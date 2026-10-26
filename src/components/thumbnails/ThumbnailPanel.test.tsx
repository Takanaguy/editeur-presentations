import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createTextElement } from '../../model/factories'
import type { Slide } from '../../model/types'
import { firePointer } from '../../test/pointer'
import { itemCenter, mockThumbnailLayout } from '../../test/thumbnailLayout'
import { ThumbnailPanel } from './ThumbnailPanel'

const slides: Slide[] = [
  { id: 'a', elements: [createTextElement({ text: 'Texte A' })] },
  { id: 'b', elements: [createTextElement({ text: 'Texte B' })] },
  { id: 'c', elements: [] },
]

describe('ThumbnailPanel', () => {
  it('affiche une vignette par diapositive, numérotée', () => {
    render(<ThumbnailPanel slides={slides} selectedSlideId="a" onSelect={() => {}} />)

    const nav = screen.getByRole('navigation', { name: 'Vignettes des diapositives' })
    expect(within(nav).getAllByRole('button')).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Diapositive 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Diapositive 2' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Diapositive 3' })).toBeInTheDocument()
  })

  it('marque seulement la diapositive sélectionnée avec aria-current', () => {
    render(<ThumbnailPanel slides={slides} selectedSlideId="b" onSelect={() => {}} />)

    expect(screen.getByRole('button', { name: 'Diapositive 2' })).toHaveAttribute(
      'aria-current',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Diapositive 1' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('button', { name: 'Diapositive 3' })).not.toHaveAttribute('aria-current')
  })

  it('appelle onSelect avec l\'id de la vignette cliquée', async () => {
    const onSelect = vi.fn()
    render(<ThumbnailPanel slides={slides} selectedSlideId="a" onSelect={onSelect} />)

    await userEvent.click(screen.getByRole('button', { name: 'Diapositive 3' }))

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('c')
  })

  it('affiche le contenu de chaque diapositive dans sa vignette', () => {
    render(<ThumbnailPanel slides={slides} selectedSlideId="a" onSelect={() => {}} />)

    expect(screen.getByText('Texte A')).toBeInTheDocument()
    expect(screen.getByText('Texte B')).toBeInTheDocument()
  })
})

