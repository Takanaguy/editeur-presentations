import { createImageElement } from '../model/factories'
import { SLIDE_HEIGHT, SLIDE_WIDTH, type ImageElement } from '../model/types'
import { fitImageSize, type ImageSize } from './imageSize'

// Image ajustée à la diapositive et centrée. `natural` vaut null si la taille
// n'a pas pu être mesurée : on retombe alors sur la taille par défaut.
export function createImageElementFitted(
  src: string,
  alt: string,
  natural: ImageSize | null,
): ImageElement {
  const { width, height } = fitImageSize(natural?.width ?? 0, natural?.height ?? 0)
  // Les fabriques centrent pour la taille par défaut seulement : on fournit x et y.
  return createImageElement(src, {
    alt,
    width,
    height,
    x: (SLIDE_WIDTH - width) / 2,
    y: (SLIDE_HEIGHT - height) / 2,
  })
}
