import type { ImageElement, RectElement, SlideElement, TextElement } from './types'

export function isTextElement(element: SlideElement): element is TextElement {
  return element.type === 'text'
}

export function isRectElement(element: SlideElement): element is RectElement {
  return element.type === 'rect'
}

export function isImageElement(element: SlideElement): element is ImageElement {
  return element.type === 'image'
}
