import { MAX_TITLE_LENGTH } from '../model/limits'
import type { Presentation } from '../model/types'
import type { EditorState } from './types'

// Même règle que slideOps : une action sans effet retourne le MÊME state.

// Remplace toute la présentation (import d'un fichier). Fait confiance à son entrée : elle
// ne doit recevoir que le résultat de validatePresentation (io/presentationJson.ts), jamais
// un objet venu d'un fichier sans validation. Passe par le chemin d'édition
// normal de l'historique : une seule entrée, donc l'import est annulable.
export function loadPresentation(state: EditorState, presentation: Presentation): EditorState {
  if (presentation === state.presentation) return state
  // Une présentation a toujours au moins une diapositive (voir createInitialState).
  const first = presentation.slides[0]
  if (!first) return state
  return { presentation, selectedSlideId: first.id, selectedElementId: null }
}

// Le titre vide est accepté tel quel : c'est à l'interface d'afficher un repli.
export function renamePresentation(state: EditorState, title: string): EditorState {
  const next = title.trim().slice(0, MAX_TITLE_LENGTH)
  if (next === state.presentation.title) return state
  return { ...state, presentation: { ...state.presentation, title: next } }
}
