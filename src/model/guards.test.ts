import { createImageElement, createRectElement, createTextElement } from './factories'
import { isImageElement, isRectElement, isTextElement } from './guards'

describe('type guards', () => {
  const text = createTextElement()
  const rect = createRectElement()
  const image = createImageElement('a.png')

  it('isTextElement ne reconnaît que le texte', () => {
    expect(isTextElement(text)).toBe(true)
    expect(isTextElement(rect)).toBe(false)
    expect(isTextElement(image)).toBe(false)
  })

  it('isRectElement ne reconnaît que le rectangle', () => {
    expect(isRectElement(rect)).toBe(true)
    expect(isRectElement(text)).toBe(false)
    expect(isRectElement(image)).toBe(false)
  })

  it('isImageElement ne reconnaît que l\'image', () => {
    expect(isImageElement(image)).toBe(true)
    expect(isImageElement(text)).toBe(false)
    expect(isImageElement(rect)).toBe(false)
  })
})
