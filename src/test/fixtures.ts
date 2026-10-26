import { createSlide, createTextElement } from '../model/factories'
import type { Presentation } from '../model/types'

// Présentation de test à trois diapositives, chacune avec un texte distinct
// pour la repérer à l'écran (Alpha, Bravo, Charlie).
export function createThreeSlidePresentation(): Presentation {
  const slides = ['Alpha', 'Bravo', 'Charlie'].map((text) => ({
    ...createSlide(),
    elements: [createTextElement({ text })],
  }))
  return { version: 1, title: 'Test', slides, fonts: [] }
}

// Octets de signature de chaque format de police, écrits à la main (indépendants du code testé).
// Construits comme des nombres : jamais de caractère de contrôle écrit dans le fichier.
export const FONT_SIGNATURE_BYTES = {
  woff2: [0x77, 0x4f, 0x46, 0x32],
  woff: [0x77, 0x4f, 0x46, 0x46],
  ttf: [0x00, 0x01, 0x00, 0x00],
  otf: [0x4f, 0x54, 0x54, 0x4f],
} as const

export const FONT_MIMES = {
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
  otf: 'font/otf',
} as const

export type FixtureFontFormat = keyof typeof FONT_SIGNATURE_BYTES

// Contenu d'une fausse police : la signature du format puis `extra` octets quelconques.
export function fontBytes(format: FixtureFontFormat, extra = 12): Uint8Array<ArrayBuffer> {
  return new Uint8Array([...FONT_SIGNATURE_BYTES[format], ...Array.from({ length: extra }, (_, i) => i + 1)])
}

export function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

// Data URL valide d'une fausse police (signature correcte, pas une vraie police).
export function fontSrcOf(format: FixtureFontFormat = 'woff2', extra = 12): string {
  return `data:${FONT_MIMES[format]};base64,${toBase64(fontBytes(format, extra))}`
}

// Fichier de fausse police : le type déclaré est volontairement vide (le système en met
// souvent un faux ou aucun).
export function fontFileOf(fileName: string, format: FixtureFontFormat = 'woff2'): File {
  return new File([fontBytes(format)], fileName)
}
