import { createRectElement, createTextElement } from '../model/factories'
import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../model/types'
import {
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  addElement,
  deleteElement,
  moveElement,
  resizeElement,
  selectElement,
  updateElement,
} from './elementOps'
import { MIN_ELEMENT_SIZE } from './geometry'
import { deepFreeze, elementById, makeElementState, selectedElements } from './testHelpers'
import type { EditorState, ElementChanges } from './types'

// Vérifie que la diapositive d'index `index` garde exactement sa référence.
function expectSlideUntouched(before: EditorState, after: EditorState, index: number) {
  expect(after.presentation.slides[index]).toBe(before.presentation.slides[index])
}

describe('addElement', () => {
  it('ajoute à la fin (premier plan) et sélectionne l\'élément', () => {
    const { state, text, rect, image } = makeElementState()
    const added = createRectElement({ x: 10, y: 10, width: 50, height: 50 })
    const next = addElement(state, added)
    expect(selectedElements(next).map((e) => e.id)).toEqual([text.id, rect.id, image.id, added.id])
    expect(next.selectedElementId).toBe(added.id)
    expect(next.selectedSlideId).toBe(state.selectedSlideId)
  })

  it('borne les bounds dans la diapositive', () => {
    const { state } = makeElementState()
    const added = createRectElement({ x: -40, y: 9999, width: 5000, height: 5 })
    const result = elementById(addElement(state, added), added.id)
    expect(result).toMatchObject({
      x: 0,
      y: SLIDE_HEIGHT - MIN_ELEMENT_SIZE,
      width: SLIDE_WIDTH,
      height: MIN_ELEMENT_SIZE,
    })
  })

  it('ne modifie pas l\'objet fourni par l\'appelant', () => {
    const { state } = makeElementState()
    const added = deepFreeze(createRectElement({ x: -40, y: 0, width: 50, height: 50 }))
    expect(() => addElement(state, added)).not.toThrow()
    expect(added.x).toBe(-40)
  })

  it('retourne le même état si l\'id existe déjà sur la diapositive', () => {
    const { state, text } = makeElementState()
    expect(addElement(state, { ...text, x: 0 })).toBe(state)
  })

  it('accepte un id déjà utilisé sur une AUTRE diapositive', () => {
    const { state, other } = makeElementState()
    const next = addElement(state, { ...other })
    expect(selectedElements(next)).toHaveLength(4)
  })

  it('ne touche qu\'à la diapositive sélectionnée', () => {
    const { state } = makeElementState()
    const next = addElement(state, createTextElement())
    expect(next.presentation.slides[0]).not.toBe(state.presentation.slides[0])
    expectSlideUntouched(state, next, 1)
  })

  it('cible la seconde diapositive quand elle est sélectionnée', () => {
    const { state, second, first } = makeElementState()
    const onSecond: EditorState = { ...state, selectedSlideId: second.id }
    const next = addElement(onSecond, createTextElement())
    expect(next.presentation.slides[1]?.elements).toHaveLength(2)
    expect(next.presentation.slides[0]).toBe(first)
  })
})

describe('selectElement', () => {
  it('sélectionne un élément de la diapositive', () => {
    const { state, rect } = makeElementState()
    const next = selectElement(state, rect.id)
    expect(next.selectedElementId).toBe(rect.id)
    expect(next.presentation).toBe(state.presentation)
  })

  it('désélectionne avec null', () => {
    const { state, rect } = makeElementState()
    const next = selectElement({ ...state, selectedElementId: rect.id }, null)
    expect(next.selectedElementId).toBeNull()
  })

  it('retourne le même état si rien n\'est sélectionné et qu\'on passe null', () => {
    const { state } = makeElementState()
    expect(selectElement(state, null)).toBe(state)
  })

  it('retourne le même état pour un id inconnu', () => {
    const { state, rect } = makeElementState()
    const selected = { ...state, selectedElementId: rect.id }
    expect(selectElement(selected, 'inconnu')).toBe(selected)
  })

  it('ignore un élément qui existe sur une autre diapositive', () => {
    const { state, other } = makeElementState()
    expect(selectElement(state, other.id)).toBe(state)
  })

  it('retourne le même état si l\'élément est déjà sélectionné', () => {
    const { state, rect } = makeElementState()
    const selected = { ...state, selectedElementId: rect.id }
    expect(selectElement(selected, rect.id)).toBe(selected)
  })
})

