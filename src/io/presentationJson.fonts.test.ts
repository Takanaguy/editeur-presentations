import {
  MAX_FONTS,
  MAX_FONT_NAME_LENGTH,
  MAX_FONT_SRC_LENGTH,
  MAX_TOTAL_FONT_SRC_LENGTH,
} from '../model/limits'
import type { CustomFont, Presentation } from '../model/types'
import { FONT_MIMES, fontBytes, fontSrcOf, toBase64, type FixtureFontFormat } from '../test/fixtures'
import {
  parsePresentation,
  prepareExport,
  serializePresentation,
  validatePresentation,
  type ParseResult,
} from './presentationJson'

const FORMATS: FixtureFontFormat[] = ['woff2', 'woff', 'ttf', 'otf']

function rawPresentation(fonts?: unknown, extra: Record<string, unknown> = {}) {
  return {
    version: 1,
    title: 'Test',
    slides: [{ id: 's1', elements: [] }],
    ...(fonts === undefined ? {} : { fonts }),
    ...extra,
  }
}

function expectOk(result: ParseResult): Presentation {
  if (!result.ok) throw new Error(`Erreurs inattendues : ${result.errors.join(' | ')}`)
  return result.presentation
}

function errorsOf(result: ParseResult): string[] {
  if (result.ok) throw new Error('Une erreur était attendue')
  return result.errors
}

// Data URL de `length` caractères exactement : bonne signature puis remplissage base64.
function srcOfLength(length: number): string {
  const head = `data:${FONT_MIMES.woff2};base64,${toBase64(fontBytes('woff2', 2))}`
  return head + 'A'.repeat(length - head.length)
}

const roboto = { name: 'Roboto', src: fontSrcOf('woff2') }
const fira = { name: 'Fira Code', src: fontSrcOf('ttf') }

