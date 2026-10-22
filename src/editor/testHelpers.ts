import {
  createImageElement,
  createRectElement,
  createSlide,
  createTextElement,
} from '../model/factories'
import type { Slide, SlideElement } from '../model/types'
import type { EditorState } from './types'

// Gèle l'objet et tout ce qu'il contient : toute mutation lève une TypeError
// (les modules ES s'exécutent en mode strict).
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value)
    Object.values(value).forEach(deepFreeze)
  }
  return value
}

// État de test à deux diapositives. La première est sélectionnée et contient un
// texte, un rectangle et une image (dans cet ordre, à des positions connues) ;
// la seconde contient un rectangle. Aucun élément n'est sélectionné au départ.
export function makeElementState() {
  const text = createTextElement({ x: 100, y: 100, width: 300, height: 100 })
  const rect = createRectElement({ x: 500, y: 200, width: 200, height: 100 })
  const image = createImageElement('data:,a', { x: 50, y: 400, width: 400, height: 200 })
  const other = createRectElement({ x: 10, y: 10, width: 100, height: 100 })

  const first: Slide = { ...createSlide(), elements: [text, rect, image] }
  const second: Slide = { ...createSlide(), elements: [other] }

  const state: EditorState = {
    presentation: { version: 1, title: 'Test', slides: [first, second] },
    selectedSlideId: first.id,
    selectedElementId: null,
  }
  return { state, first, second, text, rect, image, other }
}

// Éléments de la diapositive sélectionnée.
export function selectedElements(state: EditorState): SlideElement[] {
  return state.presentation.slides.find((s) => s.id === state.selectedSlideId)?.elements ?? []
}

export function elementById(state: EditorState, id: string): SlideElement | undefined {
  return selectedElements(state).find((e) => e.id === id)
}
