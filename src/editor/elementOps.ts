import type { Slide, SlideElement, TextAlign } from '../model/types'
import { clamp, clampBounds, type Bounds } from './geometry'
import type { EditorState, ElementChanges, ReorderTarget } from './types'

// Même règle que slideOps : une action sans effet retourne le MÊME state.
// Toutes les opérations visent la diapositive sélectionnée.

export const MIN_FONT_SIZE = 8
export const MAX_FONT_SIZE = 400

// Ces champs ne se modifient pas par `element/update` (voir ProtectedElementKey).
const PROTECTED_KEYS: ReadonlySet<string> = new Set(['id', 'type', 'x', 'y', 'width', 'height'])

function findSelectedSlide(state: EditorState): Slide | undefined {
  return state.presentation.slides.find((s) => s.id === state.selectedSlideId)
}

// Remplace les éléments de la diapositive sélectionnée. Les autres diapositives
// gardent leur référence (le map renvoie le même objet quand rien ne change).
function withElements(state: EditorState, elements: SlideElement[]): EditorState['presentation'] {
  return {
    ...state.presentation,
    slides: state.presentation.slides.map((s) =>
      s.id === state.selectedSlideId ? { ...s, elements } : s,
    ),
  }
}

// Applique `change` à un élément de la diapositive sélectionnée. Si `change`
// retourne le même objet, rien n'a changé : on retourne le même state.
function mapElement(
  state: EditorState,
  elementId: string,
  change: (element: SlideElement) => SlideElement,
): EditorState {
  const slide = findSelectedSlide(state)
  if (!slide) return state
  const index = slide.elements.findIndex((e) => e.id === elementId)
  const element = slide.elements[index]
  if (!element) return state

  const changed = change(element)
  if (changed === element) return state
  const elements = slide.elements.map((e, i) => (i === index ? changed : e))
  return { ...state, presentation: withElements(state, elements) }
}

const isString = (value: unknown): value is string => typeof value === 'string'
const isNumber = (value: unknown): value is number => typeof value === 'number'
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'
const isTextAlign = (value: unknown): value is TextAlign =>
  value === 'left' || value === 'center' || value === 'right'
const isStringOrNull = (value: unknown): value is string | null =>
  value === null || typeof value === 'string'

function areFinite(...values: number[]): boolean {
  return values.every(Number.isFinite)
}

// Borne puis applique la géométrie ; retourne le même élément si rien ne bouge.
function withBounds(element: SlideElement, bounds: Bounds): SlideElement {
  const next = clampBounds(bounds)
  const same =
    next.x === element.x &&
    next.y === element.y &&
    next.width === element.width &&
    next.height === element.height
  return same ? element : { ...element, ...next }
}

export function addElement(state: EditorState, element: SlideElement): EditorState {
  const slide = findSelectedSlide(state)
  if (!slide) return state
  if (slide.elements.some((e) => e.id === element.id)) return state

  // Ajouté en dernier = au premier plan (l'ordre du tableau est l'ordre d'empilement).
  const added: SlideElement = { ...element, ...clampBounds(element) }
  return {
    presentation: withElements(state, [...slide.elements, added]),
    selectedSlideId: state.selectedSlideId,
    selectedElementId: added.id,
  }
}

export function selectElement(state: EditorState, elementId: string | null): EditorState {
  if (elementId === state.selectedElementId) return state
  if (elementId !== null) {
    const slide = findSelectedSlide(state)
    if (!slide?.elements.some((e) => e.id === elementId)) return state
  }
  return { ...state, selectedElementId: elementId }
}

export function deleteElement(state: EditorState, elementId: string): EditorState {
  const slide = findSelectedSlide(state)
  if (!slide?.elements.some((e) => e.id === elementId)) return state

  const presentation = withElements(
    state,
    slide.elements.filter((e) => e.id !== elementId),
  )
  const selectedElementId = state.selectedElementId === elementId ? null : state.selectedElementId
  return { ...state, presentation, selectedElementId }
}

export function moveElement(
  state: EditorState,
  elementId: string,
  x: number,
  y: number,
): EditorState {
  // Une position non finie vient d'un bug de l'appelant : on la rejette plutôt
  // que de la transformer silencieusement en 0.
  if (!areFinite(x, y)) return state
  return mapElement(state, elementId, (element) =>
    withBounds(element, { x, y, width: element.width, height: element.height }),
  )
}

