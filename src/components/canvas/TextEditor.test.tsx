import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createTextElement } from '../../model/factories'
import { MAX_TEXT_LENGTH } from '../../model/limits'
import { TextEditor } from './TextEditor'

function setup(overrides: Parameters<typeof createTextElement>[0] = { text: 'Bonjour' }) {
  const onCommit = vi.fn()
  const onCancel = vi.fn()
  const element = createTextElement(overrides)
  render(<TextEditor element={element} onCommit={onCommit} onCancel={onCancel} />)
  const textarea = screen.getByRole('textbox', { name: 'Modifier le texte' }) as HTMLTextAreaElement
  return { textarea, onCommit, onCancel, element }
}

describe('TextEditor : limite de longueur', () => {
  it("limite la saisie à la longueur acceptée par l'import de fichier", () => {
    const { textarea } = setup()

    expect(textarea).toHaveAttribute('maxlength', String(MAX_TEXT_LENGTH))
  })
})

describe('TextEditor : style du texte', () => {
  it('applique gras, italique et alignement comme le rendu normal', () => {
    const { textarea } = setup({ bold: true, italic: true, align: 'right' })

    expect(textarea).toHaveStyle({ fontWeight: '700', fontStyle: 'italic', textAlign: 'right' })
  })

  it('un texte par défaut est en graisse normale, sans italique, aligné à gauche', () => {
    const { textarea } = setup()

    // Lecture directe du style en ligne : jsdom calcule mal la valeur « normal ».
    const { style } = textarea
    expect([style.fontWeight, style.fontStyle, style.textAlign]).toEqual(['normal', 'normal', 'left'])
  })

  it('reprend la police du texte comme le rendu normal', () => {
    const { textarea } = setup({ fontFamily: 'Georgia' })

    expect(textarea.style.fontFamily).toBe('Georgia, "Times New Roman", serif')
  })

  it("sans police choisie, garde la police de l'application (inherit)", () => {
    const { textarea } = setup({ fontFamily: null })

    expect(textarea.style.fontFamily).toBe('inherit')
  })

  it('applique le centrage', () => {
    const { textarea } = setup({ align: 'center' })

    expect(textarea).toHaveStyle({ textAlign: 'center' })
  })
})

