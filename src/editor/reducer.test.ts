import {
  createImageElement,
  createRectElement,
  createSlide,
  createTextElement,
} from '../model/factories'
import {
  MAX_ALT_LENGTH,
  MAX_ELEMENTS_PER_SLIDE,
  MAX_SLIDES,
  MAX_TEXT_LENGTH,
  MAX_TOTAL_IMAGE_SRC_LENGTH,
} from '../model/limits'
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

    const afterDuplicate = editorReducer(state, { type: 'element/duplicate', elementId: text.id })
    expect(selectedElements(afterDuplicate)).toHaveLength(selectedElements(state).length + 1)
    expect(afterDuplicate.selectedElementId).toBe(selectedElements(afterDuplicate).at(-1)?.id)

    const afterReorder = editorReducer(state, { type: 'element/reorder', elementId: text.id, to: 'front' })
    expect(selectedElements(afterReorder).at(-1)?.id).toBe(text.id)
  })

  it('retourne le même état pour une action d\'élément sans effet', () => {
    const { state } = makeElementState()
    expect(editorReducer(state, { type: 'element/delete', elementId: 'inconnu' })).toBe(state)
    expect(editorReducer(state, { type: 'element/duplicate', elementId: 'inconnu' })).toBe(state)
    expect(editorReducer(state, { type: 'element/select', elementId: null })).toBe(state)
    const last = selectedElements(state).at(-1)
    expect(editorReducer(state, { type: 'element/reorder', elementId: last?.id ?? '', to: 'front' })).toBe(state)
  })

  it('ne modifie jamais l\'état d\'origine pour aucune action d\'élément, gelé en profondeur', () => {
    const { state, text, rect, image } = makeElementState()
    const frozen = deepFreeze({ ...state, selectedElementId: rect.id })
    const snapshot = structuredClone(frozen)

    expect(() => {
      editorReducer(frozen, { type: 'element/add', element: createTextElement() })
      editorReducer(frozen, { type: 'element/select', elementId: text.id })
      editorReducer(frozen, { type: 'element/delete', elementId: rect.id })
      editorReducer(frozen, { type: 'element/duplicate', elementId: rect.id })
      editorReducer(frozen, { type: 'element/move', elementId: image.id, x: 3, y: 4 })
      editorReducer(frozen, {
        type: 'element/resize',
        elementId: image.id,
        bounds: { x: 0, y: 0, width: 80, height: 80 },
      })
      editorReducer(frozen, { type: 'element/update', elementId: text.id, changes: { text: 'Neuf' } })
      editorReducer(frozen, { type: 'element/reorder', elementId: text.id, to: 'back' })
      editorReducer(frozen, { type: 'element/reorder', elementId: text.id, to: 'front' })
    }).not.toThrow()

    expect(frozen).toEqual(snapshot)
  })

  it('les actions d\'éléments ne changent pas les références des autres diapositives', () => {
    const { state, text, second } = makeElementState()
    const next = editorReducer(state, { type: 'element/move', elementId: text.id, x: 9, y: 9 })
    expect(next.presentation.slides[1]).toBe(second)
  })
})

describe('aiguillage des actions de présentation', () => {
  it('presentation/load remplace tout et sélectionne la première diapositive', () => {
    const { state } = makeElementState()
    const presentation = { version: 1 as const, title: 'Autre', slides: [createSlide(), createSlide()] }
    const next = editorReducer(state, { type: 'presentation/load', presentation })
    expect(next.presentation).toBe(presentation)
    expect(next.selectedSlideId).toBe(presentation.slides[0]?.id)
    expect(next.selectedElementId).toBeNull()
  })

  it('presentation/load avec la même référence ou sans diapositive : même state', () => {
    const { state } = makeElementState()
    expect(editorReducer(state, { type: 'presentation/load', presentation: state.presentation })).toBe(state)
    const empty = { version: 1 as const, title: 'Vide', slides: [] }
    expect(editorReducer(state, { type: 'presentation/load', presentation: empty })).toBe(state)
  })

  it('presentation/rename change le titre, et le même titre ne change rien', () => {
    const { state } = makeElementState()
    const next = editorReducer(state, { type: 'presentation/rename', title: ' Neuf ' })
    expect(next.presentation.title).toBe('Neuf')
    expect(editorReducer(next, { type: 'presentation/rename', title: 'Neuf' })).toBe(next)
  })

  it('ne modifie pas un état gelé en profondeur', () => {
    const { state } = makeElementState()
    const frozen = deepFreeze({ ...state })
    const presentation = deepFreeze({ version: 1 as const, title: 'A', slides: [createSlide()] })
    expect(() => {
      editorReducer(frozen, { type: 'presentation/load', presentation })
      editorReducer(frozen, { type: 'presentation/rename', title: 'B' })
    }).not.toThrow()
  })
})

