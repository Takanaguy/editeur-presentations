import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditorProvider } from '../../hooks/EditorProvider'
import { useEditor } from '../../hooks/useEditor'
import { EditorLayout } from './EditorLayout'

// Lit l'historique via le contexte et l'affiche : prouve le nombre d'entrées créées.
function HistorySpy() {
  const { history } = useEditor()
  return <output data-testid="past-count">{history.past.length}</output>
}

function renderLayout() {
  render(
    <EditorProvider>
      <EditorLayout />
      <HistorySpy />
    </EditorProvider>,
  )
}

const main = () => screen.getByRole('main', { name: "Zone d'édition" })
const panel = () => screen.getByRole('complementary', { name: 'Propriétés' })
const pastCount = () => Number(screen.getByTestId('past-count').textContent)
const click = (name: string) => userEvent.click(screen.getByRole('button', { name }))
const clickInPanel = (name: string) => userEvent.click(within(panel()).getByRole('button', { name }))

// Couche des éléments de la diapositive : ses enfants sont dans l'ordre d'empilement du DOM.
const layer = () => (main().querySelector('div > div') as HTMLElement).firstElementChild as HTMLElement
const domOrder = () => Array.from(layer().children) as HTMLElement[]
// Nom lisible de chaque élément : le texte vaut « Texte », le rectangle est vide.
const orderNames = () => domOrder().map((node) => node.textContent || 'rect')

// Trois éléments : Texte, Rectangle, puis un second Texte « Haut ». Le dernier ajouté est
// au premier plan. Retourne le texte « Texte » sélectionné pour les tests.
async function addThreeAndSelectFirstText() {
  renderLayout()
  await click('Texte')
  await click('Rectangle')
  await click('Texte')
  // Le dernier texte devient « Haut » pour le distinguer du premier.
  const texts = within(main()).getAllByText('Texte')
  const last = texts[1] as HTMLElement
  fireEvent.doubleClick(last)
  const textarea = screen.getByRole('textbox', { name: 'Modifier le texte' })
  await userEvent.clear(textarea)
  await userEvent.type(textarea, 'Haut')
  fireEvent.blur(textarea)
  await userEvent.click(within(main()).getByText('Texte'))
}

describe("EditorLayout : ordre d'empilement", () => {
  it('Premier plan met l\'élément en dernier dans le DOM', async () => {
    await addThreeAndSelectFirstText()
    expect(orderNames()).toEqual(['Texte', 'rect', 'Haut'])

    await clickInPanel('Premier plan')

    expect(orderNames()).toEqual(['rect', 'Haut', 'Texte'])
  })

  it('Arrière-plan met l\'élément en premier dans le DOM', async () => {
    await addThreeAndSelectFirstText()
    await userEvent.click(within(main()).getByText('Haut'))
    expect(orderNames()).toEqual(['Texte', 'rect', 'Haut'])

    await clickInPanel('Arrière-plan')

    expect(orderNames()).toEqual(['Haut', 'Texte', 'rect'])
  })

  it('Avancer et Reculer déplacent d\'un cran', async () => {
    await addThreeAndSelectFirstText()

    await clickInPanel('Avancer')
    expect(orderNames()).toEqual(['rect', 'Texte', 'Haut'])

    await clickInPanel('Reculer')
    expect(orderNames()).toEqual(['Texte', 'rect', 'Haut'])
  })

  it('l\'ordre visuel suit : le dernier du DOM est peint au-dessus', async () => {
    await addThreeAndSelectFirstText()
    await clickInPanel('Premier plan')

    // Pas de z-index : c'est l'ordre du DOM qui décide, le dernier est donc devant.
    expect(domOrder().at(-1)).toHaveTextContent('Texte')
    for (const node of domOrder()) expect(node.style.zIndex).toBe('')
  })

  it('désactive les boutons selon la position de l\'élément', async () => {
    await addThreeAndSelectFirstText()
    // Le premier du tableau est sélectionné : il ne peut plus reculer.
    expect(within(panel()).getByRole('button', { name: 'Reculer' })).toBeDisabled()
    expect(within(panel()).getByRole('button', { name: 'Arrière-plan' })).toBeDisabled()
    expect(within(panel()).getByRole('button', { name: 'Avancer' })).toBeEnabled()
    expect(within(panel()).getByRole('button', { name: 'Premier plan' })).toBeEnabled()

    await clickInPanel('Premier plan')

    expect(within(panel()).getByRole('button', { name: 'Premier plan' })).toBeDisabled()
    expect(within(panel()).getByRole('button', { name: 'Avancer' })).toBeDisabled()
    expect(within(panel()).getByRole('button', { name: 'Arrière-plan' })).toBeEnabled()
  })

  it('un élément seul a les quatre boutons désactivés', async () => {
    renderLayout()
    await click('Rectangle')

    for (const name of ['Premier plan', 'Avancer', 'Reculer', 'Arrière-plan']) {
      expect(within(panel()).getByRole('button', { name })).toBeDisabled()
    }
  })

  it('cliquer sur un bouton ne désélectionne pas l\'élément', async () => {
    await addThreeAndSelectFirstText()

    await clickInPanel('Premier plan')

    expect(screen.getByTestId('selection-frame')).toBeInTheDocument()
    expect(within(panel()).getByRole('heading', { name: 'Texte' })).toBeInTheDocument()
  })

  it('chaque réordonnancement crée une entrée, et annuler restaure l\'ordre', async () => {
    await addThreeAndSelectFirstText()
    const before = pastCount()

    await clickInPanel('Premier plan')
    expect(pastCount()).toBe(before + 1)
    await clickInPanel('Arrière-plan')
    expect(pastCount()).toBe(before + 2)
    expect(orderNames()).toEqual(['Texte', 'rect', 'Haut'])

    await click('Annuler')
    expect(orderNames()).toEqual(['rect', 'Haut', 'Texte'])
    await click('Annuler')
    expect(orderNames()).toEqual(['Texte', 'rect', 'Haut'])
  })
})

