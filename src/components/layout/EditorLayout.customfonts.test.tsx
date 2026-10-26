import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditorProvider } from '../../hooks/EditorProvider'
import { useEditor } from '../../hooks/useEditor'
import { createSlide, createTextElement } from '../../model/factories'
import { exportToPptx } from '../../io/pptxExport'
import { MAX_FONTS, MAX_FONT_FILE_SIZE } from '../../model/limits'
import type { CustomFont, Presentation } from '../../model/types'
import { FakeFontFace, installFakeFonts, type FakeFontEnv } from '../../test/fakeFonts'
import { fontBytes, fontFileOf, fontSrcOf } from '../../test/fixtures'
import { EditorLayout } from './EditorLayout'

// L'export PowerPoint réel est testé ailleurs : ici on vérifie seulement ce que l'interface lui donne.
vi.mock('../../io/pptxExport', () => ({ exportToPptx: vi.fn() }))
const mockedExport = vi.mocked(exportToPptx)

// Lit l'historique via le contexte et l'affiche : prouve le nombre d'entrées créées.
function HistorySpy() {
  const { history } = useEditor()
  return (
    <>
      <output data-testid="past-count">{history.past.length}</output>
      <output data-testid="fonts">
        {JSON.stringify(history.editor.presentation.fonts.map((font) => font.name))}
      </output>
    </>
  )
}

function renderLayout(presentation?: Presentation) {
  return render(
    <EditorProvider presentation={presentation}>
      <EditorLayout />
      <HistorySpy />
    </EditorProvider>,
  )
}

const main = () => screen.getByRole('main', { name: "Zone d'édition" })
const panel = () => screen.getByRole('complementary', { name: 'Propriétés' })
const pastCount = () => Number(screen.getByTestId('past-count').textContent)
const stateFonts = () => JSON.parse(screen.getByTestId('fonts').textContent ?? '[]') as string[]
const click = (name: string) => userEvent.click(screen.getByRole('button', { name }))
const fontSelect = () => within(panel()).getByLabelText('Police') as HTMLSelectElement
const fontInput = () =>
  within(panel()).getByLabelText('Ajouter une police (WOFF2, WOFF, TTF ou OTF)') as HTMLInputElement
const addFontButton = () => within(panel()).getByRole('button', { name: 'Ajouter une police…' })
const thumbnailText = (text: string) =>
  within(screen.getByRole('button', { name: 'Diapositive 1' })).getByText(text)

// Le bandeau d'erreur existe toujours (vide) : on attend que son texte apparaisse.
async function expectAlert(...texts: string[]) {
  await waitFor(() => {
    for (const text of texts) expect(screen.getByRole('alert')).toHaveTextContent(text)
  })
}

function upload(file: File) {
  fireEvent.change(fontInput(), { target: { files: [file] } })
}

async function addText() {
  renderLayout()
  await click('Texte')
  return within(main()).getByText('Texte')
}

// Présentation de départ : un texte, et des polices déjà ajoutées.
function presentationWith(fonts: CustomFont[], text = 'Texte'): Presentation {
  const slide = { ...createSlide(), elements: [createTextElement({ text })] }
  return { version: 1, title: 'Avec polices', slides: [slide], fonts }
}

async function selectText(text = 'Texte') {
  const element = within(main()).getByText(text)
  await userEvent.click(element)
  return element
}

const roboto = { name: 'Roboto', src: fontSrcOf('woff2', 1) }

let env: FakeFontEnv
let exported: Blob[]

