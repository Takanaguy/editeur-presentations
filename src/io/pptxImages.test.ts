import { IMAGE_LOAD_TIMEOUT_MS } from './imageSize'
import {
  MAX_CANVAS_SIDE,
  createImageLoader,
  loadBrowserImage,
  type CanvasLike,
  type ImageEnvironment,
  type ImageLike,
} from './pptxImages'

// Faux Image : se charge (ou échoue) au moment où on lui donne une source.
interface FakeImageOptions {
  width?: number
  height?: number
  // 'load' : onload ; 'error' : onerror ; 'never' : rien ne se passe.
  outcome?: 'load' | 'error' | 'never'
}

function createFakeEnvironment(options: FakeImageOptions & { dataUrl?: string; tainted?: boolean; noContext?: boolean } = {}) {
  const { width = 200, height = 100, outcome = 'load', dataUrl = 'data:image/png;base64,CANVAS' } = options
  const images: FakeImage[] = []
  const canvases: FakeCanvas[] = []
  const drawCalls: unknown[][] = []

  class FakeImage implements ImageLike {
    crossOrigin: string | null = null
    referrerPolicy = ''
    onload: ((event: Event) => void) | null = null
    onerror: ((event: Event | string) => void) | null = null
    naturalWidth = width
    naturalHeight = height
    crossOriginWhenSourceSet: string | null = null
    private source = ''
    get src() {
      return this.source
    }
    set src(value: string) {
      this.source = value
      this.crossOriginWhenSourceSet = this.crossOrigin
      if (value === '') return
      if (outcome === 'load') queueMicrotask(() => this.onload?.(new Event('load')))
      else if (outcome === 'error') queueMicrotask(() => this.onerror?.(new Event('error')))
    }
  }

  class FakeCanvas implements CanvasLike {
    width = 0
    height = 0
    getContext() {
      if (options.noContext) return null
      return {
        drawImage: (...args: unknown[]) => {
          drawCalls.push(args)
        },
      }
    }
    toDataURL() {
      if (options.tainted) throw new DOMException('Tainted canvas', 'SecurityError')
      return dataUrl
    }
  }

  const environment: ImageEnvironment = {
    createImage: () => {
      const image = new FakeImage()
      images.push(image)
      return image
    },
    createCanvas: () => {
      const canvas = new FakeCanvas()
      canvases.push(canvas)
      return canvas
    },
  }
  return { environment, images, canvases, drawCalls }
}

describe('createImageLoader : images gardées telles quelles', () => {
  it.each([
    ['png', 'data:image/png;base64,AAAA', 'image/png;base64,AAAA'],
    ['jpeg', 'data:image/jpeg;base64,BBBB', 'image/jpeg;base64,BBBB'],
    ['jpg', 'data:image/jpg;base64,BBBB', 'image/jpg;base64,BBBB'],
    ['gif', 'data:image/gif;base64,CCCC', 'image/gif;base64,CCCC'],
    ['PNG en majuscules', 'DATA:IMAGE/PNG;BASE64,AAAA', 'IMAGE/PNG;BASE64,AAAA'],
  ])('%s est gardée sans passer par un canvas', async (_name, src, expected) => {
    const fake = createFakeEnvironment({ width: 300, height: 150 })

    const result = await createImageLoader(fake.environment)(src)

    expect(result).toEqual({ data: expected, width: 300, height: 150 })
    expect(fake.canvases).toHaveLength(0)
  })

  it('retire le préfixe « data: » exigé par PptxGenJS', async () => {
    const fake = createFakeEnvironment()

    const result = await createImageLoader(fake.environment)('data:image/png;base64,AAAA')

    expect(result?.data.startsWith('data:')).toBe(false)
    expect(result?.data).toMatch(/^image\/png;base64,/)
  })

  it('ignore les espaces autour de la source', async () => {
    const fake = createFakeEnvironment()

    const result = await createImageLoader(fake.environment)('  data:image/png;base64,AAAA \n')

    expect(result?.data).toBe('image/png;base64,AAAA')
  })
})

describe('createImageLoader : conversion en PNG', () => {
  it.each([
    ['WebP', 'data:image/webp;base64,AAAA'],
    ['SVG', 'data:image/svg+xml;base64,PHN2Zy8+'],
    ['SVG non encodé', 'data:image/svg+xml,%3Csvg%2F%3E'],
    ['PNG non encodé en base64', 'data:image/png,%89PNG'],
    ['image distante', 'https://exemple.fr/photo.webp'],
  ])('%s est dessinée dans un canvas puis exportée en PNG', async (_name, src) => {
    const fake = createFakeEnvironment({ width: 200, height: 100, dataUrl: 'data:image/png;base64,CANVAS' })

    const result = await createImageLoader(fake.environment)(src)

    expect(result).toEqual({ data: 'image/png;base64,CANVAS', width: 200, height: 100 })
    expect(fake.canvases).toHaveLength(1)
    expect(fake.drawCalls).toEqual([[fake.images[0], 0, 0, 200, 100]])
  })

  it('le canvas a la taille naturelle de l\'image quand elle est petite', async () => {
    const fake = createFakeEnvironment({ width: 640, height: 480 })

    await createImageLoader(fake.environment)('data:image/webp;base64,AAAA')

    expect(fake.canvases[0]).toMatchObject({ width: 640, height: 480 })
  })

  it('plafonne la grande dimension à 4096 en gardant le ratio', async () => {
    const fake = createFakeEnvironment({ width: 8192, height: 4096 })

    const result = await createImageLoader(fake.environment)('data:image/webp;base64,AAAA')

    expect(MAX_CANVAS_SIDE).toBe(4096)
    expect(fake.canvases[0]).toMatchObject({ width: 4096, height: 2048 })
    // La taille rendue reste la taille NATURELLE : seul le ratio compte pour la mise en page.
    expect(result).toMatchObject({ width: 8192, height: 4096 })
    expect(fake.drawCalls[0]).toEqual([fake.images[0], 0, 0, 4096, 2048])
  })

  it('plafonne aussi une image haute', async () => {
    const fake = createFakeEnvironment({ width: 1000, height: 10000 })

    await createImageLoader(fake.environment)('data:image/webp;base64,AAAA')

    expect(fake.canvases[0]).toMatchObject({ width: 410, height: 4096 })
  })

  it('une image de exactement 4096 n\'est pas réduite', async () => {
    const fake = createFakeEnvironment({ width: 4096, height: 4096 })

    await createImageLoader(fake.environment)('data:image/webp;base64,AAAA')

    expect(fake.canvases[0]).toMatchObject({ width: 4096, height: 4096 })
  })

  it('un canvas ne tombe jamais à 0 pixel', async () => {
    const fake = createFakeEnvironment({ width: 10000, height: 1 })

    await createImageLoader(fake.environment)('data:image/webp;base64,AAAA')

    expect(fake.canvases[0]).toMatchObject({ width: 4096, height: 1 })
  })
})

