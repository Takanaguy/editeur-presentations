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

// Vrai si la cible utilise déjà les flèches (curseur, liste, champ de saisie) : le
// déplacement de l'élément doit alors lui laisser la touche. Les boutons et le body non.
export function isArrowKeyTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  // input (tous types, dont range), select, textarea et contentEditable : déjà couverts.
  if (isTypingTarget(target)) return true
  return target.getAttribute('role') === 'slider'
}

// Direction (en unités de pas) de chaque flèche.
// Une Map et pas un objet : une touche nommée « constructor » ne doit pas y être trouvée.
const ARROW_DIRECTIONS: ReadonlyMap<string, readonly [number, number]> = new Map([
  ['ArrowLeft', [-1, 0]],
  ['ArrowRight', [1, 0]],
  ['ArrowUp', [0, -1]],
  ['ArrowDown', [0, 1]],
])

// Pas d'une flèche, en unités logiques ; Maj le décuple.
const NUDGE_STEP = 1
const NUDGE_STEP_SHIFT = 10

export interface KeyboardShortcuts {
  hasSelection: boolean
  onDeleteSelection: () => void
  onUndo?: () => void
  onRedo?: () => void
  // Ctrl/Cmd+D : duplique l'élément sélectionné.
  onDuplicate?: () => void
  // Flèches : déplacement de l'élément sélectionné de (dx, dy) unités logiques.
  onNudge?: (dx: number, dy: number) => void
  // Relâchement d'une flèche : la rafale de déplacements est finie.
  onNudgeEnd?: () => void
  // Faux : tous les raccourcis sont suspendus (mode présentation). Vrai par défaut.
  enabled?: boolean
}

// Écoute le clavier sur la fenêtre : suppression, annuler, rétablir, dupliquer et flèches.
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

    // Ctrl/Cmd+D duplique. Sans Maj ni Alt, avec une sélection, hors champ de texte.
    // preventDefault seulement si on agit : sinon on volerait « ajouter aux favoris » pour rien.
    function handleDuplicateKey(event: KeyboardEvent): boolean {
      if ((!event.ctrlKey && !event.metaKey) || event.altKey || event.shiftKey) return false
      if (event.key.toLowerCase() !== 'd') return false
      const { hasSelection, onDuplicate } = latest.current
      if (!onDuplicate || !hasSelection || isTextEntryTarget(event.target)) return false

      // Touche maintenue : on garde la main sur le raccourci (le navigateur ne doit pas
      // ouvrir ses favoris) mais on ne crée pas une copie par répétition.
      event.preventDefault()
      if (!event.repeat) onDuplicate()
      return true
    }

    // Flèches : déplacent l'élément sélectionné. Retourne true si la touche a été traitée.
    // Les répétitions sont voulues : maintenir une flèche fait glisser l'élément.
    function handleArrowKey(event: KeyboardEvent): boolean {
      const direction = ARROW_DIRECTIONS.get(event.key)
      if (!direction) return false
      if (event.ctrlKey || event.altKey || event.metaKey) return false
      const { hasSelection, onNudge } = latest.current
      if (!onNudge || !hasSelection || isArrowKeyTarget(event.target)) return false

      const step = event.shiftKey ? NUDGE_STEP_SHIFT : NUDGE_STEP
      // preventDefault ici seulement : sinon la page ne défilerait plus au clavier pour rien.
      event.preventDefault()
      onNudge(direction[0] * step, direction[1] * step)
      return true
    }

    function handleKeyDown(event: KeyboardEvent) {
      // Lu à chaque touche : réactiver les raccourcis n'exige pas de réinstaller l'écouteur.
      if (latest.current.enabled === false) return
      if (handleHistoryKey(event)) return
      if (handleDuplicateKey(event)) return
      if (handleArrowKey(event)) return
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

    // Relâcher une flèche termine la rafale, même sans sélection ou en mode présentation :
    // couper la chaîne de fusion est sans danger, et évite qu'un appui plus tardif s'y colle.
    function handleKeyUp(event: KeyboardEvent) {
      if (ARROW_DIRECTIONS.has(event.key)) latest.current.onNudgeEnd?.()
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])
}
