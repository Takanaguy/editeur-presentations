import {
  createRectElement,
  createSlide,
  createTextElement,
} from '../model/factories'
import type { Presentation, RectElement, Slide } from '../model/types'
import {
  HISTORY_LIMIT,
  canRedo,
  canUndo,
  createHistoryState,
  historyReducer,
  reconcileSelection,
  type AppAction,
  type HistoryState,
} from './history'
import {
  deepFreeze,
  elementById,
  makeElementState,
  selectedElements as selectedElementsOf,
} from './testHelpers'
import type { EditorState } from './types'

// Enchaîne les actions les unes après les autres.
function run(state: HistoryState, ...actions: AppAction[]): HistoryState {
  return actions.reduce(historyReducer, state)
}

// Applique N fois une fabrique d'action (appelée avec l'index 1..count).
function runMany(state: HistoryState, count: number, make: (i: number) => AppAction): HistoryState {
  let current = state
  for (let i = 1; i <= count; i++) current = historyReducer(current, make(i))
  return current
}

const UNDO: AppAction = { type: 'history/undo' }
const REDO: AppAction = { type: 'history/redo' }

// Historique à partir de l'état de testHelpers (deux diapositives, la première
// sélectionnée avec texte, rectangle et image).
function makeHistory() {
  const parts = makeElementState()
  return { ...parts, history: createHistoryState(parts.state.presentation) }
}

// Historique avec `count` diapositives vides et la diapositive d'index `selected` sélectionnée.
function makeSlidesHistory(count: number, selected = 0) {
  const slides: Slide[] = Array.from({ length: count }, () => createSlide())
  const presentation: Presentation = { version: 1, title: 'Test', slides }
  const history = createHistoryState(presentation)
  history.editor.selectedSlideId = slides[selected]!.id
  return { slides, history }
}

describe('état initial', () => {
  it('démarre avec un passé et un futur vides', () => {
    const history = createHistoryState()
    expect(history.past).toEqual([])
    expect(history.future).toEqual([])
    expect(canUndo(history)).toBe(false)
    expect(canRedo(history)).toBe(false)
    expect(history.editor.presentation.slides).toHaveLength(1)
  })

  it('part de la présentation donnée', () => {
    const { state, history } = makeHistory()
    expect(history.editor.presentation).toBe(state.presentation)
  })
})

describe('actions d\'édition', () => {
  it('crée une entrée de passé avec la présentation d\'avant', () => {
    const { history, text } = makeHistory()
    const before = history.editor.presentation
    const next = run(history, { type: 'element/move', elementId: text.id, x: 5, y: 6 })
    expect(next.past).toHaveLength(1)
    expect(next.past[0]).toBe(before)
    expect(next.editor.presentation).not.toBe(before)
    expect(canUndo(next)).toBe(true)
    expect(canRedo(next)).toBe(false)
  })

  it('vide le futur quand une nouvelle action suit un undo', () => {
    const { history, text } = makeHistory()
    const undone = run(
      history,
      { type: 'element/move', elementId: text.id, x: 5, y: 6 },
      UNDO,
    )
    expect(canRedo(undone)).toBe(true)

    const edited = run(undone, { type: 'element/move', elementId: text.id, x: 9, y: 9 })
    expect(edited.future).toEqual([])
    expect(canRedo(edited)).toBe(false)
    expect(edited.past).toHaveLength(1)
  })

  it('compte aussi les actions de diapositives', () => {
    const { history, first } = makeHistory()
    const next = run(history, { type: 'slide/add' }, { type: 'slide/duplicate', slideId: first.id })
    expect(next.past).toHaveLength(2)
  })
})

describe('undo et redo', () => {
  it('rendent exactement les mêmes présentations (mêmes références, sans copie)', () => {
    const { history, text } = makeHistory()
    const p0 = history.editor.presentation
    const h1 = run(history, { type: 'element/move', elementId: text.id, x: 5, y: 6 })
    const p1 = h1.editor.presentation
    const h2 = run(h1, { type: 'element/move', elementId: text.id, x: 7, y: 8 })
    const p2 = h2.editor.presentation

    const u1 = run(h2, UNDO)
    expect(u1.editor.presentation).toBe(p1)
    const u2 = run(u1, UNDO)
    expect(u2.editor.presentation).toBe(p0)
    expect(canUndo(u2)).toBe(false)

    const r1 = run(u2, REDO)
    expect(r1.editor.presentation).toBe(p1)
    const r2 = run(r1, REDO)
    expect(r2.editor.presentation).toBe(p2)
    expect(canRedo(r2)).toBe(false)
    expect(r2.past).toEqual(h2.past)
  })

  it('undo met la présentation courante en tête du futur', () => {
    const { history, text } = makeHistory()
    const h1 = run(history, { type: 'element/move', elementId: text.id, x: 5, y: 6 })
    const h2 = run(h1, { type: 'element/move', elementId: text.id, x: 7, y: 8 })
    const undone = run(h2, UNDO, UNDO)
    expect(undone.future[0]).toBe(h1.editor.presentation)
    expect(undone.future[1]).toBe(h2.editor.presentation)
  })

  it('retournent le même état quand il n\'y a rien à annuler ou à refaire', () => {
    const { history, text } = makeHistory()
    expect(historyReducer(history, UNDO)).toBe(history)
    expect(historyReducer(history, REDO)).toBe(history)

    const edited = run(history, { type: 'element/move', elementId: text.id, x: 5, y: 6 })
    expect(historyReducer(edited, REDO)).toBe(edited)
  })
})

