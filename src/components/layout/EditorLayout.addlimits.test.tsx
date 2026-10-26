import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditorProvider } from '../../hooks/EditorProvider'
import { useEditor } from '../../hooks/useEditor'
import { measureImage } from '../../io/imageSize'
import { createImageElement, createRectElement, createSlide } from '../../model/factories'
import { MAX_ELEMENTS_PER_SLIDE, MAX_TOTAL_IMAGE_SRC_LENGTH } from '../../model/limits'
import type { Presentation } from '../../model/types'
import { EditorLayout } from './EditorLayout'

// jsdom ne charge pas les images : on garde fitImageSize réel et on simule seulement la mesure.
vi.mock('../../io/imageSize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../io/imageSize')>()),
  measureImage: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(measureImage).mockResolvedValue({ width: 200, height: 100 })
})

const WEIGHT_MESSAGE = 'Le poids total des images atteint la limite de 15 Mo.'
const ELEMENT_MESSAGE = 'Limite de 500 éléments par diapositive atteinte.'

function Spy() {
  const { history } = useEditor()
  const { presentation, selectedSlideId } = history.editor
  const slide = presentation.slides.find((s) => s.id === selectedSlideId)
  return (
    <>
      <span data-testid="element-count">{slide?.elements.length ?? 0}</span>
      <span data-testid="past-count">{history.past.length}</span>
    </>
  )
}

function renderLayout(presentation?: Presentation) {
  render(
    <EditorProvider presentation={presentation}>
      <EditorLayout />
      <Spy />
    </EditorProvider>,
  )
}

const main = () => screen.getByRole('main', { name: "Zone d'édition" })
const toolbar = () => within(screen.getByRole('toolbar', { name: 'Ajouter des éléments' }))
const toolbarAlert = () => toolbar().queryByRole('alert')
const count = (testId: string) => Number(screen.getByTestId(testId).textContent)
const click = (name: string) => userEvent.click(screen.getByRole('button', { name }))
const images = () => Array.from(main().querySelectorAll('img'))

// Image dont la source fait EXACTEMENT `length` caractères (le préfixe en compte 22).
function imageOfLength(length: number) {
  return createImageElement('data:image/png;base64,' + 'A'.repeat(length - 22), { alt: 'lourde' })
}

// Présentation dont une image pèse presque tout le budget : il reste `margin` caractères.
function heavyPresentation(margin: number): Presentation {
  const slide = createSlide()
  slide.elements = [imageOfLength(MAX_TOTAL_IMAGE_SRC_LENGTH - margin)]
  return { version: 1, title: 'Lourde', slides: [slide], fonts: [] }
}

// Sélectionne l'image lourde (premier clic sur l'image de la zone d'édition).
async function selectHeavyImage() {
  const [image] = images()
  if (!image) throw new Error('image absente')
  fireEvent.pointerDown(image, { pointerId: 1, button: 0, buttons: 1 })
  fireEvent.pointerUp(image, { pointerId: 1, button: 0, buttons: 0 })
}

function almostFullSlide(): Presentation {
  const slide = createSlide()
  slide.elements = Array.from({ length: MAX_ELEMENTS_PER_SLIDE - 1 }, () => createRectElement())
  return { version: 1, title: 'Pleine', slides: [slide], fonts: [] }
}

