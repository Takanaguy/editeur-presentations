import {
  createImageElement,
  createPresentation,
  createRectElement,
  createSlide,
  createTextElement,
} from './factories'
import { SLIDE_HEIGHT, SLIDE_WIDTH, type BaseElement } from './types'

function expectCenteredInSlide(el: BaseElement) {
  expect(el.x).toBeGreaterThanOrEqual(0)
  expect(el.y).toBeGreaterThanOrEqual(0)
  expect(el.x + el.width).toBeLessThanOrEqual(SLIDE_WIDTH)
  expect(el.y + el.height).toBeLessThanOrEqual(SLIDE_HEIGHT)
  expect(el.x + el.width / 2).toBe(SLIDE_WIDTH / 2)
  expect(el.y + el.height / 2).toBe(SLIDE_HEIGHT / 2)
}

describe('createSlide', () => {
  it('crée une diapositive vide avec un id', () => {
    const slide = createSlide()
    expect(slide.id).toBeTruthy()
    expect(slide.elements).toEqual([])
  })

  it('génère un id différent à chaque appel', () => {
    expect(createSlide().id).not.toBe(createSlide().id)
  })
})

describe('createPresentation', () => {
  it('a une seule diapositive vide et la version 1', () => {
    const p = createPresentation()
    expect(p.version).toBe(1)
    expect(p.slides).toHaveLength(1)
    expect(p.slides[0]?.elements).toEqual([])
  })

  it('utilise le titre par défaut puis le titre donné', () => {
    expect(createPresentation().title).toBe('Sans titre')
    expect(createPresentation('Mon exposé').title).toBe('Mon exposé')
  })
})

describe('createTextElement', () => {
  it('applique les valeurs par défaut', () => {
    const el = createTextElement()
    expect(el).toMatchObject({
      type: 'text',
      text: 'Texte',
      fontSize: 48,
      color: '#1c2530',
      fill: null,
      width: 600,
      height: 120,
    })
    expectCenteredInSlide(el)
  })

  it('applique les overrides', () => {
    const el = createTextElement({ text: 'Bonjour', fontSize: 20, fill: '#fff', x: 10 })
    expect(el).toMatchObject({ text: 'Bonjour', fontSize: 20, fill: '#fff', x: 10 })
  })

  it('ne laisse pas écraser id ni type, même sans le typage', () => {
    const el = createTextElement({ id: 'pirate', type: 'rect' } as never)
    expect(el.id).not.toBe('pirate')
    expect(el.type).toBe('text')
  })

  it('génère un id différent à chaque appel', () => {
    expect(createTextElement().id).not.toBe(createTextElement().id)
  })
})

describe('createRectElement', () => {
  it('applique les valeurs par défaut', () => {
    const el = createRectElement()
    expect(el).toMatchObject({ type: 'rect', fill: '#2e5d7c', width: 400, height: 240 })
    expectCenteredInSlide(el)
  })

  it('applique les overrides', () => {
    const el = createRectElement({ fill: '#000', width: 100, height: 50 })
    expect(el).toMatchObject({ fill: '#000', width: 100, height: 50 })
  })

  it('ne laisse pas écraser id ni type, même sans le typage', () => {
    const el = createRectElement({ id: 'pirate', type: 'text' } as never)
    expect(el.id).not.toBe('pirate')
    expect(el.type).toBe('rect')
  })

  it('génère un id différent à chaque appel', () => {
    expect(createRectElement().id).not.toBe(createRectElement().id)
  })
})

describe('createImageElement', () => {
  it('applique les valeurs par défaut', () => {
    const el = createImageElement('data:image/png;base64,AAAA')
    expect(el).toMatchObject({
      type: 'image',
      src: 'data:image/png;base64,AAAA',
      alt: '',
      width: 480,
      height: 270,
    })
    expectCenteredInSlide(el)
  })

  it('applique les overrides', () => {
    const el = createImageElement('a.png', { alt: 'Un chat', y: 0 })
    expect(el).toMatchObject({ src: 'a.png', alt: 'Un chat', y: 0 })
  })

  it('ne laisse pas écraser id, type ni src, même sans le typage', () => {
    const el = createImageElement('a.png', { id: 'pirate', type: 'text', src: 'b.png' } as never)
    expect(el.id).not.toBe('pirate')
    expect(el.type).toBe('image')
    expect(el.src).toBe('a.png')
  })

  it('génère un id différent à chaque appel', () => {
    expect(createImageElement('a.png').id).not.toBe(createImageElement('a.png').id)
  })
})