describe('EditorLayout : opacité', () => {
  it('le curseur change le style opacity de l\'élément', async () => {
    renderLayout()
    await click('Rectangle')
    const rect = layer().firstElementChild as HTMLElement
    expect(rect).toHaveStyle({ opacity: '1' })

    fireEvent.change(within(panel()).getByLabelText('Opacité'), { target: { value: '40' } })

    expect(rect).toHaveStyle({ opacity: '0.4' })
    expect(within(panel()).getByText('40 %')).toBeInTheDocument()
  })

  it('plusieurs changements de curseur d\'affilée = une seule entrée d\'historique', async () => {
    renderLayout()
    await click('Rectangle')
    const before = pastCount()
    const slider = within(panel()).getByLabelText('Opacité')

    for (const value of ['90', '70', '50', '30']) fireEvent.change(slider, { target: { value } })

    expect(pastCount()).toBe(before + 1)
    // Annuler d'un coup revient à l'opacité d'origine.
    await click('Annuler')
    expect(layer().firstElementChild).toHaveStyle({ opacity: '1' })
  })

  it('perdre le focus du curseur coupe la fusion', async () => {
    renderLayout()
    await click('Rectangle')
    const before = pastCount()
    const slider = within(panel()).getByLabelText('Opacité')

    fireEvent.change(slider, { target: { value: '70' } })
    fireEvent.blur(slider)
    fireEvent.change(slider, { target: { value: '50' } })

    expect(pastCount()).toBe(before + 2)
  })

  it('l\'opacité de l\'élément ne touche pas le cadre ni les poignées de sélection', async () => {
    renderLayout()
    await click('Rectangle')

    fireEvent.change(within(panel()).getByLabelText('Opacité'), { target: { value: '10' } })

    const frame = screen.getByTestId('selection-frame')
    // Le cadre, les poignées et leur couche sont hors de l'élément : aucun n'a d'opacité.
    for (let node: HTMLElement | null = frame; node && node !== main(); node = node.parentElement) {
      expect(node.style.opacity).toBe('')
    }
    for (const handle of document.querySelectorAll<HTMLElement>('[data-handle]')) {
      expect(handle.style.opacity).toBe('')
    }
    expect(document.querySelectorAll('[data-handle]')).toHaveLength(8)
  })
})

describe('EditorLayout : style du texte', () => {
  async function addText() {
    renderLayout()
    await click('Texte')
    return within(main()).getByText('Texte')
  }

  it('Gras met le texte en gras, puis annuler restaure', async () => {
    const text = await addText()
    const before = pastCount()

    await clickInPanel('Gras')
    expect(text).toHaveStyle({ fontWeight: '700' })
    expect(screen.getByRole('button', { name: 'Gras' })).toHaveAttribute('aria-pressed', 'true')
    expect(pastCount()).toBe(before + 1)

    await click('Annuler')
    expect(text.style.fontWeight).toBe('normal')
    expect(screen.getByRole('button', { name: 'Gras' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('deux clics successifs sur Gras créent deux entrées d\'historique', async () => {
    const text = await addText()
    const before = pastCount()

    await clickInPanel('Gras')
    await clickInPanel('Gras')

    expect(pastCount()).toBe(before + 2)
    expect(text.style.fontWeight).toBe('normal')
    // Annuler une fois remet le gras : la seconde bascule était bien une entrée à part.
    await click('Annuler')
    expect(text).toHaveStyle({ fontWeight: '700' })
  })

  it('Italique fonctionne de la même façon', async () => {
    const text = await addText()

    await clickInPanel('Italique')
    expect(text).toHaveStyle({ fontStyle: 'italic' })

    await clickInPanel('Italique')
    expect(text).toHaveStyle({ fontStyle: 'normal' })
  })

  it('Centrer change text-align, et on peut revenir à gauche', async () => {
    const text = await addText()
    expect(text).toHaveStyle({ textAlign: 'left' })

    await clickInPanel('Centrer')
    expect(text).toHaveStyle({ textAlign: 'center' })
    expect(screen.getByRole('button', { name: 'Centrer' })).toHaveAttribute('aria-pressed', 'true')

    await clickInPanel('Aligner à droite')
    expect(text).toHaveStyle({ textAlign: 'right' })

    await clickInPanel('Aligner à gauche')
    expect(text).toHaveStyle({ textAlign: 'left' })
  })

  it('l\'éditeur en ligne reprend le style du texte', async () => {
    const text = await addText()
    await clickInPanel('Gras')
    await clickInPanel('Centrer')

    await userEvent.dblClick(text)

    expect(screen.getByRole('textbox', { name: 'Modifier le texte' })).toHaveStyle({
      fontWeight: '700',
      textAlign: 'center',
    })
  })

  it('un rectangle n\'a pas de boutons de style du texte', async () => {
    renderLayout()
    await click('Rectangle')

    expect(within(panel()).queryByRole('button', { name: 'Gras' })).not.toBeInTheDocument()
  })
})
