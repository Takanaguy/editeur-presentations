import { createSlide, duplicateSlide } from '../model/factories'
import type { Slide } from '../model/types'
import type { EditorState } from './types'

// Règle commune (aussi pour elementOps) : une action sans effet retourne le MÊME
// objet state, pour que l'historique undo/redo (history.ts) n'enregistre rien
// quand rien n'a changé.

// Retourne une copie du tableau avec `item` inséré à `index` (l'original n'est pas touché).
function insertAt<T>(items: readonly T[], index: number, item: T): T[] {
  return [...items.slice(0, index), item, ...items.slice(index)]
}

function withSlides(state: EditorState, slides: Slide[]): EditorState['presentation'] {
  return { ...state.presentation, slides }
}

export function addSlide(state: EditorState): EditorState {
  const { slides } = state.presentation
  const selectedIndex = slides.findIndex((s) => s.id === state.selectedSlideId)
  // Sélection introuvable (état incohérent) : on ajoute à la fin plutôt que de planter.
  const index = selectedIndex === -1 ? slides.length : selectedIndex + 1
  const slide = createSlide()
  return {
    presentation: withSlides(state, insertAt(slides, index, slide)),
    selectedSlideId: slide.id,
    selectedElementId: null,
  }
}

export function deleteSlide(state: EditorState, slideId: string): EditorState {
  const { slides } = state.presentation
  const index = slides.findIndex((s) => s.id === slideId)
  if (index === -1 || slides.length <= 1) return state

  const presentation = withSlides(
    state,
    slides.filter((s) => s.id !== slideId),
  )
  if (slideId !== state.selectedSlideId) return { ...state, presentation }

  // La suivante prend la place de la supprimée, sinon (c'était la dernière) la précédente.
  // Il reste au moins une diapositive, donc l'une des deux existe.
  const neighbor = slides[index + 1] ?? slides[index - 1]
  if (!neighbor) return state
  return { presentation, selectedSlideId: neighbor.id, selectedElementId: null }
}

export function duplicateSlideAction(state: EditorState, slideId: string): EditorState {
  const { slides } = state.presentation
  const index = slides.findIndex((s) => s.id === slideId)
  const original = slides[index]
  if (!original) return state

  const copy = duplicateSlide(original)
  return {
    presentation: withSlides(state, insertAt(slides, index + 1, copy)),
    selectedSlideId: copy.id,
    selectedElementId: null,
  }
}

export function moveSlide(state: EditorState, slideId: string, toIndex: number): EditorState {
  const { slides } = state.presentation
  const fromIndex = slides.findIndex((s) => s.id === slideId)
  const moved = slides[fromIndex]
  if (!moved || Number.isNaN(toIndex)) return state

  // Borné à l'index maximal du tableau sans la diapositive déplacée (= length - 1).
  const target = Math.min(Math.max(Math.trunc(toIndex), 0), slides.length - 1)
  if (target === fromIndex) return state

  const rest = slides.filter((s) => s.id !== slideId)
  return { ...state, presentation: withSlides(state, insertAt(rest, target, moved)) }
}

export function selectSlide(state: EditorState, slideId: string): EditorState {
  if (slideId === state.selectedSlideId) return state
  if (!state.presentation.slides.some((s) => s.id === slideId)) return state
  return { ...state, selectedSlideId: slideId, selectedElementId: null }
}
