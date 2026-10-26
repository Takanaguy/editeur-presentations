import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditorProvider } from '../../hooks/EditorProvider'
import { useEditor } from '../../hooks/useEditor'
import { createSlide, createTextElement } from '../../model/factories'
import type { Presentation } from '../../model/types'
import { EditorLayout } from './EditorLayout'

// Lit l'historique via le contexte : nombre d'entrées, éléments et sélection.
function HistorySpy() {
  const { history } = useEditor()
  const { presentation, selectedSlideId, selectedElementId } = history.editor
  const slide = presentation.slides.find((s) => s.id === selectedSlideId)
  return (
    <>
      <output data-testid="past-count">{history.past.length}</output>
      <output data-testid="element-count">{slide?.elements.length ?? 0}</output>
      <output data-testid="selected-index">
        {slide?.elements.findIndex((e) => e.id === selectedElementId) ?? -1}
      </output>
    </>
  )
}

function renderLayout(presentation?: Presentation) {
  render(
    <EditorProvider presentation={presentation}>
      <EditorLayout />
      <HistorySpy />
    </EditorProvider>,
  )
}

const main = () => screen.getByRole('main', { name: "Zone d'édition" })
const click = (name: string) => userEvent.click(screen.getByRole('button', { name }))
const count = (testId: string) => Number(screen.getByTestId(testId).textContent)
const pastCount = () => count('past-count')
const elementCount = () => count('element-count')
const selectedIndex = () => count('selected-index')

// Les rectangles de la zone d'édition, dans l'ordre d'empilement : les seuls éléments
// positionnés qui ont une couleur de fond (le cadre de sélection n'en a pas).
const rects = () =>
  Array.from(main().querySelectorAll<HTMLElement>('div')).filter(
    (el) => el.style.position === 'absolute' && el.style.backgroundColor !== '',
  )
const left = (el: HTMLElement) => Number.parseFloat(el.style.left)
const top = (el: HTMLElement) => Number.parseFloat(el.style.top)

const key = (init: KeyboardEventInit, target: Element | Window = document.body) =>
  fireEvent.keyDown(target, init)
const keyUp = (init: KeyboardEventInit, target: Element | Window = document.body) =>
  fireEvent.keyUp(target, init)
const ctrlD = (target?: Element) => key({ key: 'd', ctrlKey: true }, target)
const arrow = (name: string, extra: KeyboardEventInit = {}) => key({ key: name, ...extra })

describe('EditorLayout : dupliquer un élément', () => {
  it('Ctrl+D duplique le rectangle : la copie est décalée de 20 et sélectionnée', async () => {
    renderLayout()
    await click('Rectangle')
    const [original] = rects()
    const x = left(original!)
    const y = top(original!)

    ctrlD()

    expect(elementCount()).toBe(2)
    const [first, copy] = rects()
    expect(left(first!)).toBe(x)
    expect(left(copy!)).toBe(x + 20)
    expect(top(copy!)).toBe(y + 20)
    expect(selectedIndex()).toBe(1)
    expect(pastCount()).toBe(2)
  })

  it('Cmd+D fait pareil', async () => {
    renderLayout()
    await click('Rectangle')

    key({ key: 'd', metaKey: true })

    expect(elementCount()).toBe(2)
  })

  it('le bouton Dupliquer l\'élément fait pareil', async () => {
    renderLayout()
    await click('Rectangle')
    const x = left(rects()[0]!)

    await click('Dupliquer l\'élément')

    expect(elementCount()).toBe(2)
    expect(left(rects()[1]!)).toBe(x + 20)
    expect(selectedIndex()).toBe(1)
  })

  it('le bouton est désactivé sans sélection, et Ctrl+D ne fait rien', () => {
    renderLayout()
    expect(screen.getByRole('button', { name: 'Dupliquer l\'élément' })).toBeDisabled()

    const event = new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, cancelable: true })
    window.dispatchEvent(event)

    expect(elementCount()).toBe(0)
    expect(event.defaultPrevented).toBe(false)
  })

  it('annuler supprime la copie en une seule fois', async () => {
    renderLayout()
    await click('Rectangle')
    ctrlD()
    expect(elementCount()).toBe(2)

    await click('Annuler')

    expect(elementCount()).toBe(1)
    expect(pastCount()).toBe(1)
  })

  it('Ctrl+D ne duplique pas pendant la saisie dans le champ d\'URL', async () => {
    renderLayout()
    await click('Rectangle')
    await click('Image (URL)')
    const field = screen.getByRole('textbox', { name: "Adresse de l'image" })

    ctrlD(field)

    expect(elementCount()).toBe(1)
  })
})