describe('actions sans entrée d\'historique', () => {
  it('la sélection seule ne crée aucune entrée', () => {
    const { history, rect, second } = makeHistory()
    const afterSlide = run(history, { type: 'slide/select', slideId: second.id })
    expect(afterSlide.editor.selectedSlideId).toBe(second.id)
    expect(afterSlide.past).toEqual([])
    expect(afterSlide.editor.presentation).toBe(history.editor.presentation)

    const afterElement = run(history, { type: 'element/select', elementId: rect.id })
    expect(afterElement.editor.selectedElementId).toBe(rect.id)
    expect(afterElement.past).toEqual([])
    expect(canUndo(afterElement)).toBe(false)
  })

  it('la sélection seule ne vide pas le futur', () => {
    const { history, text, rect } = makeHistory()
    const undone = run(history, { type: 'element/move', elementId: text.id, x: 5, y: 6 }, UNDO)
    const selected = run(undone, { type: 'element/select', elementId: rect.id })
    expect(selected.future).toBe(undone.future)
    expect(canRedo(selected)).toBe(true)
  })

  it('une action sans effet retourne la même référence', () => {
    const { history } = makeHistory()
    expect(run(history, { type: 'slide/delete', slideId: 'inconnu' })).toBe(history)
    expect(run(history, { type: 'element/delete', elementId: 'inconnu' })).toBe(history)
    expect(run(history, { type: 'element/move', elementId: 'inconnu', x: 1, y: 1 })).toBe(history)
    expect(run(history, { type: 'element/select', elementId: null })).toBe(history)
  })

  it('la suppression de la dernière diapositive est refusée sans entrée', () => {
    const single = createHistoryState()
    const onlyId = single.editor.selectedSlideId
    const next = run(single, { type: 'slide/delete', slideId: onlyId })
    expect(next).toBe(single)
    expect(next.past).toEqual([])
  })

  it('un déplacement à la même place ne crée aucune entrée', () => {
    const { history, text } = makeHistory()
    expect(run(history, { type: 'element/move', elementId: text.id, x: text.x, y: text.y })).toBe(
      history,
    )
  })
})

describe('limite de l\'historique', () => {
  // Un rectangle déplacé à x = 1, 2, 3... : chaque action produit une présentation distincte.
  function setup() {
    const rect: RectElement = createRectElement({ x: 0, y: 0, width: 100, height: 100 })
    const slide: Slide = { ...createSlide(), elements: [rect] }
    const presentation: Presentation = { version: 1, title: 'Test', slides: [slide] }
    const initial = createHistoryState(presentation)
    const moveTo = (i: number): AppAction => ({
      type: 'element/move',
      elementId: rect.id,
      x: i,
      y: 0,
    })
    return { initial, moveTo }
  }

  it('garde au plus HISTORY_LIMIT entrées', () => {
    const { initial, moveTo } = setup()
    const full = runMany(initial, HISTORY_LIMIT + 10, moveTo)
    expect(HISTORY_LIMIT).toBe(50)
    expect(full.past).toHaveLength(HISTORY_LIMIT)
  })

  it('permet d\'annuler exactement HISTORY_LIMIT fois et oublie les plus anciennes', () => {
    const { initial, moveTo } = setup()
    // presentations[k] = présentation après les k premières actions (0 = initiale).
    const presentations: Presentation[] = [initial.editor.presentation]
    let current = initial
    for (let i = 1; i <= 60; i++) {
      current = historyReducer(current, moveTo(i))
      presentations.push(current.editor.presentation)
    }

    let undone = current
    for (let i = 0; i < HISTORY_LIMIT; i++) {
      expect(canUndo(undone)).toBe(true)
      undone = historyReducer(undone, UNDO)
    }
    expect(canUndo(undone)).toBe(false)
    expect(historyReducer(undone, UNDO)).toBe(undone)
    // Les 10 premières actions sont perdues : on s'arrête sur l'état d'après la 10e.
    expect(undone.editor.presentation).toBe(presentations[10])
    expect(undone.editor.presentation).not.toBe(presentations[0])
  })

  it('un redo après plusieurs undo ne fait jamais dépasser la limite', () => {
    const { initial, moveTo } = setup()
    const full = runMany(initial, 60, moveTo)
    let state = full
    for (let i = 0; i < 20; i++) state = historyReducer(state, UNDO)
    expect(state.past).toHaveLength(HISTORY_LIMIT - 20)
    expect(state.future).toHaveLength(20)

    for (let i = 0; i < 20; i++) {
      state = historyReducer(state, REDO)
      expect(state.past.length).toBeLessThanOrEqual(HISTORY_LIMIT)
    }
    expect(state.past).toHaveLength(HISTORY_LIMIT)
    expect(state.editor.presentation).toBe(full.editor.presentation)
    expect(canRedo(state)).toBe(false)
  })
})

