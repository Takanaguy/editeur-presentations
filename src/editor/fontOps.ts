import { checkFontSrc } from '../model/fontFormats'
import { isReservedFontName, isSafeFontName } from '../model/fonts'
import {
  MAX_FONTS,
  MAX_FONT_FILE_MB,
  MAX_FONT_SRC_LENGTH,
  MAX_TOTAL_FONT_MB,
  MAX_TOTAL_FONT_SRC_LENGTH,
} from '../model/limits'
import type { CustomFont, Presentation } from '../model/types'
import type { EditorState } from './types'

export const FONT_COUNT_LIMIT_MESSAGE = `Limite de ${MAX_FONTS} polices atteinte.`
export const FONT_WEIGHT_LIMIT_MESSAGE = `Le poids total des polices atteint la limite de ${MAX_TOTAL_FONT_MB} Mo.`
export const FONT_NAME_TAKEN_MESSAGE = 'Une police porte déjà ce nom.'
export const FONT_NAME_RESERVED_MESSAGE = "Ce nom est celui d'une police courante."
export const FONT_NAME_INVALID_MESSAGE =
  'Le nom de la police doit être simple (lettres, chiffres, espaces, tirets).'
export const FONT_TOO_BIG_MESSAGE = `La police dépasse ${MAX_FONT_FILE_MB} Mo.`
export const FONT_INVALID_MESSAGE = "Le fichier n'est pas une police valide."

function totalFontSrcLength(presentation: Presentation): number {
  return presentation.fonts.reduce((total, font) => total + font.src.length, 0)
}

// UNE seule règle pour savoir si `font` peut être ajoutée à la présentation : le reducer s'en
// sert pour refuser, l'interface avant de dispatcher pour expliquer pourquoi.
// Retourne le message français du refus, ou null si l'ajout est permis.
export function fontBlockReason(presentation: Presentation, font: CustomFont): string | null {
  if (presentation.fonts.length >= MAX_FONTS) return FONT_COUNT_LIMIT_MESSAGE
  if (!isSafeFontName(font.name)) return FONT_NAME_INVALID_MESSAGE
  if (isReservedFontName(font.name)) return FONT_NAME_RESERVED_MESSAGE
  const lower = font.name.toLowerCase()
  if (presentation.fonts.some((existing) => existing.name.toLowerCase() === lower)) {
    return FONT_NAME_TAKEN_MESSAGE
  }
  // Longueur avant le contrôle du contenu : inutile d'analyser une chaîne démesurée.
  if (font.src.length > MAX_FONT_SRC_LENGTH) return FONT_TOO_BIG_MESSAGE
  if (checkFontSrc(font.src) !== null) return FONT_INVALID_MESSAGE
  if (totalFontSrcLength(presentation) + font.src.length > MAX_TOTAL_FONT_SRC_LENGTH) {
    return FONT_WEIGHT_LIMIT_MESSAGE
  }
  return null
}

// Même règle que slideOps : une action sans effet retourne le MÊME state.
export function addFont(state: EditorState, font: CustomFont): EditorState {
  if (fontBlockReason(state.presentation, font) !== null) return state
  return {
    ...state,
    // Objet reconstruit champ par champ : rien d'autre que name et src n'entre dans l'état.
    presentation: {
      ...state.presentation,
      fonts: [...state.presentation.fonts, { name: font.name, src: font.src }],
    },
  }
}
