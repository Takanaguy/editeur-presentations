import { useMemo, useReducer, type ReactNode } from 'react'
import { createHistoryState, historyReducer } from '../editor/history'
import type { Presentation } from '../model/types'
import { EditorContext } from './EditorContext'

interface EditorProviderProps {
  // Présentation de départ. Sans elle, l'éditeur démarre sur une présentation vide.
  presentation?: Presentation
  children: ReactNode
}

export function EditorProvider({ presentation, children }: EditorProviderProps) {
  // Initialiseur paresseux : l'état de départ n'est calculé qu'au premier rendu.
  const [history, dispatch] = useReducer(historyReducer, undefined, () =>
    createHistoryState(presentation),
  )
  // dispatch est stable ; on ne recrée la valeur que si l'historique change.
  const value = useMemo(() => ({ history, dispatch }), [history])
  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
}
