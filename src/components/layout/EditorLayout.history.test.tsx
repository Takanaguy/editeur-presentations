import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditorProvider } from '../../hooks/EditorProvider'
import { useEditor } from '../../hooks/useEditor'
import { createThreeSlidePresentation } from '../../test/fixtures'
import { firePointer } from '../../test/pointer'
import { EditorLayout } from './EditorLayout'

// Le test des 60 éditions fait beaucoup d'événements : sous la charge de toute la suite, le
// délai par défaut de 5 s peut être dépassé alors qu'il passe seul en 10 s environ.
vi.setConfig({ testTimeout: 30_000 })

// Lit l'historique via le contexte : nombre d'entrées et éléments de la diapositive affichée.
function HistorySpy() {
  const { history } = useEditor()
  const { presentation, selectedSlideId } = history.editor
  const slide = presentation.slides.find((s) => s.id === selectedSlideId)
  return (
    <>
      <output data-testid="past-count">{history.past.length}</output>
      <output data-testid="future-count">{history.future.length}</output>
      <output data-testid="element-count">{slide?.elements.length ?? 0}</output>
    </>
  )
}

function renderLayout(withSlides = false) {
  render(
    <EditorProvider presentation={withSlides ? createThreeSlidePresentation() : undefined}>
      <EditorLayout />
      <HistorySpy />
    </EditorProvider>,
  )
}

const main = () => screen.getByRole('main', { name: "Zone d'édition" })
const panel = () => screen.getByRole('complementary', { name: 'Propriétés' })
const undoButton = () => screen.getByRole('button', { name: 'Annuler' })
const redoButton = () => screen.getByRole('button', { name: 'Rétablir' })
const click = (name: string) => userEvent.click(screen.getByRole('button', { name }))
const count = (testId: string) => Number(screen.getByTestId(testId).textContent)
const elementCount = () => count('element-count')
const firstElement = () =>
  main().querySelector('div > div')?.firstElementChild?.firstElementChild as HTMLElement
const handle = (name: string) => document.querySelector(`[data-handle="${name}"]`) as Element

// Raccourcis au clavier, envoyés depuis l'élément qui a le focus (ils remontent jusqu'à window).
const ctrlZ = (target: Element | Window = document.body) =>
  fireEvent.keyDown(target, { key: 'z', ctrlKey: true })
const ctrlY = (target: Element | Window = document.body) =>
  fireEvent.keyDown(target, { key: 'y', ctrlKey: true })

describe('EditorLayout : annuler et rétablir (boutons)', () => {
  it('au départ, les deux boutons sont désactivés', () => {
    renderLayout()

    expect(undoButton()).toBeDisabled()
    expect(redoButton()).toBeDisabled()
    expect(undoButton()).toHaveAttribute('title', 'Annuler (Ctrl+Z)')
    expect(redoButton()).toHaveAttribute('title', 'Rétablir (Ctrl+Y)')
    expect(screen.getByRole('group', { name: 'Historique' })).toBeInTheDocument()
  })

  it('ajouter un rectangle active Annuler, qui le retire et active Rétablir', async () => {
    renderLayout()
    await click('Rectangle')
    expect(undoButton()).toBeEnabled()
    expect(redoButton()).toBeDisabled()
    expect(elementCount()).toBe(1)

    await userEvent.click(undoButton())

    expect(elementCount()).toBe(0)
    expect(undoButton()).toBeDisabled()
    expect(redoButton()).toBeEnabled()
  })

  it('Rétablir remet le rectangle', async () => {
    renderLayout()
    await click('Rectangle')
    await userEvent.click(undoButton())

    await userEvent.click(redoButton())

    expect(elementCount()).toBe(1)
    expect(redoButton()).toBeDisabled()
    expect(undoButton()).toBeEnabled()
  })

  it("après avoir annulé la création de l'élément sélectionné, le panneau n'affiche plus rien", async () => {
    renderLayout()
    await click('Rectangle')
    expect(within(panel()).getByRole('heading', { name: 'Rectangle' })).toBeInTheDocument()

    await userEvent.click(undoButton())

    expect(within(panel()).getByText('Aucun élément sélectionné')).toBeInTheDocument()
  })
})

describe('EditorLayout : annuler et rétablir (clavier)', () => {
  it('Ctrl+Z annule et Ctrl+Y rétablit', async () => {
    renderLayout()
    await click('Rectangle')

    ctrlZ()
    expect(elementCount()).toBe(0)
    expect(redoButton()).toBeEnabled()

    ctrlY()
    expect(elementCount()).toBe(1)
    expect(undoButton()).toBeEnabled()
  })

  it('Ctrl+Maj+Z rétablit aussi', async () => {
    renderLayout()
    await click('Rectangle')
    ctrlZ()

    fireEvent.keyDown(document.body, { key: 'Z', ctrlKey: true, shiftKey: true })

    expect(elementCount()).toBe(1)
  })

  it("Ctrl+Z dans le champ d'URL n'annule pas l'éditeur", async () => {
    renderLayout()
    await click('Rectangle')
    await click('Image (URL)')
    const field = screen.getByRole('textbox', { name: "Adresse de l'image" })
    const before = count('past-count')

    ctrlZ(field)

    expect(elementCount()).toBe(1)
    expect(count('past-count')).toBe(before)
  })

  it("Ctrl+Z dans l'éditeur de texte n'annule pas l'éditeur", async () => {
    renderLayout()
    await click('Texte')
    await userEvent.dblClick(within(main()).getByText('Texte'))
    const textarea = screen.getByRole('textbox', { name: 'Modifier le texte' })
    const before = count('past-count')

    ctrlZ(textarea)

    expect(textarea).toBeInTheDocument()
    expect(elementCount()).toBe(1)
    expect(count('past-count')).toBe(before)
  })

  it('Ctrl+Z dans le champ de taille de police est laissé au navigateur', async () => {
    renderLayout()
    await click('Texte')
    const size = within(panel()).getByLabelText('Taille de police')
    const before = count('past-count')

    ctrlZ(size)

    expect(count('past-count')).toBe(before)
    expect(elementCount()).toBe(1)
  })
})

