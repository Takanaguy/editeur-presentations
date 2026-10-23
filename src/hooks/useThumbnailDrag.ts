import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import { dropIndexFromPointer } from '../editor/geometry'

// Déplacement minimal (en pixels) avant que le glisser commence : en dessous, c'est un clic.
export const DRAG_THRESHOLD = 5
// Zone (en pixels) près du bord haut ou bas de la liste où elle défile pendant le glisser.
export const AUTOSCROLL_EDGE = 40
// Pixels défilés à chaque mouvement du pointeur dans cette zone.
export const AUTOSCROLL_STEP = 12
// Demi-écart de repli entre deux vignettes. Le vrai se déduit des rects de deux vignettes
// voisines ; ce repli ne sert que si on ne peut pas les mesurer.
const FALLBACK_HALF_GAP = 6

// L'état affiché pendant un glisser actif.
export interface ThumbnailDrag {
  slideId: string
  // Index d'arrivée APRÈS retrait de la diapositive traînée (le toIndex de 'slide/move').
  toIndex: number
  // Hauteur de la barre d'insertion dans le conteneur défilant (scrollTop compris),
  // ou null s'il n'y a aucune autre vignette.
  indicatorTop: number | null
}

export interface ThumbnailDragOptions {
  slideIds: string[]
  onSelect: (slideId: string) => void
  onMoveSlide: (slideId: string, toIndex: number) => void
  // Donne l'élément DOM d'une vignette (lu à chaque mouvement, jamais mis en cache).
  getItemElement: (slideId: string) => HTMLElement | null
  // Conteneur défilant de la liste (absent : pas de défilement automatique).
  scrollContainerRef: RefObject<HTMLElement | null>
}

// Tout ce qu'il faut savoir du geste en cours.
interface ActiveDrag {
  slideId: string
  pointerId: number
  startX: number
  startY: number
  // false tant que le seuil n'est pas franchi : un simple clic ne doit rien changer.
  started: boolean
}