export function resizeElement(state: EditorState, elementId: string, bounds: Bounds): EditorState {
  if (!areFinite(bounds.x, bounds.y, bounds.width, bounds.height)) return state
  return mapElement(state, elementId, (element) => withBounds(element, bounds))
}

// Déplace l'élément dans l'ordre d'empilement (l'ordre du tableau, le dernier est devant).
// Déjà à la limite demandée, ou id inconnu : même state, donc pas d'entrée d'historique.
export function reorderElement(
  state: EditorState,
  elementId: string,
  to: ReorderTarget,
): EditorState {
  const slide = findSelectedSlide(state)
  if (!slide) return state
  const from = slide.elements.findIndex((e) => e.id === elementId)
  const element = slide.elements[from]
  if (!element) return state

  const last = slide.elements.length - 1
  let target: number
  switch (to) {
    case 'front':
      target = last
      break
    case 'back':
      target = 0
      break
    case 'forward':
      target = Math.min(from + 1, last)
      break
    case 'backward':
      target = Math.max(from - 1, 0)
      break
    default:
      // Valeur venue d'un appelant non typé : action sans effet plutôt qu'un déplacement au hasard.
      return state
  }
  if (target === from) return state

  const elements = slide.elements.filter((_, i) => i !== from)
  elements.splice(target, 0, element)
  return { ...state, presentation: withElements(state, elements) }
}

export function updateElement(
  state: EditorState,
  elementId: string,
  changes: ElementChanges,
): EditorState {
  // undefined = « pas de changement » ; les champs protégés sont ignorés.
  const entries = Object.entries(changes).filter(
    ([key, value]) => value !== undefined && !PROTECTED_KEYS.has(key),
  )
  // Un nombre non fini rejette toute l'action, même s'il vise un champ qui
  // n'existe pas sur cet élément : un appelant qui en envoie un a un bug.
  if (entries.some(([, value]) => typeof value === 'number' && !Number.isFinite(value))) {
    return state
  }

  // Une Map et pas un objet : une clé « __proto__ » venue d'un JSON ne doit pas
  // pouvoir toucher au prototype.
  const accepted = new Map<string, unknown>(entries)

  return mapElement(state, elementId, (element) => {
    let changed = false

    // Valeur finale d'un champ : la nouvelle si elle existe ET a le bon type,
    // sinon l'actuelle. Les clés inapplicables à ce type d'élément ne sont jamais
    // lues, donc ignorées.
    function pick<T>(
      key: string,
      current: T,
      isValid: (value: unknown) => value is T,
      normalize: (value: T) => T = (value) => value,
    ): T {
      if (!accepted.has(key)) return current
      const raw = accepted.get(key)
      if (!isValid(raw)) return current
      const value = normalize(raw)
      if (value !== current) changed = true
      return value
    }

    // L'opacité est commune aux trois types : bornée à [0, 1] comme la taille de police.
    const pickOpacity = (current: number) =>
      pick('opacity', current, isNumber, (n) => clamp(n, 0, 1))

    // Chaque variante est reconstruite avec ses champs typés (pas de cast). id et
    // type viennent de `...element` : ils ne peuvent pas changer.
    let next: SlideElement
    switch (element.type) {
      case 'text':
        next = {
          ...element,
          text: pick('text', element.text, isString),
          fontSize: pick('fontSize', element.fontSize, isNumber, (n) =>
            clamp(n, MIN_FONT_SIZE, MAX_FONT_SIZE),
          ),
          color: pick('color', element.color, isString),
          // Seul champ nullable : null = pas de fond derrière le texte.
          fill: pick('fill', element.fill, isStringOrNull),
          bold: pick('bold', element.bold, isBoolean),
          italic: pick('italic', element.italic, isBoolean),
          align: pick('align', element.align, isTextAlign),
          opacity: pickOpacity(element.opacity),
        }
        break
      case 'rect':
        next = {
          ...element,
          fill: pick('fill', element.fill, isString),
          opacity: pickOpacity(element.opacity),
        }
        break
      case 'image':
        next = {
          ...element,
          src: pick('src', element.src, isString),
          alt: pick('alt', element.alt, isString),
          opacity: pickOpacity(element.opacity),
        }
        break
    }
    return changed ? next : element
  })
}