beforeEach(() => {
  mockedExport.mockReset()
  env = installFakeFonts()
  exported = []
  URL.createObjectURL = vi.fn((blob: Blob) => {
    exported.push(blob)
    return 'blob:test'
  })
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

afterEach(() => {
  env.restore()
  vi.restoreAllMocks()
})

describe('EditorLayout : ajouter sa propre police', () => {
  it('la police est ajoutée, sélectionnée et appliquée au texte et à sa vignette', async () => {
    const text = await addText()

    upload(fontFileOf('Roboto.woff2'))

    expect(await screen.findByText('Police « Roboto » ajoutée.')).toBeInTheDocument()
    expect(fontSelect()).toHaveValue('Roboto')
    expect(
      within(fontSelect()).getByRole('group', { name: 'Mes polices' }),
    ).toHaveTextContent('Roboto')
    expect(screen.queryByRole('option', { name: /non listée/ })).not.toBeInTheDocument()
    expect(text.style.fontFamily).toBe('"Roboto", sans-serif')
    expect(thumbnailText('Texte').style.fontFamily).toBe('"Roboto", sans-serif')
    expect(stateFonts()).toEqual(['Roboto'])
  })

  it("charge la police dans le navigateur avec la bonne source et l'enregistre dans document.fonts", async () => {
    await addText()
    const file = fontFileOf('Roboto.woff2')
    const expectedSrc = `data:font/woff2;base64,${btoa(String.fromCharCode(...fontBytes('woff2')))}`

    upload(file)
    await screen.findByText('Police « Roboto » ajoutée.')

    // Un chargement pour valider avant l'ajout, un pour l'enregistrer (hook).
    expect(env.faces.length).toBeGreaterThanOrEqual(1)
    for (const face of env.faces) {
      expect(face.family).toBe('Roboto')
      expect(face.source).toBe(`url("${expectedSrc}")`)
      expect(face.load).toHaveBeenCalledTimes(1)
    }
    await waitFor(() => expect(env.add).toHaveBeenCalledTimes(1))
    expect(env.add.mock.calls[0]?.[0]).toBeInstanceOf(FakeFontFace)
    expect((env.add.mock.calls[0]?.[0] as FakeFontFace).family).toBe('Roboto')
  })

  it("l'ajout et le choix de la police forment UNE seule entrée d'historique", async () => {
    await addText()
    const before = pastCount()

    upload(fontFileOf('Roboto.woff2'))
    await screen.findByText('Police « Roboto » ajoutée.')

    expect(pastCount()).toBe(before + 1)
  })

  it("Annuler retire la police ET rend l'ancienne famille du texte, d'un seul coup", async () => {
    const text = await addText()
    fireEvent.change(fontSelect(), { target: { value: 'Georgia' } })
    const before = pastCount()
    upload(fontFileOf('Roboto.woff2'))
    await screen.findByText('Police « Roboto » ajoutée.')
    await waitFor(() => expect(env.contents.size).toBe(1))

    await click('Annuler')

    expect(pastCount()).toBe(before)
    expect(stateFonts()).toEqual([])
    expect(text.style.fontFamily).toBe('Georgia, "Times New Roman", serif')
    expect(fontSelect()).toHaveValue('Georgia')
    expect(screen.queryByRole('group', { name: 'Mes polices' })).not.toBeInTheDocument()
    // Le hook désenregistre la police.
    await waitFor(() => expect(env.contents.size).toBe(0))
  })

  it('Ctrl+Z fait la même chose, et Rétablir remet la police', async () => {
    const text = await addText()
    upload(fontFileOf('Roboto.woff2'))
    await screen.findByText('Police « Roboto » ajoutée.')
    await waitFor(() => expect(env.contents.size).toBe(1))

    await userEvent.keyboard('{Control>}z{/Control}')
    expect(stateFonts()).toEqual([])
    expect(text.style.fontFamily).toBe('')
    await waitFor(() => expect(env.contents.size).toBe(0))

    await click('Rétablir')
    expect(stateFonts()).toEqual(['Roboto'])
    expect(text.style.fontFamily).toBe('"Roboto", sans-serif')
    await waitFor(() => expect(env.contents.size).toBe(1))
  })

  it('le bouton ouvre le sélecteur de fichier (input caché, 4 formats)', async () => {
    await addText()
    const click = vi.spyOn(fontInput(), 'click').mockImplementation(() => {})

    await userEvent.click(addFontButton())

    expect(click).toHaveBeenCalledTimes(1)
    expect(fontInput()).toHaveAttribute('accept', '.woff2,.woff,.ttf,.otf')
  })

  it('on peut choisir deux fois de suite le même fichier (valeur vidée)', async () => {
    await addText()

    upload(fontFileOf('Roboto.woff2'))
    await screen.findByText('Police « Roboto » ajoutée.')

    expect(fontInput().value).toBe('')
  })

  it('une police ajoutée peut être choisie ensuite dans la liste, et annulée en une entrée', async () => {
    const text = await addText()
    upload(fontFileOf('Roboto.woff2'))
    await screen.findByText('Police « Roboto » ajoutée.')
    fireEvent.change(fontSelect(), { target: { value: 'Impact' } })
    const before = pastCount()

    fireEvent.change(fontSelect(), { target: { value: 'Roboto' } })

    expect(text.style.fontFamily).toBe('"Roboto", sans-serif')
    expect(pastCount()).toBe(before + 1)
    expect(stateFonts()).toEqual(['Roboto'])
  })

  it("sans texte sélectionné, le panneau ne propose pas l'ajout (rien à appliquer)", async () => {
    renderLayout()

    expect(screen.queryByLabelText('Ajouter une police (WOFF2, WOFF, TTF ou OTF)')).not.toBeInTheDocument()
  })

  describe('noms', () => {
    it('une police du même nom (casse ignorée) devient « Roboto 2 »', async () => {
      renderLayout(presentationWith([roboto]))
      await selectText()

      upload(fontFileOf('ROBOTO.woff2'))

      expect(await screen.findByText('Police « ROBOTO 2 » ajoutée.')).toBeInTheDocument()
      expect(stateFonts()).toEqual(['Roboto', 'ROBOTO 2'])
      expect(fontSelect()).toHaveValue('ROBOTO 2')
    })

    it('le même fichier ajouté deux fois donne « Roboto 2 »', async () => {
      await addText()

      upload(fontFileOf('Roboto.woff2'))
      await screen.findByText('Police « Roboto » ajoutée.')
      upload(fontFileOf('Roboto.woff2'))

      expect(await screen.findByText('Police « Roboto 2 » ajoutée.')).toBeInTheDocument()
      expect(stateFonts()).toEqual(['Roboto', 'Roboto 2'])
    })

    it('un fichier nommé comme une police de la liste devient « Arial 2 »', async () => {
      await addText()

      upload(fontFileOf('Arial.ttf', 'ttf'))

      expect(await screen.findByText('Police « Arial 2 » ajoutée.')).toBeInTheDocument()
      expect(stateFonts()).toEqual(['Arial 2'])
      expect(fontSelect()).toHaveValue('Arial 2')
    })

    it('le nom vient du fichier, nettoyé', async () => {
      await addText()

      upload(fontFileOf('Fira-Code Regular (1).otf', 'otf'))

      expect(await screen.findByText('Police « Fira-Code Regular 1 » ajoutée.')).toBeInTheDocument()
    })
  })

  describe('refus', () => {
    it("un fichier qui n'est pas une police est refusé, sans rien changer", async () => {
      await addText()
      const before = pastCount()

      upload(new File(['texte'], 'notes.txt', { type: 'text/plain' }))

      await expectAlert(
        'Ajout de police impossible',
        "Le fichier n'est pas une police (formats acceptés : WOFF2, WOFF, TTF, OTF).",
      )
      expect(pastCount()).toBe(before)
      expect(env.faces).toHaveLength(0)
    })

    it("une signature qui ne correspond pas à l'extension est refusée", async () => {
      await addText()

      upload(fontFileOf('Faux.woff2', 'ttf'))

      await expectAlert("Le fichier n'est pas une police valide.")
      expect(stateFonts()).toEqual([])
    })

    it('une police de plus de 2 Mo est refusée', async () => {
      await addText()
      const file = fontFileOf('Gros.woff2')
      Object.defineProperty(file, 'size', { value: MAX_FONT_FILE_SIZE + 1 })

      upload(file)

      await expectAlert('La police dépasse 2 Mo.')
      expect(stateFonts()).toEqual([])
    })

    it('si le navigateur refuse de charger la police : erreur, aucun changement ni historique', async () => {
      const text = await addText()
      fireEvent.change(fontSelect(), { target: { value: 'Georgia' } })
      const before = pastCount()
      env.loadMode = 'fail'

      upload(fontFileOf('Cassee.woff2'))

      await expectAlert('Ajout de police impossible', "La police n'a pas pu être chargée.")
      expect(pastCount()).toBe(before)
      expect(stateFonts()).toEqual([])
      expect(text.style.fontFamily).toBe('Georgia, "Times New Roman", serif')
      expect(fontSelect()).toHaveValue('Georgia')
      expect(env.add).not.toHaveBeenCalled()
    })

    it("sans FontFace (vieux navigateur), l'ajout est refusé avec le même message", async () => {
      await addText()
      vi.unstubAllGlobals()

      upload(fontFileOf('Roboto.woff2'))

      await expectAlert("La police n'a pas pu être chargée.")
      expect(stateFonts()).toEqual([])
    })

    describe('limite de polices', () => {
      const ten: CustomFont[] = Array.from({ length: MAX_FONTS }, (_, i) => ({
        name: `Police ${i}`,
        src: fontSrcOf('ttf', i + 1),
      }))

      it('à 10 polices, le bouton est désactivé avec la raison', async () => {
        renderLayout(presentationWith(ten))
        await selectText()

        expect(addFontButton()).toBeDisabled()
        expect(addFontButton()).toHaveAttribute('title', 'Limite de 10 polices atteinte.')
      })

      it('un fichier envoyé malgré tout est refusé avec le message de la limite', async () => {
        renderLayout(presentationWith(ten))
        await selectText()
        const before = pastCount()

        upload(fontFileOf('Onzieme.woff2'))

        await expectAlert('Limite de 10 polices atteinte.')
        expect(pastCount()).toBe(before)
        expect(stateFonts()).toHaveLength(MAX_FONTS)
      })

      it('à 9 polices, la dixième est acceptée', async () => {
        renderLayout(presentationWith(ten.slice(0, MAX_FONTS - 1)))
        await selectText()
        expect(addFontButton()).toBeEnabled()

        upload(fontFileOf('Dixieme.woff2'))

        expect(await screen.findByText('Police « Dixieme » ajoutée.')).toBeInTheDocument()
        expect(stateFonts()).toHaveLength(MAX_FONTS)
      })

      it('limite atteinte pendant le chargement : revérifiée après les await', async () => {
        renderLayout(presentationWith(ten.slice(0, MAX_FONTS - 1)))
        await selectText()
        env.loadMode = 'manual'
        const before = pastCount()

        upload(fontFileOf('Alpha.woff2'))
        await waitFor(() => expect(env.faces.some((face) => face.family === 'Alpha')).toBe(true))
        upload(fontFileOf('Bravo.woff2'))
        await waitFor(() => expect(env.faces.some((face) => face.family === 'Bravo')).toBe(true))

        // Alpha finit d'abord et prend la dernière place ; Bravo est alors refusée.
        await act(async () => {
          env.faces.find((face) => face.family === 'Alpha')?.settle?.resolve()
        })
        await screen.findByText('Police « Alpha » ajoutée.')
        await act(async () => {
          env.faces.find((face) => face.family === 'Bravo')?.settle?.resolve()
        })

        await expectAlert('Limite de 10 polices atteinte.')
        expect(stateFonts()).toHaveLength(MAX_FONTS)
        expect(stateFonts()).toContain('Alpha')
        expect(stateFonts()).not.toContain('Bravo')
        expect(pastCount()).toBe(before + 1)
      })
    })
  })

  describe('pendant le chargement', () => {
    it('si le texte a été supprimé entre-temps, la police est ajoutée sans être appliquée', async () => {
      await addText()
      env.loadMode = 'manual'
      const before = pastCount()

      upload(fontFileOf('Roboto.woff2'))
      await waitFor(() => expect(env.faces).toHaveLength(1))
      await click("Supprimer l'élément")
      expect(pastCount()).toBe(before + 1)
      await act(async () => {
        env.faces[0]?.settle?.resolve()
      })

      expect(await screen.findByText('Police « Roboto » ajoutée.')).toBeInTheDocument()
      expect(stateFonts()).toEqual(['Roboto'])
      expect(pastCount()).toBe(before + 2)
      expect(within(main()).queryByText('Texte')).not.toBeInTheDocument()
    })

    it('si la diapositive a changé entre-temps, la police est ajoutée sans être appliquée', async () => {
      await addText()
      env.loadMode = 'manual'

      upload(fontFileOf('Roboto.woff2'))
      await waitFor(() => expect(env.faces).toHaveLength(1))
      await click('Nouvelle diapositive')
      await act(async () => {
        env.faces[0]?.settle?.resolve()
      })

      expect(await screen.findByText('Police « Roboto » ajoutée.')).toBeInTheDocument()
      expect(stateFonts()).toEqual(['Roboto'])
      // Le texte de la première diapositive n'a pas reçu la police.
      await click('Diapositive 1')
      const firstText = within(main()).getByText('Texte')
      expect(firstText.style.fontFamily).toBe('')
      await userEvent.click(firstText)
      expect(fontSelect()).toHaveValue('')
    })

    it("démonté pendant le chargement : rien n'est mis à jour", async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
      const view = renderLayout()
      await click('Texte')
      env.loadMode = 'manual'

      upload(fontFileOf('Roboto.woff2'))
      await waitFor(() => expect(env.faces).toHaveLength(1))
      view.unmount()
      await act(async () => {
        env.faces[0]?.settle?.resolve()
      })

      expect(env.add).not.toHaveBeenCalled()
      expect(errors).not.toHaveBeenCalled()
    })
  })

  describe('mode présentation, impression et export', () => {
    it("l'ajout est ignoré en mode présentation", async () => {
      await addText()
      const before = pastCount()
      await click('Présenter')

      upload(fontFileOf('Roboto.woff2'))
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
      })

      expect(env.faces).toHaveLength(0)
      expect(pastCount()).toBe(before)
      expect(stateFonts()).toEqual([])
    })

    it("l'ajout est ignoré pendant l'impression", async () => {
      const print = vi.fn()
      Object.defineProperty(window, 'print', { configurable: true, writable: true, value: print })
      await addText()
      await userEvent.click(screen.getByRole('button', { name: 'Exporter' }))
      await userEvent.click(screen.getByRole('menuitem', { name: /^PDF/ }))
      await waitFor(() => expect(print).toHaveBeenCalledTimes(1))
      const before = pastCount()

      upload(fontFileOf('Roboto.woff2'))
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
      })

      expect(env.faces).toHaveLength(0)
      expect(pastCount()).toBe(before)
      expect(stateFonts()).toEqual([])
    })

    it("l'ajout est ignoré pendant un export PowerPoint", async () => {
      await addText()
      // Un export qui ne se termine jamais : Exporter reste en cours.
      mockedExport.mockReturnValue(new Promise(() => {}))
      await userEvent.click(screen.getByRole('button', { name: 'Exporter' }))
      await userEvent.click(screen.getByRole('menuitem', { name: /^PowerPoint/ }))
      const before = pastCount()

      upload(fontFileOf('Roboto.woff2'))
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
      })

      expect(env.faces).toHaveLength(0)
      expect(stateFonts()).toEqual([])
      expect(pastCount()).toBe(before)
    })
  })

  describe('fichiers JSON', () => {
    const importInput = () => screen.getByLabelText('Importer une présentation JSON') as HTMLInputElement

    function chooseJson(presentation: unknown) {
      const file = new File([JSON.stringify(presentation)], 'import.json', {
        type: 'application/json',
      })
      fireEvent.change(importInput(), { target: { files: [file] } })
    }

    it('importer un JSON avec fonts enregistre les polices dans le navigateur', async () => {
      renderLayout()
      const text = createTextElement({ text: 'Importé', fontFamily: 'Roboto' })

      chooseJson({
        version: 1,
        title: 'Avec polices',
        slides: [{ id: 's1', elements: [text] }],
        fonts: [roboto],
      })

      const imported = await within(main()).findByText('Importé')
      await waitFor(() => expect(env.add).toHaveBeenCalledTimes(1))
      expect((env.add.mock.calls[0]?.[0] as FakeFontFace).family).toBe('Roboto')
      expect(stateFonts()).toEqual(['Roboto'])
      expect(imported.style.fontFamily).toBe('"Roboto", sans-serif')
      await userEvent.click(imported)
      expect(fontSelect()).toHaveValue('Roboto')
      expect(screen.queryByRole('option', { name: /non listée/ })).not.toBeInTheDocument()
    })

    it("un JSON sans fonts s'importe encore (aucune police)", async () => {
      renderLayout()

      chooseJson({
        version: 1,
        title: 'Ancien',
        slides: [{ id: 's1', elements: [createTextElement({ text: 'Ancien texte' })] }],
      })

      await within(main()).findByText('Ancien texte')
      expect(stateFonts()).toEqual([])
    })

    it('importer une autre présentation retire les polices de la précédente', async () => {
      renderLayout(presentationWith([roboto]))
      await waitFor(() => expect(env.contents.size).toBe(1))

      chooseJson({ version: 1, title: 'Autre', slides: [{ id: 's1', elements: [] }] })

      await waitFor(() => expect(env.contents.size).toBe(0))
      expect(stateFonts()).toEqual([])
    })

    it('un JSON avec une police invalide est refusé, la présentation reste', async () => {
      renderLayout(presentationWith([], 'Avant'))

      chooseJson({
        version: 1,
        slides: [{ id: 's1', elements: [] }],
        fonts: [{ name: 'Arial', src: roboto.src }],
      })

      await expectAlert("Police 1 : le nom est celui d'une police courante.")
      expect(within(main()).getByText('Avant')).toBeInTheDocument()
    })

    it("une police d'un JSON que le navigateur refuse donne le bandeau d'erreur", async () => {
      env.loadMode = 'fail'
      renderLayout()

      chooseJson({
        version: 1,
        slides: [{ id: 's1', elements: [] }],
        fonts: [roboto],
      })

      await expectAlert("La police « Roboto » n'a pas pu être chargée.")
      expect(env.add).not.toHaveBeenCalled()
    })

    it("l'export JSON contient fonts", async () => {
      await addText()
      upload(fontFileOf('Roboto.woff2'))
      await screen.findByText('Police « Roboto » ajoutée.')

      await userEvent.click(screen.getByRole('button', { name: 'Exporter' }))
      await userEvent.click(screen.getByRole('menuitem', { name: /^Fichier JSON/ }))

      expect(exported).toHaveLength(1)
      const data = JSON.parse((await exported[0]?.text()) ?? '{}') as { fonts: CustomFont[] }
      expect(data.fonts).toHaveLength(1)
      expect(data.fonts[0]?.name).toBe('Roboto')
      expect(data.fonts[0]?.src.startsWith('data:font/woff2;base64,')).toBe(true)
    })

    it('exporter puis ré-importer redonne la police', async () => {
      await addText()
      upload(fontFileOf('Roboto.woff2'))
      await screen.findByText('Police « Roboto » ajoutée.')
      await userEvent.click(screen.getByRole('button', { name: 'Exporter' }))
      await userEvent.click(screen.getByRole('menuitem', { name: /^Fichier JSON/ }))
      const json = (await exported[0]?.text()) ?? ''

      await click('Annuler')
      expect(stateFonts()).toEqual([])
      fireEvent.change(importInput(), {
        target: { files: [new File([json], 'export.json', { type: 'application/json' })] },
      })

      await waitFor(() => expect(stateFonts()).toEqual(['Roboto']))
    })
  })

  describe('export PowerPoint', () => {
    it("reçoit les polices ajoutées, et affiche les avertissements qu'il renvoie", async () => {
      await addText()
      upload(fontFileOf('Roboto.woff2'))
      await screen.findByText('Police « Roboto » ajoutée.')
      mockedExport.mockResolvedValue({
        blob: new Blob(['pptx']),
        warnings: ["La police « Roboto » est ajoutée à la présentation mais n'est pas intégrée."],
      })

      await userEvent.click(screen.getByRole('button', { name: 'Exporter' }))
      await userEvent.click(screen.getByRole('menuitem', { name: /^PowerPoint/ }))

      expect(await screen.findByText(/n'est pas intégrée/)).toBeInTheDocument()
      const exportedPresentation = mockedExport.mock.calls[0]?.[0]
      expect(exportedPresentation?.fonts.map((font) => font.name)).toEqual(['Roboto'])
    })
  })
})

