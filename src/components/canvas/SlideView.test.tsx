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

describe('SlideView : gestes', () => {
  const slide = makeSlide()
  const [text, rect] = slide.elements
  const HANDLE_NAMES = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']
  const handles = () => Array.from(document.querySelectorAll('[data-handle]'))

  function clipsOverflow(node: Element) {
    return (node as HTMLElement).style.overflow === 'hidden' || node.classList.contains('overflow-hidden')
  }

  function ancestors(node: Element) {
    const result: Element[] = []
    for (let current = node.parentElement; current; current = current.parentElement) {
      result.push(current)
    }
    return result
  }

  it('affiche les 8 poignées quand un élément est sélectionné et onStartGesture fourni', () => {
    render(
      <SlideView
        slide={slide}
        scale={1}
        selectedElementId={rect?.id}
        onSelectElement={() => {}}
        onStartGesture={() => {}}
      />,
    )

    expect(handles().map((h) => h.getAttribute('data-handle')).sort()).toEqual(
      [...HANDLE_NAMES].sort(),
    )
  })

  it('place les poignées aux coins et aux milieux des côtés, avec le bon curseur', () => {
    render(
      <SlideView
        slide={slide}
        scale={1}
        selectedElementId={rect?.id}
        onStartGesture={() => {}}
      />,
    )
    const handle = (name: string) => document.querySelector(`[data-handle="${name}"]`)
    // 10 px visuels à l'échelle 1 : la poignée est centrée sur le point (reculée de 5).
    const left = (rect?.x ?? 0) - 5
    const top = (rect?.y ?? 0) - 5
    const right = (rect?.x ?? 0) + (rect?.width ?? 0) - 5
    const bottom = (rect?.y ?? 0) + (rect?.height ?? 0) - 5

    expect(handle('nw')).toHaveStyle({ left: `${left}px`, top: `${top}px`, cursor: 'nwse-resize' })
    expect(handle('se')).toHaveStyle({ left: `${right}px`, top: `${bottom}px`, cursor: 'nwse-resize' })
    expect(handle('ne')).toHaveStyle({ left: `${right}px`, top: `${top}px`, cursor: 'nesw-resize' })
    expect(handle('sw')).toHaveStyle({ left: `${left}px`, top: `${bottom}px`, cursor: 'nesw-resize' })
    expect(handle('n')).toHaveStyle({ top: `${top}px`, cursor: 'ns-resize' })
    expect(handle('s')).toHaveStyle({ top: `${bottom}px`, cursor: 'ns-resize' })
    expect(handle('e')).toHaveStyle({ left: `${right}px`, cursor: 'ew-resize' })
    expect(handle('w')).toHaveStyle({ left: `${left}px`, cursor: 'ew-resize' })
  })

  it('garde des poignées d\'environ 10 px à l\'écran quelle que soit l\'échelle', () => {
    render(
      <SlideView
        slide={slide}
        scale={0.5}
        selectedElementId={rect?.id}
        onStartGesture={() => {}}
      />,
    )

    expect(handles()[0]).toHaveStyle({ width: '20px', height: '20px' })
  })

  it('n\'affiche aucune poignée sans onStartGesture (vignettes) ni sans sélection', () => {
    const { rerender } = render(<SlideView slide={slide} scale={1} selectedElementId={rect?.id} />)
    expect(handles()).toHaveLength(0)
    // Le cadre, lui, reste affiché.
    expect(screen.getByTestId('selection-frame')).toBeInTheDocument()

    rerender(<SlideView slide={slide} scale={1} onStartGesture={() => {}} />)
    expect(handles()).toHaveLength(0)
  })

  it('pointerdown sur un élément appelle onSelectElement puis onStartGesture en mode move', () => {
    const onSelectElement = vi.fn()
    const onStartGesture = vi.fn()
    render(
      <SlideView
        slide={slide}
        scale={1}
        onSelectElement={onSelectElement}
        onStartGesture={onStartGesture}
      />,
    )

    fireEvent.pointerDown(screen.getByText('Premier plan arrière'))

    expect(onSelectElement).toHaveBeenCalledTimes(1)
    expect(onSelectElement).toHaveBeenCalledWith(text?.id)
    expect(onStartGesture).toHaveBeenCalledTimes(1)
    expect(onStartGesture).toHaveBeenCalledWith(expect.anything(), text, 'move')
  })

  it('pointerdown sur une poignée appelle onStartGesture avec la poignée, sans désélectionner', () => {
    const onSelectElement = vi.fn()
    const onStartGesture = vi.fn()
    render(
      <SlideView
        slide={slide}
        scale={1}
        selectedElementId={rect?.id}
        onSelectElement={onSelectElement}
        onStartGesture={onStartGesture}
      />,
    )

    for (const name of HANDLE_NAMES) {
      fireEvent.pointerDown(document.querySelector(`[data-handle="${name}"]`) as Element)
      expect(onStartGesture).toHaveBeenLastCalledWith(expect.anything(), rect, name)
    }

    expect(onStartGesture).toHaveBeenCalledTimes(8)
    expect(onSelectElement).not.toHaveBeenCalled()
  })

  it('le brouillon déplace l\'élément et le cadre, pas les autres éléments', () => {
    const preview = { elementId: rect?.id ?? '', bounds: { x: 10, y: 20, width: 111, height: 55 } }
    render(
      <SlideView
        slide={slide}
        scale={1}
        selectedElementId={rect?.id}
        onStartGesture={() => {}}
        preview={preview}
      />,
    )

    const expected = { left: '10px', top: '20px', width: '111px', height: '55px' }
    expect(document.querySelector('[style*="background-color: rgb(171, 205, 239)"]')).toHaveStyle(
      expected,
    )
    expect(screen.getByTestId('selection-frame')).toHaveStyle(expected)
    // Les poignées suivent aussi : la poignée nw est centrée sur le coin (10, 20).
    expect(document.querySelector('[data-handle="nw"]')).toHaveStyle({ left: '5px', top: '15px' })
    // Un autre élément garde sa géométrie du modèle.
    expect(screen.getByText('Premier plan arrière')).toHaveStyle({
      left: `${text?.x}px`,
      top: `${text?.y}px`,
    })
  })

  it('le cadre et les poignées n\'ont aucun ancêtre avec overflow hidden', () => {
    render(
      <SlideView
        slide={slide}
        scale={1}
        selectedElementId={rect?.id}
        onStartGesture={() => {}}
      />,
    )

    for (const node of [screen.getByTestId('selection-frame'), ...handles()]) {
      expect(ancestors(node).filter(clipsOverflow)).toHaveLength(0)
    }
    // Témoin : les éléments, eux, restent bien rognés aux bords de la diapositive.
    const elementAncestors = ancestors(screen.getByText('Premier plan arrière'))
    expect(elementAncestors.some(clipsOverflow)).toBe(true)
  })

  it('la couche de superposition laisse passer la souris, sauf sur les poignées', () => {
    render(
      <SlideView
        slide={slide}
        scale={1}
        selectedElementId={rect?.id}
        onStartGesture={() => {}}
      />,
    )

    expect(screen.getByTestId('selection-frame').parentElement).toHaveStyle({
      pointerEvents: 'none',
    })
    expect(handles()[0]).toHaveStyle({ pointerEvents: 'auto', touchAction: 'none' })
  })

  it('met touch-action: none sur les éléments interactifs seulement', () => {
    const { rerender } = render(<SlideView slide={slide} scale={1} onSelectElement={() => {}} />)
    expect(screen.getByText('Premier plan arrière')).toHaveStyle({ touchAction: 'none' })

    rerender(<SlideView slide={slide} scale={1} />)
    expect(screen.getByText('Premier plan arrière')).not.toHaveStyle({ touchAction: 'none' })
  })
})