// Gère le glisser d'une vignette pour réordonner les diapositives, aux événements de
// pointeur natifs. Pendant le geste, seul le state local `drag` change. onMoveSlide
// n'est appelé qu'au relâchement : un glisser = une action (donc une entrée d'historique).
export function useThumbnailDrag({
  slideIds,
  onSelect,
  onMoveSlide,
  getItemElement,
  scrollContainerRef,
}: ThumbnailDragOptions) {
  const [drag, setDrag] = useState<ThumbnailDrag | null>(null)

  // Valeurs les plus récentes, lues par les écouteurs : un re-rendu pendant le geste
  // ne les perturbe pas et ne les réinstalle pas (même motif que useElementGesture).
  const latest = useRef({ slideIds, onSelect, onMoveSlide, getItemElement, scrollContainerRef })
  useEffect(() => {
    latest.current = { slideIds, onSelect, onMoveSlide, getItemElement, scrollContainerRef }
  })

  // Geste en cours (null au repos) et retrait de ses écouteurs. Des refs : les écouteurs
  // lisent leur valeur à l'instant T, sans attendre un rendu.
  const gesture = useRef<ActiveDrag | null>(null)
  const stopListening = useRef<(() => void) | null>(null)
  // Retire le garde-clic posé après un vrai glisser (null quand il n'y en a pas).
  const disarmClickGuard = useRef<(() => void) | null>(null)

  const endGesture = useCallback(() => {
    stopListening.current?.()
    stopListening.current = null
    gesture.current = null
    setDrag(null)
  }, [])

  // Après un vrai glisser, le navigateur envoie encore un `click` : sans garde, il
  // re-sélectionnerait la vignette. Un écouteur en capture sur window l'avale, puis
  // se retire. Le setTimeout le retire aussi si aucun clic ne vient (relâché ailleurs),
  // pour ne pas avaler un clic légitime plus tard.
  const armClickGuard = useCallback(() => {
    disarmClickGuard.current?.()
    const swallow = (event: MouseEvent) => {
      event.stopPropagation()
      event.preventDefault()
      disarmClickGuard.current?.()
    }
    window.addEventListener('click', swallow, true)
    const timer = setTimeout(() => disarmClickGuard.current?.(), 0)
    disarmClickGuard.current = () => {
      window.removeEventListener('click', swallow, true)
      clearTimeout(timer)
      disarmClickGuard.current = null
    }
  }, [])

  // Si le composant disparaît en plein geste, plus aucun écouteur ne doit survivre.
  useEffect(() => {
    return () => {
      stopListening.current?.()
      stopListening.current = null
      gesture.current = null
      disarmClickGuard.current?.()
    }
  }, [])

  const startDrag = useCallback(
    (event: ReactPointerEvent, slideId: string) => {
      // Bouton principal seulement. Le tactile garde le défilement de la liste (les
      // boutons Monter et Descendre servent). Jamais deux gestes en même temps.
      if (event.button !== 0 || event.pointerType === 'touch' || gesture.current) return

      const active: ActiveDrag = {
        slideId,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        started: false,
      }
      gesture.current = active

      // Fait défiler la liste si le pointeur est près d'un bord. Le conteneur peut manquer.
      function autoScroll(pointerY: number) {
        const container = latest.current.scrollContainerRef.current
        if (!container) return
        const rect = container.getBoundingClientRect()
        if (pointerY < rect.top + AUTOSCROLL_EDGE) container.scrollTop -= AUTOSCROLL_STEP
        else if (pointerY > rect.bottom - AUTOSCROLL_EDGE) container.scrollTop += AUTOSCROLL_STEP
      }

      // Lit la disposition au moment du mouvement : la liste a pu défiler ou changer.
      function computeDrop(pointerY: number) {
        const { slideIds: ids, getItemElement: getElement, scrollContainerRef: containerRef } =
          latest.current
        // Rects de TOUTES les vignettes, dans l'ordre (undefined si l'élément manque).
        const all = ids.map((id) => getElement(id)?.getBoundingClientRect())

        // Demi-écart mesuré entre deux vignettes voisines de la liste complète (la
        // traînée comprise : sinon l'écart entre deux « autres » l'inclurait).
        let halfGap = FALLBACK_HALF_GAP
        for (let i = 0; i < all.length - 1; i++) {
          const upper = all[i]
          const lower = all[i + 1]
          if (upper && lower) {
            halfGap = Math.max(0, (lower.top - upper.bottom) / 2)
            break
          }
        }

        // Les AUTRES vignettes seulement : ce sont elles qui définissent l'index d'arrivée.
        const rects: DOMRect[] = []
        ids.forEach((id, i) => {
          const rect = all[i]
          if (id !== active.slideId && rect) rects.push(rect)
        })
        const toIndex = dropIndexFromPointer(
          rects.map((rect) => rect.top + rect.height / 2),
          pointerY,
        )

        // Hauteur de la barre : entre les deux voisines, ou dans le vide aux extrémités.
        const before = rects[toIndex - 1]
        const after = rects[toIndex]
        let boundary: number | null = null
        if (before && after) boundary = (before.bottom + after.top) / 2
        else if (after) boundary = after.top - halfGap
        else if (before) boundary = before.bottom + halfGap

        const container = containerRef.current
        const indicatorTop =
          boundary === null
            ? null
            : container
              ? boundary - container.getBoundingClientRect().top + container.scrollTop
              : boundary
        return { toIndex, indicatorTop }
      }

      function handleMove(moveEvent: PointerEvent) {
        if (moveEvent.pointerId !== active.pointerId) return
        // Plus aucun bouton enfoncé : le pointerup s'est perdu (alt-tab, relâché hors de
        // la page). On abandonne sans rien valider, sinon le geste resterait bloqué.
        if (moveEvent.buttons === 0) {
          endGesture()
          return
        }
        if (!active.started) {
          const distance = Math.hypot(
            moveEvent.clientX - active.startX,
            moveEvent.clientY - active.startY,
          )
          if (distance < DRAG_THRESHOLD) return
          active.started = true
          // Comme dans PowerPoint : la diapositive traînée devient la sélection.
          latest.current.onSelect(active.slideId)
        }

        // On défile d'abord : la position d'insertion se calcule sur la liste décalée.
        autoScroll(moveEvent.clientY)
        const { toIndex, indicatorTop } = computeDrop(moveEvent.clientY)
        setDrag((previous) =>
          previous &&
          previous.slideId === active.slideId &&
          previous.toIndex === toIndex &&
          previous.indicatorTop === indicatorTop
            ? previous
            : { slideId: active.slideId, toIndex, indicatorTop },
        )
      }

      function handleUp(upEvent: PointerEvent) {
        if (upEvent.pointerId !== active.pointerId) return
        const { started, slideId: draggedId } = active
        const { slideIds: ids, onMoveSlide: move } = latest.current
        // On recalcule à la position de relâchement : la liste a pu changer sans mouvement
        // (Ctrl+Z, Suppr), l'index du dernier mouvement serait alors périmé. À lire avant
        // endGesture, qui efface le geste.
        const toIndex = started ? computeDrop(upEvent.clientY).toIndex : -1
        // On termine d'abord : un callback qui lève ne doit pas laisser des écouteurs actifs.
        endGesture()

        // Jamais passé le seuil : c'est un clic, le clic de sélection habituel s'exécute.
        if (!started) return
        armClickGuard()
        const currentIndex = ids.indexOf(draggedId)
        // Revenir à sa place de départ avant de relâcher ne change rien.
        if (currentIndex === -1 || toIndex === currentIndex) return
        move(draggedId, toIndex)
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
      // La fenêtre perd le focus en plein geste : le pointerup n'arrivera peut-être jamais.
      window.addEventListener('blur', endGesture)
      stopListening.current = () => {
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
        window.removeEventListener('pointercancel', handleCancel)
        window.removeEventListener('keydown', handleKeyDown)
        window.removeEventListener('blur', endGesture)
      }
    },
    [endGesture, armClickGuard],
  )

  return { drag, startDrag }
}
