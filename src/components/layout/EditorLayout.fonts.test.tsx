import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditorProvider } from '../../hooks/EditorProvider'
import { useEditor } from '../../hooks/useEditor'
import { createSlide, createTextElement } from '../../model/factories'
import type { Presentation } from '../../model/types'
import { EditorLayout } from './EditorLayout'

// Lit l'historique via le contexte et l'affiche : prouve le nombre d'entrées créées.
function HistorySpy() {
  const { history } = useEditor()
  return <output data-testid="past-count">{history.past.length}</output>
}

function renderLayout(presentation?: Presentation) {
  render(
    <EditorProvider presentation={presentation}>
      <EditorLayout />
      <HistorySpy />
    </EditorProvider>,
  )
}

const main = () => screen.getByRole('main', { name: "Zone d'édition" })
const panel = () => screen.getByRole('complementary', { name: 'Propriétés' })
const pastCount = () => Number(screen.getByTestId('past-count').textContent)
const click = (name: string) => userEvent.click(screen.getByRole('button', { name }))
const fontSelect = () => within(panel()).getByLabelText('Police') as HTMLSelectElement
const chooseFont = (value: string) => fireEvent.change(fontSelect(), { target: { value } })
// Le même texte apparaît dans la zone d'édition et dans la vignette de la diapositive.
const thumbnailText = () =>
  within(screen.getByRole('button', { name: 'Diapositive 1' })).getByText('Texte')

async function addText() {
  renderLayout()
  await click('Texte')
  return within(main()).getByText('Texte')
}

let exported: Blob[]

beforeEach(() => {
  exported = []
  URL.createObjectURL = vi.fn((blob: Blob) => {
    exported.push(blob)
    return 'blob:test'
  })
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('EditorLayout : police du texte', () => {
  it('choisir une police change le font-family du texte ET de la vignette', async () => {
    const text = await addText()
    expect(text.style.fontFamily).toBe('')

    chooseFont('Georgia')

    expect(text.style.fontFamily).toBe('Georgia, "Times New Roman", serif')
    expect(thumbnailText().style.fontFamily).toBe('Georgia, "Times New Roman", serif')
    expect(fontSelect()).toHaveValue('Georgia')
  })

  it('Police par défaut retire la police choisie', async () => {
    const text = await addText()
    chooseFont('Impact')

    chooseFont('')

    expect(text.style.fontFamily).toBe('')
    expect(fontSelect()).toHaveValue('')
  })

  it("un choix de police crée une entrée d'historique, et annuler restaure", async () => {
    const text = await addText()
    const before = pastCount()

    chooseFont('Verdana')
    expect(pastCount()).toBe(before + 1)

    await click('Annuler')
    expect(text.style.fontFamily).toBe('')
    expect(fontSelect()).toHaveValue('')
  })

  it('deux choix successifs font deux entrées, sans fusion', async () => {
    const text = await addText()
    const before = pastCount()

    chooseFont('Georgia')
    chooseFont('Courier New')

    expect(pastCount()).toBe(before + 2)
    expect(text.style.fontFamily).toBe('"Courier New", Courier, monospace')
    // Annuler une fois revient à Georgia : le premier choix était bien une entrée à part.
    await click('Annuler')
    expect(text.style.fontFamily).toBe('Georgia, "Times New Roman", serif')
  })

  it("l'éditeur en ligne reprend la police du texte", async () => {
    const text = await addText()
    chooseFont('Tahoma')

    await userEvent.dblClick(text)

    expect(screen.getByRole('textbox', { name: 'Modifier le texte' }).style.fontFamily).toBe(
      'Tahoma, Geneva, sans-serif',
    )
  })

  it("un rectangle n'a pas de choix de police", async () => {
    renderLayout()
    await click('Rectangle')

    expect(within(panel()).queryByLabelText('Police')).not.toBeInTheDocument()
  })
})

describe('EditorLayout : police et fichiers', () => {
  const fileInput = () => screen.getByLabelText('Importer une présentation JSON') as HTMLInputElement

  function presentationWithFont(fontFamily: unknown) {
    const text = createTextElement({ text: 'Importé' })
    const raw = { ...text, fontFamily }
    return JSON.stringify({ version: 1, title: 'Polices', slides: [{ id: 's1', elements: [raw] }] })
  }

  function chooseFile(text: string) {
    const file = new File([text], 'import.json', { type: 'application/json' })
    fireEvent.change(fileInput(), { target: { files: [file] } })
  }

  it('un texte importé avec une police hors liste affiche « Calibri (non listée) »', async () => {
    renderLayout()

    chooseFile(presentationWithFont('Calibri'))
    const imported = await within(main()).findByText('Importé')
    await userEvent.click(imported)

    expect(imported.style.fontFamily).toBe('"Calibri", sans-serif')
    expect(within(panel()).getByRole('option', { name: 'Calibri (non listée)' })).toBeInTheDocument()
    expect(fontSelect()).toHaveValue('Calibri')
  })

  it('l\'export JSON contient fontFamily', async () => {
    await addText()
    chooseFont('Georgia')

    await userEvent.click(screen.getByRole('button', { name: 'Exporter' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /^Fichier JSON/ }))

    expect(exported).toHaveLength(1)
    expect(await exported[0]?.text()).toContain('"fontFamily": "Georgia"')
  })

  it('l\'export JSON contient fontFamily à null pour la police par défaut', async () => {
    await addText()

    await userEvent.click(screen.getByRole('button', { name: 'Exporter' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /^Fichier JSON/ }))

    expect(await exported[0]?.text()).toContain('"fontFamily": null')
  })

  it("l'import d'un nom de police dangereux est refusé avec le message", async () => {
    const slide = { ...createSlide(), elements: [createTextElement({ text: 'Avant' })] }
    renderLayout({ version: 1, title: 'Avant', slides: [slide] })

    chooseFile(presentationWithFont('Arial"; background:url(x)'))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Import impossible')
    expect(alert).toHaveTextContent(
      'Diapositive 1, élément 1 : la police doit être un nom simple (lettres, chiffres, espaces, tirets).',
    )
    // La présentation en cours n'a pas bougé.
    expect(within(main()).getByText('Avant')).toBeInTheDocument()
    expect(pastCount()).toBe(0)
  })
})
