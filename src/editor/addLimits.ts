import { MAX_ELEMENTS_PER_SLIDE, MAX_TOTAL_IMAGE_SRC_LENGTH } from '../model/limits'
import type { Presentation, Slide, SlideElement } from '../model/types'

const MAX_TOTAL_IMAGE_MB = MAX_TOTAL_IMAGE_SRC_LENGTH / (1024 * 1024)

export const ELEMENT_LIMIT_MESSAGE = `Limite de ${MAX_ELEMENTS_PER_SLIDE} éléments par diapositive atteinte.`
export const IMAGE_WEIGHT_LIMIT_MESSAGE = `Le poids total des images atteint la limite de ${MAX_TOTAL_IMAGE_MB} Mo.`

// Poids cumulé (en caractères) des sources d'images de toute la présentation.
function totalImageSrcLength(presentation: Presentation): number {
  let total = 0
  for (const slide of presentation.slides) {
    for (const element of slide.elements) {
      if (element.type === 'image') total += element.src.length
    }
  }
  return total
}

// UNE seule règle pour savoir si `element` peut être ajouté à `slide` (ajout ou copie) :
// le reducer s'en sert pour refuser, l'interface avant de dispatcher pour expliquer pourquoi.
// Retourne le message français du refus, ou null si l'ajout est permis.
export function addBlockReason(
  presentation: Presentation,
  slide: Slide,
  element: SlideElement,
): string | null {
  if (slide.elements.length >= MAX_ELEMENTS_PER_SLIDE) return ELEMENT_LIMIT_MESSAGE
  // Seules les images pèsent lourd : un texte ou un rectangle reste toujours permis.
  if (
    element.type === 'image' &&
    totalImageSrcLength(presentation) + element.src.length > MAX_TOTAL_IMAGE_SRC_LENGTH
  ) {
    return IMAGE_WEIGHT_LIMIT_MESSAGE
  }
  return null
}
