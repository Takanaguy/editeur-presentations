import { MAX_ALT_LENGTH } from '../model/limits'

// Accepte seulement ce qu'une balise <img> peut afficher sans risque :
// http(s) bien formé, ou une image encodée en data URL.
// Refuse javascript:, file:, le vide et le texte libre.
export function isValidImageUrl(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed === '') return false

  try {
    const url = new URL(trimmed)
    if (url.protocol === 'http:' || url.protocol === 'https:') return true
    // Pour data:, on exige un type image : data:text/html n'est pas une image.
    return url.protocol === 'data:' && /^data:image\//i.test(trimmed)
  } catch {
    return false
  }
}

// Texte alternatif tiré d'une URL : dernier segment du chemin, décodé (photo.png).
// "Image" si l'URL n'en a pas (racine du site) ou si c'est une data URL (pas de nom).
export function altFromImageUrl(value: string): string {
  const fallback = 'Image'
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return fallback
    const last = url.pathname.split('/').filter(Boolean).pop()
    if (!last) return fallback
    // Tronqué à la limite du texte alternatif, sinon l'export serait refusé à l'import.
    try {
      return decodeURIComponent(last).slice(0, MAX_ALT_LENGTH) || fallback
    } catch {
      // Séquence % mal formée : on garde le segment tel quel.
      return last.slice(0, MAX_ALT_LENGTH)
    }
  } catch {
    return fallback
  }
}
