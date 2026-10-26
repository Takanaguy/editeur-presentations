import { MAX_FONT_FILE_SIZE } from '../model/limits'
import { FONT_MIMES, fontBytes, toBase64, type FixtureFontFormat } from '../test/fixtures'
import { FontImportError, readFontFile } from './fontFile'

const FORMATS: FixtureFontFormat[] = ['woff2', 'woff', 'ttf', 'otf']

afterEach(() => {
  vi.restoreAllMocks()
})

describe('readFontFile', () => {
  it.each(FORMATS)('lit une police %s valide (signature construite dans le test)', async (format) => {
    const bytes = fontBytes(format)
    const file = new File([bytes], `Mon Police.${format}`)

    const font = await readFontFile(file)

    expect(font).toEqual({
      name: 'Mon Police',
      src: `data:${FONT_MIMES[format]};base64,${toBase64(bytes)}`,
    })
  })

  it('accepte la deuxième signature TrueType (true) pour un .ttf', async () => {
    const bytes = new Uint8Array([0x74, 0x72, 0x75, 0x65, 1, 2, 3])
    const font = await readFontFile(new File([bytes], 'Old.ttf'))

    expect(font.src).toBe(`data:font/ttf;base64,${toBase64(bytes)}`)
  })

  it('accepte une extension en majuscules', async () => {
    const font = await readFontFile(new File([fontBytes('otf')], 'GRAND.OTF'))

    expect(font.name).toBe('GRAND')
    expect(font.src.startsWith('data:font/otf;base64,')).toBe(true)
  })

  it('utilise le mime FIXE du format, même si file.type est faux ou absent', async () => {
    const bytes = fontBytes('woff2')
    for (const type of ['', 'application/octet-stream', 'text/html', 'image/png']) {
      const font = await readFontFile(new File([bytes], 'a.woff2', { type }))
      expect(font.src.startsWith('data:font/woff2;base64,')).toBe(true)
    }
  })

  it('retourne un nom sûr tiré du nom du fichier', async () => {
    const font = await readFontFile(new File([fontBytes('ttf')], 'Fira-Code Regular.ttf'))

    expect(font.name).toBe('Fira-Code Regular')
  })

  it('accepte un fichier de 2 Mo exactement', async () => {
    const bytes = new Uint8Array(MAX_FONT_FILE_SIZE)
    bytes.set(fontBytes('woff2', 0))

    const font = await readFontFile(new File([bytes], 'limite.woff2'))

    expect(font.src.length).toBeGreaterThan(MAX_FONT_FILE_SIZE)
  })

  it.each(['a.txt', 'a.png', 'a.woff2.exe', 'sans-extension', 'a.ttc', 'a.eot', ''])(
    "refuse l'extension de %j",
    async (fileName) => {
      const promise = readFontFile(new File([fontBytes('woff2')], fileName))

      await expect(promise).rejects.toBeInstanceOf(FontImportError)
      await expect(promise).rejects.toThrow(
        "Le fichier n'est pas une police (formats acceptés : WOFF2, WOFF, TTF, OTF).",
      )
    },
  )

  it("refuse un fichier de plus de 2 Mo (size redéfini, rien n'est lu)", async () => {
    const file = new File([fontBytes('woff2')], 'gros.woff2')
    Object.defineProperty(file, 'size', { value: MAX_FONT_FILE_SIZE + 1 })
    const reader = vi.spyOn(FileReader.prototype, 'readAsDataURL')

    const promise = readFontFile(file)

    await expect(promise).rejects.toBeInstanceOf(FontImportError)
    await expect(promise).rejects.toThrow('La police dépasse 2 Mo.')
    expect(reader).not.toHaveBeenCalled()
  })

  it.each([
    ['woff2', 'ttf'],
    ['ttf', 'woff2'],
    ['woff', 'woff2'],
    ['otf', 'ttf'],
    ['ttf', 'otf'],
  ] as const)('refuse un fichier .%s dont la signature est celle de %s', async (extension, real) => {
    const promise = readFontFile(new File([fontBytes(real)], `a.${extension}`))

    await expect(promise).rejects.toBeInstanceOf(FontImportError)
    await expect(promise).rejects.toThrow("Le fichier n'est pas une police valide.")
  })

  it.each([
    ['vide', new Uint8Array([])],
    ['trop court', new Uint8Array([0x77, 0x4f])],
    ['du texte', new TextEncoder().encode('<html></html>')],
  ])('refuse un fichier %s', async (_label, bytes) => {
    const promise = readFontFile(new File([bytes], 'a.woff2'))

    await expect(promise).rejects.toThrow("Le fichier n'est pas une police valide.")
  })

  it("échec de lecture du fichier : message dédié", async () => {
    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (this: FileReader) {
      queueMicrotask(() => this.onerror?.(new ProgressEvent('error') as ProgressEvent<FileReader>))
    })

    const promise = readFontFile(new File([fontBytes('woff2')], 'a.woff2'))

    await expect(promise).rejects.toBeInstanceOf(FontImportError)
    await expect(promise).rejects.toThrow('Impossible de lire le fichier de police.')
  })

  it('résultat de lecture inattendu : même message', async () => {
    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (this: FileReader) {
      Object.defineProperty(this, 'result', { value: 'pas une data url', configurable: true })
      queueMicrotask(() => this.onload?.(new ProgressEvent('load') as ProgressEvent<FileReader>))
    })

    await expect(readFontFile(new File([fontBytes('woff2')], 'a.woff2'))).rejects.toThrow(
      'Impossible de lire le fichier de police.',
    )
  })

  it('échec de lecture des premiers octets : même message', async () => {
    const file = new File([fontBytes('woff2')], 'a.woff2')
    vi.spyOn(file, 'slice').mockReturnValue({
      arrayBuffer: () => Promise.reject(new Error('disque')),
    } as unknown as Blob)

    await expect(readFontFile(file)).rejects.toThrow('Impossible de lire le fichier de police.')
  })

  it("lit la signature avec FileReader quand Blob.arrayBuffer n'existe pas", async () => {
    const bytes = fontBytes('otf')
    const file = new File([bytes], 'a.otf')
    const real = file.slice.bind(file)
    vi.spyOn(file, 'slice').mockImplementation((...args: Parameters<Blob['slice']>) => {
      const blob = real(...args)
      Object.defineProperty(blob, 'arrayBuffer', { value: undefined })
      return blob
    })

    const font = await readFontFile(file)

    expect(font.src).toBe(`data:font/otf;base64,${toBase64(bytes)}`)
  })

  it("repli FileReader : une erreur de lecture donne le message dédié", async () => {
    const file = new File([fontBytes('otf')], 'a.otf')
    vi.spyOn(file, 'slice').mockReturnValue({ arrayBuffer: undefined } as unknown as Blob)
    vi.spyOn(FileReader.prototype, 'readAsArrayBuffer').mockImplementation(function (this: FileReader) {
      queueMicrotask(() => this.onerror?.(new ProgressEvent('error') as ProgressEvent<FileReader>))
    })

    await expect(readFontFile(file)).rejects.toThrow('Impossible de lire le fichier de police.')
  })

  it("repli FileReader : un résultat qui n'est pas un ArrayBuffer est refusé", async () => {
    const file = new File([fontBytes('otf')], 'a.otf')
    vi.spyOn(file, 'slice').mockReturnValue({ arrayBuffer: undefined } as unknown as Blob)
    vi.spyOn(FileReader.prototype, 'readAsArrayBuffer').mockImplementation(function (this: FileReader) {
      Object.defineProperty(this, 'result', { value: 'texte', configurable: true })
      queueMicrotask(() => this.onload?.(new ProgressEvent('load') as ProgressEvent<FileReader>))
    })

    await expect(readFontFile(file)).rejects.toThrow('Impossible de lire le fichier de police.')
  })
})

describe('FontImportError', () => {
  it('est une Error portant le message affichable', () => {
    const error = new FontImportError('Message')

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('FontImportError')
    expect(error.message).toBe('Message')
  })
})
