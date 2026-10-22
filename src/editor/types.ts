import type { Presentation } from '../model/types'

export interface EditorState {
  presentation: Presentation
  // Toujours l'id d'une diapositive existante : la présentation en a au moins une.
  selectedSlideId: string
  selectedElementId: string | null
}

// Une union par famille d'actions, pour que l'étape suivante ajoute simplement
// ElementAction à EditorAction sans toucher aux actions de diapositives.
export type SlideAction =
  | { type: 'slide/add' }
  | { type: 'slide/delete'; slideId: string }
  | { type: 'slide/duplicate'; slideId: string }
  // toIndex est l'index dans le tableau APRÈS retrait de la diapositive déplacée.
  | { type: 'slide/move'; slideId: string; toIndex: number }
  | { type: 'slide/select'; slideId: string }

export type EditorAction = SlideAction
