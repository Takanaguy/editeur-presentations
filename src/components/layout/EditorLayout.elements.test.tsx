import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditorProvider } from '../../hooks/EditorProvider'
import { measureImage } from '../../io/imageSize'
import { MAX_IMAGE_FILE_SIZE } from '../../io/readImageFile'
import { createThreeSlidePresentation } from '../../test/fixtures'
import { EditorLayout } from './EditorLayout'

// jsdom ne charge pas les images : on garde fitImageSize réel et on simule seulement la mesure.
vi.mock('../../io/imageSize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../io/imageSize')>()),
  measureImage: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(measureImage).mockResolvedValue({ width: 200, height: 100 })
})

// Sans argument : présentation vide par défaut (une diapositive vide).
function renderLayout(withSlides = false) {
  render(
    <EditorProvider presentation={withSlides ? createThreeSlidePresentation() : undefined}>
      <EditorLayout />
    </EditorProvider>,
  )
}

const main = () => screen.getByRole('main', { name: 'Zone d\'édition' })
const panel = () => screen.getByRole('complementary', { name: 'Propriétés' })
const click = (name: string) => userEvent.click(screen.getByRole('button', { name }))
const images = () => Array.from(main().querySelectorAll('img'))
const frames = () => screen.queryAllByTestId('selection-frame')
const deleteButton = () => screen.getByRole('button', { name: 'Supprimer l\'élément' })

describe('EditorLayout : ajout et sélection d\'éléments', () => {
  it('Texte ajoute un texte dans la zone centrale et le sélectionne', async () => {
    renderLayout()

    await click('Texte')

    expect(within(main()).getByText('Texte')).toBeInTheDocument()
    expect(within(panel()).getByText('Texte')).toBeInTheDocument()
    expect(frames()).toHaveLength(1)
  })

  it('Rectangle ajoute un rectangle et le sélectionne', async () => {
    renderLayout()

    await click('Rectangle')

    expect(within(panel()).getByText('Rectangle')).toBeInTheDocument()
    expect(frames()).toHaveLength(1)
  })

  it('Supprimer l\'élément retire l\'élément sélectionné et se désactive', async () => {
    renderLayout()
    expect(deleteButton()).toBeDisabled()
    await click('Texte')
    expect(deleteButton()).toBeEnabled()

    await userEvent.click(deleteButton())

    expect(within(main()).queryByText('Texte')).not.toBeInTheDocument()
    expect(within(panel()).getByText('Aucun élément sélectionné')).toBeInTheDocument()
    expect(deleteButton()).toBeDisabled()
  })

  it('la touche Delete retire l\'élément sélectionné', async () => {
    renderLayout()
    await click('Texte')

    await userEvent.keyboard('{Delete}')

    expect(within(main()).queryByText('Texte')).not.toBeInTheDocument()
  })

  it('la touche Retour arrière retire aussi l\'élément sélectionné', async () => {
    renderLayout()
    await click('Rectangle')
    expect(frames()).toHaveLength(1)

    await userEvent.keyboard('{Backspace}')

    expect(frames()).toHaveLength(0)
    expect(deleteButton()).toBeDisabled()
  })

  it('Delete ne fait rien sans élément sélectionné', async () => {
    renderLayout(true)

    await userEvent.keyboard('{Delete}')

    expect(within(main()).getByText('Alpha')).toBeInTheDocument()
  })

  it('Delete dans le champ d\'URL ne supprime rien', async () => {
    renderLayout()
    await click('Texte')
    await click('Image (URL)')
    const field = screen.getByRole('textbox', { name: 'Adresse de l\'image' })

    await userEvent.type(field, 'abc{Delete}{Backspace}')

    expect(within(main()).getByText('Texte')).toBeInTheDocument()
    expect(field).toHaveValue('ab')
  })

  it('cliquer un élément le sélectionne', async () => {
    renderLayout(true)
    expect(frames()).toHaveLength(0)

    await userEvent.click(within(main()).getByText('Alpha'))

    expect(within(panel()).getByText('Texte')).toBeInTheDocument()
    expect(frames()).toHaveLength(1)
    expect(deleteButton()).toBeEnabled()
  })

  it('cliquer le fond de la diapositive désélectionne', async () => {
    renderLayout(true)
    await userEvent.click(within(main()).getByText('Alpha'))

    const background = main().querySelector('div > div')
    fireEvent.pointerDown(background as Element)

    expect(frames()).toHaveLength(0)
    expect(within(panel()).getByText('Aucun élément sélectionné')).toBeInTheDocument()
  })

  it('changer de diapositive désélectionne', async () => {
    renderLayout(true)
    await userEvent.click(within(main()).getByText('Alpha'))
    expect(frames()).toHaveLength(1)

    await click('Diapositive 2')

    expect(frames()).toHaveLength(0)
    expect(within(panel()).getByText('Aucun élément sélectionné')).toBeInTheDocument()
  })

  it('l\'ajout cible seulement la diapositive sélectionnée', async () => {
    renderLayout(true)
    await click('Diapositive 2')

    await click('Texte')

    expect(within(main()).getByText('Bravo')).toBeInTheDocument()
    expect(within(main()).getByText('Texte')).toBeInTheDocument()

    await click('Diapositive 1')
    expect(within(main()).getByText('Alpha')).toBeInTheDocument()
    expect(within(main()).queryByText('Texte')).not.toBeInTheDocument()
  })
})

