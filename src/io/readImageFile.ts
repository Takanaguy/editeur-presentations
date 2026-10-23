// 2 Mo : une data URL est stockée telle quelle dans la présentation, au delà
// elle alourdirait trop l'état (historique compris).
export const MAX_IMAGE_FILE_SIZE = 2 * 1024 * 1024

// Erreur dont le message est en français et peut être affiché tel quel à l'utilisateur.
export class ImageImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImageImportError'
  }
}

export function readImageFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    return Promise.reject(new ImageImportError("Le fichier n'est pas une image."))
  }
  if (file.size > MAX_IMAGE_FILE_SIZE) {
    return Promise.reject(new ImageImportError("L'image dépasse 2 Mo."))
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new ImageImportError("Impossible de lire l'image."))
    }
    reader.onerror = () => reject(new ImageImportError("Impossible de lire l'image."))
    reader.readAsDataURL(file)
  })
}
