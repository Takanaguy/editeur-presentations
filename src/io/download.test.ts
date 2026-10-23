import { downloadTextFile } from './download'

describe('downloadTextFile', () => {
  let blobs: Blob[]
  let clicked: HTMLAnchorElement[]
  const createObjectURL = vi.fn()
  const revokeObjectURL = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    blobs = []
    clicked = []
    createObjectURL.mockReset()
    revokeObjectURL.mockReset()
    createObjectURL.mockImplementation((blob: Blob) => {
      blobs.push(blob)
      return 'blob:test-url'
    })
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = revokeObjectURL
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this)
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('crée un Blob du bon type et du bon contenu', async () => {
    downloadTextFile('essai.json', '{"a":1}')

    expect(blobs).toHaveLength(1)
    expect(blobs[0]?.type).toBe('application/json')
    expect(await blobs[0]?.text()).toBe('{"a":1}')
  })

  it('utilise le type MIME fourni', () => {
    downloadTextFile('notes.txt', 'bonjour', 'text/plain')

    expect(blobs[0]?.type).toBe('text/plain')
  })

  it('clique sur un lien avec le bon nom de fichier et la bonne adresse', () => {
    downloadTextFile('ma-presentation.json', '{}')

    expect(clicked).toHaveLength(1)
    expect(clicked[0]?.download).toBe('ma-presentation.json')
    expect(clicked[0]?.getAttribute('href')).toBe('blob:test-url')
  })

  it('retire le lien du document après le clic', () => {
    downloadTextFile('a.json', '{}')

    expect(document.querySelector('a[download]')).toBeNull()
  })

  it('libère l\'adresse du Blob, un peu après le clic', () => {
    downloadTextFile('a.json', '{}')
    expect(revokeObjectURL).not.toHaveBeenCalled()

    vi.runAllTimers()

    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-url')
  })

  it('retourne true quand le téléchargement est lancé', () => {
    expect(downloadTextFile('a.json', '{}')).toBe(true)
  })

  it('ne plante pas et retourne false quand le navigateur échoue', () => {
    createObjectURL.mockImplementation(() => {
      throw new Error('indisponible')
    })

    expect(downloadTextFile('a.json', '{}')).toBe(false)
    expect(clicked).toHaveLength(0)
    expect(revokeObjectURL).not.toHaveBeenCalled()
  })

  it('ne plante pas et libère l\'adresse quand le clic échoue', () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('bloqué')
    })

    expect(downloadTextFile('a.json', '{}')).toBe(false)
    vi.runAllTimers()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-url')
    expect(document.querySelector('a[download]')).toBeNull()
  })
})