describe('EditorLayout : ajout d\'images', () => {
  it('une URL valide ajoute une image avec le bon src, ajustée à la taille mesurée', async () => {
    renderLayout()
    await click('Image (URL)')

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Adresse de l\'image' }),
      'https://exemple.fr/photo.png{Enter}',
    )

    await waitFor(() => expect(images()).toHaveLength(1))
    expect(measureImage).toHaveBeenCalledWith('https://exemple.fr/photo.png')
    expect(images()[0]).toHaveAttribute('src', 'https://exemple.fr/photo.png')
    // 200x100 est plus petit que la limite : taille naturelle, centrée.
    expect(images()[0]).toHaveStyle({ width: '200px', height: '100px', left: '540px', top: '310px' })
    expect(within(panel()).getByText('Image')).toBeInTheDocument()
    expect(frames()).toHaveLength(1)
    expect(screen.queryByRole('textbox', { name: 'Adresse de l\'image' })).not.toBeInTheDocument()
  })

  it('une image qui ne charge pas n\'est pas ajoutée et affiche une alerte', async () => {
    vi.mocked(measureImage).mockResolvedValue(null)
    renderLayout()
    await click('Image (URL)')

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Adresse de l\'image' }),
      'https://exemple.fr/x.png{Enter}',
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger l\'image.')
    expect(images()).toHaveLength(0)
    expect(within(panel()).getByText('Aucun élément sélectionné')).toBeInTheDocument()
  })

  it('donne à une image d\'URL le nom du fichier comme alt, ou Image à défaut', async () => {
    renderLayout()

    await click('Image (URL)')
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Adresse de l\'image' }),
      'https://exemple.fr/dossier/ma%20photo.png{Enter}',
    )
    await waitFor(() => expect(images()).toHaveLength(1))
    expect(images()[0]).toHaveAttribute('alt', 'ma photo.png')

    await click('Image (URL)')
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Adresse de l\'image' }),
      'data:image/png;base64,AAA{Enter}',
    )
    await waitFor(() => expect(images()).toHaveLength(2))
    expect(images()[1]).toHaveAttribute('alt', 'Image')
  })

  it('une URL invalide affiche une alerte et n\'ajoute rien', async () => {
    renderLayout()
    await click('Image (URL)')

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Adresse de l\'image' }),
      'javascript:alert(1){Enter}',
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Adresse d\'image invalide')
    expect(images()).toHaveLength(0)
    expect(measureImage).not.toHaveBeenCalled()
  })

  it('un fichier image valide ajoute une img avec une data URL et le nom en alt', async () => {
    renderLayout()
    const file = new File(['abc'], 'photo.png', { type: 'image/png' })

    await userEvent.upload(screen.getByLabelText('Choisir un fichier image'), file)

    await waitFor(() => expect(images()).toHaveLength(1))
    expect(images()[0]?.getAttribute('src')).toMatch(/^data:image\//)
    expect(images()[0]).toHaveAttribute('alt', 'photo.png')
  })

  it('un fichier de plus de 2 Mo affiche une alerte et n\'ajoute rien', async () => {
    renderLayout()
    const file = new File([new Uint8Array(MAX_IMAGE_FILE_SIZE + 1)], 'gros.png', {
      type: 'image/png',
    })

    await userEvent.upload(screen.getByLabelText('Choisir un fichier image'), file)

    expect(await screen.findByRole('alert')).toHaveTextContent('L\'image dépasse 2 Mo.')
    expect(images()).toHaveLength(0)
  })

  it('une erreur inattendue affiche le message générique', async () => {
    vi.mocked(measureImage).mockRejectedValue(new Error('boum'))
    renderLayout()
    const file = new File(['abc'], 'photo.png', { type: 'image/png' })

    await userEvent.upload(screen.getByLabelText('Choisir un fichier image'), file)

    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible d\'ajouter l\'image.')
    expect(images()).toHaveLength(0)
  })

  it('l\'erreur disparaît après un ajout réussi', async () => {
    renderLayout()
    const input = screen.getByLabelText('Choisir un fichier image')
    const big = new File([new Uint8Array(MAX_IMAGE_FILE_SIZE + 1)], 'gros.png', {
      type: 'image/png',
    })
    await userEvent.upload(input, big)
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await userEvent.upload(input, new File(['abc'], 'ok.png', { type: 'image/png' }))

    await waitFor(() => expect(images()).toHaveLength(1))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('l\'erreur disparaît au prochain clic sur un bouton d\'ajout', async () => {
    renderLayout()
    const big = new File([new Uint8Array(MAX_IMAGE_FILE_SIZE + 1)], 'gros.png', {
      type: 'image/png',
    })
    await userEvent.upload(screen.getByLabelText('Choisir un fichier image'), big)
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await click('Texte')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('EditorLayout : changement de diapositive pendant un import', () => {
  type Size = { width: number; height: number } | null

  // Mesure dont on décide du moment où elle se termine.
  function controlMeasure() {
    let resolve: (size: Size) => void = () => {}
    vi.mocked(measureImage).mockReturnValue(
      new Promise<Size>((r) => {
        resolve = r
      }),
    )
    return (size: Size) => act(async () => resolve(size))
  }

  async function startUrlImport() {
    await click('Image (URL)')
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Adresse de l\'image' }),
      'https://exemple.fr/photo.png{Enter}',
    )
  }

  const MISSED = 'L\'image n\'a pas été ajoutée : la diapositive a changé pendant l\'import.'

  it('n\'ajoute rien si l\'utilisateur change de diapositive avant la fin', async () => {
    const finish = controlMeasure()
    renderLayout(true)
    await startUrlImport()

    await click('Diapositive 2')
    await finish({ width: 200, height: 100 })

    expect(screen.getByRole('alert')).toHaveTextContent(MISSED)
    for (const number of [1, 2, 3]) {
      await click(`Diapositive ${number}`)
      expect(images()).toHaveLength(0)
    }
  })

  it('n\'ajoute rien si la diapositive de départ est supprimée pendant l\'import', async () => {
    const finish = controlMeasure()
    renderLayout(true)
    await click('Diapositive 2')
    await startUrlImport()

    await click('Supprimer la diapositive')
    await finish({ width: 200, height: 100 })

    expect(screen.getByRole('alert')).toHaveTextContent(MISSED)
    for (const number of [1, 2]) {
      await click(`Diapositive ${number}`)
      expect(images()).toHaveLength(0)
    }
  })

  it('ajoute l\'image sur la diapositive de départ si on n\'a pas bougé', async () => {
    const finish = controlMeasure()
    renderLayout(true)
    await click('Diapositive 2')
    await startUrlImport()

    await finish({ width: 200, height: 100 })

    expect(images()).toHaveLength(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