describe('limites partagées avec l\'import de fichier', () => {
  function stateWithSlides(count: number): EditorState {
    const slides: Slide[] = Array.from({ length: count }, () => createSlide())
    const first = slides[0]
    if (!first) throw new Error('au moins une diapositive')
    return {
      presentation: { version: 1, title: 'Test', slides },
      selectedSlideId: first.id,
      selectedElementId: null,
    }
  }

  function stateWithElements(count: number): EditorState {
    const slide = createSlide()
    slide.elements = Array.from({ length: count }, () => createRectElement())
    return {
      presentation: { version: 1, title: 'Test', slides: [slide] },
      selectedSlideId: slide.id,
      selectedElementId: null,
    }
  }

  it(`slide/add : accepté à ${MAX_SLIDES - 1} diapositives, refusé à ${MAX_SLIDES}`, () => {
    const below = stateWithSlides(MAX_SLIDES - 1)
    expect(editorReducer(below, { type: 'slide/add' }).presentation.slides).toHaveLength(MAX_SLIDES)
    const full = stateWithSlides(MAX_SLIDES)
    expect(editorReducer(full, { type: 'slide/add' })).toBe(full)
  })

  it(`slide/duplicate : accepté à ${MAX_SLIDES - 1} diapositives, refusé à ${MAX_SLIDES}`, () => {
    const below = stateWithSlides(MAX_SLIDES - 1)
    const id = below.selectedSlideId
    expect(
      editorReducer(below, { type: 'slide/duplicate', slideId: id }).presentation.slides,
    ).toHaveLength(MAX_SLIDES)
    const full = stateWithSlides(MAX_SLIDES)
    expect(editorReducer(full, { type: 'slide/duplicate', slideId: full.selectedSlideId })).toBe(full)
  })

  it(`element/add : accepté à ${MAX_ELEMENTS_PER_SLIDE - 1} éléments, refusé à ${MAX_ELEMENTS_PER_SLIDE}`, () => {
    const below = stateWithElements(MAX_ELEMENTS_PER_SLIDE - 1)
    expect(selectedElements(editorReducer(below, { type: 'element/add', element: createTextElement() }))).toHaveLength(
      MAX_ELEMENTS_PER_SLIDE,
    )
    const full = stateWithElements(MAX_ELEMENTS_PER_SLIDE)
    expect(editorReducer(full, { type: 'element/add', element: createTextElement() })).toBe(full)
  })

  it('element/duplicate : refusé à la limite, accepté juste en dessous', () => {
    const below = stateWithElements(MAX_ELEMENTS_PER_SLIDE - 1)
    const target = selectedElements(below)[0]!.id
    expect(
      selectedElements(editorReducer(below, { type: 'element/duplicate', elementId: target })),
    ).toHaveLength(MAX_ELEMENTS_PER_SLIDE)
    const full = stateWithElements(MAX_ELEMENTS_PER_SLIDE)
    const fullTarget = selectedElements(full)[0]!.id
    expect(editorReducer(full, { type: 'element/duplicate', elementId: fullTarget })).toBe(full)
  })

  it('la limite d\'éléments vaut par diapositive : une autre diapositive reste libre', () => {
    const full = stateWithElements(MAX_ELEMENTS_PER_SLIDE)
    const other = createSlide()
    const state: EditorState = {
      ...full,
      presentation: { ...full.presentation, slides: [...full.presentation.slides, other] },
    }
    const onOther = editorReducer(state, { type: 'slide/select', slideId: other.id })
    expect(selectedElements(editorReducer(onOther, { type: 'element/add', element: createTextElement() }))).toHaveLength(1)
  })

  it('element/update tronque le texte à la limite', () => {
    const { state, text } = makeElementState()
    const next = editorReducer(state, {
      type: 'element/update',
      elementId: text.id,
      changes: { text: 'a'.repeat(MAX_TEXT_LENGTH + 50) },
    })
    expect(elementById(next, text.id)).toHaveProperty('text', 'a'.repeat(MAX_TEXT_LENGTH))
  })

  it('element/update tronque le texte alternatif à la limite', () => {
    const { state, image } = makeElementState()
    const next = editorReducer(state, {
      type: 'element/update',
      elementId: image.id,
      changes: { alt: 'b'.repeat(MAX_ALT_LENGTH + 1) },
    })
    expect(elementById(next, image.id)).toHaveProperty('alt', 'b'.repeat(MAX_ALT_LENGTH))
  })

  it('element/update : un texte déjà tronqué à la limite et identique ne change rien (même state)', () => {
    const { state, text } = makeElementState()
    const full = editorReducer(state, {
      type: 'element/update',
      elementId: text.id,
      changes: { text: 'a'.repeat(MAX_TEXT_LENGTH) },
    })
    const again = editorReducer(full, {
      type: 'element/update',
      elementId: text.id,
      changes: { text: 'a'.repeat(MAX_TEXT_LENGTH + 10) },
    })
    expect(again).toBe(full)
  })
})

