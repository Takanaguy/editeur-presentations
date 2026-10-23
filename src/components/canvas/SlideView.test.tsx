import { fireEvent, render, screen } from '@testing-library/react'
import {
  createImageElement,
  createRectElement,
  createTextElement,
} from '../../model/factories'
import type { Slide } from '../../model/types'
import { SlideView } from './SlideView'

function makeSlide(): Slide {
  return {
    id: 's1',
    elements: [
      createTextElement({ text: 'Premier plan arrière' }),
      createRectElement({ fill: '#abcdef' }),
      createTextElement({ text: 'Dernier au premier plan' }),
      createImageElement('data:image/png;base64,AAAA', { alt: 'Illustration' }),
    ],
  }
}

describe('SlideView', () => {
  it('rend le texte des éléments et l\'image avec son alt', () => {
    render(<SlideView slide={makeSlide()} scale={0.5} />)

    expect(screen.getByText('Premier plan arrière')).toBeInTheDocument()
    expect(screen.getByText('Dernier au premier plan')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Illustration' })).toBeInTheDocument()
  })

  it('donne au conteneur la taille logique multipliée par l\'échelle', () => {
    const { container } = render(<SlideView slide={makeSlide()} scale={0.25} />)

    expect(container.firstElementChild).toHaveStyle({ width: '320px', height: '180px' })
  })

  it('applique l\'échelle depuis le coin haut gauche sur l\'espace 1280x720', () => {
    const { container } = render(<SlideView slide={makeSlide()} scale={0.5} />)

    const inner = container.firstElementChild?.firstElementChild
    expect(inner).toHaveStyle({
      width: '1280px',
      height: '720px',
      transform: 'scale(0.5)',
      transformOrigin: 'top left',
    })
  })

  it('rend les éléments dans l\'ordre du tableau', () => {
    const { container } = render(<SlideView slide={makeSlide()} scale={1} />)

    const layer = container.firstElementChild?.firstElementChild
    const children = Array.from(layer?.children ?? [])
    expect(children).toHaveLength(4)
    expect(children[0]).toHaveTextContent('Premier plan arrière')
    expect(children[1]).toHaveStyle({ backgroundColor: '#abcdef' })
    expect(children[2]).toHaveTextContent('Dernier au premier plan')
    expect(children[3]?.tagName).toBe('IMG')
  })

  it('rend une diapositive vide sans erreur', () => {
    const { container } = render(<SlideView slide={{ id: 's', elements: [] }} scale={1} />)

    expect(container.firstElementChild?.firstElementChild?.children).toHaveLength(0)
  })
})

describe('SlideView : sélection', () => {
  const slide = makeSlide()
  const [text, rect] = slide.elements

  it('reste inerte sans onSelectElement : pas de curseur move, pas d\'erreur au clic', () => {
    const { container } = render(<SlideView slide={slide} scale={1} />)
    const target = screen.getByText('Premier plan arrière')

    expect(target).not.toHaveStyle({ cursor: 'move' })
    expect(() => fireEvent.pointerDown(target)).not.toThrow()
    expect(() => fireEvent.pointerDown(container.firstElementChild as Element)).not.toThrow()
  })

  it('appelle onSelectElement avec l\'id de l\'élément cliqué, une seule fois', () => {
    const onSelectElement = vi.fn()
    render(<SlideView slide={slide} scale={1} onSelectElement={onSelectElement} />)

    fireEvent.pointerDown(screen.getByText('Premier plan arrière'))

    // Une seule fois : le clic ne remonte pas au fond (stopPropagation).
    expect(onSelectElement).toHaveBeenCalledTimes(1)
    expect(onSelectElement).toHaveBeenCalledWith(text?.id)
  })

  it('appelle onSelectElement avec null sur le fond', () => {
    const onSelectElement = vi.fn()
    const { container } = render(
      <SlideView slide={slide} scale={1} onSelectElement={onSelectElement} />,
    )

    fireEvent.pointerDown(container.firstElementChild as Element)

    expect(onSelectElement).toHaveBeenCalledTimes(1)
    expect(onSelectElement).toHaveBeenCalledWith(null)
  })

  it('met le curseur move sur les éléments quand la sélection est active', () => {
    render(<SlideView slide={slide} scale={1} onSelectElement={() => {}} />)

    expect(screen.getByText('Premier plan arrière')).toHaveStyle({ cursor: 'move' })
  })

  it('dessine le cadre seulement sur l\'élément sélectionné', () => {
    render(<SlideView slide={slide} scale={1} selectedElementId={rect?.id} onSelectElement={() => {}} />)

    const frames = screen.getAllByTestId('selection-frame')
    expect(frames).toHaveLength(1)
    expect(frames[0]).toHaveStyle({
      left: `${rect?.x}px`,
      top: `${rect?.y}px`,
      width: `${rect?.width}px`,
      height: `${rect?.height}px`,
    })
  })

  it('n\'affiche pas de cadre sans sélection ou avec un id inconnu', () => {
    const { rerender } = render(<SlideView slide={slide} scale={1} selectedElementId={null} />)
    expect(screen.queryByTestId('selection-frame')).not.toBeInTheDocument()

    rerender(<SlideView slide={slide} scale={1} selectedElementId="inconnu" />)
    expect(screen.queryByTestId('selection-frame')).not.toBeInTheDocument()
  })

  it('garde un cadre d\'environ 2 px à l\'écran quelle que soit l\'échelle', () => {
    render(<SlideView slide={slide} scale={0.5} selectedElementId={text?.id} />)

    // 2 px écran / échelle 0,5 = 4 px dans l'espace logique.
    expect(screen.getByTestId('selection-frame').style.outline).toContain('4px')
  })
})
