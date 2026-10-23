import { renderHook } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  isArrowKeyTarget,
  isTextEntryTarget,
  isTypingTarget,
  useKeyboardShortcuts,
} from './useKeyboardShortcuts'

function makeInput(type?: string) {
  const input = document.createElement('input')
  if (type !== undefined) input.setAttribute('type', type)
  return input
}

describe('isTextEntryTarget', () => {
  it.each([
    ['textarea', document.createElement('textarea'), true],
    ['input sans type', makeInput(), true],
    ['input text', makeInput('text'), true],
    ['input number', makeInput('number'), true],
    ['input search', makeInput('search'), true],
    ['input url', makeInput('url'), true],
    ['input email', makeInput('email'), true],
    ['input tel', makeInput('tel'), true],
    ['input password', makeInput('password'), true],
    ['input TEXT en majuscules', makeInput('TEXT'), true],
    ['input color', makeInput('color'), false],
    ['input checkbox', makeInput('checkbox'), false],
    ['input radio', makeInput('radio'), false],
    ['input range', makeInput('range'), false],
    ['input file', makeInput('file'), false],
    ['input button', makeInput('button'), false],
    ['bouton', document.createElement('button'), false],
    ['select', document.createElement('select'), false],
    ['div', document.createElement('div'), false],
    ['body', document.body, false],
    ['null', null, false],
    ['window', window, false],
  ])('%s', (_name, target, expected) => {
    expect(isTextEntryTarget(target)).toBe(expected)
  })

  it('reconnaît un élément contentEditable, pas contenteditable="false"', () => {
    const on = document.createElement('div')
    on.setAttribute('contenteditable', 'true')
    expect(isTextEntryTarget(on)).toBe(true)
    const off = document.createElement('div')
    off.setAttribute('contenteditable', 'false')
    expect(isTextEntryTarget(off)).toBe(false)
  })
})

describe('isTypingTarget', () => {
  it('reconnaît input, textarea et select', () => {
    for (const tag of ['input', 'textarea', 'select']) {
      expect(isTypingTarget(document.createElement(tag))).toBe(true)
    }
  })

  it('reconnaît un élément contentEditable', () => {
    const plein = document.createElement('div')
    plein.setAttribute('contenteditable', 'true')
    expect(isTypingTarget(plein)).toBe(true)

    const vide = document.createElement('div')
    vide.setAttribute('contenteditable', '')
    expect(isTypingTarget(vide)).toBe(true)
  })

  it('refuse contenteditable="false", les autres éléments et null', () => {
    const off = document.createElement('div')
    off.setAttribute('contenteditable', 'false')
    expect(isTypingTarget(off)).toBe(false)
    expect(isTypingTarget(document.createElement('div'))).toBe(false)
    expect(isTypingTarget(document.createElement('button'))).toBe(false)
    expect(isTypingTarget(document.body)).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
    expect(isTypingTarget(window)).toBe(false)
  })
})

