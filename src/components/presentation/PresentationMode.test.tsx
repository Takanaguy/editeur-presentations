import { StrictMode } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createSlide, createTextElement } from '../../model/factories'
import { createThreeSlidePresentation } from '../../test/fixtures'
import { PresentationMode } from './PresentationMode'

const slides = createThreeSlidePresentation().slides

function setup(startIndex = 0, onExit = vi.fn()) {
  const view = render(<PresentationMode slides={slides} startIndex={startIndex} onExit={onExit} />)
  return { onExit, ...view }
}

const dialog = () => screen.getByRole('dialog', { name: 'Mode présentation' })
// Les textes Alpha, Bravo, Charlie permettent de savoir quelle diapositive est affichée.
const shown = () => ['Alpha', 'Bravo', 'Charlie'].filter((t) => screen.queryByText(t))

// Envoie un keydown annulable sur window et rend l'événement pour lire defaultPrevented.
function press(key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true, ...init })
  fireEvent(window, event)
  return event
}

// L'API plein écran n'existe pas dans jsdom : on la simule puis on la retire.
function mockRequestFullscreen(impl: () => unknown) {
  const request = vi.fn(impl)
  Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
    configurable: true,
    writable: true,
    value: request,
  })
  return request
}

function mockExitFullscreen(impl: () => unknown = () => Promise.resolve()) {
  const exit = vi.fn(impl)
  Object.defineProperty(document, 'exitFullscreen', {
    configurable: true,
    writable: true,
    value: exit,
  })
  return exit
}

function setFullscreenElement(value: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => value,
  })
}

const fireFullscreenChange = () => fireEvent(document, new Event('fullscreenchange'))

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'requestFullscreen')
  Reflect.deleteProperty(document, 'exitFullscreen')
  Reflect.deleteProperty(document, 'fullscreenElement')
})

describe('PresentationMode : affichage', () => {
  it('affiche la diapositive de départ', () => {
    setup(1)

    expect(shown()).toEqual(['Bravo'])
  })

  it('a le rôle dialog, aria-modal et le nom "Mode présentation"', () => {
    setup()

    expect(dialog()).toHaveAttribute('aria-modal', 'true')
    expect(dialog()).toHaveAttribute('tabindex', '-1')
  })

  it('annonce la diapositive dans une zone aria-live masquée visuellement', async () => {
    setup(1)

    const live = await screen.findByText('Diapositive 2 sur 3')
    expect(live).toHaveAttribute('aria-live', 'polite')
    expect(live).toHaveClass('sr-only')
  })

  describe('annonce initiale', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('la zone aria-live est vide au montage puis remplie après le délai', () => {
      vi.useFakeTimers()
      const { container } = setup(1)
      const live = container.querySelector('[aria-live]') as HTMLElement
      expect(live).toBeEmptyDOMElement()

      act(() => {
        vi.advanceTimersByTime(99)
      })
      expect(live).toBeEmptyDOMElement()
      act(() => {
        vi.advanceTimersByTime(1)
      })

      expect(live).toHaveTextContent('Diapositive 2 sur 3')
    })

    it('une navigation avant le délai met la zone à jour tout de suite', () => {
      vi.useFakeTimers()
      const { container } = setup()
      const live = container.querySelector('[aria-live]') as HTMLElement

      press('ArrowRight')

      expect(live).toHaveTextContent('Diapositive 2 sur 3')
    })

    it('le minuteur est nettoyé au démontage', () => {
      vi.useFakeTimers()
      const { unmount } = setup()
      // D'autres minuteurs (React) peuvent exister : on compare avant et après le démontage.
      const before = vi.getTimerCount()

      unmount()

      expect(vi.getTimerCount()).toBe(before - 1)
    })
  })

  it('affiche un compteur discret caché des lecteurs d\'écran', () => {
    setup(1)

    const counter = screen.getByText('2 / 3')
    expect(counter).toHaveAttribute('aria-hidden', 'true')
    expect(counter).toHaveClass('pointer-events-none')
    expect(counter).toHaveClass('text-white/50')
  })

  it('couvre toute la fenêtre sur fond noir', () => {
    setup()

    expect(dialog()).toHaveClass('fixed', 'inset-0', 'z-50', 'bg-black')
  })

  it('met à l\'échelle la diapositive pour garder le 16:9 (repli jsdom 960x540)', () => {
    setup()

    // min(960 / 1280, 540 / 720) = 0,75 : la diapositive fait 960x540.
    const view = dialog().firstElementChild
    expect(view).toHaveStyle({ width: '960px', height: '540px' })
  })

  it('ramène un index de départ hors bornes dans la plage', () => {
    setup(10)
    expect(shown()).toEqual(['Charlie'])
  })

  it('reste lecture seule : aucun cadre de sélection ni poignée', () => {
    setup()

    expect(screen.queryByTestId('selection-frame')).not.toBeInTheDocument()
    expect(document.querySelector('[data-handle]')).not.toBeInTheDocument()
  })
})

