import { renderHook } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { isTypingTarget, useKeyboardShortcuts } from './useKeyboardShortcuts'

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
