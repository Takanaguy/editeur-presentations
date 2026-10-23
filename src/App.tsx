import { EditorLayout } from './components/layout/EditorLayout'
import { EditorProvider } from './hooks/EditorProvider'

function App() {
  return (
    // Sans présentation fournie, l'éditeur démarre sur une présentation vide.
    <EditorProvider>
      <EditorLayout />
    </EditorProvider>
  )
}

export default App
