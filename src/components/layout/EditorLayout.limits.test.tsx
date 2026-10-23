import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditorProvider } from '../../hooks/EditorProvider'
import { useEditor } from '../../hooks/useEditor'
import { createRectElement, createSlide } from '../../model/factories'
import { MAX_ELEMENTS_PER_SLIDE, MAX_SLIDES } from '../../model/limits'
import type { Presentation } from '../../model/types'
import { EditorLayout } from './EditorLayout'

// Ces tests construisent des présentations de la taille des limites (200 diapositives,
// 500 éléments, 15 Mo d'images) : plus lents que les autres, surtout quand tout tourne en parallèle.
vi.setConfig({ testTimeout: 30_000 })

// Lit les compteurs via le contexte.
function Spy() {
  const { history } = useEditor()
  const { presentation, selectedSlideId } = history.editor
  const slide = presentation.slides.find((s) => s.id === selectedSlideId)
  return (
    <>
      <span data-testid="slide-count">{presentation.slides.length}</span>
      <span data-testid="element-count">{slide?.elements.length ?? 0}</span>
      <span data-testid="past-count">{history.past.length}</span>
    </>
  )
}

function renderLayout(presentation: Presentation) {
  render(
    <EditorProvider presentation={presentation}>
      <EditorLayout />
      <Spy />
    </EditorProvider>,
  )
}

const count = (testId: string) => Number(screen.getByTestId(testId).textContent)
const button = (name: string) => screen.getByRole('button', { name })
const SLIDE_LIMIT = `Limite de ${MAX_SLIDES} diapositives atteinte.`
const ELEMENT_LIMIT = `Limite de ${MAX_ELEMENTS_PER_SLIDE} éléments par diapositive atteinte.`

describe('EditorLayout : limite de diapositives', () => {
  function makeAlmostFull(): Presentation {
    const slides = Array.from({ length: MAX_SLIDES - 1 }, () => createSlide())
    return { version: 1, title: 'Test', slides }
  }

  it('désactive Nouvelle diapositive et Dupliquer à la limite, avec une infobulle', async () => {
    renderLayout(makeAlmostFull())
    expect(button('Nouvelle diapositive')).toBeEnabled()

    await userEvent.click(button('Nouvelle diapositive'))

    expect(count('slide-count')).toBe(MAX_SLIDES)
    for (const name of ['Nouvelle diapositive', 'Dupliquer la diapositive']) {
      expect(button(name)).toBeDisabled()
      expect(button(name)).toHaveAttribute('title', SLIDE_LIMIT)
    }
    const past = count('past-count')
    await userEvent.click(button('Nouvelle diapositive'))
    await userEvent.click(button('Dupliquer la diapositive'))
    expect(count('slide-count')).toBe(MAX_SLIDES)
    expect(count('past-count')).toBe(past)
  })

  it('réactive les boutons dès qu\'une diapositive est supprimée', async () => {
    renderLayout(makeAlmostFull())
    await userEvent.click(button('Nouvelle diapositive'))
    expect(button('Nouvelle diapositive')).toBeDisabled()

    await userEvent.click(button('Supprimer la diapositive'))

    expect(count('slide-count')).toBe(MAX_SLIDES - 1)
    expect(button('Nouvelle diapositive')).toBeEnabled()
    expect(button('Dupliquer la diapositive')).toBeEnabled()
  })
})

describe('EditorLayout : limite d\'éléments par diapositive', () => {
  function makeAlmostFull(): Presentation {
    const slide = createSlide()
    slide.elements = Array.from({ length: MAX_ELEMENTS_PER_SLIDE - 1 }, () => createRectElement())
    return { version: 1, title: 'Test', slides: [slide] }
  }

  it('désactive les ajouts et la duplication à la limite, avec une infobulle', async () => {
    renderLayout(makeAlmostFull())

    await userEvent.click(button('Rectangle'))

    expect(count('element-count')).toBe(MAX_ELEMENTS_PER_SLIDE)
    for (const name of ['Texte', 'Rectangle', 'Image (URL)', 'Image (fichier)', "Dupliquer l'élément"]) {
      expect(button(name)).toBeDisabled()
      expect(button(name)).toHaveAttribute('title', ELEMENT_LIMIT)
    }
  })

  it('Ctrl+D est sans effet à la limite', async () => {
    renderLayout(makeAlmostFull())
    await userEvent.click(button('Rectangle'))
    const past = count('past-count')

    fireEvent.keyDown(document.body, { key: 'd', ctrlKey: true })

    expect(count('element-count')).toBe(MAX_ELEMENTS_PER_SLIDE)
    expect(count('past-count')).toBe(past)
  })

  it('Ctrl+D fonctionne encore avec un élément de marge', async () => {
    const presentation = makeAlmostFull()
    presentation.slides[0]?.elements.pop()
    renderLayout(presentation)
    await userEvent.click(button('Rectangle'))
    expect(count('element-count')).toBe(MAX_ELEMENTS_PER_SLIDE - 1)

    fireEvent.keyDown(document.body, { key: 'd', ctrlKey: true })

    expect(count('element-count')).toBe(MAX_ELEMENTS_PER_SLIDE)
  })

  it('réactive les ajouts dès qu\'un élément est supprimé', async () => {
    renderLayout(makeAlmostFull())
    await userEvent.click(button('Rectangle'))
    expect(button('Texte')).toBeDisabled()

    await userEvent.click(button("Supprimer l'élément"))

    expect(count('element-count')).toBe(MAX_ELEMENTS_PER_SLIDE - 1)
    expect(button('Texte')).toBeEnabled()
    expect(button('Rectangle')).toBeEnabled()
  })

  it('la limite vaut par diapositive : une autre diapositive reste libre', async () => {
    const presentation = makeAlmostFull()
    presentation.slides.push(createSlide())
    renderLayout(presentation)
    await userEvent.click(button('Rectangle'))
    expect(button('Texte')).toBeDisabled()

    await userEvent.click(button('Diapositive 2'))

    expect(button('Texte')).toBeEnabled()
  })
})
