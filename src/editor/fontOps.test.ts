import { BUILT_IN_FONTS } from '../model/fonts'
import {
  MAX_FONTS,
  MAX_FONT_SRC_LENGTH,
  MAX_TOTAL_FONT_SRC_LENGTH,
} from '../model/limits'
import type { CustomFont, Presentation } from '../model/types'
import { FONT_MIMES, fontBytes, fontSrcOf, toBase64 } from '../test/fixtures'
import {
  FONT_COUNT_LIMIT_MESSAGE,
  FONT_INVALID_MESSAGE,
  FONT_NAME_INVALID_MESSAGE,
  FONT_NAME_RESERVED_MESSAGE,
  FONT_NAME_TAKEN_MESSAGE,
  FONT_TOO_BIG_MESSAGE,
  FONT_WEIGHT_LIMIT_MESSAGE,
  addFont,
  fontBlockReason,
} from './fontOps'
import { createHistoryState, historyReducer } from './history'
import { editorReducer } from './reducer'
import { deepFreeze, makeElementState } from './testHelpers'

const roboto: CustomFont = { name: 'Roboto', src: fontSrcOf('woff2') }

function withFonts(fonts: CustomFont[]): Presentation {
  return { ...makeElementState().state.presentation, fonts }
}

// Police de nom `Police n` (n distinct).
const numbered = (n: number): CustomFont => ({ name: `Police ${n}`, src: fontSrcOf('ttf', n) })

// Data URL de `length` caractères exactement : bonne signature, puis du remplissage base64.
// (Ce n'est pas une vraie police : seul le navigateur la validerait vraiment.)
function srcOfLength(length: number): string {
  const head = `data:${FONT_MIMES.woff2};base64,${toBase64(fontBytes('woff2', 2))}`
  return head + 'A'.repeat(length - head.length)
}

