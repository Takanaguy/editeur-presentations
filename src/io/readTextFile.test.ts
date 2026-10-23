import { TextFileReadError, readTextFile } from './readTextFile'

describe('readTextFile', () => {
  it('lit le texte d\'un fichier valide, accents compris', async () => {
    const file = new File(['{"titre":"Été"}'], 'a.json', { type: 'application/json' })

    expect(await readTextFile(file)).toBe('{"titre":"Été"}')
  })

  it('lit un fichier vide', async () => {
    expect(await readTextFile(new File([], 'vide.json'))).toBe('')
  })

  it('rejette avec une erreur française quand file.text() échoue', async () => {
    const file = new File(['x'], 'a.json')
    Object.defineProperty(file, 'text', { value: () => Promise.reject(new Error('disque')) })

    const error = await readTextFile(file).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(TextFileReadError)
    expect((error as Error).message).toBe('Impossible de lire le fichier.')
  })

  it('passe par FileReader quand file.text n\'existe pas', async () => {
    const file = new File(['bonjour'], 'a.json')
    Object.defineProperty(file, 'text', { value: undefined })

    expect(await readTextFile(file)).toBe('bonjour')
  })

  it('rejette avec une erreur française quand FileReader échoue', async () => {
    const file = new File(['x'], 'a.json')
    Object.defineProperty(file, 'text', { value: undefined })
    vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(function (this: FileReader) {
      queueMicrotask(() => this.onerror?.(new ProgressEvent('error') as ProgressEvent<FileReader>))
    })

    try {
      const error = await readTextFile(file).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(TextFileReadError)
      expect((error as Error).message).toBe('Impossible de lire le fichier.')
    } finally {
      vi.restoreAllMocks()
    }
  })
})
