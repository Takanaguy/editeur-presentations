import { fireEvent } from '@testing-library/react'

interface PointerInit {
  clientX?: number
  clientY?: number
  pointerId?: number
  button?: number
}

// Envoie un événement de pointeur sur n'importe quelle cible (élément ou window).
// bubbles: true pour que l'événement remonte jusqu'à window, comme dans un navigateur.
export function firePointer(
  target: Element | Window,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  { clientX = 0, clientY = 0, pointerId = 1, button = 0 }: PointerInit = {},
) {
  fireEvent(
    target,
    new PointerEvent(type, { clientX, clientY, pointerId, button, bubbles: true, cancelable: true }),
  )
}
