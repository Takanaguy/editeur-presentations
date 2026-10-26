import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { EditorProvider } from '../../hooks/EditorProvider'
import { useEditor } from '../../hooks/useEditor'
import { exportToPptx, type PptxExportResult } from '../../io/pptxExport'
import { serializePresentation } from '../../io/presentationJson'
import { createSlide, createTextElement } from '../../model/factories'
import type { Presentation } from '../../model/types'
import { createThreeSlidePresentation } from '../../test/fixtures'
import { EditorLayout } from './EditorLayout'

// L'export réel (PptxGenJS, canvas) est testé ailleurs : ici on vérifie le BRANCHEMENT de
// l'interface sur exportToPptx, avec un faux contrôlable à la main.
vi.mock('../../io/pptxExport', () => ({ exportToPptx: vi.fn() }))

const mockedExport = vi.mocked(exportToPptx)

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// Lit l'historique et la présentation via le contexte.
function HistorySpy() {
  const { history } = useEditor()
  return (
    <>
      <span data-testid="past-count">{history.past.length}</span>
      <span data-testid="future-count">{history.future.length}</span>
      <span data-testid="slide-count">{history.editor.presentation.slides.length}</span>
      <span data-testid="content">{serializePresentation(history.editor.presentation)}</span>
    </>
  )
}

function renderLayout(presentation: Presentation = createThreeSlidePresentation(), strict = false) {
  const tree = (
    <EditorProvider presentation={presentation}>
      <EditorLayout />
      <HistorySpy />
    </EditorProvider>
  )
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree)
}

const text = (testId: string) => screen.getByTestId(testId).textContent
const exportButton = () => screen.getByRole('button', { name: 'Exporter' })
const importButton = () => screen.getByRole('button', { name: 'Importer' })
const status = () => screen.getByRole('status')
const alert = () => screen.getByRole('alert')

async function choosePptx() {
  await userEvent.click(exportButton())
  await userEvent.click(screen.getByRole('menuitem', { name: /^PowerPoint/ }))
}

function choosePptxSync() {
  fireEvent.click(exportButton())
  fireEvent.click(screen.getByRole('menuitem', { name: /^PowerPoint/ }))
}

// Laisse passer les promesses en attente (et fait avancer le temps factice).
async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

function result(warnings: string[] = []): PptxExportResult {
  return { blob: new Blob(['pptx'], { type: 'application/test' }), warnings }
}

const makeCreateObjectURL = () => vi.fn<(object: Blob | MediaSource) => string>(() => 'blob:pptx')

let downloads: HTMLAnchorElement[]
let createObjectURL: ReturnType<typeof makeCreateObjectURL>