describe('fusion des éditions (history/coalesced)', () => {
  const colorOf = (state: HistoryState, id: string) => {
    const element = elementById(state.editor, id)
    return element?.type === 'rect' ? element.fill : undefined
  }
  // Édition fusionnable : change la couleur du rectangle sous la clé donnée.
  const recolor = (id: string, fill: string, key = 'fill'): AppAction => ({
    type: 'history/coalesced',
    key,
    action: { type: 'element/update', elementId: id, changes: { fill } },
  })
  const SEAL: AppAction = { type: 'history/seal' }

  it('part sans clé de fusion', () => {
    expect(createHistoryState().coalesceKey).toBeNull()
  })

  it('fusionne N éditions de même clé en une seule entrée', () => {
    const { history, rect } = makeHistory()
    const next = runMany(history, 20, (i) => recolor(rect.id, `#0000${(10 + i).toString(16)}`))
    expect(next.past).toHaveLength(1)
    expect(next.past[0]).toBe(history.editor.presentation)
    expect(colorOf(next, rect.id)).toBe('#00001e')
    expect(next.coalesceKey).toBe('fill')
  })

  it('une clé différente ne fusionne pas', () => {
    const { history, rect } = makeHistory()
    const next = run(history, recolor(rect.id, '#111111', 'a'), recolor(rect.id, '#222222', 'b'))
    expect(next.past).toHaveLength(2)
    expect(next.coalesceKey).toBe('b')
  })

  it('une édition normale intercalée coupe la chaîne', () => {
    const { history, rect, text } = makeHistory()
    const interleaved = run(history, recolor(rect.id, '#111111'), {
      type: 'element/move',
      elementId: text.id,
      x: 5,
      y: 6,
    })
    expect(interleaved.coalesceKey).toBeNull()

    const next = run(interleaved, recolor(rect.id, '#222222'))
    expect(next.past).toHaveLength(3)
    expect(next.coalesceKey).toBe('fill')
  })

  it('un changement de sélection intercalé coupe la chaîne', () => {
    const { history, rect, text } = makeHistory()
    const selected = run(history, recolor(rect.id, '#111111'), {
      type: 'element/select',
      elementId: text.id,
    })
    expect(selected.coalesceKey).toBeNull()
    expect(selected.past).toHaveLength(1)

    const next = run(selected, recolor(rect.id, '#222222'))
    expect(next.past).toHaveLength(2)
  })

  it('une sélection sans effet ne coupe pas la chaîne (même référence)', () => {
    const { history, rect } = makeHistory()
    const edited = run(history, recolor(rect.id, '#111111'))
    expect(run(edited, { type: 'element/select', elementId: null })).toBe(edited)
    expect(run(edited, recolor(rect.id, '#222222')).past).toHaveLength(1)
  })

  it('seal coupe la chaîne', () => {
    const { history, rect } = makeHistory()
    const sealed = run(history, recolor(rect.id, '#111111'), SEAL)
    expect(sealed.coalesceKey).toBeNull()
    const next = run(sealed, recolor(rect.id, '#222222'))
    expect(next.past).toHaveLength(2)
  })

  it('seal retourne la même référence si la chaîne est déjà coupée', () => {
    const { history } = makeHistory()
    expect(run(history, SEAL)).toBe(history)
  })

  it("undo revient à l'état d'avant la première édition, redo à la dernière valeur", () => {
    const { history, rect } = makeHistory()
    const edited = run(
      history,
      recolor(rect.id, '#111111'),
      recolor(rect.id, '#222222'),
      recolor(rect.id, '#333333'),
    )
    const undone = run(edited, UNDO)
    expect(undone.editor.presentation).toBe(history.editor.presentation)
    expect(canUndo(undone)).toBe(false)
    expect(undone.coalesceKey).toBeNull()

    const redone = run(undone, REDO)
    expect(colorOf(redone, rect.id)).toBe('#333333')
    expect(redone.editor.presentation).toBe(edited.editor.presentation)
    expect(redone.coalesceKey).toBeNull()
  })

  it('la même clé après un undo ne fusionne pas', () => {
    const { history, rect } = makeHistory()
    const next = run(
      history,
      recolor(rect.id, '#111111'),
      recolor(rect.id, '#222222'),
      UNDO,
      recolor(rect.id, '#333333'),
    )
    // Le passé est vide après l'undo : la nouvelle édition crée sa propre entrée.
    expect(next.past).toHaveLength(1)
    expect(next.past[0]).toBe(history.editor.presentation)
    expect(next.future).toEqual([])
  })

  it('la même clé après un undo ne fusionne pas même si le passé n\'est pas vide', () => {
    const { history, rect, text } = makeHistory()
    const base = run(history, { type: 'element/move', elementId: text.id, x: 5, y: 6 })
    const next = run(base, recolor(rect.id, '#111111'), UNDO, recolor(rect.id, '#222222'))
    expect(next.past).toHaveLength(2)
  })

  it("la première édition d'une clé ne fusionne pas même si le passé contient des entrées", () => {
    const { history, rect, text } = makeHistory()
    const next = run(
      history,
      { type: 'element/move', elementId: text.id, x: 5, y: 6 },
      { type: 'element/move', elementId: text.id, x: 7, y: 8 },
      recolor(rect.id, '#111111'),
    )
    expect(next.past).toHaveLength(3)
  })

  it('vide le futur à la première édition de la chaîne', () => {
    const { history, rect, text } = makeHistory()
    const undone = run(history, { type: 'element/move', elementId: text.id, x: 5, y: 6 }, UNDO)
    expect(canRedo(undone)).toBe(true)
    const next = run(undone, recolor(rect.id, '#111111'), recolor(rect.id, '#222222'))
    expect(next.future).toEqual([])
    expect(next.past).toHaveLength(1)
  })

  it('une édition fusionnable sans effet retourne la même référence', () => {
    const { history, rect } = makeHistory()
    expect(run(history, recolor(rect.id, rect.fill))).toBe(history)
    expect(run(history, recolor('inconnu', '#111111'))).toBe(history)

    const edited = run(history, recolor(rect.id, '#111111'))
    expect(run(edited, recolor(rect.id, '#111111'))).toBe(edited)
  })

  it('respecte la limite de HISTORY_LIMIT avec des entrées fusionnées', () => {
    const { history, rect, text } = makeHistory()
    let state = history
    // Chaque tour : un déplacement, puis 5 recolorations qui forment une seule entrée.
    for (let i = 1; i <= 40; i++) {
      state = historyReducer(state, { type: 'element/move', elementId: text.id, x: i, y: 0 })
      for (let j = 0; j < 5; j++) {
        state = historyReducer(state, recolor(rect.id, `#${i + 100}0${j}00`.slice(0, 7)))
      }
    }
    expect(state.past).toHaveLength(HISTORY_LIMIT)
  })

  it('ne modifie jamais un état gelé en profondeur', () => {
    const { history, rect } = makeHistory()
    const frozen = deepFreeze(history)
    const snapshot = structuredClone(frozen)

    expect(() => {
      const edited = run(
        frozen,
        recolor(rect.id, '#111111'),
        recolor(rect.id, '#222222'),
        SEAL,
        recolor(rect.id, '#333333'),
      )
      deepFreeze(edited)
      run(run(edited, UNDO, REDO), SEAL)
    }).not.toThrow()

    expect(frozen).toEqual(snapshot)
  })
})