describe('EditorLayout : déplacer avec les flèches', () => {
  it('la flèche droite déplace de 1, Maj+flèche de 10', async () => {
    renderLayout()
    await click('Rectangle')
    const x = left(rects()[0]!)
    const y = top(rects()[0]!)

    arrow('ArrowRight')
    expect(left(rects()[0]!)).toBe(x + 1)

    arrow('ArrowRight', { shiftKey: true })
    expect(left(rects()[0]!)).toBe(x + 11)

    arrow('ArrowDown', { shiftKey: true })
    arrow('ArrowUp')
    arrow('ArrowLeft')
    expect(left(rects()[0]!)).toBe(x + 10)
    expect(top(rects()[0]!)).toBe(y + 9)
  })

  it('ne fait rien sans sélection', async () => {
    renderLayout()
    await click('Rectangle')
    // Un clic dans le vide désélectionne.
    fireEvent.pointerDown(main().querySelector('div > div') as Element)
    expect(screen.getByRole('button', { name: "Dupliquer l'élément" })).toBeDisabled()
    const x = left(rects()[0]!)
    const before = pastCount()

    arrow('ArrowRight')

    expect(left(rects()[0]!)).toBe(x)
    expect(pastCount()).toBe(before)
  })

  it('5 appuis sans relâcher = une seule entrée d\'historique', async () => {
    renderLayout()
    await click('Rectangle')
    const x = left(rects()[0]!)
    const before = pastCount()

    arrow('ArrowRight')
    for (let i = 0; i < 4; i++) arrow('ArrowRight', { repeat: true })

    expect(left(rects()[0]!)).toBe(x + 5)
    expect(pastCount()).toBe(before + 1)
  })

  it('un keyup puis un nouvel appui crée une deuxième entrée', async () => {
    renderLayout()
    await click('Rectangle')
    const before = pastCount()

    arrow('ArrowRight')
    arrow('ArrowRight', { repeat: true })
    keyUp({ key: 'ArrowRight' })
    arrow('ArrowRight')
    arrow('ArrowRight', { repeat: true })

    expect(pastCount()).toBe(before + 2)
  })

  it('Ctrl+Z après une rafale restaure la position d\'origine d\'un seul coup', async () => {
    renderLayout()
    await click('Rectangle')
    const x = left(rects()[0]!)
    arrow('ArrowRight')
    for (let i = 0; i < 6; i++) arrow('ArrowRight', { repeat: true })
    expect(left(rects()[0]!)).toBe(x + 7)

    key({ key: 'z', ctrlKey: true })

    expect(left(rects()[0]!)).toBe(x)
  })

  it('à la limite gauche de la diapositive, aucune entrée n\'est créée', async () => {
    const slide = { ...createSlide(), elements: [createTextElement({ text: 'Bord', x: 0, y: 100 })] }
    renderLayout({ version: 1, title: 'Test', slides: [slide], fonts: [] })
    await userEvent.click(within(main()).getByText('Bord'))
    const before = pastCount()

    arrow('ArrowLeft')
    arrow('ArrowLeft', { shiftKey: true })

    expect(pastCount()).toBe(before)
    expect(within(main()).getByText('Bord').style.left).toBe('0px')
  })

  it('le focus dans le curseur d\'opacité garde les flèches pour le curseur', async () => {
    renderLayout()
    await click('Rectangle')
    const x = left(rects()[0]!)
    const before = pastCount()
    const slider = screen.getByLabelText('Opacité')
    slider.focus()

    key({ key: 'ArrowRight' }, slider)

    expect(left(rects()[0]!)).toBe(x)
    expect(pastCount()).toBe(before)
  })

  it('avec le focus sur un bouton, les flèches déplacent l\'élément', async () => {
    renderLayout()
    await click('Rectangle')
    const x = left(rects()[0]!)

    key({ key: 'ArrowRight' }, screen.getByRole('button', { name: 'Rectangle' }))

    expect(left(rects()[0]!)).toBe(x + 1)
  })

  it('pendant la présentation, les flèches ne déplacent pas l\'élément', async () => {
    renderLayout()
    await click('Rectangle')
    const x = left(rects()[0]!)
    await click('Présenter')
    const before = pastCount()

    arrow('ArrowRight')

    expect(pastCount()).toBe(before)
    // Le mode présentation recouvre l'éditeur : on revient lire la position.
    await userEvent.keyboard('{Escape}')
    expect(left(rects()[0]!)).toBe(x)
  })
})
