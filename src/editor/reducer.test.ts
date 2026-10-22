import { createRectElement, createSlide, createTextElement } from '../model/factories'
import type { Slide } from '../model/types'
import { editorReducer } from './reducer'
import { deepFreeze, elementById, makeElementState, selectedElements } from './testHelpers'
import type { EditorState } from './types'

// Fabrique un état avec `count` diapositives (chacune avec un élément) et la
// diapositive d'index `selected` sélectionnée, plus son premier élément.
function makeState(count: number, selected = 0): EditorState {
  const slides: Slide[] = Array.from({ length: count }, () => {
    const slide = createSlide()
    slide.elements.push(createTextElement(), createRectElement())
    return slide
  })
  const current = slides[selected]
  if (!current) throw new Error('index de test invalide')
  return {
    presentation: { version: 1, title: 'Test', slides },
    selectedSlideId: current.id,
    selectedElementId: current.elements[0]?.id ?? null,
  }
}

function ids(state: EditorState): string[] {
  return state.presentation.slides.map((s) => s.id)
}

describe('slide/add', () => {
  it('insère une diapositive vide juste après la sélectionnée et la sélectionne', () => {
    const state = makeState(3, 0)
    const next = editorReducer(state, { type: 'slide/add' })
    const [first, added, second, third] = next.presentation.slides
    expect(next.presentation.slides).toHaveLength(4)
    expect(first?.id).toBe(ids(state)[0])
    expect(added?.elements).toEqual([])
    expect(second?.id).toBe(ids(state)[1])
    expect(third?.id).toBe(ids(state)[2])
    expect(next.selectedSlideId).toBe(added?.id)
  })

  it('insère au milieu quand la sélectionnée est au milieu', () => {
    const state = makeState(3, 1)
    const next = editorReducer(state, { type: 'slide/add' })
    expect(next.presentation.slides[2]?.id).toBe(next.selectedSlideId)
    expect(next.presentation.slides[1]?.id).toBe(ids(state)[1])
    expect(next.presentation.slides[3]?.id).toBe(ids(state)[2])
  })

  it('insère à la fin quand la sélectionnée est la dernière', () => {
    const state = makeState(3, 2)
    const next = editorReducer(state, { type: 'slide/add' })
    expect(next.presentation.slides).toHaveLength(4)
    expect(next.presentation.slides[3]?.id).toBe(next.selectedSlideId)
  })

  it('remet l\'élément sélectionné à null', () => {
    const state = makeState(2, 0)
    expect(state.selectedElementId).not.toBeNull()
    expect(editorReducer(state, { type: 'slide/add' }).selectedElementId).toBeNull()
  })
})

describe('slide/delete', () => {
  it('supprime une diapositive non sélectionnée sans toucher à la sélection', () => {
    const state = makeState(3, 0)
    const next = editorReducer(state, { type: 'slide/delete', slideId: ids(state)[2]! })
    expect(ids(next)).toEqual([ids(state)[0], ids(state)[1]])
    expect(next.selectedSlideId).toBe(state.selectedSlideId)
    expect(next.selectedElementId).toBe(state.selectedElementId)
  })

  it('sélectionne la suivante quand on supprime la sélectionnée au milieu', () => {
    const state = makeState(3, 1)
    const next = editorReducer(state, { type: 'slide/delete', slideId: ids(state)[1]! })
    expect(ids(next)).toEqual([ids(state)[0], ids(state)[2]])
    expect(next.selectedSlideId).toBe(ids(state)[2])
    expect(next.selectedElementId).toBeNull()
  })

  it('sélectionne la suivante quand on supprime la première sélectionnée', () => {
    const state = makeState(3, 0)
    const next = editorReducer(state, { type: 'slide/delete', slideId: ids(state)[0]! })
    expect(ids(next)).toEqual([ids(state)[1], ids(state)[2]])
    expect(next.selectedSlideId).toBe(ids(state)[1])
    expect(next.selectedElementId).toBeNull()
  })

  it('sélectionne la précédente quand on supprime la dernière sélectionnée', () => {
    const state = makeState(3, 2)
    const next = editorReducer(state, { type: 'slide/delete', slideId: ids(state)[2]! })
    expect(ids(next)).toEqual([ids(state)[0], ids(state)[1]])
    expect(next.selectedSlideId).toBe(ids(state)[1])
    expect(next.selectedElementId).toBeNull()
  })

  it('refuse de supprimer la dernière diapositive restante (même référence)', () => {
    const state = makeState(1)
    const next = editorReducer(state, { type: 'slide/delete', slideId: ids(state)[0]! })
    expect(next).toBe(state)
  })

  it('retourne le même état pour un id inconnu', () => {
    const state = makeState(3, 1)
    expect(editorReducer(state, { type: 'slide/delete', slideId: 'inconnu' })).toBe(state)
  })
})