describe('PresentationMode : clavier', () => {
  it.each([
    ['ArrowRight', {}],
    ['Espace', { key: ' ' }],
    ['Entrée', { key: 'Enter' }],
    ['PageDown', {}],
    ['ArrowDown', {}],
  ])('%s avance', (name, init) => {
    setup()
    const key = (init as { key?: string }).key ?? name

    press(key)

    expect(shown()).toEqual(['Bravo'])
    expect(screen.getByText('Diapositive 2 sur 3')).toBeInTheDocument()
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
  })

  it.each([
    ['ArrowLeft', false, 'ArrowLeft'],
    ['Maj+Espace', true, ' '],
    ['Backspace', false, 'Backspace'],
    ['PageUp', false, 'PageUp'],
    ['ArrowUp', false, 'ArrowUp'],
  ])('%s recule', (_name, shiftKey, key) => {
    setup(2)

    press(key, { shiftKey })

    expect(shown()).toEqual(['Bravo'])
  })

  it('Home va à la première et End à la dernière', () => {
    setup(1)

    press('End')
    expect(shown()).toEqual(['Charlie'])
    press('Home')
    expect(shown()).toEqual(['Alpha'])
  })

  it('ne dépasse pas la dernière diapositive et ne reboucle pas', () => {
    setup(2)

    press('ArrowRight')
    press(' ')
    press('Enter')

    expect(shown()).toEqual(['Charlie'])
    expect(screen.getByText('3 / 3')).toBeInTheDocument()
  })

  it('ne dépasse pas la première diapositive et ne reboucle pas', () => {
    setup(0)

    press('ArrowLeft')
    press(' ', { shiftKey: true })
    press('Backspace')

    expect(shown()).toEqual(['Alpha'])
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
  })

  it('deux touches très rapprochées avancent de deux diapositives', () => {
    setup()

    press('ArrowRight')
    press('ArrowRight')

    expect(shown()).toEqual(['Charlie'])
  })

  it('Échap appelle onExit', () => {
    const { onExit } = setup()

    press('Escape')

    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['Ctrl', { ctrlKey: true }],
    ['Alt', { altKey: true }],
    ['Meta', { metaKey: true }],
  ])('ignore les touches avec %s, sans empêcher l\'action par défaut', (_name, init) => {
    const { onExit } = setup()

    const next = press('ArrowRight', init)
    const exit = press('Escape', init)

    expect(shown()).toEqual(['Alpha'])
    expect(onExit).not.toHaveBeenCalled()
    expect(next.defaultPrevented).toBe(false)
    expect(exit.defaultPrevented).toBe(false)
  })

  it.each(['ArrowRight', ' ', 'Enter', 'PageDown', 'ArrowLeft', 'Backspace', 'Home', 'End', 'Escape'])(
    'empêche l\'action par défaut pour %j',
    (key) => {
      setup()
      expect(press(key).defaultPrevented).toBe(true)
    },
  )

  it('empêche l\'action par défaut même sur la dernière diapositive (pas de défilement)', () => {
    setup(2)
    expect(press(' ').defaultPrevented).toBe(true)
  })

  it.each(['a', 'Tab', 'F5', 'Delete'])('ne bloque pas la touche %j', (key) => {
    const { onExit } = setup()

    const event = press(key)

    expect(event.defaultPrevented).toBe(false)
    expect(onExit).not.toHaveBeenCalled()
    expect(shown()).toEqual(['Alpha'])
  })

  it('fonctionne avec le vrai clavier', async () => {
    setup()

    await userEvent.keyboard('{ArrowRight} {Shift>} {/Shift}')

    expect(shown()).toEqual(['Bravo'])
  })
})

