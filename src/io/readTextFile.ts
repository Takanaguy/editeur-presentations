// Erreur dont le message est en français et peut être affiché tel quel à l'utilisateur.
export class TextFileReadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TextFileReadError'
  }
}

const READ_FAILED = 'Impossible de lire le fichier.'

// Lit un fichier en texte UTF-8. file.text() quand le navigateur l'a, sinon FileReader.
export function readTextFile(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text().catch(() => {
      throw new TextFileReadError(READ_FAILED)
    })
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new TextFileReadError(READ_FAILED))
    }
    reader.onerror = () => reject(new TextFileReadError(READ_FAILED))
    reader.readAsText(file)
  })
}
