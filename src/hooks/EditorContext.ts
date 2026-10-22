import { createContext, type Dispatch } from 'react'
import type { AppAction, HistoryState } from '../editor/history'

export interface EditorContextValue {
  history: HistoryState
  dispatch: Dispatch<AppAction>
}

// Contexte seul dans son fichier : le Provider (composant) et useEditor (hook)
// vivent ailleurs, pour ne pas mélanger composants et non-composants dans un module.
// null = pas de Provider au-dessus, useEditor le détecte et lève une erreur claire.
export const EditorContext = createContext<EditorContextValue | null>(null)
