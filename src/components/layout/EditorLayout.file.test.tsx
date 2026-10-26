import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditorProvider } from '../../hooks/EditorProvider'
import { useEditor } from '../../hooks/useEditor'
import { MAX_IMPORT_FILE_SIZE, serializePresentation } from '../../io/presentationJson'
import { createSlide, createTextElement } from '../../model/factories'
import type { Presentation } from '../../model/types'
import { createThreeSlidePresentation } from '../../test/fixtures'
import { EditorLayout } from './EditorLayout'

// Lit l'historique et la présentation via le contexte.
function HistorySpy() {
  const { history } = useEditor()
  const { presentation, selectedSlideId } = history.editor
  return (
    <>
      <span data-testid="past-count">{history.past.length}</span>
      <span data-testid="future-count">{history.future.length}</span>
      <span data-testid="selected-slide">{selectedSlideId}</span>
      <span data-testid="title">{presentation.title}</span>
      <span data-testid="content">{serializePresentation(presentation)}</span>
    </>
  )
}

function renderLayout(presentation: Presentation = createThreeSlidePresentation()) {
  render(
    <EditorProvider presentation={presentation}>
      <EditorLayout />
      <HistorySpy />
    </EditorProvider>,
  )
  return presentation
}

const main = () => screen.getByRole('main', { name: "Zone d'édition" })
const count = (testId: string) => Number(screen.getByTestId(testId).textContent)
const pastCount = () => count('past-count')
const content = () => screen.getByTestId('content').textContent
const titleInput = () => screen.getByRole('textbox', { name: 'Titre de la présentation' })
const fileInput = () => screen.getByLabelText('Importer une présentation JSON') as HTMLInputElement

// Présentation de remplacement : deux diapositives, textes reconnaissables.
function makeImported(): Presentation {
  const slides = ['Zèbre', 'Yak'].map((text) => ({
    ...createSlide(),
    elements: [createTextElement({ text })],
  }))
  return { version: 1, title: 'Importée', slides, fonts: [] }
}

// Version synchrone pour les tests à minuteurs factices (userEvent s'y bloque).
function exportJsonSync() {
  fireEvent.click(screen.getByRole('button', { name: 'Exporter' }))
  fireEvent.click(screen.getByRole('menuitem', { name: /^Fichier JSON/ }))
}

// Exporter est un menu : on l'ouvre puis on choisit le format JSON.
async function exportJson() {
  await userEvent.click(screen.getByRole('button', { name: 'Exporter' }))
  await userEvent.click(screen.getByRole('menuitem', { name: /^Fichier JSON/ }))
}

function jsonFile(text: string, name = 'import.json'): File {
  return new File([text], name, { type: 'application/json' })
}

// Envoie un fichier au champ caché, comme le ferait le sélecteur du navigateur.
function chooseFile(file: File) {
  fireEvent.change(fileInput(), { target: { files: [file] } })
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
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('EditorLayout : export', () => {
  it('télécharge le JSON de la présentation, nommé d\'après le titre, et annonce le succès', async () => {
    const presentation = renderLayout()
    const clicks: HTMLAnchorElement[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push(this)
    })

    await exportJson()

    expect(exported).toHaveLength(1)
    expect(await exported[0]?.text()).toBe(serializePresentation(presentation))
    expect(clicks[0]?.download).toBe('test.json')
    expect(screen.getByRole('status')).toHaveTextContent('Présentation exportée : test.json')
  })

  it('ne modifie ni la présentation ni l\'historique', async () => {
    renderLayout()
    const before = content()

    await exportJson()

    expect(content()).toBe(before)
    expect(pastCount()).toBe(0)
  })

  it('n\'exporte pas une présentation que l\'import refuserait, et affiche l\'erreur', async () => {
    const slide = { ...createSlide(), elements: [createTextElement({ text: 'a'.repeat(10001) })] }
    renderLayout({ version: 1, title: 'Trop long', slides: [slide], fonts: [] })

    await exportJson()

    expect(exported).toHaveLength(0)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Export impossible')
    expect(alert).toHaveTextContent('Diapositive 1, élément 1 : le texte ne doit pas dépasser 10000 caractères.')
  })

  it('affiche une erreur quand le navigateur refuse le téléchargement', async () => {
    renderLayout()
    URL.createObjectURL = vi.fn(() => {
      throw new Error('indisponible')
    })

    await exportJson()

    expect(screen.getByRole('alert')).toHaveTextContent('Export impossible')
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })
})

