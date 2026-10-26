// Délai avant de libérer l'adresse du Blob : le navigateur a démarré le téléchargement
// pendant le clic, mais certains lisent le Blob un peu après. Libérer tout de suite
// pourrait annuler le fichier.
const REVOKE_DELAY_MS = 1000

// Déclenche le téléchargement d'un Blob : adresse temporaire, lien invisible, clic.
// Ne plante jamais : retourne false si le navigateur n'a pas pu lancer le téléchargement,
// pour que l'appelant n'annonce pas un export réussi à tort.
export function downloadBlob(fileName: string, blob: Blob): boolean {
  let url: string | null = null
  try {
    url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.hidden = true
    // Dans le document pour que le clic fonctionne partout (Firefox), retiré aussitôt.
    document.body.append(link)
    try {
      link.click()
    } finally {
      link.remove()
    }
    return true
  } catch {
    return false
  } finally {
    const created = url
    if (created !== null) setTimeout(() => URL.revokeObjectURL(created), REVOKE_DELAY_MS)
  }
}

// Téléchargement d'un fichier texte : un Blob de ce texte.
export function downloadTextFile(
  fileName: string,
  text: string,
  mimeType = 'application/json',
): boolean {
  try {
    return downloadBlob(fileName, new Blob([text], { type: mimeType }))
  } catch {
    return false
  }
}
