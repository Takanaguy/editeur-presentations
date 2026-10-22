import { useEffect, useRef, useState } from 'react'

export interface Size {
  width: number
  height: number
}

// Taille de repli : utilisée avant la première mesure, et tout le temps là où
// ResizeObserver n'existe pas (jsdom dans les tests).
export const FALLBACK_SIZE: Size = { width: 960, height: 540 }

// Mesure la taille d'un élément et la met à jour quand il est redimensionné.
// Attacher `ref` à l'élément à mesurer.
export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState<Size>(FALLBACK_SIZE)

  useEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      // Une taille nulle (élément masqué) donnerait une échelle de 0 : on l'ignore.
      if (!rect || rect.width === 0 || rect.height === 0) return
      setSize((previous) =>
        previous.width === rect.width && previous.height === rect.height
          ? previous
          : { width: rect.width, height: rect.height },
      )
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return { ref, size }
}