describe('EditorLayout : import', () => {
  it('remplace la présentation, sélectionne la première diapositive, avec UNE entrée d\'historique', async () => {
    renderLayout()
    await userEvent.click(screen.getByRole('button', { name: 'Diapositive 2' }))
    const imported = makeImported()

    chooseFile(jsonFile(serializePresentation(imported)))

    expect(await within(main()).findByText('Zèbre')).toBeInTheDocument()
    expect(within(main()).queryByText('Bravo')).not.toBeInTheDocument()
    expect(titleInput()).toHaveValue('Importée')
    expect(screen.getByTestId('selected-slide')).toHaveTextContent(imported.slides[0]?.id ?? '')
    expect(screen.getByRole('button', { name: 'Diapositive 1' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getAllByRole('button', { name: /^Diapositive \d/ })).toHaveLength(2)
    expect(pastCount()).toBe(1)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Présentation « Importée » importée : 2 diapositives.',
    )
  })

  it('Annuler restaure l\'ancienne présentation', async () => {
    renderLayout()
    const before = content()
    chooseFile(jsonFile(serializePresentation(makeImported())))
    await within(main()).findByText('Zèbre')

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(content()).toBe(before)
    expect(within(main()).getByText('Alpha')).toBeInTheDocument()
    expect(titleInput()).toHaveValue('Test')
    expect(pastCount()).toBe(0)
  })

  it('accorde "diapositive" au singulier', async () => {
    renderLayout()
    const imported: Presentation = { ...makeImported(), slides: [makeImported().slides[0]!] }

    chooseFile(jsonFile(serializePresentation(imported)))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('importée : 1 diapositive.'))
  })

  it.each([
    ['une structure invalide', JSON.stringify({ version: 2, slides: [] }), 'Version de fichier non prise en charge.'],
    ['un texte qui n\'est pas du JSON', 'ceci n\'est pas du json', 'Le fichier n\'est pas un JSON valide.'],
    ['un JSON qui n\'est pas une présentation', '[1, 2]', 'Le fichier doit contenir une présentation'],
  ])('refuse %s : alerte, rien ne change', async (_name, text, expected) => {
    renderLayout()
    const before = content()

    chooseFile(jsonFile(text))

    await waitFor(() => expect(screen.getByRole('alert')).not.toBeEmptyDOMElement())
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Import impossible')
    expect(alert).toHaveTextContent(expected)
    expect(content()).toBe(before)
    expect(pastCount()).toBe(0)
    expect(within(main()).getByText('Alpha')).toBeInTheDocument()
  })

  it('liste les erreurs de validation avec leur chemin', async () => {
    renderLayout()
    const data = {
      version: 1,
      slides: [{ id: 's1', elements: [{ id: 'e1', type: 'rect', x: 0, y: 0, width: 'large', height: 5, fill: 'red' }] }],
    }

    chooseFile(jsonFile(JSON.stringify(data)))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(
      'Diapositive 1, élément 1 : la largeur doit être un nombre.',
    ))
  })

  it('refuse un fichier trop gros sans le lire', async () => {
    renderLayout()
    const before = content()
    const file = jsonFile('{}')
    Object.defineProperty(file, 'size', { value: MAX_IMPORT_FILE_SIZE + 1 })
    const text = vi.spyOn(file, 'text')

    chooseFile(file)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Le fichier dépasse 25 Mo.'))
    expect(text).not.toHaveBeenCalled()
    expect(content()).toBe(before)
    expect(pastCount()).toBe(0)
  })

  it('affiche une erreur quand le fichier est illisible', async () => {
    renderLayout()
    const file = jsonFile('{}')
    Object.defineProperty(file, 'text', { value: () => Promise.reject(new Error('disque')) })

    chooseFile(file)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Impossible de lire le fichier.'))
    expect(pastCount()).toBe(0)
  })

  it('un import réussi remplace l\'erreur précédente', async () => {
    renderLayout()
    chooseFile(jsonFile('pas du json'))
    await waitFor(() => expect(screen.getByRole('alert')).not.toBeEmptyDOMElement())

    chooseFile(jsonFile(serializePresentation(makeImported())))

    await waitFor(() => expect(screen.getByRole('status')).not.toBeEmptyDOMElement())
    expect(screen.getByRole('alert')).toBeEmptyDOMElement()
  })

  it('un résultat périmé n\'écrase pas un import plus récent', async () => {
    renderLayout()
    const slow = jsonFile('')
    let finishSlow: (text: string) => void = () => {}
    Object.defineProperty(slow, 'text', {
      value: () => new Promise<string>((resolve) => (finishSlow = resolve)),
    })
    const slowText = serializePresentation({ ...makeImported(), title: 'Lent' })
    const fast = jsonFile(serializePresentation({ ...makeImported(), title: 'Rapide' }))

    chooseFile(slow)
    chooseFile(fast)
    await waitFor(() => expect(titleInput()).toHaveValue('Rapide'))
    const parse = vi.spyOn(JSON, 'parse')
    try {
      // La lecture lente se termine APRÈS l'import rapide. On laisse passer un tour complet de
      // la boucle d'événements : toutes les suites de promesses (lecture, analyse) ont fini.
      await act(async () => {
        finishSlow(slowText)
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      // Preuve directe de la garde : le texte périmé n'a même pas été analysé.
      expect(parse).not.toHaveBeenCalledWith(slowText)
    } finally {
      parse.mockRestore()
    }

    expect(titleInput()).toHaveValue('Rapide')
    expect(pastCount()).toBe(1)
    expect(screen.getByRole('status')).toHaveTextContent('Présentation « Rapide » importée')
  })

  it('réimporter le même fichier fonctionne', async () => {
    renderLayout()
    const file = jsonFile(serializePresentation(makeImported()))
    chooseFile(file)
    await within(main()).findByText('Zèbre')
    expect(fileInput().value).toBe('')

    await userEvent.clear(titleInput())
    await userEvent.type(titleInput(), 'Modifiée')
    expect(titleInput()).toHaveValue('Modifiée')

    chooseFile(file)

    await waitFor(() => expect(titleInput()).toHaveValue('Importée'))
  })
})

describe('EditorLayout : aller-retour', () => {
  it('exporter puis importer la même présentation redonne le même contenu', async () => {
    renderLayout()
    const original = content()
    await exportJson()
    const text = (await exported[0]?.text()) ?? ''
    // On modifie d'abord la présentation, pour prouver que l'import la remet bien.
    await userEvent.click(screen.getByRole('button', { name: 'Nouvelle diapositive' }))
    expect(content()).not.toBe(original)

    chooseFile(jsonFile(text))

    // Comparaison en valeur : l'import range les clés dans l'ordre canonique du modèle,
    // alors que les fabriques les posent dans un autre ordre.
    await waitFor(() =>
      expect(JSON.parse(content() ?? '')).toStrictEqual(JSON.parse(original ?? '')),
    )
  })
})

describe('EditorLayout : titre', () => {
  it('taper plusieurs lettres forme UNE entrée d\'historique', async () => {
    renderLayout()

    await userEvent.clear(titleInput())
    await userEvent.type(titleInput(), 'Mon titre')

    expect(titleInput()).toHaveValue('Mon titre')
    expect(screen.getByTestId('title')).toHaveTextContent('Mon titre')
    expect(pastCount()).toBe(1)
  })

  it('perdre le focus coupe la chaîne : la frappe suivante est une nouvelle entrée', async () => {
    renderLayout()
    await userEvent.clear(titleInput())
    await userEvent.type(titleInput(), 'Abc')
    await userEvent.tab()
    expect(pastCount()).toBe(1)

    await userEvent.click(titleInput())
    await userEvent.keyboard('def')

    expect(titleInput()).toHaveValue('Abcdef')
    expect(pastCount()).toBe(2)
  })

  it('Annuler restaure l\'ancien titre', async () => {
    renderLayout()
    await userEvent.clear(titleInput())
    await userEvent.type(titleInput(), 'Nouveau')

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(titleInput()).toHaveValue('Test')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Test')
  })

  it('retire les espaces autour dans le store, mais pas pendant la saisie', async () => {
    renderLayout()
    await userEvent.clear(titleInput())
    await userEvent.type(titleInput(), 'Mon ')

    expect(titleInput()).toHaveValue('Mon ')
    expect(screen.getByTestId('title')).toHaveTextContent('Mon')

    await userEvent.tab()
    expect(titleInput()).toHaveValue('Mon')
  })

  it('l\'en-tête garde un titre de niveau 1 avec le titre courant', async () => {
    renderLayout()

    expect(screen.getByRole('heading', { level: 1, name: 'Test' })).toBeInTheDocument()
  })

  it('le nom de fichier de l\'export suit le nouveau titre', async () => {
    renderLayout()
    await userEvent.clear(titleInput())
    await userEvent.type(titleInput(), 'Été 2026')
    const clicks: HTMLAnchorElement[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push(this)
    })

    await exportJson()

    expect(clicks[0]?.download).toBe('ete-2026.json')
  })
})

