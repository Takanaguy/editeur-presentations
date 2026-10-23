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

// Les 8 poignées de redimensionnement : n, e, s, w = côtés, ne, se, sw, nw = coins.
export type ResizeHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

// Déplace l'élément de dx, dy (déjà en unités logiques : la conversion pixels écran
// vers logique se fait dans le hook). La taille ne change pas, seule la position est
// arrondie puis bornée pour que l'élément reste entièrement dans la diapositive.
export function applyMove(start: Bounds, dx: number, dy: number): Bounds {
  // Un delta non fini viendrait d'un bug (échelle nulle, par exemple) : on ne bouge pas.
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return start
  return clampBounds({
    x: Math.round(start.x + dx),
    y: Math.round(start.y + dy),
    width: start.width,
    height: start.height,
  })
}

// Redimensionne par une poignée. On raisonne en bords (gauche, haut, droite, bas) :
// seuls les bords de la poignée bougent, et le bord opposé ne bouge JAMAIS.
// Chaque bord mobile est borné contre la diapositive d'un côté et, de l'autre,
// contre le bord opposé moins la taille minimale. C'est ce qui évite que le coin
// opposé dérive quand la taille minimale est atteinte, et interdit tout retournement.
export function applyResize(start: Bounds, handle: ResizeHandle, dx: number, dy: number): Bounds {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return start

  let left = start.x
  let top = start.y
  let right = start.x + start.width
  let bottom = start.y + start.height

  // Le nom de la poignée dit quels bords bougent : 'nw' contient n et w, 'e' contient e.
  if (handle.includes('w')) left = clamp(Math.round(left + dx), 0, right - MIN_ELEMENT_SIZE)
  if (handle.includes('e')) {
    right = clamp(Math.round(right + dx), left + MIN_ELEMENT_SIZE, SLIDE_WIDTH)
  }
  if (handle.includes('n')) top = clamp(Math.round(top + dy), 0, bottom - MIN_ELEMENT_SIZE)
  if (handle.includes('s')) {
    bottom = clamp(Math.round(bottom + dy), top + MIN_ELEMENT_SIZE, SLIDE_HEIGHT)
  }

  return { x: left, y: top, width: right - left, height: bottom - top }
}
