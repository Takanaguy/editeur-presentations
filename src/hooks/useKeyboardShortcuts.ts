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

// Types d'input où l'on tape du texte : le navigateur y a son propre annuler (Ctrl+Z),
// qu'il ne faut pas voler. Un input sans attribut type a la propriété `type` = 'text'.
const TEXT_INPUT_TYPES = ['text', 'number', 'search', 'url', 'email', 'tel', 'password']

// Vrai si la cible est un champ de saisie de texte. Plus étroit que isTypingTarget :
// un input color, une case, un select ou un bouton n'ont pas d'annuler propre, donc
// Ctrl+Z doit y annuler l'éditeur (le focus reste sur le sélecteur de couleur après un choix).
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.tagName === 'TEXTAREA') return true
  if (target instanceof HTMLInputElement) return TEXT_INPUT_TYPES.includes(target.type.toLowerCase())
  // isContentEditable gère l'héritage, mais jsdom ne l'implémente pas : on lit aussi l'attribut.
  if (target.isContentEditable) return true
  const attribute = target.getAttribute('contenteditable')
  return attribute !== null && attribute !== 'false'
}

export interface KeyboardShortcuts {
  hasSelection: boolean
  onDeleteSelection: () => void
  onUndo?: () => void
  onRedo?: () => void
  // Faux : tous les raccourcis sont suspendus (mode présentation). Vrai par défaut.
  enabled?: boolean
}

// Écoute le clavier sur la fenêtre : suppression, annuler et rétablir.
export function useKeyboardShortcuts(shortcuts: KeyboardShortcuts) {
  // Le listener lit toujours les dernières valeurs sans être réinstallé à chaque rendu.
  const latest = useRef(shortcuts)
  useEffect(() => {
    latest.current = shortcuts
  })

  useEffect(() => {
    // Ctrl/Cmd+Z annule, Ctrl/Cmd+Maj+Z et Ctrl/Cmd+Y rétablissent. Retourne true si
    // la touche a été traitée. Les répétitions sont voulues : maintenir la touche remonte l'historique.
    function handleHistoryKey(event: KeyboardEvent): boolean {
      if ((!event.ctrlKey && !event.metaKey) || event.altKey) return false
      const key = event.key.toLowerCase()
      const { onUndo, onRedo } = latest.current
      let action: (() => void) | undefined
      if (key === 'z') action = event.shiftKey ? onRedo : onUndo
      else if (key === 'y' && !event.shiftKey) action = onRedo
      if (!action || isTextEntryTarget(event.target)) return false

      event.preventDefault()
      action()
      return true
    }

    function handleKeyDown(event: KeyboardEvent) {
      // Lu à chaque touche : réactiver les raccourcis n'exige pas de réinstaller l'écouteur.
      if (latest.current.enabled === false) return
      if (handleHistoryKey(event)) return
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