describe('EditorLayout : poids total des images', () => {
  it('le bouton Dupliquer l\'élément affiche le message au lieu de rester silencieux', async () => {
    renderLayout(heavyPresentation(10))
    await selectHeavyImage()
    expect(count('element-count')).toBe(1)

    await click("Dupliquer l'élément")

    expect(toolbarAlert()).toHaveTextContent(WEIGHT_MESSAGE)
    expect(count('element-count')).toBe(1)
    expect(count('past-count')).toBe(0)
  })

  it('Ctrl+D affiche le même message', async () => {
    renderLayout(heavyPresentation(10))
    await selectHeavyImage()

    fireEvent.keyDown(document.body, { key: 'd', ctrlKey: true })

    expect(toolbarAlert()).toHaveTextContent(WEIGHT_MESSAGE)
    expect(count('element-count')).toBe(1)
  })

  it("un budget d'images exactement plein refuse aussi la copie", async () => {
    renderLayout(heavyPresentation(0))
    await selectHeavyImage()
    // Budget plein : même la copie d'une image est refusée.
    await click("Dupliquer l'élément")
    expect(toolbarAlert()).toHaveTextContent(WEIGHT_MESSAGE)
  })

  it('l\'import d\'une image par URL qui ferait dépasser le budget est refusé avec le message', async () => {
    renderLayout(heavyPresentation(10))
    await click('Image (URL)')

// Ces tests construisent des présentations de la taille des limites (200 diapositives,
// 500 éléments, 15 Mo d'images) : plus lents que les autres, surtout quand tout tourne en parallèle.
vi.setConfig({ testTimeout: 30_000 })

    await userEvent.type(
      screen.getByRole('textbox', { name: "Adresse de l'image" }),
      'https://exemple.fr/photo.png{Enter}',
    )

    expect(await toolbar().findByRole('alert')).toHaveTextContent(WEIGHT_MESSAGE)
    expect(images()).toHaveLength(1)
    expect(count('element-count')).toBe(1)
  })

  it('un texte et un rectangle restent permis quand le budget d\'images est plein', async () => {
    renderLayout(heavyPresentation(0))

    await click('Texte')
    await click('Rectangle')

    expect(count('element-count')).toBe(3)
    expect(toolbarAlert()).toBeNull()
  })

  it('le message disparaît à la prochaine action réussie', async () => {
    renderLayout(heavyPresentation(10))
    await selectHeavyImage()
    await click("Dupliquer l'élément")
    expect(toolbarAlert()).not.toBeNull()

    await click('Texte')

    expect(toolbarAlert()).toBeNull()
  })
})

describe('EditorLayout : limite de 500 éléments, avec message', () => {
  it('Ctrl+D à la limite affiche le message au lieu de rester silencieux', async () => {
    renderLayout(almostFullSlide())
    await click('Rectangle')
    expect(count('element-count')).toBe(MAX_ELEMENTS_PER_SLIDE)

    fireEvent.keyDown(document.body, { key: 'd', ctrlKey: true })

    expect(toolbarAlert()).toHaveTextContent(ELEMENT_MESSAGE)
    expect(count('element-count')).toBe(MAX_ELEMENTS_PER_SLIDE)
  })

  it('une image dont le chargement finit après que la limite est atteinte est refusée avec le message', async () => {
    type Size = { width: number; height: number } | null
    let resolve: (size: Size) => void = () => {}
    vi.mocked(measureImage).mockReturnValue(
      new Promise<Size>((r) => {
        resolve = r
      }),
    )
    renderLayout(almostFullSlide())
    await click('Image (URL)')
    await userEvent.type(
      screen.getByRole('textbox', { name: "Adresse de l'image" }),
      'https://exemple.fr/photo.png{Enter}',
    )

    // Pendant le chargement, l'utilisateur ajoute le 500e élément.
    await click('Rectangle')
    expect(count('element-count')).toBe(MAX_ELEMENTS_PER_SLIDE)
    await act(async () => resolve({ width: 200, height: 100 }))

    expect(toolbarAlert()).toHaveTextContent(ELEMENT_MESSAGE)
    expect(images()).toHaveLength(0)
    expect(count('element-count')).toBe(MAX_ELEMENTS_PER_SLIDE)
  })

  it('le formulaire d\'adresse d\'image se ferme quand la limite est atteinte', async () => {
    renderLayout(almostFullSlide())
    await click('Image (URL)')
    expect(screen.getByRole('textbox', { name: "Adresse de l'image" })).toBeInTheDocument()

    await click('Rectangle')

    expect(screen.queryByRole('textbox', { name: "Adresse de l'image" })).not.toBeInTheDocument()
  })
})
