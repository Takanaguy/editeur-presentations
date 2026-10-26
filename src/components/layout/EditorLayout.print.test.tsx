import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { EditorProvider } from '../../hooks/EditorProvider'
import { useEditor } from '../../hooks/useEditor'
import { serializePresentation } from '../../io/presentationJson'
import { createImageElement, createSlide } from '../../model/factories'
import type { Presentation } from '../../model/types'
import { installFakeFonts, type FakeFontEnv } from '../../test/fakeFonts'
import { createThreeSlidePresentation } from '../../test/fixtures'
import { EditorLayout } from './EditorLayout'

// Lit l'historique et la présentation via le contexte.
function HistorySpy() {
  const { history } = useEditor()
  return (
    <>
      <span data-testid="past-count">{history.past.length}</span>
      <span data-testid="future-count">{history.future.length}</span>
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
const printView = () => screen.queryByTestId('print-view')

// Présentation avec une image : il y a alors quelque chose à décoder avant d'imprimer.
function withImage(): Presentation {
  const slide = { ...createSlide(), elements: [createImageElement('data:image/png;base64,AAAA')] }
  return { version: 1, title: 'Images', slides: [slide], fonts: [] }
}

async function choosePdf() {
  await userEvent.click(screen.getByRole('button', { name: 'Exporter' }))
  await userEvent.click(screen.getByRole('menuitem', { name: /^PDF/ }))
}

// Version synchrone pour les tests à minuteurs factices.
function choosePdfSync() {
  fireEvent.click(screen.getByRole('button', { name: 'Exporter' }))
  fireEvent.click(screen.getByRole('menuitem', { name: /^PDF/ }))
}

// Laisse passer les promesses en attente (et fait avancer le temps factice).
async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

function fireAfterPrint() {
  act(() => {
    window.dispatchEvent(new Event('afterprint'))
  })
}

const originalPrint = window.print
const hadDecode = 'decode' in HTMLImageElement.prototype

function setDecode(impl: () => Promise<void>) {
  Object.defineProperty(HTMLImageElement.prototype, 'decode', {
    configurable: true,
    writable: true,
    value: vi.fn(impl),
  })
}

let print: ReturnType<typeof vi.fn>

beforeEach(() => {
  print = vi.fn()
  Object.defineProperty(window, 'print', { configurable: true, writable: true, value: print })
  setDecode(() => Promise.resolve())
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  Object.defineProperty(window, 'print', {
    configurable: true,
    writable: true,
    value: originalPrint,
  })
  if (!hadDecode) Reflect.deleteProperty(HTMLImageElement.prototype, 'decode')
})

describe('EditorLayout : export PDF', () => {
  it('ne monte pas la vue d\'impression tant qu\'on n\'a pas choisi PDF', () => {
    renderLayout()

    expect(printView()).not.toBeInTheDocument()
    expect(print).not.toHaveBeenCalled()
  })

  it('choisir PDF monte la vue d\'impression avec une page par diapositive, puis imprime', async () => {
    renderLayout()

    await choosePdf()

    expect(printView()).toBeInTheDocument()
    expect(screen.getAllByTestId('print-page')).toHaveLength(3)
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1))
  })

  it('attend le décodage des images avant d\'imprimer', async () => {
    let finishDecode: () => void = () => {}
    setDecode(() => new Promise<void>((resolve) => (finishDecode = resolve)))
    renderLayout(withImage())

    await choosePdf()
    // Le temps de laisser passer des promesses : l'image n'est pas prête, pas d'impression.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    expect(print).not.toHaveBeenCalled()

    await act(async () => finishDecode())

    await waitFor(() => expect(print).toHaveBeenCalledTimes(1))
  })

  it('imprime quand même si une image ne se décode pas', async () => {
    setDecode(() => Promise.reject(new Error('image cassée')))
    renderLayout(withImage())

    await choosePdf()

    await waitFor(() => expect(print).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alert')?.textContent).toBe('')
  })

  it('imprime quand même après 5 secondes si le décodage ne finit jamais', async () => {
    vi.useFakeTimers()
    setDecode(() => new Promise<void>(() => {}))
    renderLayout(withImage())

    choosePdfSync()
    await flush(4999)
    expect(print).not.toHaveBeenCalled()
    await flush(1)

    expect(print).toHaveBeenCalledTimes(1)
  })

  it('imprime sans erreur quand le navigateur n\'a pas decode()', async () => {
    Reflect.deleteProperty(HTMLImageElement.prototype, 'decode')
    renderLayout(withImage())

    await choosePdf()

    await waitFor(() => expect(print).toHaveBeenCalledTimes(1))
  })

  it('un export = un seul appel à print, même après un double clic rapide sur PDF', async () => {
    let finishDecode: () => void = () => {}
    setDecode(() => new Promise<void>((resolve) => (finishDecode = resolve)))
    renderLayout(withImage())

    // Premier choix de PDF, puis un second tenté pendant l'attente des images : ignoré.
    await choosePdf()
    expect(screen.getByRole('button', { name: 'Exporter' })).toBeDisabled()
    expect(screen.getAllByTestId('print-view')).toHaveLength(1)
    await act(async () => finishDecode())
    await waitFor(() => expect(print).toHaveBeenCalled())
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    expect(print).toHaveBeenCalledTimes(1)
  })

  it('un export = un seul appel à print, avec le rendu sous StrictMode', async () => {
    renderLayout(createThreeSlidePresentation(), true)

    await choosePdf()
    await waitFor(() => expect(print).toHaveBeenCalled())
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    expect(print).toHaveBeenCalledTimes(1)
    expect(screen.getAllByTestId('print-page')).toHaveLength(3)
  })

  it('un second export, après la fin du premier, imprime une seconde fois', async () => {
    renderLayout()
    await choosePdf()
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1))
    fireAfterPrint()
    expect(printView()).not.toBeInTheDocument()

    await choosePdf()

    await waitFor(() => expect(print).toHaveBeenCalledTimes(2))
  })

  it('l\'événement afterprint démonte la vue d\'impression', async () => {
    renderLayout()
    await choosePdf()
    await waitFor(() => expect(print).toHaveBeenCalled())
    expect(printView()).toBeInTheDocument()

    fireAfterPrint()

    expect(printView()).not.toBeInTheDocument()
  })

  it('retire l\'écouteur afterprint après usage', async () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    renderLayout()
    await choosePdf()
    await waitFor(() => expect(print).toHaveBeenCalled())

    fireAfterPrint()

    expect(remove).toHaveBeenCalledWith('afterprint', expect.any(Function))
  })

  it('le repli de 60 secondes démonte la vue si afterprint n\'arrive jamais', async () => {
    vi.useFakeTimers()
    renderLayout()

    choosePdfSync()
    await flush()
    expect(print).toHaveBeenCalledTimes(1)
    await flush(59_999)
    expect(printView()).toBeInTheDocument()
    await flush(1)

    expect(printView()).not.toBeInTheDocument()
  })

  it('affiche le bandeau de succès, qui se ferme seul après 5 secondes', async () => {
    vi.useFakeTimers()
    renderLayout()

    choosePdfSync()
    await flush()

    expect(screen.getByRole('status')).toHaveTextContent(
      'La fenêtre d\'impression s\'ouvre : choisissez « Enregistrer au format PDF » comme imprimante.',
    )
    await flush(5000)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('window.print absent : erreur affichée et vue d\'impression démontée', async () => {
    Object.defineProperty(window, 'print', { configurable: true, writable: true, value: undefined })
    renderLayout()

    await choosePdf()

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'L\'impression n\'est pas disponible dans ce navigateur.',
      ),
    )
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(printView()).not.toBeInTheDocument()
  })

  it('window.print qui lève : erreur affichée et vue d\'impression démontée', async () => {
    print.mockImplementation(() => {
      throw new Error('bloqué')
    })
    renderLayout()

    await choosePdf()

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'L\'impression n\'est pas disponible dans ce navigateur.',
      ),
    )
    expect(printView()).not.toBeInTheDocument()
  })

  it('ne modifie ni la présentation ni l\'historique', async () => {
    renderLayout()
    await userEvent.click(screen.getByRole('button', { name: 'Nouvelle diapositive' }))
    const before = { past: text('past-count'), future: text('future-count'), content: text('content') }

    await choosePdf()
    await waitFor(() => expect(print).toHaveBeenCalled())
    fireAfterPrint()

    expect({ past: text('past-count'), future: text('future-count'), content: text('content') }).toEqual(before)
  })

  it('la vue d\'impression reprend les diapositives actuelles', async () => {
    renderLayout()
    await userEvent.click(screen.getByRole('button', { name: 'Nouvelle diapositive' }))

    await choosePdf()

    expect(screen.getAllByTestId('print-page')).toHaveLength(4)
  })

  it('l\'éditeur est masqué à l\'impression', () => {
    const { container } = renderLayout()

    expect(container.firstElementChild).toHaveClass('print:hidden')
  })

  it('désactive l\'export pendant la présentation, et la présentation est masquée à l\'impression', async () => {
    renderLayout()

    await userEvent.click(screen.getByRole('button', { name: 'Présenter' }))

    expect(screen.getByRole('button', { name: 'Exporter', hidden: true })).toBeDisabled()
    expect(screen.getByRole('dialog')).toHaveClass('print:hidden')
  })

  it('une impression en cours est nettoyée au démontage : plus de minuteur ni d\'écouteur', async () => {
    vi.useFakeTimers()
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderLayout()
    choosePdfSync()
    await flush()
    expect(print).toHaveBeenCalledTimes(1)

    unmount()

    expect(remove).toHaveBeenCalledWith('afterprint', expect.any(Function))
    expect(vi.getTimerCount()).toBe(0)
  })

  it('démonter pendant l\'attente des images n\'imprime pas', async () => {
    vi.useFakeTimers()
    setDecode(() => new Promise<void>(() => {}))
    const { unmount } = renderLayout(withImage())
    choosePdfSync()
    await flush()

    unmount()
    await flush(10_000)

    expect(print).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe("EditorLayout : contenu figé pendant l'impression", () => {
  let finishDecode: () => void
  const addRect = () => userEvent.click(screen.getByRole('button', { name: 'Rectangle' }))
  const pastCount = () => Number(text('past-count'))

  // Lance l'export avec une image dont le décodage reste en attente.
  async function startWaiting() {
    finishDecode = () => {}
    setDecode(() => new Promise<void>((resolve) => (finishDecode = resolve)))
    renderLayout(withImage())
    await choosePdf()
    expect(print).not.toHaveBeenCalled()
    expect(printView()).toBeInTheDocument()
  }

  it("modifier la présentation pendant l'attente ne change pas ce qui sera imprimé", async () => {
    await startWaiting()
    const before = printView()!.innerHTML
    expect(screen.getAllByTestId('print-page')).toHaveLength(1)

    await addRect()

    expect(pastCount()).toBe(1)
    expect(printView()!.innerHTML).toBe(before)
    expect(screen.getAllByTestId('print-page')).toHaveLength(1)
    expect(printView()!.querySelectorAll('img')).toHaveLength(1)
  })

  it("ajouter une diapositive pendant l'attente ne change pas le nombre de pages", async () => {
    await startWaiting()

    await userEvent.click(screen.getByRole('button', { name: 'Nouvelle diapositive' }))

    expect(screen.getAllByTestId('print-page')).toHaveLength(1)
  })

  it("un import déclenché pendant l'attente est ignoré, avec un message", async () => {
    await startWaiting()
    const before = text('content')
    const input = screen.getByLabelText('Importer une présentation JSON')
    const file = new File([serializePresentation(createThreeSlidePresentation())], 'a.json', {
      type: 'application/json',
    })

    fireEvent.change(input, { target: { files: [file] } })

    expect(screen.getByRole('alert')).toHaveTextContent("Import impossible pendant l'impression.")
    expect(text('content')).toBe(before)
    expect(pastCount()).toBe(0)
    expect(screen.getAllByTestId('print-page')).toHaveLength(1)
  })

  it("Exporter et Importer sont désactivés pendant l'impression", async () => {
    await startWaiting()

    expect(screen.getByRole('button', { name: 'Exporter' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Importer' })).toBeDisabled()
  })

  it("les raccourcis de l'éditeur sont suspendus, puis reviennent après afterprint", async () => {
    await startWaiting()
    await addRect()
    expect(pastCount()).toBe(1)

    fireEvent.keyDown(document.body, { key: 'Delete' })
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true })
    expect(pastCount()).toBe(1)

    await act(async () => finishDecode())
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1))
    fireAfterPrint()
    expect(printView()).not.toBeInTheDocument()

    // Tout est actif de nouveau : le rectangle sélectionné se supprime.
    fireEvent.keyDown(document.body, { key: 'Delete' })
    expect(pastCount()).toBe(2)
    expect(screen.getByRole('button', { name: 'Exporter' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Importer' })).toBeEnabled()
  })

  it("l'export JSON ne part pas pendant l'impression", async () => {
    await startWaiting()
    const create = vi.spyOn(URL, 'createObjectURL')

    // Le bouton est désactivé : le menu ne s'ouvre pas, rien n'est téléchargé.
    await userEvent.click(screen.getByRole('button', { name: 'Exporter' }))

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })

  it('après afterprint, un nouvel export reprend la présentation modifiée', async () => {
    await startWaiting()
    await act(async () => finishDecode())
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1))
    fireAfterPrint()
    await userEvent.click(screen.getByRole('button', { name: 'Nouvelle diapositive' }))
    setDecode(() => Promise.resolve())

    await choosePdf()

    expect(screen.getAllByTestId('print-page')).toHaveLength(2)
  })
})

describe('EditorLayout : export PDF et polices ajoutées', () => {
  let env: FakeFontEnv

  beforeEach(() => {
    env = installFakeFonts()
  })

  afterEach(() => {
    env.restore()
  })

  it("attend document.fonts.ready avant d'imprimer", async () => {
    let fontsLoaded: () => void = () => {}
    env.setReady(new Promise<void>((resolve) => (fontsLoaded = resolve)))
    renderLayout()

    await choosePdf()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    expect(print).not.toHaveBeenCalled()

    await act(async () => fontsLoaded())

    await waitFor(() => expect(print).toHaveBeenCalledTimes(1))
  })

  it('imprime quand même après 5 secondes si document.fonts.ready ne se résout jamais', async () => {
    vi.useFakeTimers()
    env.setReady(new Promise<void>(() => {}))
    renderLayout()

    choosePdfSync()
    await flush(4999)
    expect(print).not.toHaveBeenCalled()
    await flush(1)

    expect(print).toHaveBeenCalledTimes(1)
  })

  it('imprime quand même si document.fonts.ready est rejetée', async () => {
    const rejected = Promise.reject(new Error('échec'))
    // Marquée comme traitée tout de suite : seul le composant doit s'en occuper.
    rejected.catch(() => {})
    env.setReady(rejected)
    renderLayout()

    await choosePdf()

    await waitFor(() => expect(print).toHaveBeenCalledTimes(1))
  })

  it('attend à la fois les images et les polices', async () => {
    let fontsLoaded: () => void = () => {}
    let finishDecode: () => void = () => {}
    env.setReady(new Promise<void>((resolve) => (fontsLoaded = resolve)))
    setDecode(() => new Promise<void>((resolve) => (finishDecode = resolve)))
    renderLayout(withImage())

    await choosePdf()
    await act(async () => fontsLoaded())
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    expect(print).not.toHaveBeenCalled()
    await act(async () => finishDecode())

    await waitFor(() => expect(print).toHaveBeenCalledTimes(1))
  })

  it('sans document.fonts (vieux navigateur), imprime sans attendre', async () => {
    env.restore()
    renderLayout()

    await choosePdf()

    await waitFor(() => expect(print).toHaveBeenCalledTimes(1))
  })

  it('un seul appel à print, même sous StrictMode', async () => {
    renderLayout(createThreeSlidePresentation(), true)

    await choosePdf()
    await waitFor(() => expect(print).toHaveBeenCalled())
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    expect(print).toHaveBeenCalledTimes(1)
  })
})