describe('reconcileSelection', () => {
  it('garde la sélection quand tout existe encore', () => {
    const { state, text } = makeElementState()
    const selected: EditorState = { ...state, selectedElementId: text.id }
    const result = reconcileSelection(selected, state.presentation)
    expect(result.selectedSlideId).toBe(state.selectedSlideId)
    expect(result.selectedElementId).toBe(text.id)
    expect(result.presentation).toBe(state.presentation)
  })

  it('met l\'élément à null s\'il n\'existe plus sur la diapositive', () => {
    const { state, text, first } = makeElementState()
    const selected: EditorState = { ...state, selectedElementId: text.id }
    const without: Presentation = {
      ...state.presentation,
      slides: state.presentation.slides.map((s) =>
        s.id === first.id ? { ...s, elements: s.elements.filter((e) => e.id !== text.id) } : s,
      ),
    }
    const result = reconcileSelection(selected, without)
    expect(result.selectedSlideId).toBe(first.id)
    expect(result.selectedElementId).toBeNull()
  })

  it('prend la diapositive au même index quand la sélectionnée a disparu', () => {
    const { slides, history } = makeSlidesHistory(3, 1)
    const [a, , c] = slides
    const without: Presentation = { ...history.editor.presentation, slides: [a!, c!] }
    const previous: EditorState = { ...history.editor, selectedElementId: 'x' }
    const result = reconcileSelection(previous, without)
    expect(result.selectedSlideId).toBe(c!.id)
    expect(result.selectedElementId).toBeNull()
  })

  it('borne l\'index au dernier disponible', () => {
    const { slides, history } = makeSlidesHistory(3, 2)
    const [a, b] = slides
    const without: Presentation = { ...history.editor.presentation, slides: [a!, b!] }
    expect(reconcileSelection(history.editor, without).selectedSlideId).toBe(b!.id)
  })

  it('tombe sur la première diapositive si l\'ancienne sélection était introuvable', () => {
    const { slides, history } = makeSlidesHistory(2)
    const broken: EditorState = { ...history.editor, selectedSlideId: 'fantome' }
    expect(reconcileSelection(broken, history.editor.presentation).selectedSlideId).toBe(
      slides[0]!.id,
    )
  })
})

