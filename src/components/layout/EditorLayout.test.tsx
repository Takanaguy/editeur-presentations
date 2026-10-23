import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditorProvider } from '../../hooks/EditorProvider'
import { useEditor } from '../../hooks/useEditor'
import { createThreeSlidePresentation } from '../../test/fixtures'
import { EditorLayout } from './EditorLayout'

function renderLayout() {
  return render(
    <EditorProvider presentation={createThreeSlidePresentation()}>
      <EditorLayout />
    </EditorProvider>,
  )
}

describe('EditorLayout', () => {
  it('affiche l\'en-tête et les trois zones', () => {
    renderLayout()

    expect(
      screen.getByRole('heading', { level: 1, name: 'Test' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Vignettes des diapositives' })).toBeInTheDocument()
    expect(screen.getByRole('main', { name: 'Zone d\'édition' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Propriétés' })).toBeInTheDocument()
  })

  it('sélectionne la première diapositive au départ', () => {
    renderLayout()

    expect(screen.getByRole('button', { name: 'Diapositive 1' })).toHaveAttribute(
      'aria-current',
      'true',
    )
    const main = screen.getByRole('main', { name: 'Zone d\'édition' })
    expect(within(main).getByText('Alpha')).toBeInTheDocument()
    expect(within(main).queryByText('Bravo')).not.toBeInTheDocument()
  })

  it('affiche la diapositive cliquée dans la zone centrale', async () => {
    renderLayout()

    await userEvent.click(screen.getByRole('button', { name: 'Diapositive 2' }))

    const main = screen.getByRole('main', { name: 'Zone d\'édition' })
    expect(within(main).getByText('Bravo')).toBeInTheDocument()
    expect(within(main).queryByText('Alpha')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Diapositive 2' })).toHaveAttribute(
      'aria-current',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Diapositive 1' })).not.toHaveAttribute('aria-current')
  })

  it('indique qu\'aucun élément n\'est sélectionné', () => {
    renderLayout()

    const panel = screen.getByRole('complementary', { name: 'Propriétés' })
    expect(within(panel).getByText('Aucun élément sélectionné')).toBeInTheDocument()
  })
})

describe('EditorLayout : gestion des diapositives', () => {
  const thumbnail = (number: number) => screen.getByRole('button', { name: `Diapositive ${number}` })
  const main = () => screen.getByRole('main', { name: 'Zone d\'édition' })
  const click = (name: string) => userEvent.click(screen.getByRole('button', { name }))

  // Texte de chaque vignette dans l'ordre (le numéro affiché est retiré ; vide si pas de texte).
  function thumbnailTexts() {
    const nav = screen.getByRole('navigation', { name: 'Vignettes des diapositives' })
    return within(nav)
      .getAllByRole('button')
      .map((button) => (button.textContent ?? '').replace(/\d+$/, ''))
  }

  it('ajoute une diapositive vide après la sélectionnée et la sélectionne', async () => {
    renderLayout()
    await userEvent.click(thumbnail(1))

    await click('Nouvelle diapositive')

    expect(thumbnailTexts()).toEqual(['Alpha', '', 'Bravo', 'Charlie'])
    expect(thumbnail(2)).toHaveAttribute('aria-current', 'true')
    expect(thumbnail(1)).not.toHaveAttribute('aria-current')
    expect(within(main()).queryByText(/Alpha|Bravo|Charlie/)).not.toBeInTheDocument()
  })

  it('duplique la diapositive juste après et sélectionne la copie', async () => {
    renderLayout()
    await userEvent.click(thumbnail(2))

    await click('Dupliquer la diapositive')

    expect(thumbnailTexts()).toEqual(['Alpha', 'Bravo', 'Bravo', 'Charlie'])
    expect(thumbnail(3)).toHaveAttribute('aria-current', 'true')
    expect(thumbnail(2)).not.toHaveAttribute('aria-current')
    expect(within(main()).getByText('Bravo')).toBeInTheDocument()
  })

  it('supprime la diapositive sélectionnée et sélectionne sa voisine', async () => {
    renderLayout()
    await userEvent.click(thumbnail(2))

    await click('Supprimer la diapositive')

    expect(thumbnailTexts()).toEqual(['Alpha', 'Charlie'])
    // La suivante prend la place de la supprimée.
    expect(thumbnail(2)).toHaveAttribute('aria-current', 'true')
    expect(within(main()).getByText('Charlie')).toBeInTheDocument()
  })

  it('désactive Supprimer quand il ne reste qu\'une diapositive', async () => {
    renderLayout()
    const del = screen.getByRole('button', { name: 'Supprimer la diapositive' })
    expect(del).toBeEnabled()

    await userEvent.click(del)
    await userEvent.click(del)

    expect(thumbnailTexts()).toHaveLength(1)
    expect(del).toBeDisabled()
  })

  it('monte la diapositive et garde la sélection dessus', async () => {
    renderLayout()
    await userEvent.click(thumbnail(2))

    await click('Monter la diapositive')

    expect(thumbnailTexts()).toEqual(['Bravo', 'Alpha', 'Charlie'])
    expect(thumbnail(1)).toHaveAttribute('aria-current', 'true')
    expect(within(main()).getByText('Bravo')).toBeInTheDocument()
  })

  it('descend la diapositive et garde la sélection dessus', async () => {
    renderLayout()
    await userEvent.click(thumbnail(2))

    await click('Descendre la diapositive')

    expect(thumbnailTexts()).toEqual(['Alpha', 'Charlie', 'Bravo'])
    expect(thumbnail(3)).toHaveAttribute('aria-current', 'true')
    expect(within(main()).getByText('Bravo')).toBeInTheDocument()
  })

  it('désactive Monter sur la première et Descendre sur la dernière', async () => {
    renderLayout()
    const up = screen.getByRole('button', { name: 'Monter la diapositive' })
    const down = screen.getByRole('button', { name: 'Descendre la diapositive' })

    // Au départ la première est sélectionnée.
    expect(up).toBeDisabled()
    expect(down).toBeEnabled()

    await userEvent.click(thumbnail(2))
    expect(up).toBeEnabled()
    expect(down).toBeEnabled()

    await userEvent.click(thumbnail(3))
    expect(up).toBeEnabled()
    expect(down).toBeDisabled()
  })
})

describe('useEditor', () => {
  function Probe() {
    useEditor()
    return null
  }

  it('lève une erreur claire hors EditorProvider', () => {
    // React logue l'erreur attendue : on coupe le bruit pour ce test.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow('EditorProvider')
    spy.mockRestore()
  })
})