describe('PresentationMode : souris', () => {
  it('un clic gauche avance', async () => {
    setup()

    await userEvent.click(dialog())

    expect(shown()).toEqual(['Bravo'])
  })

  it('un clic sur la diapositive avance aussi, sans dépasser la dernière', async () => {
    setup(1)

    await userEvent.click(screen.getByText('Bravo'))
    expect(shown()).toEqual(['Charlie'])
    await userEvent.click(screen.getByText('Charlie'))

    expect(shown()).toEqual(['Charlie'])
  })
})

describe('PresentationMode : focus et plein écran', () => {
  it('donne le focus au conteneur à l\'ouverture', () => {
    setup()

    expect(dialog()).toHaveFocus()
  })

  it('demande le plein écran sur le conteneur à l\'ouverture', () => {
    const request = mockRequestFullscreen(() => Promise.resolve())

    setup()

    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.contexts[0]).toBe(dialog())
  })

  it('fonctionne sans API plein écran (jsdom, Safari ancien)', () => {
    setup()

    press('ArrowRight')

    expect(shown()).toEqual(['Bravo'])
  })

  it('reste utilisable quand la demande de plein écran est rejetée', async () => {
    const request = mockRequestFullscreen(() => Promise.reject(new Error('refusé')))
    const onExit = vi.fn()

    setup(0, onExit)
    await act(async () => {})

    expect(request).toHaveBeenCalledTimes(1)
    expect(dialog()).toBeInTheDocument()
    press('ArrowRight')
    expect(shown()).toEqual(['Bravo'])
    // Un plein écran refusé n'est pas une sortie.
    setFullscreenElement(null)
    fireFullscreenChange()
    expect(onExit).not.toHaveBeenCalled()
  })

  it('reste utilisable quand la demande lève une exception', () => {
    mockRequestFullscreen(() => {
      throw new Error('refusé')
    })

    setup()

    expect(dialog()).toBeInTheDocument()
  })

  it('quitter le plein écran (fullscreenchange sans élément) appelle onExit', async () => {
    mockRequestFullscreen(() => Promise.resolve())
    const { onExit } = setup()
    await act(async () => {})
    setFullscreenElement(null)

    fireFullscreenChange()

    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('détecte aussi le plein écran obtenu via fullscreenchange (sans promesse)', () => {
    mockRequestFullscreen(() => undefined)
    const { onExit } = setup()

    setFullscreenElement(dialog())
    fireFullscreenChange()
    expect(onExit).not.toHaveBeenCalled()

    setFullscreenElement(null)
    fireFullscreenChange()
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('fullscreenchange sans plein écran obtenu n\'appelle rien', () => {
    const { onExit } = setup()
    setFullscreenElement(null)

    fireFullscreenChange()

    expect(onExit).not.toHaveBeenCalled()
  })

  it('fullscreenchange tant que le plein écran est actif n\'appelle rien', async () => {
    mockRequestFullscreen(() => Promise.resolve())
    const { onExit } = setup()
    await act(async () => {})
    setFullscreenElement(dialog())

    fireFullscreenChange()

    expect(onExit).not.toHaveBeenCalled()
  })

  it('au démontage, quitte le plein écran s\'il existe encore', () => {
    const exit = mockExitFullscreen()
    const { unmount } = setup()
    setFullscreenElement(dialog())

    unmount()

    expect(exit).toHaveBeenCalledTimes(1)
  })

  it('au démontage, ne quitte rien s\'il n\'y a pas de plein écran', () => {
    const exit = mockExitFullscreen()
    const { unmount } = setup()

    unmount()

    expect(exit).not.toHaveBeenCalled()
  })

  it('au démontage, ignore une sortie du plein écran rejetée, levée ou absente', async () => {
    setFullscreenElement(document.body)

    mockExitFullscreen(() => Promise.reject(new Error('échec')))
    setup().unmount()
    await act(async () => {})

    mockExitFullscreen(() => {
      throw new Error('échec')
    })
    setup().unmount()

    Reflect.deleteProperty(document, 'exitFullscreen')
    setup().unmount()
  })
})

describe('PresentationMode : nettoyage', () => {
  it('retire l\'écouteur clavier au démontage', () => {
    const { onExit, unmount } = setup()

    unmount()
    const next = press('ArrowRight')
    const exit = press('Escape')

    expect(next.defaultPrevented).toBe(false)
    expect(exit.defaultPrevented).toBe(false)
    expect(onExit).not.toHaveBeenCalled()
  })

  it('retire l\'écouteur fullscreenchange au démontage', async () => {
    mockRequestFullscreen(() => Promise.resolve())
    const { onExit, unmount } = setup()
    await act(async () => {})

    unmount()
    setFullscreenElement(null)
    fireFullscreenChange()

    expect(onExit).not.toHaveBeenCalled()
  })

  it('utilise le dernier onExit après un nouveau rendu', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = render(<PresentationMode slides={slides} startIndex={0} onExit={first} />)

    rerender(<PresentationMode slides={slides} startIndex={0} onExit={second} />)
    press('Escape')

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})

describe('PresentationMode : touche Entrée maintenue', () => {
  it('ignore la répétition d\'Entrée mais empêche l\'action par défaut', () => {
    setup()

    const first = press('Enter')
    const repeated = press('Enter', { repeat: true })

    expect(shown()).toEqual(['Bravo'])
    expect(first.defaultPrevented).toBe(true)
    expect(repeated.defaultPrevented).toBe(true)
  })

  it('laisse Espace et les flèches se répéter', () => {
    setup()

    press(' ', { repeat: true })
    press('ArrowRight', { repeat: true })

    expect(shown()).toEqual(['Charlie'])
  })
})

describe('PresentationMode : nombre de diapositives qui change', () => {
  const makeSlides = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      ...createSlide(),
      elements: [createTextElement({ text: `Page ${i + 1}` })],
    }))

  it('repart de la dernière diapositive restante, pas de l\'index périmé', async () => {
    const five = makeSlides(5)
    const { rerender } = render(<PresentationMode slides={five} startIndex={4} onExit={vi.fn()} />)
    expect(screen.getByText('Page 5')).toBeInTheDocument()

    rerender(<PresentationMode slides={five.slice(0, 2)} startIndex={4} onExit={vi.fn()} />)
    expect(screen.getByText('Page 2')).toBeInTheDocument()
    expect(screen.getByText('2 / 2')).toBeInTheDocument()
    press('ArrowLeft')

    expect(screen.getByText('Page 1')).toBeInTheDocument()
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
  })

  it('un clic après la baisse ne dépasse pas la dernière diapositive', async () => {
    const five = makeSlides(5)
    const { rerender } = render(<PresentationMode slides={five} startIndex={4} onExit={vi.fn()} />)

    rerender(<PresentationMode slides={five.slice(0, 2)} startIndex={4} onExit={vi.fn()} />)
    await userEvent.click(dialog())

    expect(screen.getByText('2 / 2')).toBeInTheDocument()
  })

  it('ignore un changement de startIndex après le montage', () => {
    const { rerender } = render(<PresentationMode slides={slides} startIndex={0} onExit={vi.fn()} />)

    rerender(<PresentationMode slides={slides} startIndex={2} onExit={vi.fn()} />)

    expect(shown()).toEqual(['Alpha'])
  })
})

describe('PresentationMode : fermeture avant la réponse du plein écran', () => {
  // Promesse que le test résout à la main.
  function deferred() {
    let resolve!: () => void
    const promise = new Promise<void>((r) => {
      resolve = r
    })
    return { promise, resolve }
  }

  it('défait le plein écran obtenu après la fermeture', async () => {
    const { promise, resolve } = deferred()
    mockRequestFullscreen(() => promise)
    const exit = mockExitFullscreen()
    const { unmount } = setup()
    const container = dialog() as HTMLElement

    unmount()
    expect(exit).not.toHaveBeenCalled()
    setFullscreenElement(container)
    await act(async () => {
      resolve()
      await promise
    })

    expect(exit).toHaveBeenCalledTimes(1)
  })

  it('ne fait rien si le plein écran n\'a finalement pas été obtenu', async () => {
    const { promise, resolve } = deferred()
    mockRequestFullscreen(() => promise)
    const exit = mockExitFullscreen()
    const { unmount } = setup()

    unmount()
    await act(async () => {
      resolve()
      await promise
    })

    expect(exit).not.toHaveBeenCalled()
  })

  it('ne touche pas au plein écran d\'un autre élément', async () => {
    const { promise, resolve } = deferred()
    mockRequestFullscreen(() => promise)
    const exit = mockExitFullscreen()
    const { unmount } = setup()

    unmount()
    setFullscreenElement(document.body)
    await act(async () => {
      resolve()
      await promise
    })

    expect(exit).not.toHaveBeenCalled()
  })

  it('reste en plein écran si la présentation est toujours ouverte', async () => {
    const { promise, resolve } = deferred()
    mockRequestFullscreen(() => promise)
    const exit = mockExitFullscreen()
    const { onExit } = setup()
    setFullscreenElement(dialog())

    await act(async () => {
      resolve()
      await promise
    })

    expect(exit).not.toHaveBeenCalled()
    // Le plein écran est maintenant connu : le quitter ferme la présentation.
    setFullscreenElement(null)
    fireFullscreenChange()
    expect(onExit).toHaveBeenCalledTimes(1)
  })
})

describe('PresentationMode : sous StrictMode', () => {
  it('reste utilisable, demande le plein écran et ne le quitte pas à tort', async () => {
    const request = mockRequestFullscreen(() => Promise.resolve())
    const exit = mockExitFullscreen()
    const onExit = vi.fn()

    render(
      <StrictMode>
        <PresentationMode slides={slides} startIndex={0} onExit={onExit} />
      </StrictMode>,
    )
    await act(async () => {})

    expect(request).toHaveBeenCalled()
    expect(exit).not.toHaveBeenCalled()
    expect(dialog()).toHaveFocus()
    press('ArrowRight')
    expect(shown()).toEqual(['Bravo'])
    press('Escape')
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('une réponse tardive du premier montage ne défait pas le plein écran', async () => {
    const request = mockRequestFullscreen(() => Promise.resolve())
    const exit = mockExitFullscreen()

    render(
      <StrictMode>
        <PresentationMode slides={slides} startIndex={0} onExit={vi.fn()} />
      </StrictMode>,
    )
    setFullscreenElement(dialog())
    await act(async () => {})

    expect(request.mock.calls.length).toBeGreaterThanOrEqual(1)
    expect(exit).not.toHaveBeenCalled()
  })
})
