import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { applyMove, applyResize, type Bounds, type ResizeHandle } from '../editor/geometry'
import type { SlideElement } from '../model/types'

export type GestureMode = 'move' | ResizeHandle

// Le brouillon affiché pendant le geste : le store n'est pas touché avant la fin.
export interface GesturePreview {
  elementId: string
  bounds: Bounds
}

export interface ElementGestureOptions {
  // Facteur entre l'espace logique et les pixels écran (pixels écran = logique * scale).
  scale: number
  onMove: (elementId: string, x: number, y: number) => void
  onResize: (elementId: string, bounds: Bounds) => void
}

// Tout ce qu'il faut savoir du geste en cours, figé au pointerdown sauf `bounds`.
interface ActiveGesture {
  elementId: string
  mode: GestureMode
  pointerId: number
  // Position écran du pointeur au départ.
  startX: number
  startY: number
  startBounds: Bounds
  // Dernier brouillon calculé : c'est lui qui est validé au pointerup.
  bounds: Bounds
}

// Gère un geste de déplacement ou de redimensionnement à la souris (ou au doigt).
// Pendant le geste, seul le state local `preview` change. Les callbacks (donc le store
// et son historique) ne sont appelés qu'une fois, au relâchement : un geste = une action.
export function useElementGesture({ scale, onMove, onResize }: ElementGestureOptions) {
  const [preview, setPreview] = useState<GesturePreview | null>(null)

  // Valeurs les plus récentes, lues par les écouteurs : un re-rendu pendant le geste
  // ne les perturbe pas et ne les réinstalle pas (même motif que useKeyboardShortcuts).
  const latest = useRef({ scale, onMove, onResize })
  useEffect(() => {
    latest.current = { scale, onMove, onResize }
  })

  // Geste en cours (null au repos). Une ref et pas un state : les écouteurs doivent
  // lire sa valeur à l'instant T, sans attendre un rendu.
  const gesture = useRef<ActiveGesture | null>(null)
  // Retire les écouteurs de window du geste en cours (null au repos).
  const stopListening = useRef<(() => void) | null>(null)

  // Termine le geste, validé ou non : écouteurs retirés, brouillon effacé.
  const endGesture = useCallback(() => {
    stopListening.current?.()
    stopListening.current = null
    gesture.current = null
    setPreview(null)
  }, [])

  // Si le composant disparaît en plein geste, plus aucun écouteur ne doit survivre.
  useEffect(() => {
    return () => {
      stopListening.current?.()
      stopListening.current = null
      gesture.current = null
    }
  }, [])

  const startGesture = useCallback(
    (event: ReactPointerEvent, element: SlideElement, mode: GestureMode) => {
      // Seulement le bouton principal, et jamais deux gestes en même temps.
      if (event.button !== 0 || gesture.current) return

      const startBounds: Bounds = {
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
      }
      const active: ActiveGesture = {
        elementId: element.id,
        mode,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startBounds,
        bounds: startBounds,
      }
      gesture.current = active

      // Le pointeur reste attaché à cet élément même s'il sort de sa zone.
      // Simple confort : les écouteurs sur window suffisent à suivre le geste. On
      // protège donc l'appel (absent dans jsdom, et il lève si le pointeur n'est
      // plus actif), sinon une exception laisserait le geste bloqué sans écouteurs.
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId)
      } catch {
        // Ignoré volontairement.
      }

      function handleMove(moveEvent: PointerEvent) {
        if (moveEvent.pointerId !== active.pointerId) return
        // Pixels écran vers unités logiques : on divise par l'échelle.
        const { scale: currentScale } = latest.current
        const dx = (moveEvent.clientX - active.startX) / currentScale
        const dy = (moveEvent.clientY - active.startY) / currentScale
        active.bounds =
          active.mode === 'move'
            ? applyMove(active.startBounds, dx, dy)
            : applyResize(active.startBounds, active.mode, dx, dy)
        setPreview({ elementId: active.elementId, bounds: active.bounds })
      }

      function handleUp(upEvent: PointerEvent) {
        if (upEvent.pointerId !== active.pointerId) return
        const { bounds, startBounds: from } = active
        const { onMove: move, onResize: resize } = latest.current
        // On termine d'abord : un callback qui lève ne doit pas laisser des écouteurs actifs.
        endGesture()

        const sameSpot = bounds.x === from.x && bounds.y === from.y
        const sameSize = bounds.width === from.width && bounds.height === from.height
        // Un clic sans mouvement (ou un retour au point de départ) ne change rien.
        if (sameSpot && sameSize) return
        if (active.mode === 'move') move(active.elementId, bounds.x, bounds.y)
        else resize(active.elementId, bounds)
      }

      function handleCancel(cancelEvent: PointerEvent) {
        if (cancelEvent.pointerId !== active.pointerId) return
        endGesture()
      }

      function handleKeyDown(keyEvent: KeyboardEvent) {
        if (keyEvent.key === 'Escape') endGesture()
      }

      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
      window.addEventListener('pointercancel', handleCancel)
      window.addEventListener('keydown', handleKeyDown)
      stopListening.current = () => {
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
        window.removeEventListener('pointercancel', handleCancel)
        window.removeEventListener('keydown', handleKeyDown)
      }
    },
    [endGesture],
  )

  return { preview, startGesture }
}