describe('reconcileSelection : saut vers la diapositive modifiée', () => {
  // Trois diapositives A, B, C ; `before` est l'état de départ, A sélectionnée.
  function setup() {
    const { slides, history } = makeSlidesHistory(3, 0)
    const [a, b, c] = slides as [Slide, Slide, Slide]
    return { a, b, c, before: history.editor }
  }
  const withSlides = (before: EditorState, slides: Slide[]): Presentation => ({
    ...before.presentation,
    slides,
  })

  it('règle a : la diapositive sélectionnée a disparu, on garde l\'index borné', () => {
    const { a, b, c, before } = setup()
    const onB: EditorState = { ...before, selectedSlideId: b.id }
    // C est modifiée en même temps : la règle a prime, pas de saut.
    const c2: Slide = { ...c, elements: [createRectElement()] }
    const result = reconcileSelection(onB, withSlides(before, [a, c2]))
    expect(result.selectedSlideId).toBe(c2.id)
    expect(result.selectedElementId).toBeNull()
  })

  it('règle b : la diapositive sélectionnée est modifiée, on la garde avec son élément', () => {
    const { a, b, c, before } = setup()
    const rect = createRectElement()
    const a2: Slide = { ...a, elements: [rect] }
    const b2: Slide = { ...b, elements: [createRectElement()] }
    const selected: EditorState = { ...before, selectedElementId: rect.id }
    const result = reconcileSelection(selected, withSlides(before, [a2, b2, c]))
    expect(result.selectedSlideId).toBe(a.id)
    expect(result.selectedElementId).toBe(rect.id)
  })

  it('règle c : la sélectionnée est inchangée, on saute à la première modifiée', () => {
    const { a, b, c, before } = setup()
    const b2: Slide = { ...b, elements: [createRectElement()] }
    const c2: Slide = { ...c, elements: [createRectElement()] }
    const selected: EditorState = { ...before, selectedElementId: 'x' }
    const result = reconcileSelection(selected, withSlides(before, [a, b2, c2]))
    expect(result.selectedSlideId).toBe(b.id)
    expect(result.selectedElementId).toBeNull()
    expect(result.presentation.slides[1]).toBe(b2)
  })

  it('règle c : une diapositive absente avant compte comme modifiée', () => {
    const { a, b, c, before } = setup()
    const added = createSlide()
    const result = reconcileSelection(before, withSlides(before, [a, b, added, c]))
    expect(result.selectedSlideId).toBe(added.id)
  })

  it('règle d : rien de modifié, la sélection est conservée', () => {
    const { a, b, c, before } = setup()
    const selected: EditorState = { ...before, selectedElementId: 'x' }
    // Les mêmes diapositives dans un autre ordre : aucune n'est modifiée.
    const result = reconcileSelection(selected, withSlides(before, [c, a, b]))
    expect(result.selectedSlideId).toBe(a.id)
    expect(result.selectedElementId).toBeNull()
    const kept = makeElementState()
    const withElement: EditorState = { ...kept.state, selectedElementId: kept.text.id }
    const same = reconcileSelection(withElement, {
      ...kept.state.presentation,
      slides: [...kept.state.presentation.slides].reverse(),
    })
    expect(same.selectedSlideId).toBe(kept.first.id)
    expect(same.selectedElementId).toBe(kept.text.id)
  })
})

