import {
  detectFontFormat,
  fontDataUrl,
  fontFormatFromExtension,
  fontNameFromFileName,
} from '../model/fontFormats'
import { MAX_FONT_FILE_MB, MAX_FONT_FILE_SIZE } from '../model/limits'
import type { CustomFont } from '../model/types'

// Erreur dont le message est en français et peut être affiché tel quel à l'utilisateur.
export class FontImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FontImportError'
  }
}

const READ_ERROR_MESSAGE = 'Impossible de lire le fichier de police.'
// Longueur de la plus longue signature de format (voir FONT_FORMATS).
const SIGNATURE_LENGTH = 4

// Lit un Blob avec FileReader (repli quand Blob.arrayBuffer n'existe pas).
function readAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result)
      else reject(new FontImportError(READ_ERROR_MESSAGE))
    }
    reader.onerror = () => reject(new FontImportError(READ_ERROR_MESSAGE))
    reader.readAsArrayBuffer(blob)
  })
}

async function readSignature(file: File): Promise<Uint8Array> {
  const head = file.slice(0, SIGNATURE_LENGTH)
  try {
    const buffer =
      typeof head.arrayBuffer === 'function' ? await head.arrayBuffer() : await readAsArrayBuffer(head)
    return new Uint8Array(buffer)
  } catch (error) {
    throw error instanceof FontImportError ? error : new FontImportError(READ_ERROR_MESSAGE)
  }
}

// Partie base64 d'une data URL produite par FileReader (`data:<type>;base64,<données>`).
function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      const comma = typeof result === 'string' ? result.indexOf(',') : -1
      if (typeof result !== 'string' || comma < 0 || !result.slice(0, comma).endsWith(';base64')) {
        reject(new FontImportError(READ_ERROR_MESSAGE))
        return
      }
      resolve(result.slice(comma + 1))
    }
    reader.onerror = () => reject(new FontImportError(READ_ERROR_MESSAGE))
    reader.readAsDataURL(file)
  })
}

// Lit un fichier de police (WOFF2, WOFF, TTF, OTF) et le prépare pour la présentation.
// Le nom retourné vient du nom du fichier : c'est à l'appelant de le rendre unique.
// La validation réelle (la police est-elle lisible ?) se fait ensuite, dans le navigateur
// (loadFontFace) : ici on ne vérifie que l'extension, la taille et la signature.
export async function readFontFile(file: File): Promise<CustomFont> {
  const format = fontFormatFromExtension(file.name)
  if (format === null) {
    throw new FontImportError(
      "Le fichier n'est pas une police (formats acceptés : WOFF2, WOFF, TTF, OTF).",
    )
  }
  if (file.size > MAX_FONT_FILE_SIZE) throw new FontImportError(`La police dépasse ${MAX_FONT_FILE_MB} Mo.`)

  // La signature doit correspondre au format annoncé par l'extension : un fichier renommé
  // en .woff2 n'est pas une police WOFF2.
  const signature = await readSignature(file)
  if (detectFontFormat(signature) !== format) {
    throw new FontImportError("Le fichier n'est pas une police valide.")
  }

  const base64 = await readAsBase64(file)
  // Type MIME fixe du format : jamais le type déclaré par le système (file.type).
  return { name: fontNameFromFileName(file.name), src: fontDataUrl(format, base64) }
}