describe('poids total des images', () => {
  // Image dont la source fait exactement `length` caractères.
  const imageOfLength = (length: number) =>
    createImageElement('data:image/png;base64,' + 'A'.repeat(length - 22))

  function stateWithImageBudgetLeft(margin: number): EditorState {
    const slide = createSlide()
    slide.elements = [imageOfLength(MAX_TOTAL_IMAGE_SRC_LENGTH - margin)]
    return {
      presentation: { version: 1, title: 'Test', slides: [slide] },
      selectedSlideId: slide.id,
      selectedElementId: null,
    }
  }

  it('element/add refuse une image qui ferait dépasser le cumul (même state)', () => {
    const state = stateWithImageBudgetLeft(100)
    expect(editorReducer(state, { type: 'element/add', element: imageOfLength(101) })).toBe(state)
  })

  it('element/add accepte une image qui tient exactement dans le budget', () => {
    const state = stateWithImageBudgetLeft(100)
    const next = editorReducer(state, { type: 'element/add', element: imageOfLength(100) })
    expect(selectedElements(next)).toHaveLength(2)
  })

  it('element/add accepte quand même un texte et un rectangle', () => {
    const state = stateWithImageBudgetLeft(0)
    const withText = editorReducer(state, { type: 'element/add', element: createTextElement() })
    const withRect = editorReducer(withText, { type: 'element/add', element: createRectElement() })
    expect(selectedElements(withRect)).toHaveLength(3)
  })

  it('element/duplicate refuse la copie d\'une image qui ferait dépasser le cumul', () => {
    const state = stateWithImageBudgetLeft(100)
    const image = selectedElements(state)[0]!
    expect(editorReducer(state, { type: 'element/duplicate', elementId: image.id })).toBe(state)
  })

  it('element/duplicate accepte la copie d\'un texte même quand le budget est plein', () => {
    const state = stateWithImageBudgetLeft(0)
    const withText = editorReducer(state, { type: 'element/add', element: createTextElement() })
    const text = selectedElements(withText)[1]!
    const next = editorReducer(withText, { type: 'element/duplicate', elementId: text.id })
    expect(selectedElements(next)).toHaveLength(3)
  })

  it('le cumul compte les images des autres diapositives', () => {
    const state = stateWithImageBudgetLeft(100)
    const other = createSlide()
    const withOther: EditorState = {
      ...state,
      presentation: { ...state.presentation, slides: [...state.presentation.slides, other] },
    }
    const onOther = editorReducer(withOther, { type: 'slide/select', slideId: other.id })
    expect(editorReducer(onOther, { type: 'element/add', element: imageOfLength(101) })).toBe(onOther)
  })
})