describe('sélection après undo et redo : saut vers la diapositive modifiée', () => {
  // Trois diapositives, l'élément est ajouté sur B, puis on revient sur A.
  function editBThenBackToA() {
    const { slides, history } = makeSlidesHistory(3, 0)
    const [a, b, c] = slides as [Slide, Slide, Slide]
    const rect = createRectElement()
    const state = run(
      history,
      { type: 'slide/select', slideId: b.id },
      { type: 'element/add', element: rect },
      { type: 'slide/select', slideId: a.id },
    )
    return { a, b, c, rect, history, state }
  }

  it('annuler une modification de B depuis A saute sur B', () => {
    const { a, b, history, state } = editBThenBackToA()
    expect(state.editor.selectedSlideId).toBe(a.id)

    const undone = run(state, UNDO)
    expect(undone.editor.presentation).toBe(history.editor.presentation)
    expect(undone.editor.selectedSlideId).toBe(b.id)
    expect(undone.editor.selectedElementId).toBeNull()
  })

  it('refaire la même chose saute aussi sur B', () => {
    const { a, b, rect, state } = editBThenBackToA()
    // On revient sur A après l'annulation, puis on refait.
    const undone = run(state, UNDO, { type: 'slide/select', slideId: a.id })
    expect(undone.editor.selectedSlideId).toBe(a.id)

    const redone = run(undone, REDO)
    expect(redone.editor.selectedSlideId).toBe(b.id)
    expect(redone.editor.selectedElementId).toBeNull()
    expect(redone.editor.presentation.slides[1]?.elements[0]?.id).toBe(rect.id)
  })

  it('annuler l\'ajout d\'une diapositive (règle a) garde l\'index voisin', () => {
    const { slides, history } = makeSlidesHistory(3, 1)
    const added = run(history, { type: 'slide/add' })
    const undone = run(added, UNDO)
    expect(undone.editor.selectedSlideId).toBe(slides[2]!.id)
  })

  it('refaire un ajout de diapositive saute sur la diapositive ajoutée', () => {
    const { slides, history } = makeSlidesHistory(3, 1)
    const added = run(history, { type: 'slide/add' })
    const newId = added.editor.selectedSlideId
    const redone = run(added, UNDO, REDO)
    expect(redone.editor.presentation.slides.map((s) => s.id)).toEqual([
      slides[0]!.id,
      slides[1]!.id,
      newId,
      slides[2]!.id,
    ])
    expect(redone.editor.selectedSlideId).toBe(newId)
  })

  it('annuler une suppression de diapositive restaure et sélectionne la restaurée', () => {
    const { slides, history } = makeSlidesHistory(3, 2)
    const [a, b] = slides
    // Suppression de B pendant qu'on est sur A : la sélection reste sur A.
    const onA = run(history, { type: 'slide/select', slideId: a!.id })
    const deleted = run(onA, { type: 'slide/delete', slideId: b!.id })
    expect(deleted.editor.selectedSlideId).toBe(a!.id)

    const undone = run(deleted, UNDO)
    expect(undone.editor.presentation.slides.map((s) => s.id)).toContain(b!.id)
    expect(undone.editor.selectedSlideId).toBe(b!.id)
  })

  it('annuler un réordonnancement ne change pas la sélection', () => {
    const { slides, history } = makeSlidesHistory(3, 0)
    const [a, b, c] = slides
    const moved = run(
      history,
      { type: 'slide/move', slideId: c!.id, toIndex: 0 },
      { type: 'slide/select', slideId: b!.id },
    )
    const undone = run(moved, UNDO)
    expect(undone.editor.presentation.slides.map((s) => s.id)).toEqual([a!.id, b!.id, c!.id])
    expect(undone.editor.selectedSlideId).toBe(b!.id)

    const redone = run(undone, REDO)
    expect(redone.editor.selectedSlideId).toBe(b!.id)
  })
})

