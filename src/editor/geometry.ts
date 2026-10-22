import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../model/types'

// Taille minimale d'un élément, en unités de l'espace logique de la diapositive.
export const MIN_ELEMENT_SIZE = 20

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

// Borne `value` entre `min` et `max`. NaN ne se compare à rien (Math.min et
// Math.max le propagent), on le ramène donc explicitement au minimum.
// Infinity et -Infinity sont bornés normalement par min et max.
export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.min(Math.max(value, min), max)
}

// Garde l'élément entièrement dans la diapositive. La taille est bornée d'abord :
// les limites de x et y dépendent de la taille finale.
export function clampBounds(bounds: Bounds): Bounds {
  const width = clamp(bounds.width, MIN_ELEMENT_SIZE, SLIDE_WIDTH)
  const height = clamp(bounds.height, MIN_ELEMENT_SIZE, SLIDE_HEIGHT)
  return {
    x: clamp(bounds.x, 0, SLIDE_WIDTH - width),
    y: clamp(bounds.y, 0, SLIDE_HEIGHT - height),
    width,
    height,
  }
}