describe('useKeyboardShortcuts', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it.each(['Delete', 'Backspace'])(
    '%s appelle le handler quand un élément est sélectionné',
    async (key) => {
      const onDeleteSelection = vi.fn()
      renderHook(() => useKeyboardShortcuts({ hasSelection: true, onDeleteSelection }))

      await userEvent.keyboard(`{${key}}`)

      expect(onDeleteSelection).toHaveBeenCalledTimes(1)
    },
  )

  it.each(['Delete', 'Backspace'])('%s ne fait rien sans sélection', async (key) => {
    const onDeleteSelection = vi.fn()
    renderHook(() => useKeyboardShortcuts({ hasSelection: false, onDeleteSelection }))

    await userEvent.keyboard(`{${key}}`)

    expect(onDeleteSelection).not.toHaveBeenCalled()
  })

  it.each(['Delete', 'Backspace'])('%s ne fait rien dans un champ de saisie', async (key) => {
    const onDeleteSelection = vi.fn()
    renderHook(() => useKeyboardShortcuts({ hasSelection: true, onDeleteSelection }))
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()

    await userEvent.keyboard(`{${key}}`)

    expect(onDeleteSelection).not.toHaveBeenCalled()
  })

  it('ignore les autres touches', async () => {
    const onDeleteSelection = vi.fn()
    renderHook(() => useKeyboardShortcuts({ hasSelection: true, onDeleteSelection }))

    await userEvent.keyboard('a{Enter}{Escape}')

    expect(onDeleteSelection).not.toHaveBeenCalled()
  })

  it('n\'empêche l\'action par défaut que quand il agit', () => {
    renderHook(() => useKeyboardShortcuts({ hasSelection: true, onDeleteSelection: vi.fn() }))

    const acted = new KeyboardEvent('keydown', { key: 'Delete', cancelable: true })
    window.dispatchEvent(acted)
    expect(acted.defaultPrevented).toBe(true)

    const input = document.createElement('input')
    document.body.append(input)
    const ignored = new KeyboardEvent('keydown', {
      key: 'Backspace',
      cancelable: true,
      bubbles: true,
    })
    input.dispatchEvent(ignored)
    expect(ignored.defaultPrevented).toBe(false)
  })

  it.each([['ctrlKey'], ['altKey'], ['metaKey'], ['repeat']])(
    'ignore Delete quand %s est actif, sans empêcher l\'action par défaut',
    (modifier) => {
      const onDeleteSelection = vi.fn()
      renderHook(() => useKeyboardShortcuts({ hasSelection: true, onDeleteSelection }))

      const event = new KeyboardEvent('keydown', {
        key: 'Delete',
        cancelable: true,
        [modifier]: true,
      })
      window.dispatchEvent(event)

      expect(onDeleteSelection).not.toHaveBeenCalled()
      expect(event.defaultPrevented).toBe(false)
    },
  )

  it('utilise toujours les dernières valeurs après un nouveau rendu', async () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook((props) => useKeyboardShortcuts(props), {
      initialProps: { hasSelection: true, onDeleteSelection: first },
    })

    rerender({ hasSelection: true, onDeleteSelection: second })
    await userEvent.keyboard('{Delete}')

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('retire son listener au démontage', async () => {
    const onDeleteSelection = vi.fn()
    const { unmount } = renderHook(() =>
      useKeyboardShortcuts({ hasSelection: true, onDeleteSelection }),
    )

    unmount()
    await userEvent.keyboard('{Delete}')

    expect(onDeleteSelection).not.toHaveBeenCalled()
  })
})