describe('EditorLayout : polices, courses et cas limites', () => {
  const importInput = () => screen.getByLabelText('Importer une présentation JSON') as HTMLInputElement
  const originalPrint = window.print

  function chooseJson(presentation: unknown) {
    const file = new File([JSON.stringify(presentation)], 'import.json', {
      type: 'application/json',
    })
    fireEvent.change(importInput(), { target: { files: [file] } })
  }

  function mockPrint() {
    const print = vi.fn()
    Object.defineProperty(window, 'print', { configurable: true, writable: true, value: print })
    return print
  }

  afterEach(() => {
    vi.useRealTimers()
    Object.defineProperty(window, 'print', {
      configurable: true,
      writable: true,
      value: originalPrint,
    })
  })

  describe('deux ajouts du même nom qui se terminent ensemble', () => {
    it('donnent « Roboto » et « Roboto 2 », et la seconde est appliquée au texte', async () => {
      const text = await addText()
      env.loadMode = 'manual'
      const before = pastCount()

      upload(fontFileOf('Roboto.woff2'))
      await waitFor(() => expect(env.faces).toHaveLength(1))
      upload(fontFileOf('Roboto.woff2'))
      await waitFor(() => expect(env.faces).toHaveLength(2))
      // Les deux chargements finissent dans la même séquence : aucun rendu entre les deux.
      await act(async () => {
        env.faces[0]?.settle?.resolve()
        env.faces[1]?.settle?.resolve()
      })

      await waitFor(() => expect(stateFonts()).toEqual(['Roboto', 'Roboto 2']))
      expect(await screen.findByText('Police « Roboto 2 » ajoutée.')).toBeInTheDocument()
      expect(text.style.fontFamily).toBe('"Roboto 2", sans-serif')
      expect(fontSelect()).toHaveValue('Roboto 2')
      // Deux ajouts, deux entrées d'historique.
      expect(pastCount()).toBe(before + 2)
    })

    it('annuler deux fois retire les deux polices', async () => {
      await addText()
      env.loadMode = 'manual'
      upload(fontFileOf('Roboto.woff2'))
      await waitFor(() => expect(env.faces).toHaveLength(1))
      upload(fontFileOf('Roboto.woff2'))
      await waitFor(() => expect(env.faces).toHaveLength(2))
      await act(async () => {
        env.faces[0]?.settle?.resolve()
        env.faces[1]?.settle?.resolve()
      })
      await waitFor(() => expect(stateFonts()).toHaveLength(2))

      await click('Annuler')
      expect(stateFonts()).toEqual(['Roboto'])
      await click('Annuler')
      expect(stateFonts()).toEqual([])
    })

    it('la limite tient compte des ajouts déjà envoyés : le dernier est refusé, sans succès annoncé', async () => {
      const nine = Array.from({ length: MAX_FONTS - 1 }, (_, i) => ({
        name: `Police ${i}`,
        src: fontSrcOf('ttf', i + 1),
      }))
      renderLayout(presentationWith(nine))
      await selectText()
      env.loadMode = 'manual'
      upload(fontFileOf('Alpha.woff2'))
      await waitFor(() => expect(env.faces.some((face) => face.family === 'Alpha')).toBe(true))
      upload(fontFileOf('Bravo.woff2'))
      await waitFor(() => expect(env.faces.some((face) => face.family === 'Bravo')).toBe(true))

      await act(async () => {
        env.faces.find((face) => face.family === 'Alpha')?.settle?.resolve()
        env.faces.find((face) => face.family === 'Bravo')?.settle?.resolve()
      })

      await expectAlert('Limite de 10 polices atteinte.')
      expect(screen.queryByText('Police « Bravo » ajoutée.')).not.toBeInTheDocument()
      await waitFor(() => expect(stateFonts()).toContain('Alpha'))
      expect(stateFonts()).not.toContain('Bravo')
      expect(stateFonts()).toHaveLength(MAX_FONTS)
      // Le texte n'a pas reçu la police refusée.
      expect(fontSelect()).toHaveValue('Alpha')
    })
  })

  describe('import pendant un ajout', () => {
    it("l'ajout est abandonné avec un message, sans toucher à la présentation importée", async () => {
      await addText()
      env.loadMode = 'manual'
      upload(fontFileOf('Roboto.woff2'))
      await waitFor(() => expect(env.faces).toHaveLength(1))

      chooseJson({
        version: 1,
        title: 'Importée',
        slides: [{ id: 's1', elements: [createTextElement({ text: 'Importé' })] }],
      })
      await within(main()).findByText('Importé')
      const before = pastCount()
      await act(async () => {
        env.faces[0]?.settle?.resolve()
      })

      await expectAlert(
        'Ajout de police impossible',
        'Ajout de police annulé : la présentation a changé pendant le chargement.',
      )
      expect(stateFonts()).toEqual([])
      expect(pastCount()).toBe(before)
      expect(screen.queryByText(/ajoutée\./)).not.toBeInTheDocument()
    })

    it("un import terminé AVANT le début de l'ajout ne l'empêche pas", async () => {
      renderLayout()
      chooseJson({
        version: 1,
        title: 'Importée',
        slides: [{ id: 's1', elements: [createTextElement({ text: 'Importé' })] }],
      })
      await userEvent.click(await within(main()).findByText('Importé'))

      upload(fontFileOf('Roboto.woff2'))

      expect(await screen.findByText('Police « Roboto » ajoutée.')).toBeInTheDocument()
      expect(stateFonts()).toEqual(['Roboto'])
    })
  })

  describe('impression et chargement des polices du hook', () => {
    const exportPdf = async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Exporter' }))
      await userEvent.click(screen.getByRole('menuitem', { name: /^PDF/ }))
    }

    it("un import avec polices suivi d'un export PDF n'imprime qu'après la fin du chargement", async () => {
      const print = mockPrint()
      env.loadMode = 'manual'
      renderLayout()
      chooseJson({
        version: 1,
        title: 'Avec polices',
        slides: [{ id: 's1', elements: [createTextElement({ text: 'Importé', fontFamily: 'Roboto' })] }],
        fonts: [roboto],
      })
      await within(main()).findByText('Importé')
      await waitFor(() => expect(env.faces).toHaveLength(1))

      await exportPdf()
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30))
      })
      expect(print).not.toHaveBeenCalled()

      await act(async () => {
        env.faces[0]?.settle?.resolve()
      })

      await waitFor(() => expect(print).toHaveBeenCalledTimes(1))
      expect(env.add).toHaveBeenCalledTimes(1)
    })

    it('imprime aussi quand le chargement échoue', async () => {
      const print = mockPrint()
      env.loadMode = 'manual'
      renderLayout(presentationWith([roboto]))
      await waitFor(() => expect(env.faces).toHaveLength(1))

      await exportPdf()
      await act(async () => {
        env.faces[0]?.settle?.reject()
      })

      await waitFor(() => expect(print).toHaveBeenCalledTimes(1))
    })

    it("le plafond de 5 secondes s'applique si le chargement ne finit jamais", async () => {
      const print = mockPrint()
      env.loadMode = 'manual'
      vi.useFakeTimers()
      renderLayout(presentationWith([roboto]))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(env.faces).toHaveLength(1)

      fireEvent.click(screen.getByRole('button', { name: 'Exporter' }))
      fireEvent.click(screen.getByRole('menuitem', { name: /^PDF/ }))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4999)
      })
      expect(print).not.toHaveBeenCalled()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1)
      })

      expect(print).toHaveBeenCalledTimes(1)
    })
  })

  describe('police refusée par le navigateur (importée)', () => {
    it("l'erreur n'est affichée qu'une fois malgré ajouts, annulations et rétablissements", async () => {
      env.loadMode = 'fail'
      renderLayout(presentationWith([roboto]))
      await selectText()
      await expectAlert("La police « Roboto » n'a pas pu être chargée.")
      await userEvent.click(screen.getByRole('button', { name: 'Fermer le message' }))
      expect(env.faces.filter((face) => face.family === 'Roboto')).toHaveLength(1)

      env.loadMode = 'ok'
      upload(fontFileOf('Fira.woff2'))
      await screen.findByText('Police « Fira » ajoutée.')
      await click('Annuler')
      await click('Rétablir')
      await waitFor(() => expect(stateFonts()).toEqual(['Roboto', 'Fira']))
      await waitFor(() => expect(env.contents.size).toBe(1))

      expect(screen.getByRole('alert')).toBeEmptyDOMElement()
      expect(env.faces.filter((face) => face.family === 'Roboto')).toHaveLength(1)
      // La police refusée reste dans la présentation (pas d'interface pour la retirer).
      expect(stateFonts()).toContain('Roboto')
    })
  })

  describe("bouton d'ajout indisponible : la raison est visible", () => {
    const addButton = () => screen.getByRole('button', { name: 'Ajouter une police…' })

    it('limite de polices atteinte', async () => {
      const ten = Array.from({ length: MAX_FONTS }, (_, i) => ({
        name: `Police ${i}`,
        src: fontSrcOf('ttf', i + 1),
      }))
      renderLayout(presentationWith(ten))
      await selectText()

      expect(addButton()).toBeDisabled()
      expect(within(panel()).getByText('Limite de 10 polices atteinte.')).toBeVisible()
    })

    it("pendant l'impression", async () => {
      mockPrint()
      renderLayout(presentationWith([]))
      await selectText()
      await userEvent.click(screen.getByRole('button', { name: 'Exporter' }))
      await userEvent.click(screen.getByRole('menuitem', { name: /^PDF/ }))

      expect(addButton()).toBeDisabled()
      expect(within(panel()).getByText("Indisponible pendant l'impression.")).toBeVisible()
    })

    it("pendant l'export PowerPoint", async () => {
      mockedExport.mockReturnValue(new Promise(() => {}))
      renderLayout(presentationWith([]))
      await selectText()
      await userEvent.click(screen.getByRole('button', { name: 'Exporter' }))
      await userEvent.click(screen.getByRole('menuitem', { name: /^PowerPoint/ }))

      expect(addButton()).toBeDisabled()
      expect(within(panel()).getByText("Indisponible pendant l'export.")).toBeVisible()
    })

    it('pendant la présentation', async () => {
      renderLayout(presentationWith([]))
      await selectText()
      await click('Présenter')

      expect(addButton()).toBeDisabled()
      expect(within(panel()).getByText('Indisponible pendant la présentation.')).toBeInTheDocument()
    })

    it('au repos : bouton actif et aucune raison', async () => {
      renderLayout(presentationWith([]))
      await selectText()

      expect(addButton()).toBeEnabled()
      expect(within(panel()).queryByText(/Indisponible|Limite de/)).not.toBeInTheDocument()
    })
  })
})