describe('sélection après undo et redo', () => {
  it('annuler un ajout de diapositive sélectionnée retombe sur l\'index voisin', () => {
    // Ajout après la dernière : la nouvelle est à l'index 3, qui n'existe plus après l'undo.
    const last = makeSlidesHistory(3, 2)
    const addedLast = run(last.history, { type: 'slide/add' })
    expect(addedLast.editor.selectedSlideId).toBe(addedLast.editor.presentation.slides[3]!.id)
    const undoneLast = run(addedLast, UNDO)
    expect(undoneLast.editor.presentation.slides).toHaveLength(3)
    expect(undoneLast.editor.selectedSlideId).toBe(last.slides[2]!.id)

    // Ajout au milieu : la nouvelle est à l'index 2, la suivante la remplace.
    const middle = makeSlidesHistory(3, 1)
    const addedMiddle = run(middle.history, { type: 'slide/add' })
    const undoneMiddle = run(addedMiddle, UNDO)
    expect(undoneMiddle.editor.selectedSlideId).toBe(middle.slides[2]!.id)
    expect(undoneMiddle.editor.selectedElementId).toBeNull()
  })

  it('annuler un ajout d\'élément sélectionné remet selectedElementId à null', () => {
    const { history, first } = makeHistory()
    const added = createTextElement()
    const withElement = run(history, { type: 'element/add', element: added })
    expect(withElement.editor.selectedElementId).toBe(added.id)

    const undone = run(withElement, UNDO)
    expect(undone.editor.selectedElementId).toBeNull()
    expect(undone.editor.selectedSlideId).toBe(first.id)
  })

  it('annuler un déplacement garde l\'élément sélectionné', () => {
    const { history, text } = makeHistory()
    const selected = run(
      history,
      { type: 'element/select', elementId: text.id },
      { type: 'element/move', elementId: text.id, x: 5, y: 6 },
    )
    const undone = run(selected, UNDO)
    expect(undone.editor.selectedElementId).toBe(text.id)
    expect(undone.editor.presentation).toBe(history.editor.presentation)
  })

  it('refaire une suppression de diapositive sélectionnée retombe sur l\'index voisin', () => {
    const { slides, history } = makeSlidesHistory(3, 1)
    const [a, b, c] = slides
    const deleted = run(history, { type: 'slide/delete', slideId: b!.id })
    const undone = run(deleted, UNDO)
    // On re-sélectionne la diapositive qui va disparaître au redo.
    const selected = run(undone, { type: 'slide/select', slideId: b!.id })
    expect(selected.editor.selectedSlideId).toBe(b!.id)

    const redone = run(selected, REDO)
    expect(redone.editor.presentation.slides.map((s) => s.id)).toEqual([a!.id, c!.id])
    expect(redone.editor.selectedSlideId).toBe(c!.id)
    expect(redone.editor.selectedElementId).toBeNull()
  })

  it('un undo n\'annule pas la sélection : il saute seulement sur la diapositive modifiée', () => {
    const { history, text, first, second } = makeHistory()
    const edited = run(
      history,
      { type: 'element/move', elementId: text.id, x: 5, y: 6 },
      { type: 'slide/select', slideId: second.id },
    )
    // Adapté à l'étape 10 : on était sur la 2, la modification annulée touche la 1, on y saute.
    const undone = run(edited, UNDO)
    expect(undone.editor.selectedSlideId).toBe(first.id)
    expect(undone.editor.presentation).toBe(history.editor.presentation)

    // La diapositive 1 est modifiée par le redo et déjà sélectionnée : elle reste affichée.
    const redone = run(undone, REDO)
    expect(redone.editor.selectedSlideId).toBe(first.id)
  })
})

describe('réordonnancement et historique', () => {
  const orderOf = (history: HistoryState) =>
    selectedElementsOf(history.editor).map((e) => e.id)

  it("chaque réordonnancement crée une entrée, et undo restaure l'ordre", () => {
    const { history, text, rect, image } = makeHistory()
    const start = [text.id, rect.id, image.id]

    const h1 = run(history, { type: 'element/reorder', elementId: text.id, to: 'front' })
    expect(orderOf(h1)).toEqual([rect.id, image.id, text.id])
    expect(h1.past).toHaveLength(1)

    const h2 = run(h1, { type: 'element/reorder', elementId: image.id, to: 'back' })
    expect(orderOf(h2)).toEqual([image.id, rect.id, text.id])
    expect(h2.past).toHaveLength(2)

    const u1 = run(h2, UNDO)
    expect(orderOf(u1)).toEqual([rect.id, image.id, text.id])
    expect(orderOf(run(u1, UNDO))).toEqual(start)
    expect(orderOf(run(u1, UNDO, REDO))).toEqual([rect.id, image.id, text.id])
  })

  it("un réordonnancement sans effet ne crée pas d'entrée", () => {
    const { history, image } = makeHistory()
    const same = run(history, { type: 'element/reorder', elementId: image.id, to: 'front' })
    expect(same).toBe(history)
    expect(same.past).toHaveLength(0)
  })

  it("garde l'élément sélectionné après le réordonnancement et après undo", () => {
    const { history, text } = makeHistory()
    const selected = run(history, { type: 'element/select', elementId: text.id })
    const moved = run(selected, { type: 'element/reorder', elementId: text.id, to: 'front' })
    expect(moved.editor.selectedElementId).toBe(text.id)
    expect(run(moved, UNDO).editor.selectedElementId).toBe(text.id)
  })
})

