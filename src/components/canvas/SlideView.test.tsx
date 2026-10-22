import { render, screen } from '@testing-library/react'
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
