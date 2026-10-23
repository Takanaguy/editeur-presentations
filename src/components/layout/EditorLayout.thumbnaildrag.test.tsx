import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditorProvider } from '../../hooks/EditorProvider'
import { useEditor } from '../../hooks/useEditor'
import { createThreeSlidePresentation } from '../../test/fixtures'
import { firePointer } from '../../test/pointer'
import { itemCenter, mockThumbnailLayout } from '../../test/thumbnailLayout'
import { EditorLayout } from './EditorLayout'

// Lit l'historique via le contexte et l'affiche : prouve le nombre d'entrées créées.
function HistorySpy() {
  const { history } = useEditor()
  return <output data-testid="past-count">{history.past.length}</output>
}

function renderLayout() {
  render(
    <EditorProvider presentation={createThreeSlidePresentation()}>
      <EditorLayout />
      <HistorySpy />
    </EditorProvider>,
  )
}

const nav = () => screen.getByRole('navigation', { name: 'Vignettes des diapositives' })
const thumbnails = () => within(nav()).getAllByRole('button')
// Ordre des vignettes, lu par leurs textes (Alpha, Bravo, Charlie).
const order = () => thumbnails().map((button) => /Alpha|Bravo|Charlie/.exec(button.textContent ?? '')?.[0])
const selectedText = () =>
  /Alpha|Bravo|Charlie/.exec(
    thumbnails().find((button) => button.getAttribute('aria-current') === 'true')?.textContent ?? '',
  )?.[0]
const pastCount = () => Number(screen.getByTestId('past-count').textContent)

// Glisse la vignette de rang `from` (à partir de 1) jusqu'à la hauteur `toY`, sans relâcher.
function dragTo(from: number, toY: number) {
  const button = screen.getByRole('button', { name: `Diapositive ${from}` })
  firePointer(button, 'pointerdown', { clientX: 20, clientY: itemCenter(from - 1) })
  for (let y = itemCenter(from - 1); y >= toY; y -= 10) {
    firePointer(window, 'pointermove', { clientX: 20, clientY: y })
  }
}

describe('EditorLayout : réordonner les vignettes en glissant', () => {
  beforeEach(() => {
    mockThumbnailLayout()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('glisser la diapositive 3 au dessus de la 1 change l\'ordre, sélectionne et crée une seule entrée', () => {
    renderLayout()
    expect(order()).toEqual(['Alpha', 'Bravo', 'Charlie'])
    expect(selectedText()).toBe('Alpha')
    const before = pastCount()

    dragTo(3, 45)
    firePointer(window, 'pointerup', { clientX: 20, clientY: 45 })

    expect(order()).toEqual(['Charlie', 'Alpha', 'Bravo'])
    expect(selectedText()).toBe('Charlie')
    expect(pastCount()).toBe(before + 1)
  })

  it('pendant le glisser, l\'ordre et l\'historique ne bougent pas', () => {
    renderLayout()
    const before = pastCount()

    dragTo(3, 45)

    expect(order()).toEqual(['Alpha', 'Bravo', 'Charlie'])
    expect(pastCount()).toBe(before)
    expect(screen.getByTestId('drop-indicator')).toBeInTheDocument()

    firePointer(window, 'pointerup', { clientX: 20, clientY: 45 })
    expect(screen.queryByTestId('drop-indicator')).not.toBeInTheDocument()
  })

  it('Annuler rétablit l\'ordre d\'origine', async () => {
    renderLayout()

    dragTo(3, 45)
    firePointer(window, 'pointerup', { clientX: 20, clientY: 45 })
    expect(order()).toEqual(['Charlie', 'Alpha', 'Bravo'])

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(order()).toEqual(['Alpha', 'Bravo', 'Charlie'])
  })

  it('glisser puis annuler par Échap laisse l\'ordre', () => {
    renderLayout()
    const before = pastCount()

    dragTo(3, 45)
    fireEvent.keyDown(window, { key: 'Escape' })
    firePointer(window, 'pointerup', { clientX: 20, clientY: 45 })

    expect(order()).toEqual(['Alpha', 'Bravo', 'Charlie'])
    expect(pastCount()).toBe(before)
    expect(screen.queryByTestId('drop-indicator')).not.toBeInTheDocument()
  })

  it('un simple clic sur une vignette la sélectionne toujours', () => {
    renderLayout()
    const before = pastCount()
    const second = screen.getByRole('button', { name: 'Diapositive 2' })

    firePointer(second, 'pointerdown', { clientX: 20, clientY: itemCenter(1) })
    firePointer(window, 'pointerup', { clientX: 20, clientY: itemCenter(1) })
    fireEvent.click(second)

    expect(selectedText()).toBe('Bravo')
    expect(order()).toEqual(['Alpha', 'Bravo', 'Charlie'])
    expect(pastCount()).toBe(before)
  })

  it('après un glisser, un clic ultérieur sur une vignette fonctionne', () => {
    renderLayout()

    dragTo(3, 45)
    firePointer(window, 'pointerup', { clientX: 20, clientY: 45 })
    // Le click qui suit immédiatement le relâchement est avalé.
    fireEvent.click(screen.getByRole('button', { name: 'Diapositive 1' }))
    expect(selectedText()).toBe('Charlie')

    // Le suivant est un vrai clic : Alpha est maintenant la 2e vignette.
    fireEvent.click(screen.getByRole('button', { name: 'Diapositive 2' }))
    expect(selectedText()).toBe('Alpha')
  })

  it('les boutons Monter et Descendre fonctionnent toujours', async () => {
    renderLayout()

    await userEvent.click(screen.getByRole('button', { name: 'Diapositive 2' }))
    await userEvent.click(screen.getByRole('button', { name: /Monter/ }))

    expect(order()).toEqual(['Bravo', 'Alpha', 'Charlie'])
  })
})
