import { checkFontSrc } from '../model/fontFormats'
import type { CustomFont } from '../model/types'
import { FontImportError } from './fontFile'

// Au delà, on renonce : une police locale se décode en quelques millisecondes.
const LOAD_TIMEOUT_MS = 10_000
const LOAD_FAILED_MESSAGE = "La police n'a pas pu être chargée."

// Ensemble des polices du document, ou null si le navigateur n'a pas l'API (vieux navigateur,
// jsdom).
export function getDocumentFonts(): FontFaceSet | null {
  if (typeof document === 'undefined') return null
  return (document.fonts as FontFaceSet | undefined) ?? null
}

// Fabrique la FontFace d'une police ajoutée et la charge. C'est la VRAIE validation : le
// navigateur refuse une police corrompue ou piégée (il assainit les tables de la police).
// L'ajout à `document.fonts` est laissé à l'appelant (le hook useDocumentFonts).
export function loadFontFace(font: CustomFont): Promise<FontFace> {
  // La src est déjà validée (data URL de police en base64) ; on revérifie ici car elle est
  // collée dans un url("...") : aucun guillemet ne doit pouvoir y passer.
  if (
    typeof FontFace === 'undefined' ||
    getDocumentFonts() === null ||
    checkFontSrc(font.src) !== null
  ) {
    return Promise.reject(new FontImportError(LOAD_FAILED_MESSAGE))
  }

  return new Promise((resolve, reject) => {
    // Abandon au bout de 10 secondes (fail est défini juste dessous, avant que le minuteur ne sonne).
    const timer = setTimeout(() => fail(), LOAD_TIMEOUT_MS)
    const fail = () => {
      clearTimeout(timer)
      reject(new FontImportError(LOAD_FAILED_MESSAGE))
    }
    try {
      const face = new FontFace(font.name, `url("${font.src}")`)
      face.load().then(() => {
        clearTimeout(timer)
        resolve(face)
      }, fail)
    } catch {
      fail()
    }
  })
}
