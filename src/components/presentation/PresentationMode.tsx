import { useEffect, useRef, useState } from 'react'
import { useElementSize } from '../../hooks/useElementSize'
import { SLIDE_HEIGHT, SLIDE_WIDTH, type Slide } from '../../model/types'
import { SlideView } from '../canvas/SlideView'
import { navigationTarget } from './navigation'

interface PresentationModeProps {
  slides: Slide[]
  // Lu une seule fois, au montage : changer cette prop ensuite ne déplace pas la présentation.
  startIndex: number
  onExit: () => void
}

// Délai avant la première annonce : une zone aria-live déjà remplie au montage n'est pas lue.
const ANNOUNCE_DELAY_MS = 100

// Quitte le plein écran en ignorant toute erreur (API absente, refus, page en arrière-plan).
function leaveFullscreen() {
  try {
    Promise.resolve(document.exitFullscreen?.()).catch(() => {})
  } catch {
    // Rien à faire : le mode reste simplement tel quel.
  }
}

// Présentationnel : ne lit pas le store et ne modifie jamais la présentation.
export function PresentationMode({ slides, startIndex, onExit }: PresentationModeProps) {
  const count = slides.length
  const lastIndex = Math.max(count - 1, 0)
  const [index, setIndex] = useState(() => Math.min(Math.max(startIndex, 0), lastIndex))
  // Vide au premier rendu, rempli juste après : voir ANNOUNCE_DELAY_MS.
  const [announced, setAnnounced] = useState(false)
  // On mesure le conteneur plein écran lui-même : il sert aussi au focus et au plein écran.
  const { ref: containerRef, size } = useElementSize<HTMLDivElement>()
  const scale = Math.min(size.width / SLIDE_WIDTH, size.height / SLIDE_HEIGHT)

  // Si des diapositives disparaissent, l'index retombe sur la dernière (ajustement pendant
  // le rendu, sans effet) : sinon l'état garderait une valeur hors bornes.
  const safeIndex = Math.min(index, lastIndex)
  if (index !== safeIndex) setIndex(safeIndex)

  // Valeurs lues par les écouteurs, installés une seule fois, sans les réinstaller à chaque rendu.
  const indexRef = useRef(safeIndex)
  const countRef = useRef(count)
  const onExitRef = useRef(onExit)
  useEffect(() => {
    countRef.current = count
    onExitRef.current = onExit
    // Resynchronise l'index lu par les écouteurs seulement s'il dépasse (pas à chaque rendu :
    // on écraserait un index plus récent écrit par goTo avant ce rendu).
    if (indexRef.current > lastIndex) indexRef.current = lastIndex
  })
  // Vrai dès que le navigateur nous a mis en plein écran : sans cela, un fullscreenchange
  // (null au départ ou après un refus) ne signifierait pas que l'utilisateur a quitté.
  const enteredFullscreen = useRef(false)
  // Faux une fois démonté : permet de défaire un plein écran obtenu après la fermeture.
  const mounted = useRef(false)

  // Index courant, toujours dans les bornes même si le nombre de diapositives a baissé.
  function currentIndex() {
    return Math.max(Math.min(indexRef.current, countRef.current - 1), 0)
  }

  // On écrit aussi indexRef ici : deux touches rapprochées lisent ainsi le bon index
  // sans attendre le prochain rendu.
  function goTo(target: number) {
    indexRef.current = target
    setIndex(target)
    // Dès qu'on navigue, l'annonce est affichée sans attendre le délai.
    setAnnounced(true)
  }

  useEffect(() => {
    const timer = setTimeout(() => setAnnounced(true), ANNOUNCE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const container = containerRef.current
    mounted.current = true

    // Le focus au conteneur évite qu'Espace "clique" sur le bouton Présenter resté focalisé.
    container?.focus()

    // Le plein écran peut être absent (jsdom, vieux Safari) ou refusé : le mode reste
    // alors un plein fenêtre fonctionnel, donc aucune erreur ne doit remonter.
    try {
      const request = container?.requestFullscreen?.()
      if (typeof request?.then === 'function') {
        request.then(
          () => {
            if (mounted.current) {
              enteredFullscreen.current = true
            } else if (container && document.fullscreenElement === container) {
              // Fermé avant la réponse du navigateur : le plein écran arrive trop tard, on le défait.
              // (On teste mounted et pas un drapeau propre à l'exécution de l'effet : en
              // StrictMode, le premier montage est annulé puis refait sur le même conteneur.)
              leaveFullscreen()
            }
          },
          () => {},
        )
      }
    } catch {
      // Refus synchrone : on reste en plein fenêtre.
    }

    function handleKeyDown(event: KeyboardEvent) {
      // Ctrl, Alt, Meta : combinaison du navigateur ou du système, on n'y touche pas.
      if (event.ctrlKey || event.altKey || event.metaKey) return
      const target = navigationTarget(event.key, event.shiftKey, currentIndex(), countRef.current)
      if (!target) return
      // Évite le défilement de la page et le clic sur un bouton avec Espace ou Entrée.
      event.preventDefault()
      // Entrée maintenue (par exemple après avoir ouvert la présentation avec Entrée) répète
      // la touche : on ne la laisse pas faire défiler. Espace et les flèches, elles, se répètent.
      if (event.repeat && event.key === 'Enter') return
      if (target.type === 'exit') onExitRef.current()
      else goTo(target.index)
    }

    // En plein écran, le navigateur consomme Échap : on ne reçoit pas toujours le keydown,
    // mais seulement ce changement.
    function handleFullscreenChange() {
      if (document.fullscreenElement) {
        enteredFullscreen.current = true
      } else if (enteredFullscreen.current) {
        enteredFullscreen.current = false
        onExitRef.current()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      mounted.current = false
      window.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      // Fermé autrement que par le navigateur (Échap sans plein écran, bouton) : on le quitte.
      if (document.fullscreenElement) leaveFullscreen()
    }
    // Effet de montage uniquement : containerRef est un ref stable, et goTo et currentIndex
    // n'utilisent que des setters et des refs. Les inclure réinstallerait les écouteurs à
    // chaque rendu, alors qu'ils lisent déjà les dernières valeurs via les refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const slide = slides[safeIndex]
  const label = `Diapositive ${safeIndex + 1} sur ${count}`

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Mode présentation"
      tabIndex={-1}
      // Clic gauche : diapositive suivante (onClick ne couvre que le bouton principal).
      onClick={() => {
        const target = navigationTarget('ArrowRight', false, currentIndex(), count)
        if (target?.type === 'go') goTo(target.index)
      }}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black outline-none select-none print:hidden"
    >
      {slide && <SlideView slide={slide} scale={scale} />}
      <p aria-live="polite" className="sr-only">
        {announced ? label : ''}
      </p>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-4 bottom-3 text-sm text-white/80"
      >
        {safeIndex + 1} / {count}
      </span>
    </div>
  )
}
