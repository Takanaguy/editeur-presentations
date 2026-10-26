import { MAX_FONT_NAME_LENGTH } from './limits'
import { BUILT_IN_FONTS, isSafeFontName } from './fonts'

// Formats de police acceptés. Le format est vérifié par la signature des premiers octets du
// fichier (jamais par son type déclaré, que le système peut fausser), et la data URL est
// reconstruite avec le type MIME fixe du format.
export type FontFormat = 'woff2' | 'woff' | 'ttf' | 'otf'

interface FontFormatInfo {
  mime: string
  // Plusieurs signatures possibles (le TrueType en a deux).
  signatures: readonly (readonly number[])[]
}

const bytesOf = (text: string) => [...text].map((char) => char.charCodeAt(0))

export const FONT_FORMATS: Readonly<Record<FontFormat, FontFormatInfo>> = {
  woff2: { mime: 'font/woff2', signatures: [bytesOf('wOF2')] },
  woff: { mime: 'font/woff', signatures: [bytesOf('wOFF')] },
  // 00 01 00 00 (TrueType classique) ou « true » (anciennes polices Apple).
  ttf: { mime: 'font/ttf', signatures: [[0x00, 0x01, 0x00, 0x00], bytesOf('true')] },
  otf: { mime: 'font/otf', signatures: [bytesOf('OTTO')] },
}

const FORMAT_NAMES = Object.keys(FONT_FORMATS) as FontFormat[]

function isFontFormat(value: string): value is FontFormat {
  return Object.hasOwn(FONT_FORMATS, value)
}

// Format annoncé par l'extension du nom de fichier (sans tenir compte de la casse), ou null.
export function fontFormatFromExtension(fileName: string): FontFormat | null {
  const dot = fileName.lastIndexOf('.')
  if (dot < 0) return null
  const extension = fileName.slice(dot + 1).toLowerCase()
  return isFontFormat(extension) ? extension : null
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return bytes.length >= signature.length && signature.every((byte, i) => bytes[i] === byte)
}

// Format réel d'après la signature des premiers octets, ou null si aucune ne correspond.
export function detectFontFormat(bytes: Uint8Array): FontFormat | null {
  return (
    FORMAT_NAMES.find((format) =>
      FONT_FORMATS[format].signatures.some((signature) => startsWith(bytes, signature)),
    ) ?? null
  )
}

// Data URL d'une police : le type MIME est celui du format, jamais celui que le système a déclaré.
export function fontDataUrl(format: FontFormat, base64: string): string {
  return `data:${FONT_FORMATS[format].mime};base64,${base64}`
}

// Base64 strict (sans espace ni retour à la ligne), avec 0 à 2 « = » de fin.
const FONT_DATA_URL_PATTERN = /^data:font\/(woff2|woff|ttf|otf);base64,([A-Za-z0-9+/]+={0,2})$/
// 12 caractères base64 donnent 9 octets : largement de quoi lire la signature (4 octets).
const SIGNATURE_BASE64_CHARS = 12

export type FontSrcProblem =
  // Ce n'est pas une data URL de police en base64 (mime interdit, caractères invalides...).
  | 'format'
  // La data URL est bien formée mais ses premiers octets ne sont pas ceux du format annoncé.
  | 'signature'

// Vérifie qu'une `src` est une data URL de police sûre : mime autorisé, base64 valide, et
// signature cohérente avec le mime. Ne contrôle PAS la longueur (limite à part, plus parlante).
// Retourne null si tout est bon.
export function checkFontSrc(src: string): FontSrcProblem | null {
  const match = FONT_DATA_URL_PATTERN.exec(src)
  const mimeName = match?.[1]
  const base64 = match?.[2]
  if (mimeName === undefined || base64 === undefined || !isFontFormat(mimeName)) return 'format'
  // Il faut au moins de quoi lire la signature.
  if (base64.length < 8) return 'format'
  let bytes: Uint8Array
  try {
    const binary = atob(base64.slice(0, SIGNATURE_BASE64_CHARS))
    bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  } catch {
    return 'format'
  }
  return detectFontFormat(bytes) === mimeName ? null : 'signature'
}

function allNamesLower(existingNames: readonly string[]): Set<string> {
  return new Set([...existingNames, ...BUILT_IN_FONTS.map((font) => font.name)].map((n) => n.toLowerCase()))
}

// Nom libre : `name` tel quel s'il n'est pas déjà pris (casse ignorée, polices de la liste
// comprises), sinon « name 2 », « name 3 »... Le résultat reste un nom sûr et assez court.
export function uniqueFontName(name: string, existingNames: readonly string[]): string {
  const taken = allNamesLower(existingNames)
  const base = isSafeFontName(name) ? name : 'Police'
  if (!taken.has(base.toLowerCase())) return base
  for (let n = 2; ; n += 1) {
    const suffix = ` ${n}`
    // On rogne la base pour laisser la place au suffixe, et on retire ce que la coupure laisse
    // en fin (espace, tiret) : le nom doit finir par une lettre ou un chiffre.
    const trimmed = base
      .slice(0, MAX_FONT_NAME_LENGTH - suffix.length)
      .replace(/[^A-Za-z0-9]+$/, '')
    const candidate = `${trimmed}${suffix}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
}

// Nom de famille proposé à partir du nom du fichier : sans dossier ni extension, seuls les
// caractères autorisés dans un nom sûr sont gardés (les autres deviennent des espaces).
export function fontNameFromFileName(fileName: string): string {
  const baseName = fileName.slice(Math.max(fileName.lastIndexOf('/'), fileName.lastIndexOf('\\')) + 1)
  const dot = baseName.lastIndexOf('.')
  const withoutExtension = dot >= 0 ? baseName.slice(0, dot) : baseName
  const cleaned = withoutExtension
    .replace(/[^A-Za-z0-9 _-]/g, ' ')
    .replace(/ {2,}/g, ' ')
    // Le nom doit commencer et finir par une lettre ou un chiffre.
    .replace(/^[^A-Za-z0-9]+/, '')
    .slice(0, MAX_FONT_NAME_LENGTH)
    .replace(/[^A-Za-z0-9]+$/, '')
  return isSafeFontName(cleaned) ? cleaned : 'Police'
}
