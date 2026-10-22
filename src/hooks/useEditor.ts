import { useContext } from 'react'
import { EditorContext, type EditorContextValue } from './EditorContext'

export function useEditor(): EditorContextValue {
  const value = useContext(EditorContext)
  if (!value) {
    throw new Error("useEditor doit être utilisé à l'intérieur d'un EditorProvider")
  }
  return value
}
