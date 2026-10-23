import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditorProvider } from '../../hooks/EditorProvider'
import { useEditor } from '../../hooks/useEditor'
import { createThreeSlidePresentation } from '../../test/fixtures'
import { EditorLayout } from './EditorLayout'

// Lit l'historique via le contexte et l'affiche : prouve le nombre d'entrées créées.
function HistorySpy() {
  const { history } = useEditor()
  return <output data-testid="past-count">{history.past.length}</output>
}

function renderLayout(withSlides = false) {
  render(
    <EditorProvider presentation={withSlides ? createThreeSlidePresentation() : undefined}>
      <EditorLayout />
      <HistorySpy />
    </EditorProvider>,
  )
}

const main = () => screen.getByRole('main', { name: "Zone d'édition" })
const panel = () => screen.getByRole('complementary', { name: 'Propriétés' })
const pastCount = () => Number(screen.getByTestId('past-count').textContent)
const editor = () => screen.queryByRole('textbox', { name: 'Modifier le texte' })
const click = (name: string) => userEvent.click(screen.getByRole('button', { name }))
const firstElement = () =>
  main().querySelector('div > div')?.firstElementChild?.firstElementChild as HTMLElement

// Le fond de la diapositive : le conteneur qui désélectionne au pointerdown.
const slideBackground = () => main().querySelector('div > div') as HTMLElement

// Ajoute un texte ("Texte") puis ouvre son éditeur.
async function addTextAndEdit() {
  renderLayout()
  await click('Texte')
  await userEvent.dblClick(within(main()).getByText('Texte'))
}

describe("EditorLayout : édition du texte en ligne", () => {
  it("le double clic sur un texte ouvre l'éditeur, texte sélectionné", async () => {
    await addTextAndEdit()

    const textarea = editor() as HTMLTextAreaElement
    expect(textarea).toBeInTheDocument()
    expect(textarea).toHaveFocus()
    expect(textarea.value).toBe('Texte')
    expect(textarea.selectionEnd - textarea.selectionStart).toBe('Texte'.length)
    // Pas de poignées pendant l'édition, mais le cadre reste.
    expect(document.querySelectorAll('[data-handle]')).toHaveLength(0)
    expect(screen.getByTestId('selection-frame')).toBeInTheDocument()
  })

  it("saisir puis perdre le focus met à jour le texte et crée UNE entrée d'historique", async () => {
    await addTextAndEdit()
    const before = pastCount()

    await userEvent.keyboard('Bonjour')
    fireEvent.blur(editor() as HTMLElement)

    expect(editor()).not.toBeInTheDocument()
    expect(within(main()).getByText('Bonjour')).toBeInTheDocument()
    expect(pastCount()).toBe(before + 1)
  })

  it('Ctrl+Entrée valide aussi, avec une seule entrée', async () => {
    await addTextAndEdit()
    const before = pastCount()

    await userEvent.keyboard('Salut{Control>}{Enter}{/Control}')

    expect(editor()).not.toBeInTheDocument()
    expect(within(main()).getByText('Salut')).toBeInTheDocument()
    expect(pastCount()).toBe(before + 1)
  })

  it("Échap laisse le texte inchangé et sans entrée d'historique", async () => {
    await addTextAndEdit()
    const before = pastCount()

    await userEvent.keyboard('Autre chose{Escape}')

    expect(editor()).not.toBeInTheDocument()
    expect(within(main()).getByText('Texte')).toBeInTheDocument()
    expect(pastCount()).toBe(before)
  })

  it("un texte inchangé ne crée pas d'entrée d'historique", async () => {
    await addTextAndEdit()
    const before = pastCount()

    fireEvent.blur(editor() as HTMLElement)

    expect(editor()).not.toBeInTheDocument()
    expect(pastCount()).toBe(before)
  })

  it("le double clic sur un rectangle n'ouvre pas d'éditeur", async () => {
    renderLayout()
    await click('Rectangle')

    await userEvent.dblClick(firstElement())

    expect(editor()).not.toBeInTheDocument()
  })

  it("l'éditeur se ferme au changement de diapositive et ne revient pas à la resélection", async () => {
    renderLayout(true)
    await userEvent.dblClick(within(main()).getByText('Alpha'))
    expect(editor()).toBeInTheDocument()

    // Passer à une autre diapositive ferme l'édition.
    await click('Diapositive 2')
    expect(editor()).not.toBeInTheDocument()

    // Revenir sur la première et resélectionner le texte ne rouvre rien.
    await click('Diapositive 1')
    await userEvent.click(within(main()).getByText('Alpha'))
    expect(editor()).not.toBeInTheDocument()
  })

  it('un pointerdown sur le fond valide la saisie au lieu de la perdre', async () => {
    await addTextAndEdit()
    await userEvent.keyboard('Bonjour')
    const before = pastCount()

    fireEvent.pointerDown(slideBackground())

    expect(editor()).not.toBeInTheDocument()
    expect(within(main()).getByText('Bonjour')).toBeInTheDocument()
    expect(pastCount()).toBe(before + 1)
  })

  it('un pointerdown sur un autre élément valide la saisie puis le sélectionne', async () => {
    renderLayout()
    await click('Texte')
    await click('Rectangle')
    await userEvent.dblClick(within(main()).getByText('Texte'))
    await userEvent.keyboard('Bonjour')
    const before = pastCount()

    fireEvent.pointerDown(main().querySelector('[style*="rgb(46, 93, 124)"]') as Element)
    fireEvent.pointerUp(window)

    expect(editor()).not.toBeInTheDocument()
    expect(within(main()).getByText('Bonjour')).toBeInTheDocument()
    expect(pastCount()).toBe(before + 1)
    expect(within(panel()).getByRole('heading', { name: 'Rectangle' })).toBeInTheDocument()
  })

  it('un pointerdown dans le textarea ne valide pas', async () => {
    await addTextAndEdit()
    await userEvent.keyboard('Bonjour')
    const before = pastCount()

    fireEvent.pointerDown(editor() as HTMLElement)

    expect(editor()).toBeInTheDocument()
    expect(pastCount()).toBe(before)
  })

  it("l'éditeur se ferme quand l'élément est supprimé", async () => {
    await addTextAndEdit()

    fireEvent.click(screen.getByRole('button', { name: "Supprimer l'élément" }))

    expect(editor()).not.toBeInTheDocument()
  })
})

