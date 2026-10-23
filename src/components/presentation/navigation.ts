export type NavigationTarget = { type: 'go'; index: number } | { type: 'exit' }

// Traduit une touche en commande de navigation du mode présentation.
// Convention aux bornes : une touche de navigation reconnue renvoie TOUJOURS `go`, même quand
// l'index ne change pas (suivante sur la dernière, précédente sur la première). Ainsi l'appelant
// sait que la touche est gérée (preventDefault : pas de défilement de la page avec Espace)
// et ne dépasse jamais les bornes, sans rebouclage. Seule une touche inconnue renvoie null.
export function navigationTarget(
  key: string,
  shiftKey: boolean,
  index: number,
  count: number,
): NavigationTarget | null {
  const last = Math.max(count - 1, 0)
  const go = (target: number): NavigationTarget => ({
    type: 'go',
    index: Math.min(Math.max(target, 0), last),
  })

  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
    case 'PageDown':
    case 'Enter':
      return go(index + 1)
    // Maj+Espace recule, comme dans un navigateur ou un lecteur de PDF.
    case ' ':
      return go(shiftKey ? index - 1 : index + 1)
    case 'ArrowLeft':
    case 'ArrowUp':
    case 'PageUp':
    case 'Backspace':
      return go(index - 1)
    case 'Home':
      return go(0)
    case 'End':
      return go(last)
    case 'Escape':
      return { type: 'exit' }
    default:
      return null
  }
}