describe('validatePresentation : fonts', () => {
  it('absent : équivaut à une liste vide, et le résultat a toujours fonts', () => {
    const presentation = expectOk(validatePresentation(rawPresentation()))

    expect(presentation.fonts).toEqual([])
    expect(Object.hasOwn(presentation, 'fonts')).toBe(true)
  })

  it('liste vide acceptée', () => {
    expect(expectOk(validatePresentation(rawPresentation([]))).fonts).toEqual([])
  })

  it.each(FORMATS)('accepte une police %s', (format) => {
    const font = { name: 'Test', src: fontSrcOf(format) }

    expect(expectOk(validatePresentation(rawPresentation([font]))).fonts).toEqual([font])
  })

  it('conserve plusieurs polices dans leur ordre', () => {
    const presentation = expectOk(validatePresentation(rawPresentation([roboto, fira])))

    expect(presentation.fonts).toEqual([roboto, fira])
  })

  it('accepte exactement MAX_FONTS polices', () => {
    const fonts = Array.from({ length: MAX_FONTS }, (_, i) => ({
      name: `Police ${i}`,
      src: fontSrcOf('woff2', i + 1),
    }))

    expect(expectOk(validatePresentation(rawPresentation(fonts))).fonts).toHaveLength(MAX_FONTS)
  })

  it('refuse plus de MAX_FONTS polices', () => {
    const fonts = Array.from({ length: MAX_FONTS + 1 }, (_, i) => ({
      name: `Police ${i}`,
      src: fontSrcOf('woff2', i + 1),
    }))

    expect(errorsOf(validatePresentation(rawPresentation(fonts)))).toEqual([
      'La présentation ne peut pas contenir plus de 10 polices.',
    ])
  })

  it.each([
    ['une chaîne', 'Roboto'],
    ['un objet', { name: 'Roboto', src: roboto.src }],
    ['un nombre', 3],
    ['null', null],
  ])("refuse fonts quand c'est %s", (_label, fonts) => {
    expect(errorsOf(validatePresentation({ ...rawPresentation(), fonts }))).toEqual([
      'La liste des polices (fonts) doit être un tableau.',
    ])
  })

  it.each([
    ['une chaîne', 'x'],
    ['null', null],
    ['un tableau', []],
    ['un nombre', 1],
  ])('refuse une police qui est %s', (_label, item) => {
    expect(errorsOf(validatePresentation(rawPresentation([item])))).toEqual([
      'Police 1 : une police doit être un objet.',
    ])
  })

  describe('nom', () => {
    it.each(['a"b', 'a;b', 'é', '', ' a', 'a ', 'a  b', 'a(b)', 'a\\b', 'a'.repeat(MAX_FONT_NAME_LENGTH + 1)])(
      'refuse le nom non sûr %j',
      (name) => {
        expect(errorsOf(validatePresentation(rawPresentation([{ ...roboto, name }])))).toEqual([
          'Police 1 : le nom doit être un nom simple (lettres, chiffres, espaces, tirets).',
        ])
      },
    )

    it.each([undefined, null, 3, true, ['Roboto']])('refuse un nom qui est %j', (name) => {
      const font = name === undefined ? { src: roboto.src } : { ...roboto, name }

      expect(errorsOf(validatePresentation(rawPresentation([font])))).toEqual([
        'Police 1 : le nom doit être un nom simple (lettres, chiffres, espaces, tirets).',
      ])
    })

    it.each(['Arial', 'arial', 'Times New Roman', 'IMPACT'])(
      "refuse le nom %s, celui d'une police courante",
      (name) => {
        expect(errorsOf(validatePresentation(rawPresentation([{ ...roboto, name }])))).toEqual([
          "Police 1 : le nom est celui d'une police courante.",
        ])
      },
    )

    it('refuse un doublon, sans tenir compte de la casse, avec le numéro de la seconde', () => {
      const fonts = [roboto, fira, { ...roboto, name: 'ROBOTO' }]

      expect(errorsOf(validatePresentation(rawPresentation(fonts)))).toEqual([
        'Police 3 : le nom est déjà utilisé.',
      ])
    })

    it("« Roboto 2 » n'est pas un doublon de « Roboto »", () => {
      const fonts = [roboto, { ...roboto, name: 'Roboto 2' }]

      expect(expectOk(validatePresentation(rawPresentation(fonts))).fonts).toHaveLength(2)
    })

    it('accepte un nom de la longueur maximale', () => {
      const name = 'a'.repeat(MAX_FONT_NAME_LENGTH)

      expect(expectOk(validatePresentation(rawPresentation([{ ...roboto, name }]))).fonts[0]?.name).toBe(name)
    })
  })

  describe('source', () => {
    it('refuse un mime interdit (data:image/png avec un nom de police)', () => {
      const src = `data:image/png;base64,${toBase64(fontBytes('otf'))}`

      expect(errorsOf(validatePresentation(rawPresentation([{ name: 'Test', src }])))).toEqual([
        'Police 1 : la source doit être une police encodée en base64 (data:font/woff2, woff, ttf ou otf).',
      ])
    })

    it.each([
      ['mime texte', `data:text/html;base64,${toBase64(fontBytes('woff2'))}`],
      ['font/ttc', `data:font/ttc;base64,${toBase64(fontBytes('ttf'))}`],
      ['sans base64', `data:font/woff2,${toBase64(fontBytes('woff2'))}`],
      ['base64 invalide', 'data:font/woff2;base64,d09GMg$$$$$$$$$$'],
      ['espace dans le base64', 'data:font/woff2;base64,d09GMgAB AgMEBQYH'],
      ['guillemet', 'data:font/woff2;base64,d09GMgABAgMEBQYH"x'],
      ['url http', 'https://exemple.test/a.woff2'],
      ['javascript', 'javascript:alert(1)'],
      ['trop court', 'data:font/woff2;base64,d09G'],
    ])('refuse une source invalide : %s', (_label, src) => {
      expect(errorsOf(validatePresentation(rawPresentation([{ name: 'Test', src }])))).toEqual([
        'Police 1 : la source doit être une police encodée en base64 (data:font/woff2, woff, ttf ou otf).',
      ])
    })

    it.each([undefined, null, 3, {}, ['x'], ''])('refuse une source qui est %j', (src) => {
      const font = src === undefined ? { name: 'Test' } : { name: 'Test', src }

      expect(errorsOf(validatePresentation(rawPresentation([font])))).toEqual([
        'Police 1 : la source doit être du texte non vide.',
      ])
    })

    it.each([
      ['woff2', 'otf'],
      ['otf', 'woff2'],
      ['ttf', 'woff'],
      ['woff', 'ttf'],
    ] as const)('refuse une signature %s sous un mime %s', (real, announced) => {
      const src = `data:${FONT_MIMES[announced]};base64,${toBase64(fontBytes(real))}`

      expect(errorsOf(validatePresentation(rawPresentation([{ name: 'Test', src }])))).toEqual([
        'Police 1 : le contenu ne correspond pas au format de police annoncé.',
      ])
    })

    it("refuse un contenu qui n'est pas une police sous un mime de police (texte)", () => {
      const src = `data:font/woff2;base64,${btoa('<html>pas une police</html>')}`

      expect(errorsOf(validatePresentation(rawPresentation([{ name: 'Test', src }])))).toEqual([
        'Police 1 : le contenu ne correspond pas au format de police annoncé.',
      ])
    })

    it('accepte une source de MAX_FONT_SRC_LENGTH caractères, refuse un caractère de plus', () => {
      const ok = srcOfLength(MAX_FONT_SRC_LENGTH)
      const tooLong = srcOfLength(MAX_FONT_SRC_LENGTH + 1)

      expect(expectOk(validatePresentation(rawPresentation([{ name: 'Test', src: ok }]))).fonts).toHaveLength(1)
      expect(errorsOf(validatePresentation(rawPresentation([{ name: 'Test', src: tooLong }])))).toEqual([
        'Police 1 : la source est trop volumineuse (3 Mo de caractères au maximum).',
      ])
    })
  })

  describe('cumul', () => {
    const big = (name: string, length = MAX_FONT_SRC_LENGTH): CustomFont => ({
      name,
      src: srcOfLength(length),
    })

    it('accepte un cumul exactement égal à la limite', () => {
      const room = MAX_TOTAL_FONT_SRC_LENGTH - 2 * MAX_FONT_SRC_LENGTH
      const fonts = [big('A'), big('B'), big('C', room)]

      expect(expectOk(validatePresentation(rawPresentation(fonts))).fonts).toHaveLength(3)
    })

    it('refuse un cumul qui dépasse la limite, avec un seul message', () => {
      const room = MAX_TOTAL_FONT_SRC_LENGTH - 2 * MAX_FONT_SRC_LENGTH
      const fonts = [big('A'), big('B'), big('C', room + 1)]

      expect(errorsOf(validatePresentation(rawPresentation(fonts)))).toEqual([
        'Le poids total des polices dépasse la limite de 8 Mo.',
      ])
    })
  })

  describe('reconstruction', () => {
    it("crée des objets neufs : aucune référence partagée avec l'entrée", () => {
      const input = [{ ...roboto }, { ...fira }]
      const raw = rawPresentation(input)

      const presentation = expectOk(validatePresentation(raw))

      expect(presentation.fonts).not.toBe(input)
      presentation.fonts.forEach((font, index) => {
        expect(font).not.toBe(input[index])
        expect(font).toEqual(input[index])
      })
    })

    it("ignore les champs inconnus d'une police", () => {
      const font = { ...roboto, extra: 'x', isAdmin: true }

      const presentation = expectOk(validatePresentation(rawPresentation([font])))

      expect(presentation.fonts[0]).toEqual(roboto)
      expect(Object.keys(presentation.fonts[0] ?? {}).sort()).toEqual(['name', 'src'])
    })

    it('ignore une police dont les champs arrivent par le prototype', () => {
      const font = Object.create({ name: 'Herite', src: roboto.src }) as Record<string, unknown>

      // Un objet à prototype personnalisé n'est pas un objet « simple ».
      expect(errorsOf(validatePresentation(rawPresentation([font])))).toEqual([
        'Police 1 : une police doit être un objet.',
      ])
    })

    it('une clé __proto__ dans le JSON ne fournit ni nom ni source', () => {
      const json = `{"version":1,"slides":[{"id":"s","elements":[]}],"fonts":[{"__proto__":{"name":"Herite","src":"${roboto.src}"}}]}`

      const errors = errorsOf(parsePresentation(json))

      expect(errors).toEqual([
        'Police 1 : le nom doit être un nom simple (lettres, chiffres, espaces, tirets).',
        'Police 1 : la source doit être du texte non vide.',
      ])
    })

    it('un __proto__ au niveau de la présentation ne pollue rien et ne crée pas de fonts', () => {
      const json = '{"version":1,"slides":[{"id":"s","elements":[]}],"__proto__":{"fonts":[{"name":"X","src":"y"}]}}'

      const presentation = expectOk(parsePresentation(json))

      expect(presentation.fonts).toEqual([])
      expect(({} as Record<string, unknown>).fonts).toBeUndefined()
    })
  })

  it('cumule les erreurs de plusieurs polices avec leur chemin', () => {
    const fonts = [{ name: 'Arial', src: roboto.src }, roboto, { name: 'Test', src: 'nope' }]

    expect(errorsOf(validatePresentation(rawPresentation(fonts)))).toEqual([
      "Police 1 : le nom est celui d'une police courante.",
      'Police 3 : la source doit être une police encodée en base64 (data:font/woff2, woff, ttf ou otf).',
    ])
  })
})