describe('ThumbnailPanel : glisser pour réordonner', () => {
  beforeEach(() => {
    mockThumbnailLayout()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const item = (n: number) => screen.getByRole('button', { name: `Diapositive ${n}` })
  const indicator = () => screen.queryByTestId('drop-indicator')

  function setup(withMove = true) {
    const onSelect = vi.fn()
    const onMoveSlide = vi.fn()
    render(
      <ThumbnailPanel
        slides={slides}
        selectedSlideId="a"
        onSelect={onSelect}
        onMoveSlide={withMove ? onMoveSlide : undefined}
      />,
    )
    return { onSelect, onMoveSlide }
  }

  it("n'affiche aucun indicateur au repos", () => {
    setup()
    expect(indicator()).not.toBeInTheDocument()
  })

  it('affiche la barre bleue à la bonne place pendant un glisser, puis la retire', () => {
    const { onMoveSlide } = setup()

    firePointer(item(3), 'pointerdown', { clientX: 10, clientY: itemCenter(2) })
    // Pointeur au dessus de tout : avant la première autre vignette (haut à 8, moins
    // la moitié de l'écart mesuré, 5), la barre de 4 px étant centrée sur 3 (donc top 1).
    firePointer(window, 'pointermove', { clientX: 10, clientY: 45 })
    expect(indicator()).toBeInTheDocument()
    expect(indicator()).toHaveStyle({ top: '1px', height: '4px' })
    expect(indicator()).toHaveAttribute('aria-hidden', 'true')
    expect(indicator()).toHaveClass('pointer-events-none')

    // Entre la 1 et la 2 : au milieu de l'écart (bas 108, haut 118), donc 113.
    firePointer(window, 'pointermove', { clientX: 10, clientY: 100 })
    expect(indicator()).toHaveStyle({ top: '111px' })

    firePointer(window, 'pointerup', { clientX: 10, clientY: 100 })
    expect(indicator()).not.toBeInTheDocument()
    expect(onMoveSlide).toHaveBeenCalledWith('c', 1)
  })

  it("n'affiche pas de barre à la position actuelle de la diapositive traînée", () => {
    setup()

    firePointer(item(3), 'pointerdown', { clientX: 10, clientY: itemCenter(2) })
    firePointer(window, 'pointermove', { clientX: 10, clientY: itemCenter(2) - 20 })
    firePointer(window, 'pointermove', { clientX: 10, clientY: itemCenter(2) })

    // Le glisser est actif (vignette marquée) mais l'insertion ne bougerait rien.
    expect(item(3)).toHaveAttribute('data-dragging', 'true')
    expect(indicator()).not.toBeInTheDocument()

    firePointer(window, 'pointerup', { clientX: 10, clientY: itemCenter(2) })
  })

  it('marque la vignette traînée et seulement elle', () => {
    setup()

    firePointer(item(2), 'pointerdown', { clientX: 10, clientY: itemCenter(1) })
    expect(item(2)).not.toHaveAttribute('data-dragging')
    firePointer(window, 'pointermove', { clientX: 10, clientY: itemCenter(1) + 60 })

    expect(item(2)).toHaveAttribute('data-dragging', 'true')
    expect(item(2)).toHaveClass('cursor-grabbing')
    // Seul l'aperçu est atténué : le bouton entier et le numéro restent opaques.
    expect(item(2)).not.toHaveClass('opacity-50', 'opacity-60')
    expect(item(2).querySelector('[aria-hidden="true"]')).toHaveClass('opacity-60')
    expect(within(item(2)).getByText('2')).not.toHaveClass('opacity-60')
    expect(item(1).querySelector('[aria-hidden="true"]')).not.toHaveClass('opacity-60')
    expect(item(1)).not.toHaveAttribute('data-dragging')
    expect(item(3)).not.toHaveAttribute('data-dragging')
    expect(screen.getByRole('navigation')).toHaveClass('select-none')

    firePointer(window, 'pointerup', { clientX: 10, clientY: itemCenter(1) + 60 })
    expect(item(2)).not.toHaveAttribute('data-dragging')
    expect(screen.getByRole('navigation')).not.toHaveClass('select-none')
  })

  it("Échap retire la barre et n'appelle pas onMoveSlide", () => {
    const { onMoveSlide } = setup()

    firePointer(item(3), 'pointerdown', { clientX: 10, clientY: itemCenter(2) })
    firePointer(window, 'pointermove', { clientX: 10, clientY: 45 })
    expect(indicator()).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(indicator()).not.toBeInTheDocument()
    expect(onMoveSlide).not.toHaveBeenCalled()
  })

  it('un clic sans glisser sélectionne comme avant', () => {
    const { onSelect, onMoveSlide } = setup()

    firePointer(item(3), 'pointerdown', { clientX: 10, clientY: itemCenter(2) })
    firePointer(window, 'pointerup', { clientX: 10, clientY: itemCenter(2) })
    fireEvent.click(item(3))

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('c')
    expect(onMoveSlide).not.toHaveBeenCalled()
  })

  it('sans onMoveSlide, aucun comportement de glisser', () => {
    const { onSelect } = setup(false)

    firePointer(item(3), 'pointerdown', { clientX: 10, clientY: itemCenter(2) })
    firePointer(window, 'pointermove', { clientX: 10, clientY: 45 })

    expect(indicator()).not.toBeInTheDocument()
    expect(item(3)).not.toHaveAttribute('data-dragging')
    expect(screen.getByRole('navigation')).not.toHaveClass('select-none')
    expect(onSelect).not.toHaveBeenCalled()

    firePointer(window, 'pointerup', { clientX: 10, clientY: 45 })
    fireEvent.click(item(3))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})
