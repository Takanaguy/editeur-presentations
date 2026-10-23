import { createSlide, createTextElement } from '../model/factories'
import type { Presentation } from '../model/types'

// Présentation de test à trois diapositives, chacune avec un texte distinct
// pour la repérer à l'écran (Alpha, Bravo, Charlie).
export function createThreeSlidePresentation(): Presentation {
  const slides = ['Alpha', 'Bravo', 'Charlie'].map((text) => ({
    ...createSlide(),
    elements: [createTextElement({ text })],
  }))
  return { version: 1, title: 'Test', slides }
}
