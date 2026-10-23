import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ElementToolbar } from './ElementToolbar'

function renderToolbar(overrides: Partial<Parameters<typeof ElementToolbar>[0]> = {}) {
  const handlers = {
    onAddText: vi.fn(),
    onAddRect: vi.fn(),
    onAddImageFromUrl: vi.fn(),
    onAddImageFromFile: vi.fn(),
    onDelete: vi.fn(),
    onDuplicate: vi.fn(),
  }
  render(<ElementToolbar canDelete={true} error={null} {...handlers} {...overrides} />)
  return handlers
}

const urlField = () => screen.getByRole('textbox', { name: 'Adresse de l\'image' })
const queryUrlField = () => screen.queryByRole('textbox', { name: 'Adresse de l\'image' })
const openUrlForm = () => userEvent.click(screen.getByRole('button', { name: 'Image (URL)' }))

describe('ElementToolbar', () => {
  it('est une barre d\'outils nommée avec ses six boutons', () => {
    renderToolbar()

    expect(screen.getByRole('toolbar', { name: 'Ajouter des éléments' })).toBeInTheDocument()
    const names = [
      'Texte',
      'Rectangle',
      'Image (URL)',
      'Image (fichier)',
      'Dupliquer l\'élément',
      'Supprimer l\'élément',
    ]
    for (const name of names) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('appelle les callbacks de Texte, Rectangle et Supprimer', async () => {
    const h = renderToolbar()

    await userEvent.click(screen.getByRole('button', { name: 'Texte' }))
    await userEvent.click(screen.getByRole('button', { name: 'Rectangle' }))
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer l\'élément' }))

    expect(h.onAddText).toHaveBeenCalledTimes(1)
    expect(h.onAddRect).toHaveBeenCalledTimes(1)
    expect(h.onDelete).toHaveBeenCalledTimes(1)
  })

  it('désactive Supprimer sans sélection', async () => {
    const h = renderToolbar({ canDelete: false })
    const del = screen.getByRole('button', { name: 'Supprimer l\'élément' })

    expect(del).toBeDisabled()
    await userEvent.click(del)
    expect(h.onDelete).not.toHaveBeenCalled()
  })

  it('appelle onDuplicate au clic sur Dupliquer l\'élément', async () => {
    const h = renderToolbar()

    await userEvent.click(screen.getByRole('button', { name: 'Dupliquer l\'élément' }))

    expect(h.onDuplicate).toHaveBeenCalledTimes(1)
    expect(h.onDelete).not.toHaveBeenCalled()
  })

  it('désactive Dupliquer sans sélection', async () => {
    const h = renderToolbar({ canDelete: false })
    const duplicate = screen.getByRole('button', { name: 'Dupliquer l\'élément' })

    expect(duplicate).toBeDisabled()
    await userEvent.click(duplicate)
    expect(h.onDuplicate).not.toHaveBeenCalled()
  })

  describe('formulaire d\'URL', () => {
    it('est fermé au départ et s\'ouvre au clic avec le focus', async () => {
      renderToolbar()
      expect(queryUrlField()).not.toBeInTheDocument()

      await openUrlForm()

      expect(urlField()).toHaveFocus()
    })

    it('une URL valide appelle le callback, ferme et vide le formulaire', async () => {
      const h = renderToolbar()
      await openUrlForm()

      await userEvent.type(urlField(), '  https://exemple.fr/a.png ')
      await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))

      expect(h.onAddImageFromUrl).toHaveBeenCalledWith('https://exemple.fr/a.png')
      expect(queryUrlField()).not.toBeInTheDocument()

      await openUrlForm()
      expect(urlField()).toHaveValue('')
    })

    it('Entrée valide le formulaire', async () => {
      const h = renderToolbar()
      await openUrlForm()

      await userEvent.type(urlField(), 'data:image/png;base64,AAA{Enter}')

      expect(h.onAddImageFromUrl).toHaveBeenCalledWith('data:image/png;base64,AAA')
    })

    it('une URL invalide affiche l\'alerte et n\'appelle pas le callback', async () => {
      const h = renderToolbar()
      await openUrlForm()

      await userEvent.type(urlField(), 'javascript:alert(1){Enter}')

      expect(screen.getByRole('alert')).toHaveTextContent(
        'Adresse d\'image invalide (http, https ou data:image).',
      )
      expect(h.onAddImageFromUrl).not.toHaveBeenCalled()
      expect(urlField()).toBeInTheDocument()
    })

    it('l\'alerte disparaît quand on retape', async () => {
      renderToolbar()
      await openUrlForm()
      await userEvent.type(urlField(), 'x{Enter}')
      expect(screen.getByRole('alert')).toBeInTheDocument()

      await userEvent.type(urlField(), 'y')

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('Échap ferme le formulaire sans rien appeler', async () => {
      const h = renderToolbar()
      await openUrlForm()
      await userEvent.type(urlField(), 'https://exemple.fr/a.png')

      await userEvent.keyboard('{Escape}')

      expect(queryUrlField()).not.toBeInTheDocument()
      expect(h.onAddImageFromUrl).not.toHaveBeenCalled()
    })
  })

  describe('fichier', () => {
    it('appelle onAddImageFromFile avec le fichier choisi et vide l\'input', async () => {
      const h = renderToolbar()
      const file = new File(['abc'], 'photo.png', { type: 'image/png' })
      const input = screen.getByLabelText<HTMLInputElement>('Choisir un fichier image')

      await userEvent.upload(input, file)

      expect(h.onAddImageFromFile).toHaveBeenCalledWith(file)
      expect(input.value).toBe('')
    })

    it('l\'input est caché et n\'accepte que des images', () => {
      renderToolbar()
      const input = screen.getByLabelText('Choisir un fichier image')

      expect(input).toHaveAttribute('accept', 'image/*')
      expect(input).not.toBeVisible()
    })

    it('le bouton Image (fichier) ouvre le sélecteur', async () => {
      renderToolbar()
      const input = screen.getByLabelText('Choisir un fichier image')
      const click = vi.spyOn(input, 'click')

      await userEvent.click(screen.getByRole('button', { name: 'Image (fichier)' }))

      expect(click).toHaveBeenCalled()
    })
  })

  it('affiche l\'erreur du parent dans une alerte', () => {
    renderToolbar({ error: 'L\'image dépasse 2 Mo.' })

    expect(screen.getByRole('alert')).toHaveTextContent('L\'image dépasse 2 Mo.')
  })

  it('n\'affiche pas d\'alerte sans erreur', () => {
    renderToolbar()

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
