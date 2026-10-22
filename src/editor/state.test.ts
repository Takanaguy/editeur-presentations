import { createPresentation, createSlide } from '../model/factories'
import { createInitialState } from './state'

describe('createInitialState', () => {
  it('crée une présentation par défaut avec sa première diapositive sélectionnée', () => {
    const state = createInitialState()
    expect(state.presentation.slides).toHaveLength(1)
    expect(state.selectedSlideId).toBe(state.presentation.slides[0]?.id)
    expect(state.selectedElementId).toBeNull()
  })

  it('sélectionne la première diapositive d\'une présentation donnée', () => {
    const presentation = createPresentation()
    presentation.slides.push(createSlide(), createSlide())
    const state = createInitialState(presentation)
    expect(state.presentation).toBe(presentation)
    expect(state.selectedSlideId).toBe(presentation.slides[0]?.id)
    expect(state.selectedElementId).toBeNull()
  })

  it('refuse une présentation sans diapositive', () => {
    expect(() => createInitialState({ version: 1, title: 'Vide', slides: [] })).toThrow()
  })
})