describe('EditorLayout : bandeau de message', () => {
  it('le succès disparaît seul après 5 secondes', () => {
    vi.useFakeTimers()
    renderLayout()

    exportJsonSync()
    expect(screen.getByRole('status')).not.toBeEmptyDOMElement()

    act(() => {
      vi.advanceTimersByTime(4999)
    })
    expect(screen.getByRole('status')).not.toBeEmptyDOMElement()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('un nouveau message relance le minuteur', () => {
    vi.useFakeTimers()
    renderLayout()

    exportJsonSync()
    act(() => {
      vi.advanceTimersByTime(4000)
    })
    exportJsonSync()
    act(() => {
      vi.advanceTimersByTime(4000)
    })

    expect(screen.getByRole('status')).not.toBeEmptyDOMElement()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('l\'erreur reste affichée sans limite de temps', () => {
    vi.useFakeTimers()
    const slide = { ...createSlide(), elements: [createTextElement({ text: 'a'.repeat(10001) })] }
    renderLayout({ version: 1, title: 'T', slides: [slide], fonts: [] })

    exportJsonSync()
    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    expect(screen.getByRole('alert')).not.toBeEmptyDOMElement()
  })

  it('le bouton Fermer ferme le message et rend le focus au bouton Exporter', async () => {
    renderLayout()
    await exportJson()

    await userEvent.click(screen.getByRole('button', { name: 'Fermer le message' }))

    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(screen.getByRole('button', { name: 'Exporter' })).toHaveFocus()
  })

  it('après une erreur d\'import, Fermer rend le focus au bouton Importer', async () => {
    renderLayout()
    chooseFile(jsonFile('pas du json'))
    await waitFor(() => expect(screen.getByRole('alert')).not.toBeEmptyDOMElement())

    await userEvent.click(screen.getByRole('button', { name: 'Fermer le message' }))

    expect(screen.getByRole('alert')).toBeEmptyDOMElement()
    expect(screen.getByRole('button', { name: 'Importer' })).toHaveFocus()
  })

  it('le dernier bouton utilisé décide du focus rendu', async () => {
    renderLayout()
    chooseFile(jsonFile('pas du json'))
    await waitFor(() => expect(screen.getByRole('alert')).not.toBeEmptyDOMElement())
    await exportJson()

    await userEvent.click(screen.getByRole('button', { name: 'Fermer le message' }))

    expect(screen.getByRole('button', { name: 'Exporter' })).toHaveFocus()
  })

  it('une erreur est remplacée par la prochaine action d\'export', async () => {
    renderLayout()
    chooseFile(jsonFile('pas du json'))
    await waitFor(() => expect(screen.getByRole('alert')).not.toBeEmptyDOMElement())

    await exportJson()

    expect(screen.getByRole('alert')).toBeEmptyDOMElement()
    expect(screen.getByRole('status')).not.toBeEmptyDOMElement()
  })
})

describe('EditorLayout : mode présentation', () => {
  it('désactive l\'export et l\'import pendant la présentation', async () => {
    renderLayout()

    await userEvent.click(screen.getByRole('button', { name: 'Présenter' }))

    expect(screen.getByRole('button', { name: 'Exporter', hidden: true })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Importer', hidden: true })).toBeDisabled()
  })
})

describe("EditorLayout : cas limites de l'import", () => {
  it("un titre importé vide s'affiche « Sans titre » dans le message de succès", async () => {
    renderLayout()
    chooseFile(jsonFile(serializePresentation({ ...makeImported(), title: '' })))

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Présentation « Sans titre » importée'),
    )
    // Le modèle garde le titre vide : seul l'affichage du message a un repli.
    expect(screen.getByTestId('title')).toBeEmptyDOMElement()
  })

  it('un import qui se termine pendant le mode présentation est abandonné', async () => {
    renderLayout()
    const before = content()
    const file = jsonFile('')
    let finish: (text: string) => void = () => {}
    Object.defineProperty(file, 'text', {
      value: () => new Promise<string>((resolve) => (finish = resolve)),
    })
    chooseFile(file)

    await userEvent.click(screen.getByRole('button', { name: 'Présenter' }))
    await act(async () => {
      finish(serializePresentation(makeImported()))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(content()).toBe(before)
    expect(pastCount()).toBe(0)
    expect(screen.getByRole('status', { hidden: true })).toBeEmptyDOMElement()
    expect(screen.getByRole('alert', { hidden: true })).toHaveTextContent(
      'Import annulé : la présentation est en cours.',
    )

    // À la sortie de la présentation, le message est là et l'éditeur n'a pas changé.
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('alert')).toHaveTextContent('Import annulé')
    expect(within(main()).getByText('Alpha')).toBeInTheDocument()
  })
})
