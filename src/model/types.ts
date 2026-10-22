// Espace logique 16:9. L'affichage est mis à l'échelle en CSS, les coordonnées
// du modèle restent donc toujours exprimées dans cet espace.
export const SLIDE_WIDTH = 1280
export const SLIDE_HEIGHT = 720

export interface BaseElement {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export interface TextElement extends BaseElement {
  type: 'text'
  text: string
  fontSize: number
  color: string
  // null = pas de fond derrière le texte
  fill: string | null
}

export interface RectElement extends BaseElement {
  type: 'rect'
  fill: string
}

export interface ImageElement extends BaseElement {
  type: 'image'
  src: string
  alt: string
}

// Union discriminée par `type` : TypeScript affine le type après un test sur `type`.
export type SlideElement = TextElement | RectElement | ImageElement

export type ElementType = SlideElement['type']

export interface Slide {
  id: string
  // L'ordre du tableau est l'ordre d'empilement : le dernier élément est au premier plan.
  elements: SlideElement[]
}

export interface Presentation {
  // Numéro de version du format, pour pouvoir migrer d'anciens fichiers plus tard.
  version: 1
  title: string
  slides: Slide[]
}
