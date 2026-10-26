import { createSlide, createTextElement } from '../model/factories'
import type { Presentation } from '../model/types'
import { loadPresentation, renamePresentation } from './presentationOps'
import { editorReducer } from './reducer'
import { deepFreeze, makeElementState } from './testHelpers'

function makeOther(): Presentation {
  const a = { ...createSlide(), elements: [createTextElement()] }
  const b = createSlide()
  return { version: 1, title: 'Importée', slides: [a, b], fonts: [] }
}

describe('presentation/load', () => {
  it('remplace toute la présentation, sélectionne la première diapositive, aucun élément', () => {
    const { state, text } = makeElementState()
    const selected = { ...state, selectedElementId: text.id }
    const other = makeOther()
    const next = editorReducer(selected, { type: 'presentation/load', presentation: other })
    expect(next.presentation).toBe(other)
    expect(next.selectedSlideId).toBe(other.slides[0]?.id)
    expect(next.selectedElementId).toBeNull()
  })

  it('la même référence que l\'actuelle retourne le même state', () => {
    const { state } = makeElementState()
    expect(loadPresentation(state, state.presentation)).toBe(state)
  })

  it('une présentation sans diapositive est refusée (même state)', () => {
    const { state } = makeElementState()
    const empty: Presentation = { version: 1, title: 'Vide', slides: [], fonts: [] }
    expect(loadPresentation(state, empty)).toBe(state)
  })

  it('ne modifie pas un état gelé en profondeur', () => {
    const { state } = makeElementState()
    const frozen = deepFreeze({ ...state })
    const other = deepFreeze(makeOther())
    expect(() => loadPresentation(frozen, other)).not.toThrow()
  })
})

describe('presentation/rename', () => {
  it('change le titre', () => {
    const { state } = makeElementState()
    const next = editorReducer(state, { type: 'presentation/rename', title: 'Nouveau' })
    expect(next.presentation.title).toBe('Nouveau')
    expect(next.presentation.slides).toBe(state.presentation.slides)
    expect(next.selectedSlideId).toBe(state.selectedSlideId)
  })

  it('retire les espaces autour', () => {
    const { state } = makeElementState()
    expect(renamePresentation(state, '  Mon titre \n').presentation.title).toBe('Mon titre')
  })

  it('tronque à 200 caractères', () => {
    const { state } = makeElementState()
    expect(renamePresentation(state, 'x'.repeat(300)).presentation.title).toBe('x'.repeat(200))
  })

  it('le même titre retourne le même state (aussi après trim)', () => {
    const { state } = makeElementState()
    expect(renamePresentation(state, state.presentation.title)).toBe(state)
    expect(renamePresentation(state, `  ${state.presentation.title}  `)).toBe(state)
  })

  it('accepte un titre vide tel quel', () => {
    const { state } = makeElementState()
    expect(renamePresentation(state, '   ').presentation.title).toBe('')
  })

  it('ne modifie pas un état gelé en profondeur', () => {
    const { state } = makeElementState()
    const frozen = deepFreeze({ ...state })
    expect(() => renamePresentation(frozen, 'Autre')).not.toThrow()
  })
})
