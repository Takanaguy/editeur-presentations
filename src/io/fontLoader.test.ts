import { FakeFontFace, installFakeFonts, type FakeFontEnv } from '../test/fakeFonts'
import { fontSrcOf } from '../test/fixtures'
import { FontImportError } from './fontFile'
import { getDocumentFonts, loadFontFace } from './fontLoader'

const FAILURE = "La police n'a pas pu être chargée."
const font = { name: 'Roboto', src: fontSrcOf('woff2') }

let env: FakeFontEnv

beforeEach(() => {
  env = installFakeFonts()
})

afterEach(() => {
  env.restore()
  vi.useRealTimers()
})

describe('loadFontFace', () => {
  it('fabrique la FontFace avec le nom et la source, la charge et la retourne', async () => {
    const face = await loadFontFace(font)

    expect(face).toBeInstanceOf(FakeFontFace)
    expect(env.faces).toHaveLength(1)
    const created = env.faces[0]
    expect(created?.family).toBe('Roboto')
    expect(created?.source).toBe(`url("${font.src}")`)
    expect(created?.load).toHaveBeenCalledTimes(1)
    expect(face).toBe(created)
  })

  it("n'ajoute PAS la police à document.fonts (c'est le rôle du hook)", async () => {
    await loadFontFace(font)

    expect(env.add).not.toHaveBeenCalled()
  })

  it('rejette avec FontImportError quand le navigateur refuse la police', async () => {
    env.loadMode = 'fail'

    const promise = loadFontFace(font)

    await expect(promise).rejects.toBeInstanceOf(FontImportError)
    await expect(promise).rejects.toThrow(FAILURE)
  })

  it('rejette si le constructeur FontFace lève', async () => {
    vi.stubGlobal(
      'FontFace',
      class {
        constructor() {
          throw new SyntaxError('source invalide')
        }
      },
    )

    await expect(loadFontFace(font)).rejects.toThrow(FAILURE)
  })

  it('abandonne après 10 secondes', async () => {
    vi.useFakeTimers()
    env.loadMode = 'manual'
    const promise = loadFontFace(font)
    const outcome = promise.then(
      () => 'résolu',
      (error: unknown) => error,
    )

    await vi.advanceTimersByTimeAsync(9999)
    // Pas encore terminé : on vérifie en regardant que rien n'a été réglé.
    let settled = false
    void outcome.then(() => {
      settled = true
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    const error = await outcome
    expect(error).toBeInstanceOf(FontImportError)
    expect((error as Error).message).toBe(FAILURE)
  })

  it('un chargement terminé à temps annule le minuteur', async () => {
    vi.useFakeTimers()
    env.loadMode = 'manual'
    const promise = loadFontFace(font)
    env.faces[0]?.settle?.resolve()
    const face = await promise

    expect(face).toBe(env.faces[0])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejette sans FontFace (jsdom, vieux navigateur)', async () => {
    vi.unstubAllGlobals()

    const promise = loadFontFace(font)

    await expect(promise).rejects.toBeInstanceOf(FontImportError)
    await expect(promise).rejects.toThrow(FAILURE)
  })

  it('rejette sans document.fonts', async () => {
    Reflect.deleteProperty(document, 'fonts')

    await expect(loadFontFace(font)).rejects.toThrow(FAILURE)
    expect(env.faces).toHaveLength(0)
  })

  it.each([
    ['guillemet pour sortir de url()', 'data:font/woff2;base64,d09GMgABAgMEBQYH"); x: url("'],
    ['mime image', 'data:image/png;base64,d09GMgABAgMEBQYH'],
    ['http', 'https://exemple.test/police.woff2'],
    ['signature incohérente', 'data:font/otf;base64,d09GMgABAgMEBQYH'],
  ])('refuse une source non sûre sans fabriquer de FontFace : %s', async (_label, src) => {
    await expect(loadFontFace({ name: 'Roboto', src })).rejects.toThrow(FAILURE)
    expect(env.faces).toHaveLength(0)
  })
})

describe('getDocumentFonts', () => {
  it("retourne l'ensemble des polices du document quand il existe", () => {
    expect(getDocumentFonts()).toBe(document.fonts)
  })

  it('retourne null quand le navigateur ne propose pas document.fonts', () => {
    Reflect.deleteProperty(document, 'fonts')

    expect(getDocumentFonts()).toBeNull()
  })
})