describe('slide/duplicate', () => {
  it('insère la copie juste après l\'original et la sélectionne', () => {
    const state = makeState(3, 0)
    const next = editorReducer(state, { type: 'slide/duplicate', slideId: ids(state)[1]! })
    expect(next.presentation.slides).toHaveLength(4)
    expect(next.presentation.slides[1]?.id).toBe(ids(state)[1])
    expect(next.presentation.slides[2]?.id).toBe(next.selectedSlideId)
    expect(next.presentation.slides[3]?.id).toBe(ids(state)[2])
    expect(next.selectedElementId).toBeNull()
  })

  it('donne de nouveaux ids à la diapositive et à tous ses éléments', () => {
    const state = makeState(2, 0)
    const next = editorReducer(state, { type: 'slide/duplicate', slideId: ids(state)[0]! })
    const original = next.presentation.slides[0]!
    const copy = next.presentation.slides[1]!
    expect(copy.id).not.toBe(original.id)
    const allElementIds = next.presentation.slides.flatMap((s) => s.elements.map((e) => e.id))
    expect(new Set(allElementIds).size).toBe(allElementIds.length)
    const originalIds = new Set(original.elements.map((e) => e.id))
    expect(copy.elements.some((e) => originalIds.has(e.id))).toBe(false)
  })

  it('garde le même contenu hors ids', () => {
    const state = makeState(1)
    const next = editorReducer(state, { type: 'slide/duplicate', slideId: ids(state)[0]! })
    const strip = (s: Slide) => s.elements.map((e) => ({ ...e, id: undefined }))
    expect(strip(next.presentation.slides[1]!)).toEqual(strip(next.presentation.slides[0]!))
  })

  it('laisse l\'original intact', () => {
    const state = makeState(2, 0)
    const original = state.presentation.slides[0]!
    const snapshot = structuredClone(original)
    const next = editorReducer(state, { type: 'slide/duplicate', slideId: original.id })
    expect(next.presentation.slides[0]).toBe(original)
    expect(original).toEqual(snapshot)
  })

  it('retourne le même état pour un id inconnu', () => {
    const state = makeState(2)
    expect(editorReducer(state, { type: 'slide/duplicate', slideId: 'inconnu' })).toBe(state)
  })
})

describe('slide/move', () => {
  it('monte une diapositive (index - 1)', () => {
    const state = makeState(3, 0)
    const [a, b, c] = ids(state)
    const next = editorReducer(state, { type: 'slide/move', slideId: c!, toIndex: 1 })
    expect(ids(next)).toEqual([a, c, b])
  })

  it('descend une diapositive (index + 1)', () => {
    const state = makeState(3, 0)
    const [a, b, c] = ids(state)
    const next = editorReducer(state, { type: 'slide/move', slideId: a!, toIndex: 1 })
    expect(ids(next)).toEqual([b, a, c])
  })

  it('déplace vers le début', () => {
    const state = makeState(4, 0)
    const [a, b, c, d] = ids(state)
    expect(ids(editorReducer(state, { type: 'slide/move', slideId: d!, toIndex: 0 }))).toEqual([d, a, b, c])
  })

  it('déplace vers la fin', () => {
    const state = makeState(4, 0)
    const [a, b, c, d] = ids(state)
    expect(ids(editorReducer(state, { type: 'slide/move', slideId: a!, toIndex: 3 }))).toEqual([b, c, d, a])
  })

  it('borne un index hors limites', () => {
    const state = makeState(3, 0)
    const [a, b, c] = ids(state)
    expect(ids(editorReducer(state, { type: 'slide/move', slideId: b!, toIndex: 99 }))).toEqual([a, c, b])
    expect(ids(editorReducer(state, { type: 'slide/move', slideId: b!, toIndex: -5 }))).toEqual([b, a, c])
  })

  it('retourne le même état si la position ne change pas', () => {
    const state = makeState(3, 0)
    const [a, b, c] = ids(state)
    expect(editorReducer(state, { type: 'slide/move', slideId: b!, toIndex: 1 })).toBe(state)
    // Hors bornes mais déjà à l'extrémité : le bornage donne la même position.
    expect(editorReducer(state, { type: 'slide/move', slideId: c!, toIndex: 50 })).toBe(state)
    expect(editorReducer(state, { type: 'slide/move', slideId: a!, toIndex: -1 })).toBe(state)
  })

  it('retourne le même état pour un id inconnu ou un index invalide', () => {
    const state = makeState(3, 0)
    expect(editorReducer(state, { type: 'slide/move', slideId: 'inconnu', toIndex: 1 })).toBe(state)
    expect(editorReducer(state, { type: 'slide/move', slideId: ids(state)[0]!, toIndex: NaN })).toBe(state)
  })

  it('ne change pas la sélection', () => {
    const state = makeState(3, 1)
    const next = editorReducer(state, { type: 'slide/move', slideId: ids(state)[1]!, toIndex: 0 })
    expect(next.selectedSlideId).toBe(state.selectedSlideId)
    expect(next.selectedElementId).toBe(state.selectedElementId)
  })
})