beforeEach(() => {
  downloads = []
  createObjectURL = makeCreateObjectURL()
  URL.createObjectURL = createObjectURL
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push(this)
  })
  mockedExport.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('EditorLayout : export PowerPoint', () => {
  it('le menu Exporter propose PowerPoint, avec la mention LibreOffice', async () => {
    renderLayout()

    await userEvent.click(exportButton())

    expect(screen.getByRole('menuitem', { name: /^PowerPoint/ })).toHaveTextContent(
      "PowerPoint (.pptx, s'ouvre aussi dans LibreOffice)",
    )
    expect(mockedExport).not.toHaveBeenCalled()
  })

  it('affiche « Préparation… » pendant l\'export, puis le succès avec le nom du fichier', async () => {
    const pending = deferred<PptxExportResult>()
    mockedExport.mockReturnValue(pending.promise)
    renderLayout()

    await choosePptx()

    expect(status()).toHaveTextContent('Préparation du fichier PowerPoint…')
    expect(downloads).toHaveLength(0)

    await act(async () => pending.resolve(result()))

    expect(status()).toHaveTextContent('Présentation exportée : test.pptx')
    expect(status()).not.toHaveTextContent('Préparation')
    expect(alert()).toBeEmptyDOMElement()
  })

  it('télécharge le Blob produit, sous le nom dérivé du titre avec l\'extension .pptx', async () => {
    const produced = result()
    mockedExport.mockResolvedValue(produced)
    renderLayout({ ...createThreeSlidePresentation(), title: 'Cours de réseau' })

    await choosePptx()

    await waitFor(() => expect(downloads).toHaveLength(1))
    expect(downloads[0]?.download).toBe('cours-de-reseau.pptx')
    expect(createObjectURL).toHaveBeenCalledWith(produced.blob)
    expect(status()).toHaveTextContent('Présentation exportée : cours-de-reseau.pptx')
  })

  it('un titre vide donne le nom de repli', async () => {
    mockedExport.mockResolvedValue(result())
    renderLayout({ ...createThreeSlidePresentation(), title: '' })

    await choosePptx()

    await waitFor(() => expect(downloads[0]?.download).toBe('presentation.pptx'))
  })

  it('les avertissements apparaissent dans le bandeau de succès', async () => {
    mockedExport.mockResolvedValue(
      result([
        "Diapositive 2 : une image distante n'a pas pu être incluse (le site l'interdit).",
        'Diapositive 3 : la couleur « zzz » n\'est pas reconnue, elle est remplacée par du noir.',
      ]),
    )
    renderLayout()

    await choosePptx()

    await waitFor(() => expect(status()).toHaveTextContent('Présentation exportée : test.pptx'))
    const items = Array.from(status().querySelectorAll('li')).map((li) => li.textContent)
    expect(items).toEqual([
      "Diapositive 2 : une image distante n'a pas pu être incluse (le site l'interdit).",
      "Diapositive 3 : la couleur « zzz » n'est pas reconnue, elle est remplacée par du noir.",
    ])
  })

  it('une erreur de l\'export affiche le bandeau d\'erreur avec le message, sans téléchargement', async () => {
    mockedExport.mockRejectedValue(new Error('Le fichier PowerPoint n\'a pas pu être créé (zip cassé).'))
    renderLayout()

    await choosePptx()

    await waitFor(() => expect(alert()).toHaveTextContent('Export PowerPoint impossible'))
    expect(alert()).toHaveTextContent("Le fichier PowerPoint n'a pas pu être créé (zip cassé).")
    expect(status()).toBeEmptyDOMElement()
    expect(downloads).toHaveLength(0)
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('une erreur sans message donne un message générique', async () => {
    mockedExport.mockRejectedValue('boom')
    renderLayout()

    await choosePptx()

    await waitFor(() => expect(alert()).toHaveTextContent("Une erreur inattendue s'est produite."))
  })

  it('un téléchargement refusé par le navigateur est signalé', async () => {
    mockedExport.mockResolvedValue(result())
    createObjectURL.mockImplementation(() => {
      throw new Error('indisponible')
    })
    renderLayout()

    await choosePptx()

    await waitFor(() => expect(alert()).toHaveTextContent('Export PowerPoint impossible'))
    expect(alert()).toHaveTextContent('Le navigateur a refusé le téléchargement.')
    expect(status()).toBeEmptyDOMElement()
  })

  it('après une erreur, on peut relancer l\'export', async () => {
    mockedExport.mockRejectedValueOnce(new Error('échec'))
    mockedExport.mockResolvedValueOnce(result())
    renderLayout()
    await choosePptx()
    await waitFor(() => expect(alert()).toHaveTextContent('échec'))

    await choosePptx()

    await waitFor(() => expect(status()).toHaveTextContent('Présentation exportée : test.pptx'))
    expect(alert()).toBeEmptyDOMElement()
    expect(mockedExport).toHaveBeenCalledTimes(2)
  })
})

describe('EditorLayout : export PowerPoint en cours', () => {
  it('désactive Exporter et Importer pendant l\'export, puis les réactive', async () => {
    const pending = deferred<PptxExportResult>()
    mockedExport.mockReturnValue(pending.promise)
    renderLayout()

    await choosePptx()

    expect(exportButton()).toBeDisabled()
    expect(importButton()).toBeDisabled()

    await act(async () => pending.resolve(result()))

    expect(exportButton()).toBeEnabled()
    expect(importButton()).toBeEnabled()
  })

  it('les boutons sont réactivés aussi après une erreur', async () => {
    const pending = deferred<PptxExportResult>()
    mockedExport.mockReturnValue(pending.promise)
    renderLayout()
    await choosePptx()

    await act(async () => pending.reject(new Error('échec')))

    expect(exportButton()).toBeEnabled()
    expect(importButton()).toBeEnabled()
  })

  it('un second export est ignoré (un seul appel), même sous StrictMode', async () => {
    const pending = deferred<PptxExportResult>()
    mockedExport.mockReturnValue(pending.promise)
    renderLayout(createThreeSlidePresentation(), true)

    await choosePptx()
    // Le bouton est désactivé : le menu ne s'ouvre plus.
    await userEvent.click(exportButton())
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await act(async () => pending.resolve(result()))

    expect(mockedExport).toHaveBeenCalledTimes(1)
    expect(downloads).toHaveLength(1)
  })

  it('un import tenté pendant l\'export est refusé avec un message, sans toucher à la présentation', async () => {
    const pending = deferred<PptxExportResult>()
    mockedExport.mockReturnValue(pending.promise)
    renderLayout()
    await choosePptx()
    const before = text('content')
    const file = new File([serializePresentation(createThreeSlidePresentation())], 'a.json', {
      type: 'application/json',
    })

    fireEvent.change(screen.getByLabelText('Importer une présentation JSON'), {
      target: { files: [file] },
    })

    expect(alert()).toHaveTextContent("Import impossible pendant l'export PowerPoint.")
    expect(text('content')).toBe(before)
    expect(text('past-count')).toBe('0')
  })

  it('ne modifie ni la présentation ni l\'historique', async () => {
    mockedExport.mockResolvedValue(result())
    renderLayout()
    await userEvent.click(screen.getByRole('button', { name: 'Nouvelle diapositive' }))
    const before = { past: text('past-count'), future: text('future-count'), content: text('content') }

    await choosePptx()
    await waitFor(() => expect(downloads).toHaveLength(1))

    expect({ past: text('past-count'), future: text('future-count'), content: text('content') }).toEqual(before)
  })

  it('exporte la présentation de l\'instant du clic, même modifiée ensuite', async () => {
    const pending = deferred<PptxExportResult>()
    mockedExport.mockReturnValue(pending.promise)
    renderLayout()
    await choosePptx()
    await waitFor(() => expect(mockedExport).toHaveBeenCalledTimes(1))
    const exported = mockedExport.mock.calls[0]![0]
    const exportedJson = serializePresentation(exported)
    expect(exported.slides).toHaveLength(3)

    // L'édition reste possible pendant l'export.
    await userEvent.click(screen.getByRole('button', { name: 'Nouvelle diapositive' }))
    expect(text('slide-count')).toBe('4')
    await act(async () => pending.resolve(result()))

    expect(mockedExport.mock.calls[0]![0]).toBe(exported)
    expect(serializePresentation(exported)).toBe(exportedJson)
    expect(exported.slides).toHaveLength(3)
    expect(text('slide-count')).toBe('4')
  })

  it('le nom du fichier est celui du titre au moment du clic', async () => {
    const pending = deferred<PptxExportResult>()
    mockedExport.mockReturnValue(pending.promise)
    renderLayout()
    await choosePptx()
    await waitFor(() => expect(mockedExport).toHaveBeenCalled())

    const title = screen.getByRole('textbox', { name: 'Titre de la présentation' })
    await userEvent.clear(title)
    await userEvent.type(title, 'Autre nom')
    await act(async () => pending.resolve(result()))

    expect(downloads[0]?.download).toBe('test.pptx')
  })

  it('un import déjà en cours n\'est pas perturbé par l\'export', async () => {
    const pendingExport = deferred<PptxExportResult>()
    mockedExport.mockReturnValue(pendingExport.promise)
    renderLayout()
    // Lecture du fichier d'import tenue en attente.
    const pendingRead = deferred<string>()
    const imported: Presentation = {
      version: 1,
      title: 'Importée',
      fonts: [],
      slides: [{ ...createSlide(), elements: [createTextElement({ text: 'Zèbre' })] }],
    }
    const file = new File(['{}'], 'import.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: () => pendingRead.promise })
    fireEvent.change(screen.getByLabelText('Importer une présentation JSON'), {
      target: { files: [file] },
    })

    await choosePptx()
    await waitFor(() => expect(mockedExport).toHaveBeenCalledTimes(1))
    const exported = mockedExport.mock.calls[0]![0]
    await act(async () => pendingRead.resolve(serializePresentation(imported)))

    // L'import est allé au bout : la présentation a changé.
    expect(text('slide-count')).toBe('1')
    expect(status()).toHaveTextContent('Présentation « Importée » importée : 1 diapositive.')
    expect(alert()).toBeEmptyDOMElement()
    // L'export, lui, garde la présentation figée au clic.
    expect(exported.slides).toHaveLength(3)

    await act(async () => pendingExport.resolve(result()))

    expect(downloads[0]?.download).toBe('test.pptx')
    expect(text('slide-count')).toBe('1')
  })
})

describe('EditorLayout : export PowerPoint et autres modes', () => {
  it('n\'est pas disponible en mode présentation', async () => {
    renderLayout()

    await userEvent.click(screen.getByRole('button', { name: 'Présenter' }))

    expect(screen.getByRole('button', { name: 'Exporter', hidden: true })).toBeDisabled()
    expect(mockedExport).not.toHaveBeenCalled()
  })

  it('n\'est pas disponible pendant l\'impression du PDF', async () => {
    const print = vi.fn()
    Object.defineProperty(window, 'print', { configurable: true, writable: true, value: print })
    renderLayout()

    await userEvent.click(exportButton())
    await userEvent.click(screen.getByRole('menuitem', { name: /^PDF/ }))

    expect(exportButton()).toBeDisabled()
    expect(mockedExport).not.toHaveBeenCalled()
  })

  it('l\'export JSON et le PDF ne partent pas pendant un export PowerPoint', async () => {
    const pending = deferred<PptxExportResult>()
    mockedExport.mockReturnValue(pending.promise)
    renderLayout()

    await choosePptx()
    await userEvent.click(exportButton())

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.queryByTestId('print-view')).not.toBeInTheDocument()
    // Seul le Blob de l'export PowerPoint (pas encore prêt) pourrait être téléchargé.
    expect(createObjectURL).not.toHaveBeenCalled()
  })
})

describe('EditorLayout : bandeau et démontage', () => {
  it('le message « Préparation » reste affiché tant que l\'export dure, au delà de 5 secondes', async () => {
    vi.useFakeTimers()
    const pending = deferred<PptxExportResult>()
    mockedExport.mockReturnValue(pending.promise)
    renderLayout()

    choosePptxSync()
    await flush(10_000)

    expect(status()).toHaveTextContent('Préparation du fichier PowerPoint…')

    await act(async () => pending.resolve(result()))
    expect(status()).toHaveTextContent('Présentation exportée : test.pptx')
  })

  it('le succès sans avertissement se ferme seul après 5 secondes', async () => {
    vi.useFakeTimers()
    mockedExport.mockResolvedValue(result())
    renderLayout()

    choosePptxSync()
    await flush()
    expect(status()).toHaveTextContent('Présentation exportée : test.pptx')
    await flush(5000)

    expect(status()).toBeEmptyDOMElement()
  })

  it('le succès avec avertissements reste affiché jusqu\'à fermeture', async () => {
    vi.useFakeTimers()
    mockedExport.mockResolvedValue(result(['Diapositive 1 : une image n\'a pas pu être incluse (format illisible).']))
    renderLayout()

    choosePptxSync()
    await flush()
    await flush(60_000)

    expect(status()).toHaveTextContent('format illisible')
    fireEvent.click(screen.getByRole('button', { name: 'Fermer le message' }))
    expect(status()).toBeEmptyDOMElement()
  })

  it('démonter pendant l\'export : rien n\'est téléchargé ni mis à jour à la fin', async () => {
    const pending = deferred<PptxExportResult>()
    mockedExport.mockReturnValue(pending.promise)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { unmount } = renderLayout()
    await choosePptx()
    await waitFor(() => expect(mockedExport).toHaveBeenCalled())

    unmount()
    await act(async () => pending.resolve(result()))

    expect(downloads).toHaveLength(0)
    expect(createObjectURL).not.toHaveBeenCalled()
    expect(errors).not.toHaveBeenCalled()
  })

  it('démonter pendant l\'export puis échouer ne met rien à jour non plus', async () => {
    const pending = deferred<PptxExportResult>()
    mockedExport.mockReturnValue(pending.promise)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { unmount } = renderLayout()
    await choosePptx()
    await waitFor(() => expect(mockedExport).toHaveBeenCalled())

    unmount()
    await act(async () => pending.reject(new Error('trop tard')))

    expect(errors).not.toHaveBeenCalled()
  })
})