describe('deleteElement', () => {
  it('supprime un élément non sélectionné sans toucher à la sélection', () => {
    const { state, text, rect, image } = makeElementState()
    const selected = { ...state, selectedElementId: text.id }
    const next = deleteElement(selected, rect.id)
    expect(selectedElements(next)).toEqual([text, image])
    expect(next.selectedElementId).toBe(text.id)
  })

  it('remet la sélection à null quand on supprime l\'élément sélectionné', () => {
    const { state, rect } = makeElementState()
    const next = deleteElement({ ...state, selectedElementId: rect.id }, rect.id)
    expect(next.selectedElementId).toBeNull()
    expect(elementById(next, rect.id)).toBeUndefined()
  })

  it('garde les autres éléments intacts (même référence)', () => {
    const { state, text, rect, image } = makeElementState()
    const next = deleteElement(state, rect.id)
    const [a, b] = selectedElements(next)
    expect(a).toBe(text)
    expect(b).toBe(image)
  })

  it('retourne le même état pour un id inconnu', () => {
    const { state } = makeElementState()
    expect(deleteElement(state, 'inconnu')).toBe(state)
  })

  it('ne supprime pas un élément d\'une autre diapositive', () => {
    const { state, other } = makeElementState()
    expect(deleteElement(state, other.id)).toBe(state)
  })

  it('ne touche pas aux autres diapositives', () => {
    const { state, text } = makeElementState()
    expectSlideUntouched(state, deleteElement(state, text.id), 1)
  })
})

describe('moveElement', () => {
  it('déplace un élément sans changer sa taille', () => {
    const { state, rect } = makeElementState()
    const result = elementById(moveElement(state, rect.id, 300, 150), rect.id)
    expect(result).toMatchObject({ x: 300, y: 150, width: 200, height: 100 })
  })

  it('ne change ni la sélection ni les autres éléments', () => {
    const { state, text, rect, image } = makeElementState()
    const selected = { ...state, selectedElementId: image.id }
    const next = moveElement(selected, rect.id, 300, 150)
    expect(next.selectedElementId).toBe(image.id)
    expect(selectedElements(next)[0]).toBe(text)
    expect(selectedElements(next)[2]).toBe(image)
  })

  it('borne aux quatre bords', () => {
    const { state, rect } = makeElementState()
    const at = (x: number, y: number) => elementById(moveElement(state, rect.id, x, y), rect.id)
    expect(at(-100, 150)).toMatchObject({ x: 0, y: 150 })
    expect(at(5000, 150)).toMatchObject({ x: SLIDE_WIDTH - 200, y: 150 })
    expect(at(300, -100)).toMatchObject({ x: 300, y: 0 })
    expect(at(300, 5000)).toMatchObject({ x: 300, y: SLIDE_HEIGHT - 100 })
  })

  it('retourne le même état si la position finale est identique', () => {
    const { state, rect } = makeElementState()
    expect(moveElement(state, rect.id, rect.x, rect.y)).toBe(state)
  })

  it('retourne le même état si le bornage ramène à la position actuelle', () => {
    const { state, text } = makeElementState()
    const atCorner = moveElement(state, text.id, -10, -10)
    expect(atCorner).not.toBe(state)
    // Déjà collé au coin : un second déplacement vers l'extérieur ne change rien.
    expect(moveElement(atCorner, text.id, -50, -50)).toBe(atCorner)
  })

  it('retourne le même état pour un id inconnu', () => {
    const { state } = makeElementState()
    expect(moveElement(state, 'inconnu', 10, 10)).toBe(state)
  })

  it('rejette une position non finie', () => {
    const { state, rect } = makeElementState()
    expect(moveElement(state, rect.id, NaN, 10)).toBe(state)
    expect(moveElement(state, rect.id, 10, Infinity)).toBe(state)
  })

  it('ne touche pas aux autres diapositives', () => {
    const { state, rect } = makeElementState()
    expectSlideUntouched(state, moveElement(state, rect.id, 0, 0), 1)
  })
})