describe('fontBlockReason', () => {
  it('accepte une police valide', () => {
    expect(fontBlockReason(withFonts([]), roboto)).toBeNull()
  })

  it.each(['woff2', 'woff', 'ttf', 'otf'] as const)('accepte le format %s', (format) => {
    expect(fontBlockReason(withFonts([]), { name: 'Test', src: fontSrcOf(format) })).toBeNull()
  })

  it('refuse quand la limite de polices est atteinte', () => {
    const full = withFonts(Array.from({ length: MAX_FONTS }, (_, i) => numbered(i)))

    expect(fontBlockReason(full, roboto)).toBe('Limite de 10 polices atteinte.')
    expect(FONT_COUNT_LIMIT_MESSAGE).toBe('Limite de 10 polices atteinte.')
  })

  it('accepte la dixième police', () => {
    const nine = withFonts(Array.from({ length: MAX_FONTS - 1 }, (_, i) => numbered(i)))

    expect(fontBlockReason(nine, roboto)).toBeNull()
  })

  it('refuse un nom déjà pris, sans tenir compte de la casse', () => {
    const presentation = withFonts([roboto])

    expect(fontBlockReason(presentation, { ...roboto })).toBe('Une police porte déjà ce nom.')
    expect(fontBlockReason(presentation, { ...roboto, name: 'ROBOTO' })).toBe(FONT_NAME_TAKEN_MESSAGE)
    expect(fontBlockReason(presentation, { ...roboto, name: 'roboto' })).toBe(FONT_NAME_TAKEN_MESSAGE)
  })

  it.each([...BUILT_IN_FONTS.map((font) => font.name), 'arial', 'GEORGIA'])(
    "refuse le nom %s, celui d'une police de la liste",
    (name) => {
      expect(fontBlockReason(withFonts([]), { name, src: roboto.src })).toBe(
        FONT_NAME_RESERVED_MESSAGE,
      )
    },
  )

  it.each(['', ' ', 'a"b', 'a;b', 'é', 'a  b', '-a', 'a-', 'a'.repeat(65), 'a\nb', 'a(b)'])(
    'refuse le nom non sûr %j',
    (name) => {
      expect(fontBlockReason(withFonts([]), { name, src: roboto.src })).toBe(
        FONT_NAME_INVALID_MESSAGE,
      )
    },
  )

  it.each([
    ['mime image', `data:image/png;base64,${toBase64(fontBytes('woff2'))}`],
    ['pas du base64', 'data:font/woff2;base64,***'],
    ['signature incohérente', `data:font/otf;base64,${toBase64(fontBytes('woff2'))}`],
    ['adresse http', 'https://exemple.test/a.woff2'],
    ['vide', ''],
  ])('refuse une source invalide : %s', (_label, src) => {
    expect(fontBlockReason(withFonts([]), { name: 'Test', src })).toBe(FONT_INVALID_MESSAGE)
    expect(FONT_INVALID_MESSAGE).toBe("Le fichier n'est pas une police valide.")
  })

  it('refuse une source de plus de MAX_FONT_SRC_LENGTH caractères', () => {
    const tooLong = srcOfLength(MAX_FONT_SRC_LENGTH + 4)

    expect(fontBlockReason(withFonts([]), { name: 'Gros', src: tooLong })).toBe(FONT_TOO_BIG_MESSAGE)
  })

  it("accepte une source d'exactement MAX_FONT_SRC_LENGTH caractères", () => {
    const exact = srcOfLength(MAX_FONT_SRC_LENGTH)

    expect(fontBlockReason(withFonts([]), { name: 'Gros', src: exact })).toBeNull()
  })

  it('refuse quand le cumul des polices dépasserait la limite', () => {
    // 2 polices de 3 Mo = 6 Mo, la troisième ferait 9 Mo > 8 Mo.
    const big = (name: string): CustomFont => ({ name, src: srcOfLength(MAX_FONT_SRC_LENGTH) })
    const presentation = withFonts([big('A'), big('B')])

    expect(fontBlockReason(presentation, big('C'))).toBe(
      'Le poids total des polices atteint la limite de 8 Mo.',
    )
    expect(FONT_WEIGHT_LIMIT_MESSAGE).toContain('8 Mo')
  })

  it('accepte une police qui amène le cumul exactement à la limite', () => {
    // 3 Mo + 3 Mo déjà là : il reste exactement 2 Mo de caractères.
    const presentation = withFonts([
      { name: 'A', src: srcOfLength(MAX_FONT_SRC_LENGTH) },
      { name: 'B', src: srcOfLength(MAX_FONT_SRC_LENGTH) },
    ])
    const room = MAX_TOTAL_FONT_SRC_LENGTH - 2 * MAX_FONT_SRC_LENGTH

    expect(fontBlockReason(presentation, { name: 'C', src: srcOfLength(room) })).toBeNull()
    expect(fontBlockReason(presentation, { name: 'C', src: srcOfLength(room + 1) })).toBe(
      FONT_WEIGHT_LIMIT_MESSAGE,
    )
  })
})

