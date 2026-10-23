import { useEffect, useRef } from 'react'

// Vrai si l'utilisateur est en train de saisir du texte : les raccourcis
// (Suppr, Retour arrière...) ne doivent alors pas agir sur la diapositive.
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return true
  // isContentEditable gère l'héritage, mais jsdom ne l'implémente pas : on lit aussi l'attribut.
  if (target.isContentEditable) return true
  const attribute = target.getAttribute('contenteditable')
  return attribute !== null && attribute !== 'false'
}

export interface KeyboardShortcuts {
  hasSelection: boolean
  onDeleteSelection: () => void
}

// Écoute le clavier sur la fenêtre. Pensé pour s'étendre (annuler/rétablir à l'étape 10).
export function useKeyboardShortcuts(shortcuts: KeyboardShortcuts) {
  // Le listener lit toujours les dernières valeurs sans être réinstallé à chaque rendu.
  const latest = useRef(shortcuts)
  useEffect(() => {
    latest.current = shortcuts
  })

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const { hasSelection, onDeleteSelection } = latest.current
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      // Ctrl, Alt ou Meta : une autre combinaison que la nôtre. repeat : touche maintenue,
      // sans quoi un appui long supprimerait les éléments un par un.
      if (event.ctrlKey || event.altKey || event.metaKey || event.repeat) return
      if (!hasSelection || isTypingTarget(event.target)) return

      // preventDefault seulement ici : Retour arrière ne doit pas être bloqué quand on ne fait rien.
      event.preventDefault()
      onDeleteSelection()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}