describe('resizeElement', () => {
  it('applique x, y, width et height d\'un coup (poignée en haut à gauche)', () => {
    const { state, rect } = makeElementState()
    // Poignée haut gauche tirée vers la gauche : x diminue, width augmente.
    const bounds = { x: 400, y: 150, width: 300, height: 150 }
    const result = elementById(resizeElement(state, rect.id, bounds), rect.id)
    expect(result).toMatchObject(bounds)
  })

  it('respecte la taille minimale', () => {
    const { state, rect } = makeElementState()
    const result = elementById(
      resizeElement(state, rect.id, { x: 600, y: 250, width: 2, height: 0 }),
      rect.id,
    )
    expect(result).toMatchObject({ width: MIN_ELEMENT_SIZE, height: MIN_ELEMENT_SIZE })
  })

  it('borne dans la diapositive', () => {
    const { state, rect } = makeElementState()
    const result = elementById(
      resizeElement(state, rect.id, { x: -20, y: 600, width: 9999, height: 300 }),
      rect.id,
    )
    expect(result).toMatchObject({ x: 0, y: SLIDE_HEIGHT - 300, width: SLIDE_WIDTH, height: 300 })
  })

  it('retourne le même état si les bounds finales sont identiques', () => {
    const { state, rect } = makeElementState()
    const same = { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    expect(resizeElement(state, rect.id, same)).toBe(state)
  })

  it('retourne le même état si le bornage donne les bounds actuelles', () => {
    const { state, rect } = makeElementState()
    const bigger = { x: rect.x, y: rect.y, width: 1500, height: 1000 }
    const full = resizeElement(state, rect.id, bigger)
    expect(full).not.toBe(state)
    expect(resizeElement(full, rect.id, { x: 0, y: 0, width: 5000, height: 5000 })).toBe(full)
  })

  it('retourne le même état pour un id inconnu', () => {
    const { state } = makeElementState()
    expect(resizeElement(state, 'inconnu', { x: 0, y: 0, width: 50, height: 50 })).toBe(state)
  })

  it('rejette des bounds non finies', () => {
    const { state, rect } = makeElementState()
    expect(resizeElement(state, rect.id, { x: 0, y: 0, width: NaN, height: 50 })).toBe(state)
    expect(resizeElement(state, rect.id, { x: 0, y: 0, width: 50, height: Infinity })).toBe(state)
  })

  it('ne touche pas aux autres diapositives ni aux autres éléments', () => {
    const { state, text, rect } = makeElementState()
    const next = resizeElement(state, rect.id, { x: 0, y: 0, width: 50, height: 50 })
    expectSlideUntouched(state, next, 1)
    expect(selectedElements(next)[0]).toBe(text)
  })
})

describe('updateElement', () => {
  it('modifie text sur un texte', () => {
    const { state, text } = makeElementState()
    const result = elementById(updateElement(state, text.id, { text: 'Bonjour' }), text.id)
    expect(result).toMatchObject({ type: 'text', text: 'Bonjour' })
  })

  it('modifie fill sur un rectangle', () => {
    const { state, rect } = makeElementState()
    const result = elementById(updateElement(state, rect.id, { fill: '#ff0000' }), rect.id)
    expect(result).toMatchObject({ type: 'rect', fill: '#ff0000' })
  })

  it('accepte fill à null sur un texte (pas de fond)', () => {
    const { state, text } = makeElementState()
    const withFill = updateElement(state, text.id, { fill: '#fff' })
    const result = elementById(updateElement(withFill, text.id, { fill: null }), text.id)
    expect(result).toMatchObject({ fill: null })
  })

  it('modifie src et alt sur une image', () => {
    const { state, image } = makeElementState()
    const result = elementById(
      updateElement(state, image.id, { src: 'data:,b', alt: 'Une image' }),
      image.id,
    )
    expect(result).toMatchObject({ src: 'data:,b', alt: 'Une image' })
  })

  it('borne fontSize entre le minimum et le maximum', () => {
    const { state, text } = makeElementState()
    const size = (fontSize: number) => {
      const el = elementById(updateElement(state, text.id, { fontSize }), text.id)
      return el?.type === 'text' ? el.fontSize : undefined
    }
    expect(size(2)).toBe(MIN_FONT_SIZE)
    expect(size(9999)).toBe(MAX_FONT_SIZE)
    expect(size(64)).toBe(64)
  })

  it('retourne le même état si fontSize borné égale la valeur actuelle', () => {
    const { state, text } = makeElementState()
    const atMax = updateElement(state, text.id, { fontSize: 9999 })
    expect(updateElement(atMax, text.id, { fontSize: 5000 })).toBe(atMax)
  })

  it('ignore une clé inapplicable au type de l\'élément', () => {
    const { state, rect } = makeElementState()
    expect(updateElement(state, rect.id, { text: 'inutile', fontSize: 30 })).toBe(state)
    const mixed = elementById(
      updateElement(state, rect.id, { text: 'inutile', fill: '#000' }),
      rect.id,
    )
    expect(mixed).toEqual({ ...rect, fill: '#000' })
    expect(mixed).not.toHaveProperty('text')
  })

  it('ignore les clés undefined', () => {
    const { state, text } = makeElementState()
    expect(updateElement(state, text.id, { text: undefined, fontSize: undefined })).toBe(state)
    const result = elementById(
      updateElement(state, text.id, { text: undefined, color: '#123456' }),
      text.id,
    )
    expect(result).toEqual({ ...text, color: '#123456' })
  })

  it('ignore fill à null sur un rectangle (fill non nullable)', () => {
    const { state, rect } = makeElementState()
    expect(updateElement(state, rect.id, { fill: null })).toBe(state)
  })

  it('ignore une valeur du mauvais type (données venues d\'un JSON)', () => {
    const { state, text } = makeElementState()
    // Casts : le type interdit ces valeurs, on vérifie la validation à l'exécution.
    const badColor = { color: 5 } as unknown as ElementChanges
    const badText = { text: {} } as unknown as ElementChanges
    const badSize = { fontSize: '12' } as unknown as ElementChanges
    expect(updateElement(state, text.id, badColor)).toBe(state)
    expect(updateElement(state, text.id, badText)).toBe(state)
    expect(updateElement(state, text.id, badSize)).toBe(state)
  })

  it('applique la valeur valide et ignore l\'invalide dans la même action', () => {
    const { state, text } = makeElementState()
    const mixed = { color: 5, text: 'Bonjour', fontSize: '12' } as unknown as ElementChanges
    const result = elementById(updateElement(state, text.id, mixed), text.id)
    expect(result).toEqual({ ...text, text: 'Bonjour' })
  })

  it('rejette toute l\'action si une valeur numérique n\'est pas finie', () => {
    const { state, text, rect } = makeElementState()
    expect(updateElement(state, text.id, { fontSize: NaN })).toBe(state)
    expect(updateElement(state, text.id, { fontSize: Infinity, text: 'ignoré aussi' })).toBe(state)
    // Même sur un champ inapplicable : l'action entière est rejetée.
    expect(updateElement(state, rect.id, { fontSize: NaN, fill: '#000' })).toBe(state)
  })

  it('retourne le même état quand les valeurs sont déjà égales', () => {
    const { state, text } = makeElementState()
    expect(updateElement(state, text.id, { text: text.text, color: text.color })).toBe(state)
    expect(updateElement(state, text.id, {})).toBe(state)
  })

  it('retourne le même état pour un id inconnu', () => {
    const { state } = makeElementState()
    expect(updateElement(state, 'inconnu', { text: 'x' })).toBe(state)
  })

  it('ne change jamais id, type ni la géométrie', () => {
    const { state, rect } = makeElementState()
    // Cast : le type interdit ces clés, on vérifie la protection à l'exécution.
    const sneaky = {
      id: 'autre',
      type: 'text',
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      fill: '#abcdef',
    } as unknown as ElementChanges
    const result = elementById(updateElement(state, rect.id, sneaky), rect.id)
    expect(result).toEqual({ ...rect, fill: '#abcdef' })
  })

  it('ignore __proto__ et constructor', () => {
    const { state, rect } = makeElementState()
    const evil = JSON.parse('{"__proto__": {"polluted": true}, "constructor": "x"}') as ElementChanges
    expect(updateElement(state, rect.id, evil)).toBe(state)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('ne touche pas aux autres éléments ni aux autres diapositives', () => {
    const { state, text, image } = makeElementState()
    const rectId = selectedElements(state)[1]!.id
    const next = updateElement(state, rectId, { fill: '#000' })
    expect(selectedElements(next)[0]).toBe(text)
    expect(selectedElements(next)[2]).toBe(image)
    expectSlideUntouched(state, next, 1)
  })
})

describe('sélection de diapositive cohérente', () => {
  it('toutes les actions visent la diapositive sélectionnée (la seconde ici)', () => {
    const { state, first, second, other } = makeElementState()
    const onSecond: EditorState = { ...state, selectedSlideId: second.id }

    const results = [
      selectElement(onSecond, other.id),
      moveElement(onSecond, other.id, 300, 300),
      resizeElement(onSecond, other.id, { x: 0, y: 0, width: 50, height: 50 }),
      updateElement(onSecond, other.id, { fill: '#000' }),
      deleteElement(onSecond, other.id),
    ]
    for (const next of results) {
      expect(next).not.toBe(onSecond)
      expect(next.presentation.slides[0]).toBe(first)
    }
  })

  it('un id de la première diapositive est inconnu quand la seconde est sélectionnée', () => {
    const { state, second, text } = makeElementState()
    const onSecond: EditorState = { ...state, selectedSlideId: second.id }
    expect(selectElement(onSecond, text.id)).toBe(onSecond)
    expect(deleteElement(onSecond, text.id)).toBe(onSecond)
    expect(moveElement(onSecond, text.id, 0, 0)).toBe(onSecond)
    expect(resizeElement(onSecond, text.id, { x: 0, y: 0, width: 50, height: 50 })).toBe(onSecond)
    expect(updateElement(onSecond, text.id, { text: 'x' })).toBe(onSecond)
  })

  it('retourne le même état si la diapositive sélectionnée n\'existe pas (état incohérent)', () => {
    const { state, text } = makeElementState()
    const broken: EditorState = { ...state, selectedSlideId: 'fantôme' }
    expect(addElement(broken, createTextElement())).toBe(broken)
    expect(selectElement(broken, text.id)).toBe(broken)
    expect(deleteElement(broken, text.id)).toBe(broken)
    expect(moveElement(broken, text.id, 0, 0)).toBe(broken)
    expect(updateElement(broken, text.id, { text: 'x' })).toBe(broken)
  })
})

describe('immuabilité', () => {
  it('ne modifie jamais l\'état d\'origine, gelé en profondeur', () => {
    const { state, text, rect, image } = makeElementState()
    const frozen = deepFreeze({ ...state, selectedElementId: rect.id })
    const snapshot = structuredClone(frozen)

    expect(() => {
      addElement(frozen, createTextElement())
      selectElement(frozen, text.id)
      selectElement(frozen, null)
      deleteElement(frozen, rect.id)
      moveElement(frozen, image.id, 5, 5)
      resizeElement(frozen, image.id, { x: 0, y: 0, width: 60, height: 60 })
      updateElement(frozen, text.id, { text: 'Nouveau', fontSize: 9999 })
    }).not.toThrow()

    expect(frozen).toEqual(snapshot)
  })
})