describe('addFont (reducer)', () => {
  it('ajoute la police à la fin de la liste', () => {
    const { state } = makeElementState()
    const withRoboto = editorReducer(state, { type: 'font/add', font: roboto })
    const next = editorReducer(withRoboto, { type: 'font/add', font: numbered(1) })

    expect(next.presentation.fonts).toEqual([roboto, numbered(1)])
  })

  it('ne touche ni aux diapositives ni à la sélection', () => {
    const { state, text } = makeElementState()
    const selected = { ...state, selectedElementId: text.id }

    const next = editorReducer(selected, { type: 'font/add', font: roboto })

    expect(next.presentation.slides).toBe(selected.presentation.slides)
    expect(next.selectedSlideId).toBe(selected.selectedSlideId)
    expect(next.selectedElementId).toBe(text.id)
    expect(next.presentation.title).toBe(selected.presentation.title)
  })

  it("ne modifie pas l'état d'origine (gelé en profondeur)", () => {
    const { state } = makeElementState()
    const frozen = deepFreeze(state)

    const next = editorReducer(frozen, { type: 'font/add', font: { ...roboto } })

    expect(frozen.presentation.fonts).toEqual([])
    expect(next.presentation.fonts).toHaveLength(1)
    expect(next).not.toBe(frozen)
  })

  it("reconstruit la police : un champ en plus n'entre pas dans l'état", () => {
    const { state } = makeElementState()
    const sneaky = { ...roboto, extra: 'x' } as CustomFont

    const next = editorReducer(state, { type: 'font/add', font: sneaky })

    expect(next.presentation.fonts[0]).toEqual(roboto)
    expect(next.presentation.fonts[0]).not.toHaveProperty('extra')
    expect(next.presentation.fonts[0]).not.toBe(sneaky)
  })

  it.each([
    ['limite de polices', () => withFonts(Array.from({ length: MAX_FONTS }, (_, i) => numbered(i))), roboto],
    ['nom déjà pris', () => withFonts([roboto]), { ...roboto, name: 'roboto' }],
    ['nom de la liste', () => withFonts([]), { ...roboto, name: 'Arial' }],
    ['nom non sûr', () => withFonts([]), { ...roboto, name: 'a"b' }],
    ['source invalide', () => withFonts([]), { ...roboto, src: 'data:text/html;base64,AAAA' }],
    ['source trop longue', () => withFonts([]), { ...roboto, src: srcOfLength(MAX_FONT_SRC_LENGTH + 4) }],
  ])('refus (%s) : le MÊME state est retourné', (_label, makePresentation, font) => {
    const state = { ...makeElementState().state, presentation: makePresentation() }

    const next = editorReducer(state, { type: 'font/add', font })

    expect(next).toBe(state)
  })

  it('refus pour le cumul : le MÊME state est retourné', () => {
    const big = (name: string): CustomFont => ({ name, src: srcOfLength(MAX_FONT_SRC_LENGTH) })
    const state = {
      ...makeElementState().state,
      presentation: withFonts([big('A'), big('B')]),
    }

    expect(editorReducer(state, { type: 'font/add', font: big('C') })).toBe(state)
  })

  it('addFont appelé directement suit la même règle', () => {
    const { state } = makeElementState()

    expect(addFont(state, roboto).presentation.fonts).toEqual([roboto])
    expect(addFont(addFont(state, roboto), roboto).presentation.fonts).toHaveLength(1)
  })
})

describe("font/add dans l'historique", () => {
  it("ajouter une police crée UNE entrée d'historique", () => {
    const history = createHistoryState()

    const next = historyReducer(history, { type: 'font/add', font: roboto })

    expect(next.past).toHaveLength(1)
    expect(next.editor.presentation.fonts).toEqual([roboto])
  })

  it('un refus ne crée aucune entrée et garde le même état', () => {
    const history = historyReducer(createHistoryState(), { type: 'font/add', font: roboto })

    const next = historyReducer(history, { type: 'font/add', font: { ...roboto, name: 'ROBOTO' } })

    expect(next).toBe(history)
    expect(next.past).toHaveLength(1)
  })

  it('annuler retire la police, rétablir la remet', () => {
    const added = historyReducer(createHistoryState(), { type: 'font/add', font: roboto })

    const undone = historyReducer(added, { type: 'history/undo' })
    expect(undone.editor.presentation.fonts).toEqual([])

    const redone = historyReducer(undone, { type: 'history/redo' })
    expect(redone.editor.presentation.fonts).toEqual([roboto])
  })

  it("ajout + changement de police du texte fusionnés : un seul undo rend tout l'état d'avant", () => {
    const start = createHistoryState()
    const withText = historyReducer(start, {
      type: 'element/add',
      element: {
        id: 't1',
        type: 'text',
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        opacity: 1,
        text: 'Salut',
        fontSize: 20,
        color: '#000000',
        fill: null,
        bold: false,
        italic: false,
        align: 'left',
        fontFamily: 'Georgia',
      },
    })
    const before = withText.editor.presentation
    const key = 'font-upload:Roboto'

    let history = historyReducer(withText, {
      type: 'history/coalesced',
      key,
      action: { type: 'font/add', font: roboto },
    })
    history = historyReducer(history, {
      type: 'history/coalesced',
      key,
      action: { type: 'element/update', elementId: 't1', changes: { fontFamily: 'Roboto' } },
    })
    history = historyReducer(history, { type: 'history/seal' })

    expect(history.past).toHaveLength(withText.past.length + 1)
    const slideElements = history.editor.presentation.slides[0]?.elements
    expect(slideElements?.[0]).toMatchObject({ fontFamily: 'Roboto' })
    expect(history.editor.presentation.fonts).toEqual([roboto])

    const undone = historyReducer(history, { type: 'history/undo' })
    expect(undone.editor.presentation).toBe(before)
    expect(undone.editor.presentation.fonts).toEqual([])
  })
})