describe('TextEditor', () => {
  it('prend le focus à l\'ouverture avec tout le texte sélectionné', () => {
    const { textarea } = setup()

    expect(textarea).toHaveFocus()
    expect(textarea.value).toBe('Bonjour')
    expect(textarea.selectionStart).toBe(0)
    expect(textarea.selectionEnd).toBe('Bonjour'.length)
  })

  it('se place sur la boîte de l\'élément avec les mêmes styles que le rendu', () => {
    const { textarea } = setup({
      x: 10,
      y: 20,
      width: 300,
      height: 80,
      fontSize: 40,
      color: '#ff0000',
      fill: '#00ff00',
    })

    expect(textarea).toHaveStyle({
      position: 'absolute',
      left: '10px',
      top: '20px',
      width: '300px',
      height: '80px',
      fontSize: '40px',
      color: '#ff0000',
      backgroundColor: '#00ff00',
      padding: '8px',
      boxSizing: 'border-box',
      lineHeight: '1.25',
      resize: 'none',
    })
  })

  it('reste transparent sans fond', () => {
    const { textarea } = setup({ fill: null })

    expect(textarea.style.backgroundColor).toBe('transparent')
  })

  it('valide le nouveau texte à la perte de focus', async () => {
    const { textarea, onCommit, onCancel } = setup()

    await userEvent.keyboard('Salut')
    fireEvent.blur(textarea)

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith('Salut')
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('valide avec Ctrl+Entrée', async () => {
    const { onCommit, onCancel } = setup()

    await userEvent.keyboard('Salut{Control>}{Enter}{/Control}')

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith('Salut')
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('valide avec Cmd+Entrée', async () => {
    const { textarea, onCommit } = setup()

    await userEvent.keyboard('Salut')
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })

    expect(onCommit).toHaveBeenCalledWith('Salut')
  })

  it('annule avec Échap sans valider, même après le blur qui suit', async () => {
    const { textarea, onCommit, onCancel } = setup()

    await userEvent.keyboard('Salut{Escape}')
    fireEvent.blur(textarea)

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('un texte inchangé n\'appelle pas onCommit mais onCancel', () => {
    const { textarea, onCommit, onCancel } = setup()

    fireEvent.blur(textarea)

    expect(onCommit).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('un seul appel même si le blur suit une validation au clavier', async () => {
    const { textarea, onCommit, onCancel } = setup()

    await userEvent.keyboard('Salut{Control>}{Enter}{/Control}')
    fireEvent.blur(textarea)
    fireEvent.blur(textarea)

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('Entrée seule insère un retour à la ligne sans rien appeler', async () => {
    const { textarea, onCommit, onCancel } = setup()

    await userEvent.keyboard('A{Enter}B')

    expect(textarea.value).toBe('A\nB')
    expect(onCommit).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('n\'envoie ni pointerdown ni keydown au parent', async () => {
    const onParentPointerDown = vi.fn()
    const onParentKeyDown = vi.fn()
    const element = createTextElement({ text: 'Bonjour' })
    render(
      <div onPointerDown={onParentPointerDown} onKeyDown={onParentKeyDown}>
        <TextEditor element={element} onCommit={() => {}} onCancel={() => {}} />
      </div>,
    )

    fireEvent.pointerDown(screen.getByRole('textbox'))
    await userEvent.keyboard('a')

    expect(onParentPointerDown).not.toHaveBeenCalled()
    expect(onParentKeyDown).not.toHaveBeenCalled()
  })

  it('décrit les raccourcis dans un texte masqué visuellement', () => {
    const { textarea } = setup()

    expect(textarea).toHaveAccessibleDescription('Ctrl+Entrée pour valider, Échap pour annuler.')
    expect(textarea).toHaveAttribute('aria-describedby')
    const hint = document.getElementById(textarea.getAttribute('aria-describedby') ?? '')
    expect(hint).toHaveClass('sr-only')
  })

  describe('clic ailleurs sur la page (pointerdown)', () => {
    it('valide le nouveau texte quand le pointerdown vise hors du champ', async () => {
      const { onCommit, onCancel } = setup()
      await userEvent.keyboard('Salut')

      fireEvent.pointerDown(document.body)

      expect(onCommit).toHaveBeenCalledTimes(1)
      expect(onCommit).toHaveBeenCalledWith('Salut')
      expect(onCancel).not.toHaveBeenCalled()
    })

    it('ne valide pas quand le pointerdown vise le champ', async () => {
      const { textarea, onCommit, onCancel } = setup()
      await userEvent.keyboard('Salut')

      fireEvent.pointerDown(textarea)

      expect(onCommit).not.toHaveBeenCalled()
      expect(onCancel).not.toHaveBeenCalled()
    })

    it('annule quand le texte est inchangé', () => {
      const { onCommit, onCancel } = setup()

      fireEvent.pointerDown(document.body)

      expect(onCommit).not.toHaveBeenCalled()
      expect(onCancel).toHaveBeenCalledTimes(1)
    })

    it('ne fait qu\'un seul appel, même avec un blur et un second pointerdown', async () => {
      const { textarea, onCommit, onCancel } = setup()
      await userEvent.keyboard('Salut')

      fireEvent.pointerDown(document.body)
      fireEvent.blur(textarea)
      fireEvent.pointerDown(document.body)

      expect(onCommit).toHaveBeenCalledTimes(1)
      expect(onCancel).not.toHaveBeenCalled()
    })

    it('retire l\'écouteur au démontage', () => {
      const onCommit = vi.fn()
      const onCancel = vi.fn()
      const { unmount } = render(
        <TextEditor element={createTextElement({ text: 'A' })} onCommit={onCommit} onCancel={onCancel} />,
      )
      unmount()

      fireEvent.pointerDown(document.body)

      expect(onCommit).not.toHaveBeenCalled()
      expect(onCancel).not.toHaveBeenCalled()
    })

    it('utilise les callbacks du dernier rendu', async () => {
      const first = vi.fn()
      const second = vi.fn()
      const element = createTextElement({ text: 'A' })
      const { rerender } = render(<TextEditor element={element} onCommit={first} onCancel={() => {}} />)
      rerender(<TextEditor element={element} onCommit={second} onCancel={() => {}} />)

      await userEvent.keyboard('B')
      fireEvent.pointerDown(document.body)

      expect(first).not.toHaveBeenCalled()
      expect(second).toHaveBeenCalledWith('B')
    })
  })

  it('laisse le texte sélectionnable à l\'intérieur', () => {
    const { textarea } = setup()

    expect(textarea.style.userSelect).toBe('')
    expect(textarea.style.touchAction).toBe('')
  })
})
