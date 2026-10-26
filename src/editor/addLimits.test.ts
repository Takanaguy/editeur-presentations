import { createImageElement, createRectElement, createSlide, createTextElement } from '../model/factories'
import { MAX_ELEMENTS_PER_SLIDE, MAX_TOTAL_IMAGE_SRC_LENGTH } from '../model/limits'
import type { Presentation, Slide } from '../model/types'
import {
  ELEMENT_LIMIT_MESSAGE,
  IMAGE_WEIGHT_LIMIT_MESSAGE,
  addBlockReason,
} from './addLimits'

// Image dont la source fait exactement `length` caractères.
function imageOfLength(length: number) {
  return createImageElement('data:image/png;base64,' + 'A'.repeat(length - 22))
}

function presentationOf(...slides: Slide[]): Presentation {
  return { version: 1, title: 'Test', slides, fonts: [] }
}

describe('addBlockReason', () => {
  it('les messages sont ceux attendus', () => {
    expect(ELEMENT_LIMIT_MESSAGE).toBe('Limite de 500 éléments par diapositive atteinte.')
    expect(IMAGE_WEIGHT_LIMIT_MESSAGE).toBe('Le poids total des images atteint la limite de 15 Mo.')
  })

  it('retourne null pour un ajout permis', () => {
    const slide = createSlide()
    expect(addBlockReason(presentationOf(slide), slide, createTextElement())).toBeNull()
  })

  it('refuse un ajout quand la diapositive a déjà 500 éléments', () => {
    const slide = createSlide()
    slide.elements = Array.from({ length: MAX_ELEMENTS_PER_SLIDE }, () => createRectElement())
    expect(addBlockReason(presentationOf(slide), slide, createTextElement())).toBe(ELEMENT_LIMIT_MESSAGE)
  })

  it('accepte le 500e élément', () => {
    const slide = createSlide()
    slide.elements = Array.from({ length: MAX_ELEMENTS_PER_SLIDE - 1 }, () => createRectElement())
    expect(addBlockReason(presentationOf(slide), slide, createTextElement())).toBeNull()
  })

  it('compte les images de TOUTES les diapositives', () => {
    const a = createSlide()
    const b = createSlide()
    a.elements = [imageOfLength(MAX_TOTAL_IMAGE_SRC_LENGTH - 100)]
    expect(addBlockReason(presentationOf(a, b), b, imageOfLength(101))).toBe(IMAGE_WEIGHT_LIMIT_MESSAGE)
  })

  it('accepte une image qui atteint exactement la limite, refuse un caractère de plus', () => {
    const a = createSlide()
    const b = createSlide()
    a.elements = [imageOfLength(MAX_TOTAL_IMAGE_SRC_LENGTH - 100)]
    expect(addBlockReason(presentationOf(a, b), b, imageOfLength(100))).toBeNull()
    expect(addBlockReason(presentationOf(a, b), b, imageOfLength(101))).not.toBeNull()
  })

  it('ne refuse jamais un texte ou un rectangle à cause du poids des images', () => {
    const slide = createSlide()
    slide.elements = [imageOfLength(MAX_TOTAL_IMAGE_SRC_LENGTH)]
    const presentation = presentationOf(slide)
    expect(addBlockReason(presentation, slide, createTextElement())).toBeNull()
    expect(addBlockReason(presentation, slide, createRectElement())).toBeNull()
  })

  it('la limite d\'éléments passe avant celle du poids', () => {
    const slide = createSlide()
    slide.elements = Array.from({ length: MAX_ELEMENTS_PER_SLIDE }, () => createRectElement())
    slide.elements[0] = imageOfLength(MAX_TOTAL_IMAGE_SRC_LENGTH)
    expect(addBlockReason(presentationOf(slide), slide, imageOfLength(100))).toBe(ELEMENT_LIMIT_MESSAGE)
  })
})
