import { createPresentation } from '../model/factories'
import type { Presentation } from '../model/types'
import type { EditorState } from './types'

export function createInitialState(presentation: Presentation = createPresentation()): EditorState {
  const first = presentation.slides[0]
  if (!first) {
    throw new Error('Une présentation doit contenir au moins une diapositive')
  }
  return { presentation, selectedSlideId: first.id, selectedElementId: null }
}
