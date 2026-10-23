export interface ImageSize {
  width: number
  height: number
}

// Taille utilisée quand on ne connaît pas celle de l'image (16:9, comme la fabrique).
export const DEFAULT_IMAGE_SIZE: ImageSize = { width: 480, height: 270 }

// Taille d'affichage d'une image : le ratio est conservé, elle tient dans
// maxWidth x maxHeight, et on ne l'agrandit jamais au delà de sa taille naturelle.
export function fitImageSize(
  naturalWidth: number,
  naturalHeight: number,
  maxWidth = 640,
  maxHeight = 360,
): ImageSize {
  const valid = (n: number) => Number.isFinite(n) && n > 0
  if (!valid(naturalWidth) || !valid(naturalHeight)) return { ...DEFAULT_IMAGE_SIZE }

  const ratio = Math.min(1, maxWidth / naturalWidth, maxHeight / naturalHeight)
  return {
    // Au moins 1 : une image très fine ne doit pas tomber à 0 après l'arrondi.
    width: Math.max(1, Math.round(naturalWidth * ratio)),
    height: Math.max(1, Math.round(naturalHeight * ratio)),
  }
}

// Au delà de ce délai, on considère que l'image ne se chargera pas.
export const IMAGE_LOAD_TIMEOUT_MS = 8000

// Charge l'image pour lire sa taille naturelle. Ne rejette jamais : null si le
// chargement échoue ou dépasse IMAGE_LOAD_TIMEOUT_MS.
export function measureImage(src: string): Promise<ImageSize | null> {
  return new Promise((resolve) => {
    const image = new Image()

    function finish(size: ImageSize | null) {
      clearTimeout(timer)
      // Handlers retirés pour qu'un évènement tardif ne fasse rien.
      image.onload = null
      image.onerror = null
      resolve(size)
    }

    const timer = setTimeout(() => {
      // Vider src interrompt le téléchargement en cours.
      image.src = ''
      finish(null)
    }, IMAGE_LOAD_TIMEOUT_MS)
    image.onload = () => finish({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => finish(null)
    image.src = src
  })
}
