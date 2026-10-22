import type { Presentation, SlideElement } from '../model/types'
import type { Bounds } from './geometry'

export interface EditorState {
  presentation: Presentation
  // Toujours l'id d'une diapositive existante : la présentation en a au moins une.
  selectedSlideId: string
  selectedElementId: string | null
}

// Une union par famille d'actions, pour ajouter une famille à EditorAction
// sans toucher aux autres.
export type SlideAction =
  | { type: 'slide/add' }
  | { type: 'slide/delete'; slideId: string }
  | { type: 'slide/duplicate'; slideId: string }
  // toIndex est l'index dans le tableau APRÈS retrait de la diapositive déplacée.
  | { type: 'slide/move'; slideId: string; toIndex: number }
  | { type: 'slide/select'; slideId: string }

// Champs qui ne passent jamais par `element/update` : l'identité ne change pas,
// la géométrie passe par `element/move` et `element/resize` (qui la bornent).
export type ProtectedElementKey = 'id' | 'type' | 'x' | 'y' | 'width' | 'height'

type KeysOfUnion<T> = T extends unknown ? keyof T : never
type ValueInUnion<T, K extends PropertyKey> = T extends unknown
  ? K extends keyof T
    ? T[K]
    : never
  : never

// Tous les champs de contenu de tous les types d'éléments (text, fontSize, color,
// fill, src, alt...), tous optionnels. Un champ qui ne concerne pas le type de
// l'élément visé (text sur un rectangle) est ignoré à l'exécution.
export type ElementChanges = {
  [K in Exclude<KeysOfUnion<SlideElement>, ProtectedElementKey>]?: ValueInUnion<SlideElement, K>
}

// Toutes les actions d'éléments visent la diapositive sélectionnée.
export type ElementAction =
  // L'élément est fabriqué par l'appelant (fabriques du modèle) : le reducer reste pur.
  | { type: 'element/add'; element: SlideElement }
  | { type: 'element/select'; elementId: string | null }
  | { type: 'element/delete'; elementId: string }
  | { type: 'element/move'; elementId: string; x: number; y: number }
  // Applique x, y, width et height d'un coup : une poignée en haut à gauche change aussi x et y.
  // Le reducer applique les bounds telles quelles (seulement bornées) : c'est à l'appelant
  // (l'UI) de calculer des bounds qui gardent le coin opposé fixe quand la taille minimale
  // est atteinte.
  | { type: 'element/resize'; elementId: string; bounds: Bounds }
  | { type: 'element/update'; elementId: string; changes: ElementChanges }

export type EditorAction = SlideAction | ElementAction