describe("EditorLayout : ce qu'une annulation défait", () => {
  it('un geste de déplacement = une seule annulation', async () => {
    renderLayout()
    await click('Rectangle')
    const start = { left: '440px', top: '240px' }

    firePointer(firstElement(), 'pointerdown', { clientX: 0, clientY: 0 })
    for (let i = 1; i <= 30; i++) firePointer(window, 'pointermove', { clientX: i, clientY: i })
    firePointer(window, 'pointerup', { clientX: 30, clientY: 30 })
    expect(firstElement()).not.toHaveStyle(start)

    ctrlZ()

    expect(firstElement()).toHaveStyle(start)
    // L'ajout du rectangle est encore là : il faudrait une seconde annulation pour le retirer.
    expect(elementCount()).toBe(1)
  })

  it('un redimensionnement = une seule annulation', async () => {
    renderLayout()
    await click('Rectangle')

    firePointer(handle('se'), 'pointerdown', { clientX: 0, clientY: 0 })
    for (let i = 1; i <= 30; i++) firePointer(window, 'pointermove', { clientX: i, clientY: i })
    firePointer(window, 'pointerup', { clientX: 30, clientY: 30 })

    ctrlZ()

    expect(firstElement()).toHaveStyle({ width: '400px', height: '240px' })
  })

  it("quatre changements de couleur puis un seul Ctrl+Z restaurent la couleur d'origine", async () => {
    renderLayout()
    await click('Rectangle')
    const color = within(panel()).getByLabelText('Couleur de remplissage')

    for (const value of ['#111111', '#222222', '#333333', '#444444']) {
      fireEvent.change(color, { target: { value } })
    }
    expect(firstElement()).toHaveStyle({ backgroundColor: '#444444' })

    // Le focus reste sur le sélecteur de couleur : le raccourci doit quand même agir.
    ctrlZ(color)

    expect(firstElement()).toHaveStyle({ backgroundColor: '#2e5d7c' })
    expect(elementCount()).toBe(1)
  })

  it("modifier le texte puis annuler restaure l'ancien texte", async () => {
    renderLayout()
    await click('Texte')
    await userEvent.dblClick(within(main()).getByText('Texte'))
    await userEvent.keyboard('Bonjour{Control>}{Enter}{/Control}')
    expect(within(main()).getByText('Bonjour')).toBeInTheDocument()

    await userEvent.click(undoButton())

    expect(within(main()).getByText('Texte')).toBeInTheDocument()
    expect(within(main()).queryByText('Bonjour')).not.toBeInTheDocument()
  })

  it('modifier la diapositive 2 puis annuler depuis la 1 affiche la 2 et annule la modification', async () => {
    renderLayout(true)
    await click('Diapositive 2')
    await click('Texte')
    expect(within(main()).getByText('Texte')).toBeInTheDocument()
    await click('Diapositive 1')
    expect(within(main()).getByText('Alpha')).toBeInTheDocument()

    await userEvent.click(undoButton())

    // On est sur la diapositive 2, sans le texte ajouté.
    expect(within(main()).getByText('Bravo')).toBeInTheDocument()
    expect(within(main()).queryByText('Alpha')).not.toBeInTheDocument()
    expect(within(main()).queryByText('Texte')).not.toBeInTheDocument()
    expect(within(panel()).getByText('Aucun élément sélectionné')).toBeInTheDocument()

    // Rétablir y retourne aussi, même après être repassé sur la diapositive 1.
    await click('Diapositive 1')
    await userEvent.click(redoButton())
    expect(within(main()).getByText('Bravo')).toBeInTheDocument()
    expect(within(main()).getByText('Texte')).toBeInTheDocument()
  })
})

describe("EditorLayout : limite de l'historique", () => {
  it('60 éditions puis 60 annulations : seules 50 sont possibles', async () => {
    renderLayout()
    await click('Rectangle')
    const color = within(panel()).getByLabelText('Couleur de remplissage')
    // 60 changements de couleur, chacun séparé par une perte de focus pour ne pas fusionner.
    // Un seul rectangle à l'écran : bien plus rapide que 60 éléments ajoutés.
    const hex = (i: number) => `#${i.toString(16).padStart(6, '0')}`
    for (let i = 1; i <= 60; i++) {
      fireEvent.change(color, { target: { value: hex(i) } })
      fireEvent.blur(color)
    }
    expect(count('past-count')).toBe(50)

    // Le bouton est retrouvé une seule fois : getByRole est lent, et le nœud DOM reste le même.
    const undo = undoButton() as HTMLButtonElement
    let undone = 0
    while (!undo.disabled && undone < 60) {
      fireEvent.click(undo)
      undone++
    }

    expect(undone).toBe(50)
    expect(undo).toBeDisabled()
    expect(count('future-count')).toBe(50)
    // Les 10 premières éditions sont oubliées : on s'arrête sur la couleur de la 10e.
    expect(elementCount()).toBe(1)
    expect(firstElement()).toHaveStyle({ backgroundColor: hex(10) })
  })
})