describe('useKeyboardShortcuts : option enabled', () => {
  function press(init: KeyboardEventInit) {
    const event = new KeyboardEvent('keydown', { cancelable: true, bubbles: true, ...init })
    window.dispatchEvent(event)
    return event
  }

  function setup(enabled?: boolean) {
    const handlers = { onDeleteSelection: vi.fn(), onUndo: vi.fn(), onRedo: vi.fn() }
    const view = renderHook((props) => useKeyboardShortcuts(props), {
      initialProps: { hasSelection: true, enabled, ...handlers },
    })
    return { ...handlers, ...view }
  }

  it.each([
    ['Delete', { key: 'Delete' }],
    ['Backspace', { key: 'Backspace' }],
    ['Ctrl+Z', { key: 'z', ctrlKey: true }],
    ['Ctrl+Y', { key: 'y', ctrlKey: true }],
    ['Ctrl+Maj+Z', { key: 'Z', ctrlKey: true, shiftKey: true }],
  ])('%s ne déclenche rien et ne bloque rien avec enabled: false', (_name, init) => {
    const { onDeleteSelection, onUndo, onRedo } = setup(false)

    const event = press(init)

    expect(onDeleteSelection).not.toHaveBeenCalled()
    expect(onUndo).not.toHaveBeenCalled()
    expect(onRedo).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it.each([undefined, true])('les raccourcis agissent avec enabled: %s', (enabled) => {
    const { onDeleteSelection, onUndo, onRedo } = setup(enabled)

    press({ key: 'Delete' })
    press({ key: 'z', ctrlKey: true })
    press({ key: 'y', ctrlKey: true })

    expect(onDeleteSelection).toHaveBeenCalledTimes(1)
    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(onRedo).toHaveBeenCalledTimes(1)
  })

  it('se réactive proprement, sans rejouer ce qui a été ignoré', () => {
    const { onDeleteSelection, onUndo, rerender } = setup(false)
    press({ key: 'Delete' })
    press({ key: 'z', ctrlKey: true })

    rerender({ hasSelection: true, enabled: true, onDeleteSelection, onUndo, onRedo: vi.fn() })
    expect(onDeleteSelection).not.toHaveBeenCalled()
    press({ key: 'Delete' })
    press({ key: 'z', ctrlKey: true })

    expect(onDeleteSelection).toHaveBeenCalledTimes(1)
    expect(onUndo).toHaveBeenCalledTimes(1)

    rerender({ hasSelection: true, enabled: false, onDeleteSelection, onUndo, onRedo: vi.fn() })
    press({ key: 'Delete' })
    expect(onDeleteSelection).toHaveBeenCalledTimes(1)
  })
})

describe('useKeyboardShortcuts : annuler et rétablir', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  function setup() {
    const onUndo = vi.fn()
    const onRedo = vi.fn()
    const view = renderHook(() =>
      useKeyboardShortcuts({
        hasSelection: false,
        onDeleteSelection: vi.fn(),
        onUndo,
        onRedo,
      }),
    )
    return { onUndo, onRedo, ...view }
  }

  // Envoie un keydown annulable sur la cible et rend l'événement pour lire defaultPrevented.
  function press(init: KeyboardEventInit, target: EventTarget = window) {
    const event = new KeyboardEvent('keydown', { cancelable: true, bubbles: true, ...init })
    target.dispatchEvent(event)
    return event
  }

  it.each([
    ['Ctrl+Z', { key: 'z', ctrlKey: true }, 'undo'],
    ['Cmd+Z', { key: 'z', metaKey: true }, 'undo'],
    ['Ctrl+Z en majuscule', { key: 'Z', ctrlKey: true }, 'undo'],
    ['Ctrl+Y', { key: 'y', ctrlKey: true }, 'redo'],
    ['Cmd+Y', { key: 'y', metaKey: true }, 'redo'],
    ['Ctrl+Maj+Z', { key: 'Z', ctrlKey: true, shiftKey: true }, 'redo'],
    ['Cmd+Maj+Z', { key: 'Z', metaKey: true, shiftKey: true }, 'redo'],
  ] as const)('%s déclenche %s', (_name, init, expected) => {
    const { onUndo, onRedo } = setup()

    const event = press(init)

    expect(onUndo).toHaveBeenCalledTimes(expected === 'undo' ? 1 : 0)
    expect(onRedo).toHaveBeenCalledTimes(expected === 'redo' ? 1 : 0)
    expect(event.defaultPrevented).toBe(true)
  })

  it.each([
    ['Z seul', { key: 'z' }],
    ['Y seul', { key: 'y' }],
    ['Ctrl+Maj+Y', { key: 'Y', ctrlKey: true, shiftKey: true }],
    ['Ctrl+X', { key: 'x', ctrlKey: true }],
    ['Ctrl+Alt+Z', { key: 'z', ctrlKey: true, altKey: true }],
    ['Cmd+Alt+Y', { key: 'y', metaKey: true, altKey: true }],
  ])('%s ne déclenche rien et ne bloque pas le navigateur', (_name, init) => {
    const { onUndo, onRedo } = setup()

    const event = press(init)

    expect(onUndo).not.toHaveBeenCalled()
    expect(onRedo).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('la répétition de touche reste autorisée', () => {
    const { onUndo, onRedo } = setup()

    press({ key: 'z', ctrlKey: true, repeat: true })
    press({ key: 'y', ctrlKey: true, repeat: true })

    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(onRedo).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['un textarea', () => document.createElement('textarea')],
    ['un input texte', () => makeInput('text')],
    ['un input sans type', () => makeInput()],
    ['un input nombre', () => makeInput('number')],
  ])('est ignoré dans %s, sans bloquer le annuler du navigateur', (_name, make) => {
    const { onUndo, onRedo } = setup()
    const field = make()
    document.body.append(field)
    field.focus()

    const undo = press({ key: 'z', ctrlKey: true }, field)
    const redo = press({ key: 'y', ctrlKey: true }, field)

    expect(onUndo).not.toHaveBeenCalled()
    expect(onRedo).not.toHaveBeenCalled()
    expect(undo.defaultPrevented).toBe(false)
    expect(redo.defaultPrevented).toBe(false)
  })

  it.each([
    ['un input color', () => makeInput('color')],
    ['un input checkbox', () => makeInput('checkbox')],
    ['un bouton', () => document.createElement('button')],
    ['body', () => document.body],
  ])('est déclenché quand la cible est %s', (_name, make) => {
    const { onUndo, onRedo } = setup()
    const target = make()
    if (target !== document.body) document.body.append(target)

    press({ key: 'z', ctrlKey: true }, target)
    press({ key: 'y', ctrlKey: true }, target)

    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(onRedo).toHaveBeenCalledTimes(1)
  })

  it('fonctionne avec le vrai clavier (Ctrl+Z, Ctrl+Y, Ctrl+Maj+Z)', async () => {
    const { onUndo, onRedo } = setup()

    await userEvent.keyboard('{Control>}z{/Control}')
    await userEvent.keyboard('{Control>}y{/Control}')
    await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')

    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(onRedo).toHaveBeenCalledTimes(2)
  })

  it('ne casse pas Delete : Ctrl+Suppr reste ignoré, Suppr agit toujours', async () => {
    const onDeleteSelection = vi.fn()
    renderHook(() =>
      useKeyboardShortcuts({ hasSelection: true, onDeleteSelection, onUndo: vi.fn() }),
    )

    await userEvent.keyboard('{Delete}')
    await userEvent.keyboard('{Control>}{Delete}{/Control}')

    expect(onDeleteSelection).toHaveBeenCalledTimes(1)
  })

  it('sans callback fourni, rien ne se passe et rien n\'est bloqué', () => {
    renderHook(() => useKeyboardShortcuts({ hasSelection: false, onDeleteSelection: vi.fn() }))

    const event = press({ key: 'z', ctrlKey: true })

    expect(event.defaultPrevented).toBe(false)
  })

  it('utilise toujours les derniers callbacks après un nouveau rendu', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook((props) => useKeyboardShortcuts(props), {
      initialProps: { hasSelection: false, onDeleteSelection: vi.fn(), onUndo: first },
    })

    rerender({ hasSelection: false, onDeleteSelection: vi.fn(), onUndo: second })
    press({ key: 'z', ctrlKey: true })

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('retire son listener au démontage', () => {
    const { onUndo, onRedo, unmount } = setup()

    unmount()
    const event = press({ key: 'z', ctrlKey: true })
    press({ key: 'y', ctrlKey: true })

    expect(onUndo).not.toHaveBeenCalled()
    expect(onRedo).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })
})

// Envoie un événement clavier annulable sur la cible (window par défaut).
function fire(
  init: KeyboardEventInit,
  target: EventTarget = window,
  type: 'keydown' | 'keyup' = 'keydown',
) {
  const event = new KeyboardEvent(type, { cancelable: true, bubbles: true, ...init })
  target.dispatchEvent(event)
  return event
}

describe('isArrowKeyTarget', () => {
  function withRole(role: string) {
    const element = document.createElement('div')
    element.setAttribute('role', role)
    return element
  }
  function editable(value: string) {
    const element = document.createElement('div')
    element.setAttribute('contenteditable', value)
    return element
  }

  it.each([
    ['input sans type', makeInput(), true],
    ['input text', makeInput('text'), true],
    ['input number', makeInput('number'), true],
    ['input range', makeInput('range'), true],
    ['input color', makeInput('color'), true],
    ['input checkbox', makeInput('checkbox'), true],
    ['select', document.createElement('select'), true],
    ['textarea', document.createElement('textarea'), true],
    ['contentEditable', editable('true'), true],
    ['contenteditable vide', editable(''), true],
    ['role slider', withRole('slider'), true],
    ['contenteditable false', editable('false'), false],
    ['role button', withRole('button'), false],
    ['bouton', document.createElement('button'), false],
    ['div', document.createElement('div'), false],
    ['body', document.body, false],
    ['null', null, false],
    ['window', window, false],
  ])('%s', (_name, target, expected) => {
    expect(isArrowKeyTarget(target)).toBe(expected)
  })
})

describe('useKeyboardShortcuts : dupliquer (Ctrl/Cmd+D)', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  function setup(overrides: { hasSelection?: boolean; enabled?: boolean } = {}) {
    const onDuplicate = vi.fn()
    renderHook(() =>
      useKeyboardShortcuts({
        hasSelection: true,
        onDeleteSelection: vi.fn(),
        onDuplicate,
        ...overrides,
      }),
    )
    return { onDuplicate }
  }

  it.each([
    ['Ctrl+D', { key: 'd', ctrlKey: true }],
    ['Cmd+D', { key: 'd', metaKey: true }],
    ['Ctrl+D en majuscule', { key: 'D', ctrlKey: true }],
  ])('%s duplique et bloque le navigateur', (_name, init) => {
    const { onDuplicate } = setup()

    const event = fire(init)

    expect(onDuplicate).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it.each([
    ['D seul', { key: 'd' }],
    ['Ctrl+Maj+D', { key: 'D', ctrlKey: true, shiftKey: true }],
    ['Ctrl+Alt+D', { key: 'd', ctrlKey: true, altKey: true }],
    ['Cmd+Alt+D', { key: 'd', metaKey: true, altKey: true }],
    ['Ctrl+F', { key: 'f', ctrlKey: true }],
  ])('%s ne déclenche rien et ne bloque pas le navigateur', (_name, init) => {
    const { onDuplicate } = setup()

    const event = fire(init)

    expect(onDuplicate).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it.each([
    ['un textarea', () => document.createElement('textarea')],
    ['un input texte', () => makeInput('text')],
  ])('est ignoré dans %s, sans bloquer le navigateur', (_name, make) => {
    const { onDuplicate } = setup()
    const field = make()
    document.body.append(field)
    field.focus()

    const event = fire({ key: 'd', ctrlKey: true }, field)

    expect(onDuplicate).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('est déclenché depuis un bouton et un input color', () => {
    const { onDuplicate } = setup()
    const button = document.createElement('button')
    const color = makeInput('color')
    document.body.append(button, color)

    fire({ key: 'd', ctrlKey: true }, button)
    fire({ key: 'd', ctrlKey: true }, color)

    expect(onDuplicate).toHaveBeenCalledTimes(2)
  })

  it('est ignoré sans sélection, sans bloquer le navigateur', () => {
    const { onDuplicate } = setup({ hasSelection: false })

    const event = fire({ key: 'd', ctrlKey: true })

    expect(onDuplicate).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('est ignoré avec enabled: false, sans bloquer le navigateur', () => {
    const { onDuplicate } = setup({ enabled: false })

    const event = fire({ key: 'd', ctrlKey: true })

    expect(onDuplicate).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('est ignoré sans callback fourni', () => {
    renderHook(() => useKeyboardShortcuts({ hasSelection: true, onDeleteSelection: vi.fn() }))

    const event = fire({ key: 'd', ctrlKey: true })

    expect(event.defaultPrevented).toBe(false)
  })

  it('une touche maintenue ne crée qu\'une copie', () => {
    const { onDuplicate } = setup()

    fire({ key: 'd', ctrlKey: true })
    fire({ key: 'd', ctrlKey: true, repeat: true })
    fire({ key: 'd', ctrlKey: true, repeat: true })

    expect(onDuplicate).toHaveBeenCalledTimes(1)
  })
})

describe('useKeyboardShortcuts : déplacer avec les flèches', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  function setup(overrides: { hasSelection?: boolean; enabled?: boolean } = {}) {
    const onNudge = vi.fn()
    const onNudgeEnd = vi.fn()
    const view = renderHook(() =>
      useKeyboardShortcuts({
        hasSelection: true,
        onDeleteSelection: vi.fn(),
        onNudge,
        onNudgeEnd,
        ...overrides,
      }),
    )
    return { onNudge, onNudgeEnd, ...view }
  }

  it.each([
    ['ArrowLeft', -1, 0],
    ['ArrowRight', 1, 0],
    ['ArrowUp', 0, -1],
    ['ArrowDown', 0, 1],
  ])('%s déplace de 1 unité', (key, dx, dy) => {
    const { onNudge } = setup()

    const event = fire({ key })

    expect(onNudge).toHaveBeenCalledTimes(1)
    expect(onNudge).toHaveBeenCalledWith(dx, dy)
    expect(event.defaultPrevented).toBe(true)
  })

  it.each([
    ['ArrowLeft', -10, 0],
    ['ArrowRight', 10, 0],
    ['ArrowUp', 0, -10],
    ['ArrowDown', 0, 10],
  ])('Maj+%s déplace de 10 unités', (key, dx, dy) => {
    const { onNudge } = setup()

    fire({ key, shiftKey: true })

    expect(onNudge).toHaveBeenCalledTimes(1)
    expect(onNudge).toHaveBeenCalledWith(dx, dy)
  })

  it.each([
    ['Ctrl', { ctrlKey: true }],
    ['Alt', { altKey: true }],
    ['Meta', { metaKey: true }],
  ])('est ignoré avec %s, sans bloquer le navigateur', (_name, modifier) => {
    const { onNudge } = setup()

    const event = fire({ key: 'ArrowRight', ...modifier })

    expect(onNudge).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('ignore les autres touches', () => {
    const { onNudge } = setup()

    fire({ key: 'a' })
    fire({ key: 'Home' })
    fire({ key: 'constructor' })

    expect(onNudge).not.toHaveBeenCalled()
  })

  it('est ignoré sans sélection, sans bloquer le navigateur', () => {
    const { onNudge } = setup({ hasSelection: false })

    const event = fire({ key: 'ArrowDown' })

    expect(onNudge).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('est ignoré avec enabled: false, sans bloquer le navigateur', () => {
    const { onNudge } = setup({ enabled: false })

    const event = fire({ key: 'ArrowDown' })

    expect(onNudge).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('est ignoré sans callback fourni', () => {
    renderHook(() => useKeyboardShortcuts({ hasSelection: true, onDeleteSelection: vi.fn() }))

    const event = fire({ key: 'ArrowDown' })

    expect(event.defaultPrevented).toBe(false)
  })

  it.each([
    ['un input range', () => makeInput('range')],
    ['un input texte', () => makeInput('text')],
    ['un input nombre', () => makeInput('number')],
    ['un input color', () => makeInput('color')],
    ['un select', () => document.createElement('select')],
    ['un textarea', () => document.createElement('textarea')],
    [
      'un élément role=slider',
      () => {
        const slider = document.createElement('div')
        slider.setAttribute('role', 'slider')
        return slider
      },
    ],
    [
      'un élément contentEditable',
      () => {
        const editable = document.createElement('div')
        editable.setAttribute('contenteditable', 'true')
        return editable
      },
    ],
  ])('laisse les flèches à %s', (_name, make) => {
    const { onNudge } = setup()
    const control = make()
    document.body.append(control)

    const event = fire({ key: 'ArrowRight' }, control)

    expect(onNudge).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it.each([
    ['body', () => document.body],
    ['un bouton', () => document.createElement('button')],
  ])('se déclenche quand la cible est %s', (_name, make) => {
    const { onNudge } = setup()
    const target = make()
    if (target !== document.body) document.body.append(target)

    fire({ key: 'ArrowRight' }, target)

    expect(onNudge).toHaveBeenCalledTimes(1)
    expect(onNudge).toHaveBeenCalledWith(1, 0)
  })

  it('les répétitions de la touche sont autorisées', () => {
    const { onNudge } = setup()

    fire({ key: 'ArrowRight' })
    fire({ key: 'ArrowRight', repeat: true })
    fire({ key: 'ArrowRight', repeat: true })

    expect(onNudge).toHaveBeenCalledTimes(3)
  })

  it('appelle onNudgeEnd au keyup d\'une flèche, même sans sélection', () => {
    const { onNudgeEnd } = setup({ hasSelection: false })

    fire({ key: 'ArrowLeft' }, window, 'keyup')
    fire({ key: 'ArrowDown', shiftKey: true }, window, 'keyup')

    expect(onNudgeEnd).toHaveBeenCalledTimes(2)
  })

  it('n\'appelle pas onNudgeEnd pour une autre touche, ni au keydown', () => {
    const { onNudgeEnd } = setup()

    fire({ key: 'ArrowLeft' })
    fire({ key: 'a' }, window, 'keyup')
    fire({ key: 'constructor' }, window, 'keyup')

    expect(onNudgeEnd).not.toHaveBeenCalled()
  })

  it('utilise toujours les derniers callbacks après un nouveau rendu', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook((props) => useKeyboardShortcuts(props), {
      initialProps: { hasSelection: true, onDeleteSelection: vi.fn(), onNudge: first },
    })

    rerender({ hasSelection: true, onDeleteSelection: vi.fn(), onNudge: second })
    fire({ key: 'ArrowUp' })

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('retire ses listeners au démontage', () => {
    const { onNudge, onNudgeEnd, unmount } = setup()

    unmount()
    const event = fire({ key: 'ArrowUp' })
    fire({ key: 'ArrowUp' }, window, 'keyup')

    expect(onNudge).not.toHaveBeenCalled()
    expect(onNudgeEnd).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })
})
