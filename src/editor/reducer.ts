import {
  addElement,
  deleteElement,
  duplicateElement,
  moveElement,
  reorderElement,
  resizeElement,
  selectElement,
  updateElement,
} from './elementOps'
import { addFont } from './fontOps'
import { loadPresentation, renamePresentation } from './presentationOps'
import { addSlide, deleteSlide, duplicateSlideAction, moveSlide, selectSlide } from './slideOps'
import type { EditorAction, EditorState } from './types'

// Simple aiguillage : la logique vit dans slideOps.ts, elementOps.ts, presentationOps.ts et fontOps.ts.
export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'slide/add':
      return addSlide(state)
    case 'slide/delete':
      return deleteSlide(state, action.slideId)
    case 'slide/duplicate':
      return duplicateSlideAction(state, action.slideId)
    case 'slide/move':
      return moveSlide(state, action.slideId, action.toIndex)
    case 'slide/select':
      return selectSlide(state, action.slideId)
    case 'element/add':
      return addElement(state, action.element)
    case 'element/select':
      return selectElement(state, action.elementId)
    case 'element/delete':
      return deleteElement(state, action.elementId)
    case 'element/duplicate':
      return duplicateElement(state, action.elementId)
    case 'element/move':
      return moveElement(state, action.elementId, action.x, action.y)
    case 'element/resize':
      return resizeElement(state, action.elementId, action.bounds)
    case 'element/update':
      return updateElement(state, action.elementId, action.changes)
    case 'element/reorder':
      return reorderElement(state, action.elementId, action.to)
    case 'presentation/load':
      return loadPresentation(state, action.presentation)
    case 'presentation/rename':
      return renamePresentation(state, action.title)
    case 'font/add':
      return addFont(state, action.font)
    default:
      return assertNever(action)
  }
}

// Si une action est ajoutée à l'union sans être traitée dans le switch, `action`
// n'est plus de type never ici et TypeScript refuse de compiler.
function assertNever(action: never): never {
  throw new Error(`Action inconnue : ${JSON.stringify(action)}`)
}
