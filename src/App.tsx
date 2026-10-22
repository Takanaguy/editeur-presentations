import { EditorLayout } from './components/layout/EditorLayout'
import { EditorProvider } from './hooks/EditorProvider'
import { createDemoPresentation } from './model/demo'

function App() {
  return (
    // Démo temporaire : retirée à l'étape 7, quand on pourra ajouter des éléments.
    <EditorProvider presentation={createDemoPresentation()}>
      <EditorLayout />
    </EditorProvider>
  )
}

export default App
