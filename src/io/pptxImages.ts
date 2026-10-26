import { IMAGE_LOAD_TIMEOUT_MS } from './imageSize'

// Image prête pour PptxGenJS : `data` est de la forme « image/png;base64,... » (sans le
// préfixe « data: »), `width` et `height` sont la taille naturelle de l'image.
export interface PptxImage {
  data: string
  width: number
  height: number
}

// Accès aux images, injecté dans l'export : la logique de l'export n'a pas besoin de canvas
// et se teste sans navigateur. Retourne null si l'image est illisible (réseau, CORS...).
export type LoadImage = (src: string) => Promise<PptxImage | null>

// Au delà, l'image est réduite avant d'être écrite : un canvas géant consomme beaucoup de
// mémoire et peut échouer sans erreur claire.
export const MAX_CANVAS_SIDE = 4096

// Le strict nécessaire de HTMLImageElement et HTMLCanvasElement : des faux simples suffisent
// dans les tests, et les vrais éléments les satisfont.
export interface ImageLike {
  crossOrigin: string | null
  referrerPolicy: string
  onload: ((event: Event) => void) | null
  onerror: ((event: Event | string) => void) | null
  src: string
  readonly naturalWidth: number
  readonly naturalHeight: number
}

interface CanvasContextLike {
  drawImage(image: unknown, dx: number, dy: number, dw: number, dh: number): void
}

export interface CanvasLike {
  width: number
  height: number
  getContext(contextId: '2d'): CanvasContextLike | null
  toDataURL(type: 'image/png'): string
}

export interface ImageEnvironment {
  createImage(): ImageLike
  createCanvas(): CanvasLike
}

const browserEnvironment: ImageEnvironment = {
  createImage: () => new Image(),
  createCanvas: () => document.createElement('canvas'),
}

// PowerPoint lit PNG, JPEG et GIF tels quels. WebP et SVG passent par un canvas.
const KEPT_AS_IS = /^data:image\/(?:png|jpe?g|gif);base64,/i
const REMOTE_URL = /^https?:/i
const DATA_URL_PREFIX = 'data:'

// Charge l'image dans un élément pour connaître sa taille. null en cas d'échec ou de délai.
function loadElement(
  environment: ImageEnvironment,
  src: string,
  timeoutMs: number,
): Promise<ImageLike | null> {
  return new Promise((resolve) => {
    const image = environment.createImage()

    function finish(result: ImageLike | null) {
      clearTimeout(timer)
      // Handlers retirés pour qu'un évènement tardif ne fasse rien.
      image.onload = null
      image.onerror = null
      resolve(result)
    }

    const timer = setTimeout(() => {
      // Vider src interrompt le téléchargement en cours.
      image.src = ''
      finish(null)
    }, timeoutMs)
    image.onload = () => finish(image)
    image.onerror = () => finish(null)
    // Une image distante doit être lue « anonymement » : sans cela le canvas serait
    // contaminé et l'export en PNG interdit. Le site doit alors autoriser la lecture (CORS).
    if (REMOTE_URL.test(src)) image.crossOrigin = 'anonymous'
    // Comme à l'écran : l'adresse de la page n'est pas envoyée au serveur de l'image.
    image.referrerPolicy = 'no-referrer'
    image.src = src
  })
}

// Dessine l'image dans un canvas (réduite si elle dépasse MAX_CANVAS_SIDE) et l'exporte en PNG.
function toPng(
  environment: ImageEnvironment,
  image: ImageLike,
  width: number,
  height: number,
): string | null {
  const scale = Math.min(1, MAX_CANVAS_SIDE / Math.max(width, height))
  const canvas = environment.createCanvas()
  // Au moins 1 : une image très fine ne doit pas tomber à 0 après l'arrondi.
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const context = canvas.getContext('2d')
  if (!context) return null
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const url = canvas.toDataURL('image/png')
  return url.startsWith('data:image/png;base64,') ? url.slice(DATA_URL_PREFIX.length) : null
}

// Fabrique la fonction de chargement. L'environnement et le délai sont injectables pour les tests.
export function createImageLoader(
  environment: ImageEnvironment = browserEnvironment,
  timeoutMs: number = IMAGE_LOAD_TIMEOUT_MS,
): LoadImage {
  return async (rawSrc) => {
    const src = rawSrc.trim()
    const image = await loadElement(environment, src, timeoutMs)
    if (!image) return null
    const { naturalWidth: width, naturalHeight: height } = image
    // Un SVG sans dimensions peut annoncer 0 : on ne sait pas le placer, on l'écarte.
    if (!(width > 0 && height > 0)) return null

    if (KEPT_AS_IS.test(src)) return { data: src.slice(DATA_URL_PREFIX.length), width, height }

    try {
      const data = toPng(environment, image, width, height)
      return data ? { data, width, height } : null
    } catch {
      // Canvas contaminé (SecurityError) ou mémoire insuffisante.
      return null
    }
  }
}

export const loadBrowserImage: LoadImage = createImageLoader()
