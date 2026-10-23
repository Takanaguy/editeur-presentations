import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import type { TextElement } from '../../model/types'
import { TEXT_LINE_HEIGHT, TEXT_PADDING, textStyle } from './ElementView'

interface TextEditorProps {
  element: TextElement
  // Appelé avec le nouveau texte, seulement s'il a changé.
  onCommit: (text: string) => void
  // Appelé pour Échap, et aussi quand le texte est resté identique.
  onCancel: () => void
}

// Zone de saisie posée exactement sur la boîte d'un texte, avec les mêmes styles que
// le rendu normal pour que l'édition ressemble au résultat.
export function TextEditor({ element, onCommit, onCancel }: TextEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  // Vrai dès que la saisie est terminée : un blur qui suit une validation au clavier
  // (le champ disparaît et perd le focus) ne doit pas appeler une seconde fois.
  const finished = useRef(false)
  const hintId = useId()

  function finish(text: string | null) {
    if (finished.current) return
    finished.current = true
    // Un texte inchangé ne doit pas créer d'entrée d'historique : on annule.
    if (text === null || text === element.text) onCancel()
    else onCommit(text)
  }

  // L'écouteur global ne doit s'installer qu'une fois par montage mais appeler la
  // dernière version de `finish` (et donc des props) : on la lit via une ref.
  const latestFinish = useRef(finish)
  useEffect(() => {
    latestFinish.current = finish
  })

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  // Un clic sur le fond ou sur un autre élément démonte le champ AVANT que le navigateur
  // ne déplace le focus : aucun blur n'arrive et la saisie serait perdue. On valide donc
  // dès le pointerdown, en phase de capture, avant les gestionnaires de React (sélection).
  // Pas de validation au nettoyage de l'effet : StrictMode le joue aussi à vide en dev.
  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const textarea = ref.current
      if (!textarea) return
      if (event.target instanceof Node && textarea.contains(event.target)) return
      latestFinish.current(textarea.value)
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [])

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Aucun raccourci de la page (Suppr, Échap d'un geste...) ne doit voir ces touches.
    event.stopPropagation()
    if (event.key === 'Escape') {
      event.preventDefault()
      finish(null)
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      finish(event.currentTarget.value)
    }
    // Entrée seule : comportement natif, un retour à la ligne.
  }

  return (
    <>
      <textarea
        ref={ref}
        aria-label="Modifier le texte"
        aria-describedby={hintId}
        defaultValue={element.text}
        onBlur={(event) => finish(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
        // Sinon le fond démarrerait un déplacement ou désélectionnerait l'élément.
        onPointerDown={(event) => event.stopPropagation()}
        style={{
          position: 'absolute',
          left: element.x,
          top: element.y,
          width: element.width,
          height: element.height,
          padding: TEXT_PADDING,
          boxSizing: 'border-box',
          lineHeight: TEXT_LINE_HEIGHT,
          fontSize: element.fontSize,
          fontFamily: 'inherit',
          color: element.color,
          ...textStyle(element),
          backgroundColor: element.fill ?? 'transparent',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'break-word',
          overflow: 'hidden',
          resize: 'none',
          border: 'none',
          margin: 0,
          outline: '2px solid #2563eb',
        }}
      />
      <span id={hintId} className="sr-only">
        Ctrl+Entrée pour valider, Échap pour annuler.
      </span>
    </>
  )
}