describe('EditorLayout : panneau de propriétés', () => {
  it("changer la couleur d'un rectangle met à jour son style", async () => {
    renderLayout()
    await click('Rectangle')

    fireEvent.change(within(panel()).getByLabelText('Couleur de remplissage'), {
      target: { value: '#ff0000' },
    })

    expect(firstElement()).toHaveStyle({ backgroundColor: '#ff0000' })
  })

  it("plusieurs changements de couleur de suite ne créent qu'une entrée, puis une édition normale en crée une autre", async () => {
    renderLayout()
    await click('Rectangle')
    const before = pastCount()
    const color = within(panel()).getByLabelText('Couleur de remplissage')

    for (const value of ['#111111', '#222222', '#333333', '#444444']) {
      fireEvent.change(color, { target: { value } })
    }
    expect(pastCount()).toBe(before + 1)

    // Une édition normale (ajout d'un texte) coupe la chaîne et crée sa propre entrée.
    await click('Texte')
    expect(pastCount()).toBe(before + 2)
  })

  it('perdre le focus du champ coupe la fusion', async () => {
    renderLayout()
    await click('Rectangle')
    const before = pastCount()
    const color = within(panel()).getByLabelText('Couleur de remplissage')

    fireEvent.change(color, { target: { value: '#111111' } })
    fireEvent.change(color, { target: { value: '#222222' } })
    fireEvent.blur(color)
    fireEvent.change(color, { target: { value: '#333333' } })

    expect(pastCount()).toBe(before + 2)
  })

  it('changer la taille de police met à jour le rendu', async () => {
    renderLayout()
    await click('Texte')

    fireEvent.change(within(panel()).getByLabelText('Taille de police'), {
      target: { value: '72' },
    })

    expect(within(main()).getByText('Texte')).toHaveStyle({ fontSize: '72px' })
  })

  it('la case Fond ajoute puis retire un fond sur le texte', async () => {
    renderLayout()
    await click('Texte')
    const text = within(main()).getByText('Texte')
    expect(text.style.backgroundColor).toBe('')

    await userEvent.click(within(panel()).getByLabelText('Fond'))
    expect(text).toHaveStyle({ backgroundColor: '#ffffff' })

    await userEvent.click(within(panel()).getByLabelText('Fond'))
    expect(text.style.backgroundColor).toBe('')
  })

  it('le panneau ne propose pas de texte alternatif pour un rectangle', async () => {
    renderLayout()
    await click('Rectangle')

    expect(within(panel()).queryByLabelText('Texte alternatif')).not.toBeInTheDocument()
  })
})