describe('duplication et historique', () => {
  it('crée une entrée, et undo supprime la copie avec une sélection cohérente', () => {
    const { history, rect } = makeHistory()
    const selected = run(history, { type: 'element/select', elementId: rect.id })

    const duplicated = run(selected, { type: 'element/duplicate', elementId: rect.id })
    expect(duplicated.past).toHaveLength(1)
    expect(selectedElementsOf(duplicated.editor)).toHaveLength(4)
    const copyId = duplicated.editor.selectedElementId
    expect(copyId).not.toBe(rect.id)

    const undone = run(duplicated, UNDO)
    expect(selectedElementsOf(undone.editor)).toHaveLength(3)
    expect(selectedElementsOf(undone.editor).some((e) => e.id === copyId)).toBe(false)
    // La copie n'existe plus : rien n'est sélectionné plutôt qu'un id fantôme.
    expect(undone.editor.selectedElementId).toBeNull()
    expect(undone.editor.presentation).toBe(selected.editor.presentation)

    const redone = run(undone, REDO)
    expect(selectedElementsOf(redone.editor).at(-1)?.id).toBe(copyId)
  })

  it('un id inconnu ne crée pas d\'entrée', () => {
    const { history } = makeHistory()
    const same = run(history, { type: 'element/duplicate', elementId: 'inconnu' })
    expect(same).toBe(history)
  })
})

describe('immuabilité', () => {
  it('ne modifie jamais un état gelé en profondeur', () => {
    const { history, text, rect, second } = makeHistory()
    const frozen = deepFreeze(history)
    const snapshot = structuredClone(frozen)

    expect(() => {
      const edited = run(
        frozen,
        { type: 'element/add', element: createRectElement() },
        { type: 'element/move', elementId: text.id, x: 1, y: 2 },
        { type: 'slide/add' },
        { type: 'slide/select', slideId: second.id },
        { type: 'element/select', elementId: rect.id },
      )
      deepFreeze(edited)
      const undone = run(edited, UNDO, UNDO, UNDO)
      deepFreeze(undone)
      run(undone, REDO, REDO, { type: 'element/delete', elementId: 'inconnu' })
      run(frozen, UNDO, REDO)
    }).not.toThrow()

    expect(frozen).toEqual(snapshot)
  })
})

describe('import et renommage et historique', () => {
  function makeLoaded(): Presentation {
    return { version: 1, title: 'Importée', slides: [createSlide(), createSlide()] }
  }

  it('load crée UNE entrée, undo restaure l\'ancienne présentation, redo la remet', () => {
    const { history, state, text } = makeHistory()
    const selected = run(history, { type: 'element/select', elementId: text.id })
    const loaded = makeLoaded()

    const after = run(selected, { type: 'presentation/load', presentation: loaded })
    expect(after.past).toHaveLength(1)
    expect(after.future).toEqual([])
    expect(after.editor.presentation).toBe(loaded)
    expect(after.editor.selectedSlideId).toBe(loaded.slides[0]?.id)
    expect(after.editor.selectedElementId).toBeNull()

    const undone = run(after, UNDO)
    expect(undone.editor.presentation).toBe(state.presentation)
    // La sélection pointait une diapositive de la présentation importée : elle se répare.
    expect(undone.editor.presentation.slides.map((s) => s.id)).toContain(undone.editor.selectedSlideId)
    expect(undone.editor.selectedElementId).toBeNull()
    expect(canRedo(undone)).toBe(true)

    const redone = run(undone, REDO)
    expect(redone.editor.presentation).toBe(loaded)
    expect(redone.editor.selectedSlideId).toBe(loaded.slides[0]?.id)
    expect(redone.past).toHaveLength(1)
  })

  it('load de la même présentation ou d\'une présentation vide ne crée pas d\'entrée', () => {
    const { history } = makeHistory()
    expect(run(history, { type: 'presentation/load', presentation: history.editor.presentation })).toBe(history)
    const empty: Presentation = { version: 1, title: 'Vide', slides: [] }
    expect(run(history, { type: 'presentation/load', presentation: empty })).toBe(history)
  })

  it('load efface les redo possibles', () => {
    const { history } = makeHistory()
    const undone = run(history, { type: 'slide/add' }, UNDO)
    expect(canRedo(undone)).toBe(true)
    const after = run(undone, { type: 'presentation/load', presentation: makeLoaded() })
    expect(canRedo(after)).toBe(false)
  })

  it('rename crée une entrée, undo restaure le titre, un titre identique n\'en crée pas', () => {
    const { history } = makeHistory()
    const renamed = run(history, { type: 'presentation/rename', title: 'Nouveau' })
    expect(renamed.past).toHaveLength(1)
    expect(renamed.editor.presentation.title).toBe('Nouveau')

    const same = run(renamed, { type: 'presentation/rename', title: 'Nouveau' })
    expect(same).toBe(renamed)

    const undone = run(renamed, UNDO)
    expect(undone.editor.presentation.title).toBe(history.editor.presentation.title)
  })
})