describe('aller-retour avec polices', () => {
  const presentation: Presentation = {
    version: 1,
    title: 'Avec polices',
    slides: [{ id: 's1', elements: [] }],
    fonts: [roboto, fira],
  }

  it('serializePresentation écrit fonts (name et src)', () => {
    const data = JSON.parse(serializePresentation(presentation)) as { fonts: CustomFont[] }

    expect(data.fonts).toEqual([roboto, fira])
  })

  it('export puis import redonne les mêmes polices', () => {
    const exported = prepareExport(presentation)
    if (!exported.ok) throw new Error(exported.message)

    const imported = expectOk(parsePresentation(exported.text))

    expect(imported).toEqual(presentation)
  })

  it('prepareExport compte les polices dans la taille du fichier', () => {
    const heavy: Presentation = {
      ...presentation,
      fonts: Array.from({ length: 2 }, (_, i) => ({
        name: `Lourde ${i}`,
        src: srcOfLength(MAX_FONT_SRC_LENGTH),
      })),
    }

    const exported = prepareExport(heavy)

    if (!exported.ok) throw new Error(exported.message)
    // Le texte exporté contient bien le poids des polices.
    expect(exported.text.length).toBeGreaterThan(2 * MAX_FONT_SRC_LENGTH)
  })

  it("prepareExport re-valide les polices : un nom non sûr dans l'état est refusé à l'export", () => {
    const bad: Presentation = { ...presentation, fonts: [{ name: 'a"b', src: roboto.src }] }

    const exported = prepareExport(bad)

    expect(exported.ok).toBe(false)
    if (!exported.ok) expect(exported.message).toContain('Police 1 : le nom')
  })

  it('prepareExport refuse un cumul de polices au dessus de la limite (re-validation)', () => {
    const bad: Presentation = {
      ...presentation,
      fonts: [
        { name: 'A', src: srcOfLength(MAX_FONT_SRC_LENGTH) },
        { name: 'B', src: srcOfLength(MAX_FONT_SRC_LENGTH) },
        { name: 'C', src: srcOfLength(MAX_FONT_SRC_LENGTH) },
      ],
    }

    const exported = prepareExport(bad)

    expect(exported).toEqual({
      ok: false,
      message: 'Le poids total des polices dépasse la limite de 8 Mo.',
    })
  })
})