describe('createImageLoader : échecs (retour null, jamais d\'exception)', () => {
  it('échec de chargement', async () => {
    const fake = createFakeEnvironment({ outcome: 'error' })

    expect(await createImageLoader(fake.environment)('https://exemple.fr/absente.png')).toBeNull()
  })

  it('échec de chargement d\'une image locale', async () => {
    const fake = createFakeEnvironment({ outcome: 'error' })

    expect(await createImageLoader(fake.environment)('data:image/png;base64,###')).toBeNull()
  })

  it('canvas contaminé : l\'export en PNG lève, on retourne null', async () => {
    const fake = createFakeEnvironment({ tainted: true })

    expect(await createImageLoader(fake.environment)('https://exemple.fr/sans-cors.png')).toBeNull()
  })

  it('pas de contexte 2D disponible', async () => {
    const fake = createFakeEnvironment({ noContext: true })

    expect(await createImageLoader(fake.environment)('data:image/webp;base64,AAAA')).toBeNull()
  })

  it('le canvas ne rend pas un PNG', async () => {
    const fake = createFakeEnvironment({ dataUrl: 'data:,' })

    expect(await createImageLoader(fake.environment)('data:image/webp;base64,AAAA')).toBeNull()
  })

  it.each([
    [0, 100],
    [100, 0],
    [0, 0],
  ])('taille naturelle %d x %d (SVG sans dimensions) : null', async (width, height) => {
    const fake = createFakeEnvironment({ width, height })

    expect(await createImageLoader(fake.environment)('data:image/svg+xml;base64,PHN2Zy8+')).toBeNull()
  })
})

describe('createImageLoader : délai', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('abandonne une image qui ne se charge jamais, après le délai prévu', async () => {
    vi.useFakeTimers()
    const fake = createFakeEnvironment({ outcome: 'never' })
    let result: unknown = 'en attente'
    void createImageLoader(fake.environment)('https://exemple.fr/lente.png').then((value) => {
      result = value
    })

    await vi.advanceTimersByTimeAsync(IMAGE_LOAD_TIMEOUT_MS - 1)
    expect(result).toBe('en attente')
    await vi.advanceTimersByTimeAsync(1)

    expect(result).toBeNull()
    // Vider src interrompt le téléchargement en cours.
    expect(fake.images[0]?.src).toBe('')
  })

  it('le délai est réglable', async () => {
    vi.useFakeTimers()
    const fake = createFakeEnvironment({ outcome: 'never' })
    let result: unknown = 'en attente'
    void createImageLoader(fake.environment, 50)('https://exemple.fr/lente.png').then((value) => {
      result = value
    })

    await vi.advanceTimersByTimeAsync(50)

    expect(result).toBeNull()
  })

  it('ne laisse aucun minuteur derrière lui après un chargement réussi', async () => {
    vi.useFakeTimers()
    const fake = createFakeEnvironment()

    await createImageLoader(fake.environment)('data:image/png;base64,AAAA')

    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('createImageLoader : réglages de l\'élément Image', () => {
  it('une image distante est lue en mode anonyme (CORS)', async () => {
    const fake = createFakeEnvironment()

    await createImageLoader(fake.environment)('https://exemple.fr/a.png')
    await createImageLoader(fake.environment)('http://exemple.fr/b.png')

    expect(fake.images.map((image) => image.crossOrigin)).toEqual(['anonymous', 'anonymous'])
  })

  it('une image locale n\'a pas besoin de crossOrigin', async () => {
    const fake = createFakeEnvironment()

    await createImageLoader(fake.environment)('data:image/webp;base64,AAAA')

    expect(fake.images[0]?.crossOrigin).toBeNull()
  })

  it('l\'adresse de la page n\'est pas envoyée au serveur de l\'image', async () => {
    const fake = createFakeEnvironment()

    await createImageLoader(fake.environment)('https://exemple.fr/a.png')

    expect(fake.images[0]?.referrerPolicy).toBe('no-referrer')
  })

  it('crossOrigin est déjà réglé quand la source est posée (sinon le réglage serait ignoré)', async () => {
    const fake = createFakeEnvironment()

    await createImageLoader(fake.environment)('https://exemple.fr/a.png')

    expect(fake.images[0]?.crossOriginWhenSourceSet).toBe('anonymous')
  })
})

describe('loadBrowserImage', () => {
  it('est une fonction prête à l\'emploi qui ne touche pas au DOM tant qu\'on ne l\'appelle pas', () => {
    expect(typeof loadBrowserImage).toBe('function')
  })
})