describe('slide/select', () => {
  it('change de diapositive et remet l\'élément sélectionné à null', () => {
    const state = makeState(3, 0)
    expect(state.selectedElementId).not.toBeNull()
    const next = editorReducer(state, { type: 'slide/select', slideId: ids(state)[2]! })
    expect(next.selectedSlideId).toBe(ids(state)[2])
    expect(next.selectedElementId).toBeNull()
    expect(next.presentation).toBe(state.presentation)
  })

  it('retourne le même état si la diapositive est déjà sélectionnée (élément conservé)', () => {
    const state = makeState(3, 1)
    const next = editorReducer(state, { type: 'slide/select', slideId: state.selectedSlideId })
    expect(next).toBe(state)
    expect(next.selectedElementId).not.toBeNull()
  })

  it('retourne le même état pour un id inconnu', () => {
    const state = makeState(3, 1)
    expect(editorReducer(state, { type: 'slide/select', slideId: 'inconnu' })).toBe(state)
  })
})

describe('immuabilité', () => {
  it('ne modifie jamais l\'état d\'origine, gelé en profondeur', () => {
    const state = deepFreeze(makeState(3, 1))
    const [a, b, c] = ids(state)
    const snapshot = structuredClone(state)

    expect(() => {
      editorReducer(state, { type: 'slide/add' })
      editorReducer(state, { type: 'slide/delete', slideId: b! })
      editorReducer(state, { type: 'slide/delete', slideId: a! })
      editorReducer(state, { type: 'slide/duplicate', slideId: c! })
      editorReducer(state, { type: 'slide/move', slideId: a!, toIndex: 2 })
      editorReducer(state, { type: 'slide/select', slideId: c! })
    }).not.toThrow()

    expect(state).toEqual(snapshot)
  })
})

// Le détail est testé dans elementOps.test.ts : ici on vérifie l'aiguillage.
describe('aiguillage des actions d\'éléments', () => {
  it('route chaque action d\'élément vers la bonne opération', () => {
    const { state, text, rect } = makeElementState()
    const added = createRectElement({ x: 0, y: 0, width: 50, height: 50 })

    const afterAdd = editorReducer(state, { type: 'element/add', element: added })
    expect(afterAdd.selectedElementId).toBe(added.id)
    expect(selectedElements(afterAdd).at(-1)?.id).toBe(added.id)

    expect(editorReducer(state, { type: 'element/select', elementId: rect.id }).selectedElementId).toBe(
      rect.id,
    )

    const afterDelete = editorReducer(state, { type: 'element/delete', elementId: rect.id })
    expect(elementById(afterDelete, rect.id)).toBeUndefined()

    const afterMove = editorReducer(state, { type: 'element/move', elementId: text.id, x: 7, y: 8 })
    expect(elementById(afterMove, text.id)).toMatchObject({ x: 7, y: 8 })

    const bounds = { x: 1, y: 2, width: 30, height: 40 }
    const afterResize = editorReducer(state, { type: 'element/resize', elementId: text.id, bounds })
    expect(elementById(afterResize, text.id)).toMatchObject(bounds)

    const changes = { text: 'Salut' }
    const afterUpdate = editorReducer(state, { type: 'element/update', elementId: text.id, changes })
    expect(elementById(afterUpdate, text.id)).toMatchObject(changes)
  })

  it('retourne le même état pour une action d\'élément sans effet', () => {
    const { state } = makeElementState()
    expect(editorReducer(state, { type: 'element/delete', elementId: 'inconnu' })).toBe(state)
    expect(editorReducer(state, { type: 'element/select', elementId: null })).toBe(state)
  })

  it('ne modifie jamais l\'état d\'origine pour aucune action d\'élément, gelé en profondeur', () => {
    const { state, text, rect, image } = makeElementState()
    const frozen = deepFreeze({ ...state, selectedElementId: rect.id })
    const snapshot = structuredClone(frozen)

    expect(() => {
      editorReducer(frozen, { type: 'element/add', element: createTextElement() })
      editorReducer(frozen, { type: 'element/select', elementId: text.id })
      editorReducer(frozen, { type: 'element/delete', elementId: rect.id })
      editorReducer(frozen, { type: 'element/move', elementId: image.id, x: 3, y: 4 })
      editorReducer(frozen, {
        type: 'element/resize',
        elementId: image.id,
        bounds: { x: 0, y: 0, width: 80, height: 80 },
      })
      editorReducer(frozen, { type: 'element/update', elementId: text.id, changes: { text: 'Neuf' } })
    }).not.toThrow()

    expect(frozen).toEqual(snapshot)
  })

  it('les actions d\'éléments ne changent pas les références des autres diapositives', () => {
    const { state, text, second } = makeElementState()
    const next = editorReducer(state, { type: 'element/move', elementId: text.id, x: 9, y: 9 })
    expect(next.presentation.slides[1]).toBe(second)
  })
})
