import {
  DEFAULT_IMAGE_SIZE,
  IMAGE_LOAD_TIMEOUT_MS,
  fitImageSize,
  measureImage,
} from './imageSize'

describe('fitImageSize', () => {
  it('rétrécit en conservant le ratio (limité par la largeur)', () => {
    expect(fitImageSize(1280, 640)).toEqual({ width: 640, height: 320 })
  })

  it('rétrécit en conservant le ratio (limité par la hauteur)', () => {
    expect(fitImageSize(400, 1440)).toEqual({ width: 100, height: 360 })
  })

  it('n\'agrandit jamais une petite image', () => {
    expect(fitImageSize(100, 50)).toEqual({ width: 100, height: 50 })
  })

  it('arrondit à l\'entier', () => {
    expect(fitImageSize(1000, 333)).toEqual({ width: 640, height: 213 })
  })

  it('respecte des limites personnalisées', () => {
    expect(fitImageSize(1000, 1000, 200, 300)).toEqual({ width: 200, height: 200 })
  })

  it('la taille par défaut vaut 480x270', () => {
    expect(DEFAULT_IMAGE_SIZE).toEqual({ width: 480, height: 270 })
  })

  it.each([
    [0, 100],
    [100, 0],
    [NaN, 100],
    [100, NaN],
    [-10, 50],
    [50, -10],
    [Infinity, 100],
  ])('retourne la taille par défaut pour %s x %s', (w, h) => {
    expect(fitImageSize(w, h)).toEqual({ width: 480, height: 270 })
  })
})

describe('measureImage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // jsdom ne charge pas les images : on simule la classe Image.
  function stubImage(outcome: 'load' | 'error') {
    class FakeImage {
      naturalWidth = 300
      naturalHeight = 200
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) {
        queueMicrotask(() => (outcome === 'load' ? this.onload?.() : this.onerror?.()))
      }
    }
    vi.stubGlobal('Image', FakeImage)
  }

  it('résout avec la taille naturelle', async () => {
    stubImage('load')

    await expect(measureImage('data:image/png;base64,AAA')).resolves.toEqual({
      width: 300,
      height: 200,
    })
  })

  it('résout avec null en cas d\'erreur de chargement, sans rejeter', async () => {
    stubImage('error')

    await expect(measureImage('https://exemple.fr/cassee.png')).resolves.toBeNull()
  })
})

describe('measureImage : délai maximum', () => {
  // Image qui ne charge jamais toute seule : le test déclenche (ou non) les évènements.
  class SilentImage {
    static last: SilentImage | null = null
    naturalWidth = 300
    naturalHeight = 200
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    src = ''
    constructor() {
      SilentImage.last = this
    }
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('Image', SilentImage)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('exporte un délai de 8 secondes', () => {
    expect(IMAGE_LOAD_TIMEOUT_MS).toBe(8000)
  })

  it('résout avec null une fois le délai écoulé, et nettoie l\'image', async () => {
    const promise = measureImage('https://exemple.fr/lente.png')
    const image = SilentImage.last

    vi.advanceTimersByTime(IMAGE_LOAD_TIMEOUT_MS - 1)
    expect(image?.onload).not.toBeNull()
    vi.advanceTimersByTime(1)

    await expect(promise).resolves.toBeNull()
    expect(image?.onload).toBeNull()
    expect(image?.onerror).toBeNull()
    // Le téléchargement est interrompu.
    expect(image?.src).toBe('')
  })

  it('annule le délai quand l\'image charge à temps', async () => {
    const promise = measureImage('https://exemple.fr/rapide.png')

    SilentImage.last?.onload?.()

    await expect(promise).resolves.toEqual({ width: 300, height: 200 })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('annule le délai quand le chargement échoue', async () => {
    const promise = measureImage('https://exemple.fr/404.png')

    SilentImage.last?.onerror?.()

    await expect(promise).resolves.toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })
})
