import { createId } from './ids'
import {
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  type ImageElement,
  type Presentation,
  type RectElement,
  type Slide,
  type TextElement,
} from './types'

// Position qui centre un élément de cette taille sur la diapositive.
function centered(width: number, height: number) {
  return {
    x: (SLIDE_WIDTH - width) / 2,
    y: (SLIDE_HEIGHT - height) / 2,
  }
}

export function createSlide(): Slide {
  return { id: createId(), elements: [] }
}

// Copie profonde avec de nouveaux ids : la diapositive ET chaque élément, sinon
// deux éléments de la présentation partageraient le même id.
// Les éléments sont des objets plats (pas d'objet imbriqué) : une copie superficielle suffit.
export function duplicateSlide(slide: Slide): Slide {
  return {
    ...slide,
    id: createId(),
    elements: slide.elements.map((element) => ({ ...element, id: createId() })),
  }
}

export function createPresentation(title = 'Sans titre'): Presentation {
  return { version: 1, title, slides: [createSlide()] }
}

// Dans chaque fabrique, id et type sont posés après les overrides : même un
// appelant non typé (JS, cast) ne peut pas les écraser.
// Le centrage est calculé pour la taille par défaut : si on surcharge width ou
// height, l'appelant fournit aussi x et y s'il veut un élément centré.
export function createTextElement(
  overrides: Partial<Omit<TextElement, 'id' | 'type'>> = {},
): TextElement {
  return {
    ...centered(600, 120),
    width: 600,
    height: 120,
    text: 'Texte',
    fontSize: 48,
    color: '#1c2530',
    fill: null,
    bold: false,
    italic: false,
    align: 'left',
    fontFamily: null,
    opacity: 1,
    ...overrides,
    id: createId(),
    type: 'text',
  }
}

export function createRectElement(
  overrides: Partial<Omit<RectElement, 'id' | 'type'>> = {},
): RectElement {
  return {
    ...centered(400, 240),
    width: 400,
    height: 240,
    fill: '#2e5d7c',
    opacity: 1,
    ...overrides,
    id: createId(),
    type: 'rect',
  }
}

export function createImageElement(
  src: string,
  overrides: Partial<Omit<ImageElement, 'id' | 'type' | 'src'>> = {},
): ImageElement {
  return {
    ...centered(480, 270),
    width: 480,
    height: 270,
    alt: '',
    opacity: 1,
    ...overrides,
    src,
    id: createId(),
    type: 'image',
  }
}
