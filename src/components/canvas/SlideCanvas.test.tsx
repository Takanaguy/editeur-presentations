import { act, render, renderHook, screen } from '@testing-library/react'
import { FALLBACK_SIZE, useElementSize } from '../../hooks/useElementSize'
import { createTextElement } from '../../model/factories'
import type { Slide } from '../../model/types'
import { SlideCanvas } from './SlideCanvas'

const slide: Slide = { id: 's1', elements: [createTextElement({ text: 'Contenu central' })] }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SlideCanvas sans ResizeObserver (jsdom)', () => {
  it('ne plante pas et utilise la taille de repli 960x540', () => {
    expect(typeof ResizeObserver).toBe('undefined')
    render(<SlideCanvas slide={slide} />)

    expect(screen.getByText('Contenu central')).toBeInTheDocument()
    // 960 / 1280 = 540 / 720 = 0.75 : la diapositive remplit exactement le repli.
    const main = screen.getByRole('main', { name: 'Zone d\'édition' })
    expect(main.querySelector('div > div')).toHaveStyle({ width: '960px', height: '540px' })
  })

  it('useElementSize rend la taille de repli', () => {
    const { result } = renderHook(() => useElementSize<HTMLDivElement>())

    expect(result.current.size).toEqual(FALLBACK_SIZE)
  })
})

describe('SlideCanvas avec un ResizeObserver simulé', () => {
  function stubObserver() {
    let callback: ResizeObserverCallback = () => {}
    class FakeObserver {
      constructor(cb: ResizeObserverCallback) {
        callback = cb
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', FakeObserver)
    return (width: number, height: number) =>
      act(() => {
        callback([{ contentRect: { width, height } } as ResizeObserverEntry], {} as ResizeObserver)
      })
  }

  it('limite l\'échelle par la largeur quand l\'espace est trop étroit', () => {
    const resize = stubObserver()
    render(<SlideCanvas slide={slide} />)

    resize(640, 600)
    const main = screen.getByRole('main', { name: 'Zone d\'édition' })
    expect(main.querySelector('div > div')).toHaveStyle({ width: '640px', height: '360px' })
  })

  it('limite l\'échelle par la hauteur quand l\'espace est trop bas', () => {
    const resize = stubObserver()
    render(<SlideCanvas slide={slide} />)

    resize(2000, 360)
    const main = screen.getByRole('main', { name: 'Zone d\'édition' })
    expect(main.querySelector('div > div')).toHaveStyle({ width: '640px', height: '360px' })
  })

  it('ignore une taille nulle', () => {
    const resize = stubObserver()
    render(<SlideCanvas slide={slide} />)

    resize(0, 0)
    const main = screen.getByRole('main', { name: 'Zone d\'édition' })
    expect(main.querySelector('div > div')).toHaveStyle({ width: '960px', height: '540px' })
  })
})
