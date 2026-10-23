import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditorProvider } from '../../hooks/EditorProvider'
import { useEditor } from '../../hooks/useEditor'
import { createThreeSlidePresentation } from '../../test/fixtures'
import { firePointer } from '../../test/pointer'
import { EditorLayout } from './EditorLayout'

// Lit l'historique via le contexte et l'affiche : prouve le nombre d'entrées créées.
function HistorySpy() {
  const { history } = useEditor()
  return <output data-testid="past-count">{history.past.length}</output>
}

function renderLayout(withSlides = false) {
  render(
    <EditorProvider presentation={withSlides ? createThreeSlidePresentation() : undefined}>
      <EditorLayout />
      <HistorySpy />
    </EditorProvider>,
  )
}

const main = () => screen.getByRole('main', { name: 'Zone d\'édition' })
// Premier enfant de la couche des éléments : le seul élément de la diapositive vide + ajout.
const firstElement = () =>
  main().querySelector('div > div')?.firstElementChild?.firstElementChild as HTMLElement
const handle = (name: string) => document.querySelector(`[data-handle="${name}"]`) as Element
const pastCount = () => Number(screen.getByTestId('past-count').textContent)

// jsdom n'a pas de ResizeObserver : l'échelle est celle de repli, 960 / 1280.
const SCALE = 0.75
// Rectangle par défaut : 400x240, centré sur la diapositive 1280x720.
const RECT = { left: 440, top: 240, width: 400, height: 240 }

async function addRect() {
  renderLayout()
  await userEvent.click(screen.getByRole('button', { name: 'Rectangle' }))
}

