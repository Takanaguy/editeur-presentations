import type { Presentation } from '../model/types'
import { editorReducer } from './reducer'
import { createInitialState } from './state'
import type { EditorAction, EditorState } from './types'

// Nombre maximal d'annulations possibles. Au-delà, les plus anciennes sont oubliées.
export const HISTORY_LIMIT = 50

// L'historique stocke des snapshots de la Presentation, pas des actions inverses :
// le reducer ne modifie jamais un objet, il en recrée seulement les parties qui
// changent. Un snapshot partage donc presque tout avec le suivant et coûte très peu.
// La sélection reste dans `editor`, hors de l'historique : annuler n'annule pas un clic.
export interface HistoryState {
  editor: EditorState
  // Du plus ancien au plus récent : la dernière entrée est ce qu'un undo restaure.
  past: Presentation[]
  // Du plus proche au plus lointain : la première entrée est ce qu'un redo restaure.
  future: Presentation[]
  // Clé de la dernière édition fusionnable, ou null. Tant que la prochaine édition a la
  // même clé et que rien d'autre n'est arrivé, elle s'ajoute à la même entrée de passé.
  coalesceKey: string | null
}

export type HistoryAction =
  | { type: 'history/undo' }
  | { type: 'history/redo' }
  // Édition normale, mais fusionnée avec la précédente si elle a la même clé : un
  // sélecteur de couleur émet un événement à chaque mouvement, pour une seule intention.
  | { type: 'history/coalesced'; key: string; action: EditorAction }
  // Coupe la chaîne de fusion (par exemple quand le champ perd le focus).
  | { type: 'history/seal' }

export type AppAction = EditorAction | HistoryAction

export function createHistoryState(presentation?: Presentation): HistoryState {
  return { editor: createInitialState(presentation), past: [], future: [], coalesceKey: null }
}

export function canUndo(state: HistoryState): boolean {
  return state.past.length > 0
}

export function canRedo(state: HistoryState): boolean {
  return state.future.length > 0
}

// Après un undo/redo, la sélection peut viser une diapositive ou un élément qui
// n'existe plus (annuler un ajout). On la ramène sur quelque chose de valide.
export function reconcileSelection(previous: EditorState, presentation: Presentation): EditorState {
  const { slides } = presentation
  const stillThere = slides.find((s) => s.id === previous.selectedSlideId)

  if (stillThere) {
    // Même diapositive : l'élément sélectionné reste seulement s'il y existe encore.
    const keepElement = stillThere.elements.some((e) => e.id === previous.selectedElementId)
    return {
      presentation,
      selectedSlideId: stillThere.id,
      selectedElementId: keepElement ? previous.selectedElementId : null,
    }
  }

  // Diapositive disparue : on prend celle qui occupe maintenant la même place,
  // bornée au dernier index. Si l'ancienne sélection était introuvable (index -1),
  // on retombe sur la première.
  const oldIndex = previous.presentation.slides.findIndex((s) => s.id === previous.selectedSlideId)
  const index = Math.min(Math.max(oldIndex, 0), slides.length - 1)
  const fallback = slides[index]
  // Une présentation a toujours au moins une diapositive (voir createInitialState).
  if (!fallback) throw new Error('Une présentation doit contenir au moins une diapositive')
  return { presentation, selectedSlideId: fallback.id, selectedElementId: null }
}

// Ajoute un snapshot en fin de liste et ne garde que les HISTORY_LIMIT plus récents.
function pushCapped(past: Presentation[], snapshot: Presentation): Presentation[] {
  return [...past, snapshot].slice(-HISTORY_LIMIT)
}

export function historyReducer(state: HistoryState, action: AppAction): HistoryState {
  switch (action.type) {
    case 'history/undo': {
      const previous = state.past.at(-1)
      if (!previous) return state
      return {
        editor: reconcileSelection(state.editor, previous),
        past: state.past.slice(0, -1),
        future: [state.editor.presentation, ...state.future],
        coalesceKey: null,
      }
    }
    case 'history/redo': {
      const [next, ...rest] = state.future
      if (!next) return state
      return {
        editor: reconcileSelection(state.editor, next),
        past: pushCapped(state.past, state.editor.presentation),
        future: rest,
        coalesceKey: null,
      }
    }
    case 'history/coalesced':
      return applyEdit(state, action.action, action.key)
    case 'history/seal':
      return state.coalesceKey === null ? state : { ...state, coalesceKey: null }
    default:
      return applyEdit(state, action, null)
  }
}

// Règle unique : une entrée d'historique naît si et seulement si la présentation
// a changé de référence. Pas de liste d'actions à maintenir à la main.
// `key` non nul : édition fusionnable avec la précédente si elle a la même clé.
function applyEdit(state: HistoryState, action: EditorAction, key: string | null): HistoryState {
  const next = editorReducer(state.editor, action)
  // Action sans effet : on rend le même objet pour que l'UI ne se redessine pas.
  if (next === state.editor) return state
  // Sélection seule : on met à jour l'éditeur, pas l'historique. Changer de sélection
  // coupe la chaîne de fusion.
  if (next.presentation === state.editor.presentation) {
    return { ...state, editor: next, coalesceKey: null }
  }
  // Même clé que l'édition d'avant : on garde l'entrée de passé existante (l'état d'avant
  // la première édition de la chaîne), seul l'état courant avance. La première édition
  // d'une clé ne fusionne jamais, même si `past` contient d'autres entrées.
  // La garde `past.length > 0` est défensive : une clé non nulle implique un passé non vide.
  if (key !== null && state.coalesceKey === key && state.past.length > 0) {
    return { ...state, editor: next }
  }
  // Vraie modification : une nouvelle action efface les redo possibles.
  return {
    editor: next,
    past: pushCapped(state.past, state.editor.presentation),
    future: [],
    coalesceKey: key,
  }
}