describe('EditorLayout : déplacer et redimensionner à la souris', () => {
  it('glisser un élément change sa position, en unités logiques', async () => {
    await addRect()

    firePointer(firstElement(), 'pointerdown', { clientX: 100, clientY: 100 })
    firePointer(window, 'pointermove', { clientX: 160, clientY: 130 })
    firePointer(window, 'pointerup', { clientX: 160, clientY: 130 })

    // 60 px et 30 px à l'écran valent 80 et 40 unités à l'échelle 0,75.
    expect(firstElement()).toHaveStyle({
      left: `${RECT.left + 60 / SCALE}px`,
      top: `${RECT.top + 30 / SCALE}px`,
      width: `${RECT.width}px`,
      height: `${RECT.height}px`,
    })
  })

  it('pendant le geste, l\'élément et le cadre suivent sans toucher à l\'historique', async () => {
    await addRect()
    const before = pastCount()

    firePointer(firstElement(), 'pointerdown', { clientX: 0, clientY: 0 })
    firePointer(window, 'pointermove', { clientX: 75, clientY: 0 })

    const expected = { left: `${RECT.left + 100}px`, top: `${RECT.top}px` }
    expect(firstElement()).toHaveStyle(expected)
    expect(screen.getByTestId('selection-frame')).toHaveStyle(expected)
    expect(pastCount()).toBe(before)

    firePointer(window, 'pointerup', { clientX: 75, clientY: 0 })
  })

  it('un geste complet crée exactement une entrée d\'historique', async () => {
    await addRect()
    const before = pastCount()

    firePointer(firstElement(), 'pointerdown', { clientX: 0, clientY: 0 })
    for (let i = 1; i <= 40; i++) firePointer(window, 'pointermove', { clientX: i, clientY: i })
    firePointer(window, 'pointerup', { clientX: 40, clientY: 40 })

    expect(pastCount()).toBe(before + 1)

    // Pareil pour un redimensionnement.
    firePointer(handle('se'), 'pointerdown', { clientX: 0, clientY: 0 })
    for (let i = 1; i <= 40; i++) firePointer(window, 'pointermove', { clientX: i, clientY: i })
    firePointer(window, 'pointerup', { clientX: 40, clientY: 40 })

    expect(pastCount()).toBe(before + 2)
  })

  it('glisser très loin borne l\'élément à la diapositive', async () => {
    await addRect()

    firePointer(firstElement(), 'pointerdown', { clientX: 0, clientY: 0 })
    firePointer(window, 'pointermove', { clientX: 100000, clientY: 100000 })
    firePointer(window, 'pointerup', { clientX: 100000, clientY: 100000 })

    expect(firstElement()).toHaveStyle({
      left: `${1280 - RECT.width}px`,
      top: `${720 - RECT.height}px`,
    })

    firePointer(firstElement(), 'pointerdown', { clientX: 0, clientY: 0 })
    firePointer(window, 'pointermove', { clientX: -100000, clientY: -100000 })
    firePointer(window, 'pointerup', { clientX: -100000, clientY: -100000 })

    expect(firstElement()).toHaveStyle({ left: '0px', top: '0px' })
  })

  it('la poignée se change la largeur et la hauteur, pas la position', async () => {
    await addRect()

    firePointer(handle('se'), 'pointerdown', { clientX: 0, clientY: 0 })
    firePointer(window, 'pointermove', { clientX: 75, clientY: 30 })
    firePointer(window, 'pointerup', { clientX: 75, clientY: 30 })

    expect(firstElement()).toHaveStyle({
      left: `${RECT.left}px`,
      top: `${RECT.top}px`,
      width: `${RECT.width + 100}px`,
      height: `${RECT.height + 40}px`,
    })
  })

  it('la poignée nw garde le coin opposé fixe, même à la taille minimale', async () => {
    await addRect()

    firePointer(handle('nw'), 'pointerdown', { clientX: 0, clientY: 0 })
    firePointer(window, 'pointermove', { clientX: 100000, clientY: 100000 })
    firePointer(window, 'pointerup', { clientX: 100000, clientY: 100000 })

    // Coin bas droit d'origine : (840, 480). Taille minimale : 20.
    expect(firstElement()).toHaveStyle({ left: '820px', top: '460px', width: '20px', height: '20px' })
  })

  it('un geste annulé par Échap laisse l\'élément inchangé', async () => {
    await addRect()
    const before = pastCount()

    firePointer(firstElement(), 'pointerdown', { clientX: 0, clientY: 0 })
    firePointer(window, 'pointermove', { clientX: 150, clientY: 150 })
    fireEvent.keyDown(window, { key: 'Escape' })
    firePointer(window, 'pointerup', { clientX: 150, clientY: 150 })

    expect(firstElement()).toHaveStyle({ left: `${RECT.left}px`, top: `${RECT.top}px` })
    expect(pastCount()).toBe(before)
    // L'élément reste sélectionné : Échap annule le geste, pas la sélection.
    expect(screen.getByTestId('selection-frame')).toBeInTheDocument()
  })

  it('cliquer sans bouger ne modifie rien et ne crée pas d\'entrée d\'historique', async () => {
    await addRect()
    const before = pastCount()

    firePointer(firstElement(), 'pointerdown', { clientX: 50, clientY: 50 })
    firePointer(window, 'pointerup', { clientX: 50, clientY: 50 })

    expect(firstElement()).toHaveStyle({
      left: `${RECT.left}px`,
      top: `${RECT.top}px`,
      width: `${RECT.width}px`,
      height: `${RECT.height}px`,
    })
    expect(pastCount()).toBe(before)
  })

  it('glisser un élément non sélectionné le sélectionne et le déplace', () => {
    renderLayout(true)
    const alpha = within(main()).getByText('Alpha')
    expect(screen.queryByTestId('selection-frame')).not.toBeInTheDocument()

    firePointer(alpha, 'pointerdown', { clientX: 0, clientY: 0 })
    firePointer(window, 'pointermove', { clientX: 75, clientY: 0 })
    firePointer(window, 'pointerup', { clientX: 75, clientY: 0 })

    expect(screen.getByTestId('selection-frame')).toBeInTheDocument()
    // Alpha est centré : x = (1280 - 600) / 2 = 340, déplacé de 100 unités.
    expect(alpha).toHaveStyle({ left: '440px' })
    expect(pastCount()).toBe(1)
  })

  it('une poignée ne désélectionne pas l\'élément', async () => {
    await addRect()

    firePointer(handle('e'), 'pointerdown', { clientX: 0, clientY: 0 })
    firePointer(window, 'pointerup', { clientX: 0, clientY: 0 })

    expect(screen.getByTestId('selection-frame')).toBeInTheDocument()
  })
})
