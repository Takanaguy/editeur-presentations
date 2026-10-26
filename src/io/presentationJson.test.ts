import {
  MAX_ALT_LENGTH,
  MAX_ELEMENTS_PER_SLIDE,
  MAX_SLIDES,
  MAX_TEXT_LENGTH,
  MAX_TITLE_LENGTH,
} from '../model/limits'
import type { Presentation } from '../model/types'
import {
  MAX_ERRORS,
  MAX_IMAGE_SRC_LENGTH,
  MAX_IMPORT_FILE_SIZE,
  checkImportFileSize,
  exportFileName,
  isSafeColor,
  parsePresentation,
  prepareExport,
  serializePresentation,
  validatePresentation,
  type ParseResult,
} from './presentationJson'

// Élément texte brut tel qu'il apparaîtrait dans un fichier (objet non typé).
function rawText(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    type: 'text',
    x: 100,
    y: 100,
    width: 300,
    height: 100,
    opacity: 1,
    text: 'Bonjour',
    fontSize: 48,
    color: '#1c2530',
    fill: null,
    bold: false,
    italic: false,
    align: 'left',
    ...extra,
  }
}

function rawRect(id: string, extra: Record<string, unknown> = {}) {
  return { id, type: 'rect', x: 0, y: 0, width: 200, height: 100, opacity: 1, fill: '#2e5d7c', ...extra }
}

function rawImage(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    type: 'image',
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    opacity: 1,
    src: 'https://exemple.fr/a.png',
    alt: 'photo',
    ...extra,
  }
}

function rawPresentation(elements: unknown[] = [rawText('e1')], extra: Record<string, unknown> = {}) {
  return { version: 1, title: 'Test', slides: [{ id: 's1', elements }], ...extra }
}

// Résultat attendu OK : échoue clairement sinon, et affiche les erreurs.
function expectOk(result: ParseResult): Presentation {
  if (!result.ok) throw new Error(`Erreurs inattendues : ${result.errors.join(' | ')}`)
  return result.presentation
}

function errorsOf(result: ParseResult): string[] {
  if (result.ok) throw new Error('Une erreur était attendue')
  return result.errors
}

// Premier élément de la première diapositive du résultat.
function firstElement(result: ParseResult) {
  const element = expectOk(result).slides[0]?.elements[0]
  if (!element) throw new Error('élément manquant')
  return element
}

describe('aller-retour', () => {
  const original: Presentation = {
    version: 1,
    title: 'Ma présentation',
    slides: [
      {
        id: 's1',
        elements: [
          {
            id: 'e1',
            type: 'text',
            x: 10,
            y: 20,
            width: 300,
            height: 80,
            opacity: 0.5,
            text: 'Titre\nsur deux lignes',
            fontSize: 36,
            color: 'rgb(10, 20, 30)',
            fill: '#ffeeaa',
            bold: true,
            italic: true,
            align: 'center',
          },
          { id: 'e2', type: 'rect', x: 400, y: 300, width: 200, height: 100, opacity: 1, fill: 'teal' },
        ],
      },
      { id: 's2', elements: [] },
      {
        id: 's3',
        elements: [
          {
            id: 'e3',
            type: 'image',
            x: 50,
            y: 60,
            width: 480,
            height: 270,
            opacity: 0.8,
            src: 'data:image/png;base64,iVBORw0KGgo=',
            alt: 'Un pixel',
          },
        ],
      },
    ],
  }

  it('redonne une présentation strictement égale en valeur', () => {
    const result = parsePresentation(serializePresentation(original))
    expect(expectOk(result)).toStrictEqual(original)
  })

  it('ne partage aucune référence avec l\'entrée', () => {
    const data: unknown = JSON.parse(serializePresentation(original))
    const presentation = expectOk(validatePresentation(data))
    const input = data as { slides: { elements: object[] }[] }
    expect(presentation).not.toBe(data)
    // Références différentes à tous les niveaux : tableau des diapositives, diapositives, éléments.
    expect(presentation.slides).not.toBe(input.slides)
    presentation.slides.forEach((slide, i) => {
      const inputSlide = input.slides[i]
      expect(slide).not.toBe(inputSlide)
      expect(slide.elements).not.toBe(inputSlide?.elements)
      slide.elements.forEach((element, j) => {
        expect(element).not.toBe(inputSlide?.elements[j])
      })
    })
  })

  it('modifier le résultat ne modifie pas l\'entrée', () => {
    const data = rawPresentation([rawText('e1')])
    const presentation = expectOk(validatePresentation(data))
    const element = presentation.slides[0]?.elements[0]
    if (element?.type !== 'text') throw new Error('texte attendu')
    element.text = 'changé'
    expect(data.slides[0]?.elements[0]).toHaveProperty('text', 'Bonjour')
  })

  it('le JSON exporté est indenté sur deux espaces', () => {
    expect(serializePresentation(original)).toContain('\n  "version": 1')
  })
})

describe('exportFileName', () => {
  it.each([
    ['Ma présentation', 'ma-presentation.json'],
    ['Été 2026 : bilan', 'ete-2026-bilan.json'],
    ['  espaces   multiples  ', 'espaces-multiples.json'],
    ['Cours/TP #3 (final)', 'cours-tp-3-final.json'],
    ['../../etc/passwd', 'etc-passwd.json'],
    ['CAFÉ-ÀÉÎÕÜ', 'cafe-aeiou.json'],
    ['', 'presentation.json'],
    ['   ', 'presentation.json'],
    ['!!! ??? ***', 'presentation.json'],
    ['日本語', 'presentation.json'],
    ["Cœur d'Œuvre", 'coeur-d-oeuvre.json'],
    ['Æther', 'aether.json'],
    ['Straße', 'strasse.json'],
    ['con', 'presentation-con.json'],
    ['CON', 'presentation-con.json'],
    ['Nul', 'presentation-nul.json'],
    ['prn', 'presentation-prn.json'],
    ['aux', 'presentation-aux.json'],
    ['COM1', 'presentation-com1.json'],
    ['lpt9', 'presentation-lpt9.json'],
    ['com0', 'com0.json'],
    ['console', 'console.json'],
    ['con 2', 'con-2.json'],
    ['a'.repeat(100), `${'a'.repeat(60)}.json`],
  ])('%j devient %j', (title, expected) => {
    expect(exportFileName(title)).toBe(expected)
  })

  it('retire le tiret laissé à la fin par la troncature', () => {
    const title = `${'a'.repeat(59)} b`
    expect(exportFileName(title)).toBe(`${'a'.repeat(59)}.json`)
  })

  it('met le préfixe aussi quand le titre se réduit à un nom réservé', () => {
    expect(exportFileName('  Con!  ')).toBe('presentation-con.json')
  })

  it('accepte une autre extension (sans point) et applique les mêmes règles', () => {
    expect(exportFileName('Ma présentation', 'pptx')).toBe('ma-presentation.pptx')
    expect(exportFileName('', 'pptx')).toBe('presentation.pptx')
    expect(exportFileName('Con', 'pptx')).toBe('presentation-con.pptx')
    expect(exportFileName('a'.repeat(100), 'pptx')).toBe(`${'a'.repeat(60)}.pptx`)
  })

  it('garde json par défaut', () => {
    expect(exportFileName('Essai')).toBe('essai.json')
    expect(exportFileName('Essai', 'json')).toBe('essai.json')
  })

  it('ne produit que des caractères sûrs', () => {
    expect(exportFileName('<script>"x";|&$`')).toMatch(/^[a-z0-9-]+\.json$/)
  })
})

describe('parsePresentation : racine', () => {
  it('refuse un JSON invalide', () => {
    expect(errorsOf(parsePresentation('{ pas du json'))).toEqual(["Le fichier n'est pas un JSON valide."])
    expect(errorsOf(parsePresentation(''))).toEqual(["Le fichier n'est pas un JSON valide."])
  })

  it.each([
    ['un tableau', '[]'],
    ['null', 'null'],
    ['un nombre', '42'],
    ['une chaîne', '"texte"'],
    ['un booléen', 'true'],
  ])('refuse %s à la racine', (_name, json) => {
    expect(parsePresentation(json).ok).toBe(false)
  })

  it('refuse un objet qui n\'est pas simple (instance de classe)', () => {
    class Faux {
      version = 1
      slides = [{ id: 's', elements: [] }]
    }
    expect(validatePresentation(new Faux()).ok).toBe(false)
  })

  it('accepte une présentation minimale valide', () => {
    expect(expectOk(parsePresentation(JSON.stringify(rawPresentation([])))).slides).toHaveLength(1)
  })
})

describe('version', () => {
  it.each([
    ['absente', undefined],
    ['2', 2],
    ["'1' (chaîne)", '1'],
    ['0', 0],
    ['null', null],
    ['1.5', 1.5],
  ])('refuse une version %s', (_name, version) => {
    const data: Record<string, unknown> = rawPresentation()
    if (version === undefined) delete data.version
    else data.version = version
    expect(errorsOf(validatePresentation(data))).toContain('Version de fichier non prise en charge.')
  })
})

describe('titre', () => {
  it('prend "Sans titre" quand il est absent', () => {
    const data: Record<string, unknown> = rawPresentation()
    delete data.title
    expect(expectOk(validatePresentation(data)).title).toBe('Sans titre')
  })

  it.each([42, null, ['a'], { a: 1 }, true])('refuse un titre qui n\'est pas du texte (%j)', (title) => {
    const errors = errorsOf(validatePresentation(rawPresentation([], { title })))
    expect(errors).toEqual(['Le titre doit être du texte.'])
  })

  it('retire les espaces autour', () => {
    expect(expectOk(validatePresentation(rawPresentation([], { title: '  Mon titre  ' }))).title).toBe(
      'Mon titre',
    )
  })

  it('tronque à 200 caractères', () => {
    const presentation = expectOk(validatePresentation(rawPresentation([], { title: 'x'.repeat(500) })))
    expect(presentation.title).toHaveLength(200)
  })

  it('accepte un titre vide', () => {
    expect(expectOk(validatePresentation(rawPresentation([], { title: '' }))).title).toBe('')
  })
})

describe('diapositives', () => {
  it('refuse l\'absence de slides', () => {
    expect(validatePresentation({ version: 1, title: 'x' }).ok).toBe(false)
  })

  it.each([['une chaîne', 'abc'], ['un objet', {}], ['null', null]])(
    'refuse slides quand c\'est %s',
    (_name, slides) => {
      expect(validatePresentation({ version: 1, slides }).ok).toBe(false)
    },
  )

  it('refuse une liste vide', () => {
    const errors = errorsOf(validatePresentation({ version: 1, slides: [] }))
    expect(errors).toEqual(['La présentation doit contenir au moins une diapositive.'])
  })

  it(`accepte exactement ${MAX_SLIDES} diapositives`, () => {
    const slides = Array.from({ length: MAX_SLIDES }, (_, i) => ({ id: `s${i}`, elements: [] }))
    expect(expectOk(validatePresentation({ version: 1, slides })).slides).toHaveLength(MAX_SLIDES)
  })

  it(`refuse ${MAX_SLIDES + 1} diapositives`, () => {
    const slides = Array.from({ length: MAX_SLIDES + 1 }, (_, i) => ({ id: `s${i}`, elements: [] }))
    const errors = errorsOf(validatePresentation({ version: 1, slides }))
    expect(errors[0]).toContain(String(MAX_SLIDES))
  })

  it('refuse une diapositive qui n\'est pas un objet', () => {
    const errors = errorsOf(validatePresentation({ version: 1, slides: [42] }))
    expect(errors[0]).toContain('Diapositive 1')
  })

  it.each([
    ['absent', undefined],
    ['vide', ''],
    ['un nombre', 5],
    ['null', null],
    ['trop long', 'a'.repeat(101)],
  ])('refuse un id de diapositive %s', (_name, id) => {
    const slide: Record<string, unknown> = { elements: [] }
    if (id !== undefined) slide.id = id
    const errors = errorsOf(validatePresentation({ version: 1, slides: [slide] }))
    expect(errors[0]).toContain("Diapositive 1 : l'identifiant")
  })

  it('accepte un id de 100 caractères', () => {
    const slides = [{ id: 'a'.repeat(100), elements: [] }]
    expect(validatePresentation({ version: 1, slides }).ok).toBe(true)
  })

  it('refuse elements absent ou qui n\'est pas un tableau', () => {
    expect(validatePresentation({ version: 1, slides: [{ id: 's1' }] }).ok).toBe(false)
    expect(validatePresentation({ version: 1, slides: [{ id: 's1', elements: {} }] }).ok).toBe(false)
  })

  it(`accepte ${MAX_ELEMENTS_PER_SLIDE} éléments mais pas ${MAX_ELEMENTS_PER_SLIDE + 1}`, () => {
    const make = (count: number) =>
      rawPresentation(Array.from({ length: count }, (_, i) => rawRect(`e${i}`)))
    expect(validatePresentation(make(MAX_ELEMENTS_PER_SLIDE)).ok).toBe(true)
    const errors = errorsOf(validatePresentation(make(MAX_ELEMENTS_PER_SLIDE + 1)))
    expect(errors).toEqual([`Diapositive 1 : au plus ${MAX_ELEMENTS_PER_SLIDE} éléments sont acceptés.`])
  })
})

describe('identifiants uniques', () => {
  it('refuse deux diapositives de même id', () => {
    const data = {
      version: 1,
      slides: [
        { id: 's1', elements: [] },
        { id: 's1', elements: [] },
      ],
    }
    const errors = errorsOf(validatePresentation(data))
    expect(errors[0]).toContain('Identifiant en double : « s1 »')
  })

  it('refuse deux éléments de même id dans la même diapositive', () => {
    const errors = errorsOf(validatePresentation(rawPresentation([rawRect('e1'), rawText('e1')])))
    expect(errors[0]).toContain('Identifiant en double : « e1 »')
  })

  it('refuse deux éléments de même id dans deux diapositives différentes', () => {
    const data = {
      version: 1,
      slides: [
        { id: 's1', elements: [rawRect('dup')] },
        { id: 's2', elements: [rawText('dup')] },
      ],
    }
    const errors = errorsOf(validatePresentation(data))
    expect(errors[0]).toContain('Identifiant en double : « dup »')
    expect(errors[0]).toContain('Diapositive 2, élément 1')
  })
})

describe('éléments : type, id, géométrie', () => {
  it('refuse un type inconnu', () => {
    const errors = errorsOf(validatePresentation(rawPresentation([rawRect('e1', { type: 'video' })])))
    expect(errors[0]).toContain('Diapositive 1, élément 1')
    expect(errors[0]).toContain('type')
  })

  it('refuse un élément sans type et un élément qui n\'est pas un objet', () => {
    const noType: Record<string, unknown> = rawRect('e1')
    delete noType.type
    expect(validatePresentation(rawPresentation([noType])).ok).toBe(false)
    expect(validatePresentation(rawPresentation([null])).ok).toBe(false)
    expect(validatePresentation(rawPresentation(['texte'])).ok).toBe(false)
    expect(validatePresentation(rawPresentation([[]])).ok).toBe(false)
  })

  it.each([
    ['absent', undefined],
    ['vide', ''],
    ['un nombre', 7],
    ['trop long', 'a'.repeat(101)],
  ])('refuse un id d\'élément %s', (_name, id) => {
    const element: Record<string, unknown> = rawRect('x')
    if (id === undefined) delete element.id
    else element.id = id
    const errors = errorsOf(validatePresentation(rawPresentation([element])))
    expect(errors[0]).toContain("Diapositive 1, élément 1 : l'identifiant")
  })

  it('refuse une géométrie en chaîne avec un message précis', () => {
    const errors = errorsOf(validatePresentation(rawPresentation([rawRect('e1', { width: '200' })])))
    expect(errors).toEqual(['Diapositive 1, élément 1 : la largeur doit être un nombre.'])
  })

  it.each(['x', 'y', 'width', 'height'])('refuse %s absent, null ou NaN-like', (key) => {
    const element: Record<string, unknown> = rawRect('e1')
    delete element[key]
    expect(validatePresentation(rawPresentation([element])).ok).toBe(false)
    expect(validatePresentation(rawPresentation([rawRect('e1', { [key]: null })])).ok).toBe(false)
  })

  it('refuse un nombre non fini (1e999 devient Infinity dans le JSON)', () => {
    const json = '{"version":1,"slides":[{"id":"s","elements":[{"id":"e","type":"rect","x":1e999,"y":0,"width":10,"height":10,"fill":"red"}]}]}'
    expect(parsePresentation(json).ok).toBe(false)
    expect(validatePresentation(rawPresentation([rawRect('e1', { x: Number.NaN })])).ok).toBe(false)
    expect(
      validatePresentation(rawPresentation([rawRect('e1', { y: Number.NEGATIVE_INFINITY })])).ok,
    ).toBe(false)
  })

  it('normalise une géométrie hors limites par clamp', () => {
    const element = firstElement(
      validatePresentation(rawPresentation([rawRect('e1', { x: -50, y: 9999, width: 5000, height: 4000 })])),
    )
    expect(element).toMatchObject({ x: 0, y: 0, width: 1280, height: 720 })
  })

  it('ramène une position qui déborde à l\'intérieur de la diapositive', () => {
    const element = firstElement(
      validatePresentation(rawPresentation([rawRect('e1', { x: 1200, y: 700, width: 200, height: 100 })])),
    )
    expect(element).toMatchObject({ x: 1080, y: 620, width: 200, height: 100 })
  })

  it.each([0, -5, -1000])('normalise une largeur ou hauteur de %s à la taille minimale', (size) => {
    const element = firstElement(
      validatePresentation(rawPresentation([rawRect('e1', { width: size, height: size })])),
    )
    expect(element).toMatchObject({ width: 20, height: 20 })
  })

  it('arrondit les décimales à l\'entier', () => {
    const element = firstElement(
      validatePresentation(
        rawPresentation([rawRect('e1', { x: 10.4, y: 20.6, width: 100.5, height: 50.2 })]),
      ),
    )
    expect(element).toMatchObject({ x: 10, y: 21, width: 101, height: 50 })
  })
})

describe('opacité', () => {
  it('vaut 1 quand elle est absente', () => {
    const element: Record<string, unknown> = rawRect('e1')
    delete element.opacity
    expect(firstElement(validatePresentation(rawPresentation([element]))).opacity).toBe(1)
  })

  it.each([
    [-3, 0],
    [7, 1],
    [0.25, 0.25],
    [0, 0],
    [1, 1],
  ])('borne %s à %s', (value, expected) => {
    const element = firstElement(validatePresentation(rawPresentation([rawRect('e1', { opacity: value })])))
    expect(element.opacity).toBe(expected)
  })

  it.each(['0.5', null, true, {}, Number.NaN])('refuse une opacité qui n\'est pas un nombre (%j)', (value) => {
    const errors = errorsOf(validatePresentation(rawPresentation([rawRect('e1', { opacity: value })])))
    expect(errors).toEqual(["Diapositive 1, élément 1 : l'opacité doit être un nombre."])
  })
})

describe('élément texte', () => {
  function textOf(extra: Record<string, unknown>) {
    const element = firstElement(validatePresentation(rawPresentation([rawText('e1', extra)])))
    if (element.type !== 'text') throw new Error('texte attendu')
    return element
  }

  it('clampe fontSize entre 8 et 400', () => {
    expect(textOf({ fontSize: 1 }).fontSize).toBe(8)
    expect(textOf({ fontSize: 9999 }).fontSize).toBe(400)
    expect(textOf({ fontSize: 24.5 }).fontSize).toBe(24.5)
  })

  it('refuse une taille de police absente ou en chaîne', () => {
    expect(validatePresentation(rawPresentation([rawText('e1', { fontSize: '12' })])).ok).toBe(false)
    const element: Record<string, unknown> = rawText('e1')
    delete element.fontSize
    expect(validatePresentation(rawPresentation([element])).ok).toBe(false)
  })

  it('refuse bold ou italic qui ne sont pas des booléens', () => {
    expect(errorsOf(validatePresentation(rawPresentation([rawText('e1', { bold: 'oui' })])))[0]).toContain(
      'le gras doit valoir vrai ou faux',
    )
    expect(validatePresentation(rawPresentation([rawText('e1', { italic: 1 })])).ok).toBe(false)
    expect(validatePresentation(rawPresentation([rawText('e1', { bold: null })])).ok).toBe(false)
  })

  it('bold et italic valent false quand ils sont absents', () => {
    const data: Record<string, unknown> = rawText('e1')
    delete data.bold
    delete data.italic
    const element = firstElement(validatePresentation(rawPresentation([data])))
    expect(element).toMatchObject({ bold: false, italic: false })
  })

  it('refuse un align inconnu', () => {
    expect(validatePresentation(rawPresentation([rawText('e1', { align: 'justify' })])).ok).toBe(false)
    expect(validatePresentation(rawPresentation([rawText('e1', { align: 3 })])).ok).toBe(false)
    expect(validatePresentation(rawPresentation([rawText('e1', { align: null })])).ok).toBe(false)
  })

  it.each(['left', 'center', 'right'])('accepte align %s', (align) => {
    expect(textOf({ align }).align).toBe(align)
  })

  it('align vaut left quand il est absent', () => {
    const data: Record<string, unknown> = rawText('e1')
    delete data.align
    expect(firstElement(validatePresentation(rawPresentation([data])))).toHaveProperty('align', 'left')
  })

  it('fill vaut null quand il est null ou absent', () => {
    expect(textOf({ fill: null }).fill).toBeNull()
    const data: Record<string, unknown> = rawText('e1')
    delete data.fill
    expect(firstElement(validatePresentation(rawPresentation([data])))).toHaveProperty('fill', null)
  })

  it('refuse un fill non valide', () => {
    expect(validatePresentation(rawPresentation([rawText('e1', { fill: 'url(x)' })])).ok).toBe(false)
    expect(validatePresentation(rawPresentation([rawText('e1', { fill: 12 })])).ok).toBe(false)
  })

  it('refuse une couleur de texte absente ou invalide', () => {
    const data: Record<string, unknown> = rawText('e1')
    delete data.color
    expect(validatePresentation(rawPresentation([data])).ok).toBe(false)
    expect(validatePresentation(rawPresentation([rawText('e1', { color: '' })])).ok).toBe(false)
  })

  it(`accepte ${MAX_TEXT_LENGTH} caractères et refuse ${MAX_TEXT_LENGTH + 1}`, () => {
    expect(textOf({ text: 'a'.repeat(MAX_TEXT_LENGTH) }).text).toHaveLength(MAX_TEXT_LENGTH)
    const errors = errorsOf(
      validatePresentation(rawPresentation([rawText('e1', { text: 'a'.repeat(MAX_TEXT_LENGTH + 1) })])),
    )
    expect(errors[0]).toContain('le texte ne doit pas dépasser')
  })

  it('refuse un texte absent ou qui n\'est pas une chaîne, mais accepte une chaîne vide', () => {
    expect(validatePresentation(rawPresentation([rawText('e1', { text: 5 })])).ok).toBe(false)
    expect(textOf({ text: '' }).text).toBe('')
  })

  it('ne touche pas au contenu du texte (balises restent du texte inerte)', () => {
    expect(textOf({ text: '<img src=x onerror=alert(1)>' }).text).toBe('<img src=x onerror=alert(1)>')
  })
})

describe('élément rectangle', () => {
  it('exige un fill valide', () => {
    const data: Record<string, unknown> = rawRect('e1')
    delete data.fill
    expect(errorsOf(validatePresentation(rawPresentation([data])))[0]).toContain(
      'la couleur de remplissage',
    )
    expect(validatePresentation(rawPresentation([rawRect('e1', { fill: null })])).ok).toBe(false)
  })
})

describe('élément image', () => {
  function srcErrors(src: unknown) {
    return validatePresentation(rawPresentation([rawImage('e1', { src })]))
  }

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java\nscript:alert(1)',
    'file:///etc/passwd',
    'data:text/html,<script>alert(1)</script>',
    'data:application/javascript,alert(1)',
    'ftp://exemple.fr/a.png',
    'vbscript:x',
    '//exemple.fr/a.png',
    'a.png',
    '',
    '   ',
  ])('refuse la source %j', (src) => {
    expect(srcErrors(src).ok).toBe(false)
  })

  it.each([
    'http://exemple.fr/a.png',
    'https://exemple.fr/a.png?x=1',
    'data:image/png;base64,iVBORw0KGgo=',
  ])('accepte la source %j', (src) => {
    const element = firstElement(srcErrors(src))
    expect(element).toHaveProperty('src', src)
  })

  it('refuse une source absente ou qui n\'est pas du texte', () => {
    const data: Record<string, unknown> = rawImage('e1')
    delete data.src
    expect(validatePresentation(rawPresentation([data])).ok).toBe(false)
    expect(srcErrors(42).ok).toBe(false)
    expect(srcErrors(null).ok).toBe(false)
  })

  it('range la source sans espaces autour', () => {
    expect(firstElement(srcErrors('  https://exemple.fr/a.png  '))).toHaveProperty(
      'src',
      'https://exemple.fr/a.png',
    )
  })

  it('refuse une source trop longue', () => {
    const src = `data:image/png;base64,${'A'.repeat(MAX_IMAGE_SRC_LENGTH)}`
    const errors = errorsOf(srcErrors(src))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('trop volumineuse')
  })

  it('accepte une data URL de 2,8 millions de caractères (image de 2 Mo)', () => {
    const src = `data:image/png;base64,${'A'.repeat(2_900_000)}`
    expect(srcErrors(src).ok).toBe(true)
  })

  it('alt vaut une chaîne vide quand il est absent', () => {
    const data: Record<string, unknown> = rawImage('e1')
    delete data.alt
    expect(firstElement(validatePresentation(rawPresentation([data])))).toHaveProperty('alt', '')
  })

  it(`accepte un alt de ${MAX_ALT_LENGTH} caractères et refuse ${MAX_ALT_LENGTH + 1}`, () => {
    const ok = validatePresentation(rawPresentation([rawImage('e1', { alt: 'a'.repeat(MAX_ALT_LENGTH) })]))
    expect(ok.ok).toBe(true)
    const tooLong = validatePresentation(
      rawPresentation([rawImage('e1', { alt: 'a'.repeat(MAX_ALT_LENGTH + 1) })]),
    )
    expect(tooLong.ok).toBe(false)
    expect(validatePresentation(rawPresentation([rawImage('e1', { alt: 5 })])).ok).toBe(false)
  })
})

describe('isSafeColor', () => {
  it.each([
    '#fff',
    '#FFF',
    '#ffff',
    '#FFFFFF',
    '#1c2530',
    '#1c253080',
    'red',
    'Red',
    'rebeccapurple',
    'transparent',
    'rgb(10, 20, 30)',
    'rgba(10,20,30,0.5)',
    'RGB(10, 20, 30)',
    'hsl(210 40% 20%)',
    'hsl(210, 40%, 20%)',
    'hsla(210, 40%, 20%, 50%)',
    'rgb(-1, 2.5, 3)',
  ])('accepte %j', (value) => {
    expect(isSafeColor(value)).toBe(true)
  })

  it.each([
    'url(http://x/a.png)',
    'url(x)',
    'URL(x)',
    'var(x)',
    'calc(1)',
    'expression(alert)',
    'rgb(a)',
    'rgb()',
    'rgb( )',
    'rgb(1, 2, 3',
    'rgb(1, 2, 3))',
    'rgb(1,2,3) red',
    'red)',
    'red(',
    '(1)',
    'red"',
    "red'",
    'red;',
    'red; background: url(x)',
    '{color:red}',
    'red}',
    'a/b',
    'var(--x)\\',
    '<red>',
    'red!important',
    '-',
    '#',
    '#f',
    '#ff',
    '#fffff',
    '#fffffff',
    '#fffffffff',
    '#ggg',
    '# fff',
    'red\n',
    'rgb(1,\n2,3)',
    'rgb(1,\t2,3)',
    ' red',
    'red ',
    '   ',
    'dark blue',
    'a'.repeat(31),
    'rgb(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20)',
    '',
  ])('refuse %j', (value) => {
    expect(isSafeColor(value)).toBe(false)
  })

  it('refuse les espaces Unicode et les retours à la ligne', () => {
    for (const code of [0x0a, 0x0d, 0x09, 0xa0, 0x2003, 0x3000]) {
      const space = String.fromCharCode(code)
      expect(isSafeColor('rgb(1,' + space + '2,3)')).toBe(false)
      expect(isSafeColor('red' + space)).toBe(false)
    }
  })

  it('accepte un nom de 30 lettres et refuse 31', () => {
    expect(isSafeColor('a'.repeat(30))).toBe(true)
    expect(isSafeColor('a'.repeat(31))).toBe(false)
  })

  it.each([null, undefined, 5, true, {}, [], ['red']])('refuse la valeur non textuelle %j', (value) => {
    expect(isSafeColor(value)).toBe(false)
  })

  it('refuse les couleurs dangereuses dans un fichier importé', () => {
    for (const fill of ['url(x)', 'red"', 'red;', 'red}', 'red\n']) {
      expect(validatePresentation(rawPresentation([rawRect('e1', { fill })])).ok).toBe(false)
    }
    for (const fill of ['#fff', '#ffffff', 'rgb(1, 2, 3)', 'blue']) {
      expect(validatePresentation(rawPresentation([rawRect('e1', { fill })])).ok).toBe(true)
    }
  })
})

describe('clés dangereuses et champs inconnus', () => {
  it('ne pollue pas Object.prototype et ne copie pas les clés dangereuses à la racine', () => {
    const json =
      '{"version":1,"title":"x","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"toString":"x","slides":[{"id":"s","elements":[]}]}'
    const presentation = expectOk(parsePresentation(json))
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.keys(presentation).sort()).toEqual(['slides', 'title', 'version'])
    expect(Object.hasOwn(presentation, '__proto__')).toBe(false)
    expect(Object.hasOwn(presentation, 'constructor')).toBe(false)
    expect(Object.hasOwn(presentation, 'toString')).toBe(false)
    expect(Object.getPrototypeOf(presentation)).toBe(Object.prototype)
  })

  it('ne copie pas les clés dangereuses d\'un élément ni d\'une diapositive', () => {
    const json =
      '{"version":1,"slides":[{"id":"s","__proto__":{"polluted":true},"constructor":"x","elements":[{"id":"e","type":"rect","x":0,"y":0,"width":50,"height":50,"fill":"red","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"toString":"x","isAdmin":true}]}]}'
    const presentation = expectOk(parsePresentation(json))
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    const slide = presentation.slides[0]
    const element = slide?.elements[0]
    expect(Object.keys(slide ?? {}).sort()).toEqual(['elements', 'id'])
    expect(Object.keys(element ?? {}).sort()).toEqual(
      ['fill', 'height', 'id', 'opacity', 'type', 'width', 'x', 'y'],
    )
    expect(element).not.toHaveProperty('isAdmin')
    expect(Object.getPrototypeOf(element)).toBe(Object.prototype)
  })

  it('une clé « __proto__ » dans le JSON ne fournit pas un champ requis', () => {
    // JSON.parse crée une vraie propriété nommée __proto__ : elle ne devient pas le prototype
    // et on ne la lit jamais, donc l'id de la diapositive reste manquant.
    const json = '{"version":1,"slides":[{"__proto__":{"id":"herite"},"elements":[]}]}'
    expect(parsePresentation(json).ok).toBe(false)
  })

  it('ne lit que des propriétés propres (Object.hasOwn), jamais le prototype', () => {
    // On pollue volontairement Object.prototype : si le code lisait un champ sans passer
    // par Object.hasOwn, id, fill, elements et la géométrie seraient trouvés par héritage
    // et l'import réussirait.
    const polluted: Record<string, unknown> = {
      id: 'herite',
      fill: 'red',
      elements: [],
      x: 0,
      y: 0,
      width: 50,
      height: 50,
    }
    try {
      for (const [key, value] of Object.entries(polluted)) {
        Object.defineProperty(Object.prototype, key, {
          value,
          configurable: true,
          writable: true,
          enumerable: false,
        })
      }
      // Rien de tout cela n'est une propriété propre de ces objets.
      const data = { version: 1, slides: [{}, { elements: [{ type: 'rect' }] }] }
      const errors = errorsOf(validatePresentation(data))
      expect(errors).toContain("Diapositive 1 : l'identifiant doit être du texte.")
      expect(errors).toContain('Diapositive 1 : la liste des éléments doit être un tableau.')
      expect(errors).toContain("Diapositive 2, élément 1 : l'identifiant doit être du texte.")
      expect(errors).toContain('Diapositive 2, élément 1 : la largeur doit être un nombre.')
      expect(errors).toContain(
        'Diapositive 2, élément 1 : la couleur de remplissage doit être une couleur valide (par exemple #2e5d7c).',
      )
    } finally {
      // Nettoyage dans tous les cas : un Object.prototype pollué casserait les autres tests.
      for (const key of Object.keys(polluted)) Reflect.deleteProperty(Object.prototype, key)
    }
    expect(({} as Record<string, unknown>).id).toBeUndefined()
    // Sans pollution, une présentation complète et propre est bien acceptée.
    expect(validatePresentation(rawPresentation([rawRect('e1')])).ok).toBe(true)
  })

  it('refuse un objet à prototype personnalisé (non simple)', () => {
    const custom = Object.assign(Object.create({ fill: 'red' }) as object, {
      id: 'e1',
      type: 'rect',
      x: 0,
      y: 0,
      width: 50,
      height: 50,
    })
    expect(validatePresentation(rawPresentation([custom])).ok).toBe(false)
  })

  it('accepte un objet à prototype nul', () => {
    const element = Object.assign(Object.create(null) as object, rawRect('e1'))
    expect(validatePresentation(rawPresentation([element])).ok).toBe(true)
  })

  it('supprime les champs inconnus', () => {
    const data = rawPresentation([rawText('e1', { secret: 1, onclick: 'x' }), rawRect('e2', { extra: [] })], {
      auteur: 'moi',
    })
    const presentation = expectOk(validatePresentation(data))
    expect(presentation).not.toHaveProperty('auteur')
    const [text, rect] = presentation.slides[0]?.elements ?? []
    expect(text).not.toHaveProperty('secret')
    expect(text).not.toHaveProperty('onclick')
    expect(rect).not.toHaveProperty('extra')
    // Un champ d'un autre type d'élément est ignoré aussi.
    const typed = firstElement(validatePresentation(rawPresentation([rawRect('e1', { text: 'x', src: 'y' })])))
    expect(typed).not.toHaveProperty('text')
    expect(typed).not.toHaveProperty('src')
  })
})

describe('messages d\'erreur', () => {
  it('accumule plusieurs erreurs au lieu de s\'arrêter à la première', () => {
    const data = {
      version: 2,
      title: 5,
      slides: [{ id: '', elements: [rawRect('e1', { width: 'large', fill: 'url(x)' })] }],
    }
    const errors = errorsOf(validatePresentation(data))
    expect(errors).toEqual([
      'Version de fichier non prise en charge.',
      'Le titre doit être du texte.',
      "Diapositive 1 : l'identifiant ne doit pas être vide.",
      'Diapositive 1, élément 1 : la largeur doit être un nombre.',
      'Diapositive 1, élément 1 : la couleur de remplissage doit être une couleur valide (par exemple #2e5d7c).',
    ])
  })

  it('numérote les diapositives et les éléments à partir de 1', () => {
    const data = {
      version: 1,
      slides: [
        { id: 's1', elements: [] },
        { id: 's2', elements: [rawRect('a'), rawRect('b'), rawRect('c', { height: 'x' })] },
      ],
    }
    expect(errorsOf(validatePresentation(data))).toEqual([
      'Diapositive 2, élément 3 : la hauteur doit être un nombre.',
    ])
  })

  it(`plafonne à ${MAX_ERRORS} messages puis une phrase de fin`, () => {
    const elements = Array.from({ length: 100 }, (_, i) => rawRect(`e${i}`, { width: 'x' }))
    const errors = errorsOf(validatePresentation(rawPresentation(elements)))
    expect(errors).toHaveLength(MAX_ERRORS + 1)
    expect(errors.at(-1)).toBe("… et d'autres erreurs.")
    expect(errors[0]).toContain('élément 1')
    expect(errors[MAX_ERRORS - 1]).toContain(`élément ${MAX_ERRORS}`)
  })

  it(`ne met pas la phrase de fin avec exactement ${MAX_ERRORS} erreurs`, () => {
    const elements = Array.from({ length: MAX_ERRORS }, (_, i) => rawRect(`e${i}`, { width: 'x' }))
    const errors = errorsOf(validatePresentation(rawPresentation(elements)))
    expect(errors).toHaveLength(MAX_ERRORS)
    expect(errors.at(-1)).not.toContain('d\'autres')
  })

  it('ne contient aucun tiret cadratin ni demi-cadratin', () => {
    const data = {
      version: 2,
      title: 5,
      slides: [{ id: '', elements: [rawText('e', { align: 'x', bold: 1, fill: 3, src: 1 }), rawImage('e', { src: 'file:///x' })] }],
    }
    const text = errorsOf(validatePresentation(data)).join('\n')
    expect(text).not.toMatch(new RegExp(String.fromCharCode(91, 0x2013, 0x2014, 93)))
  })
})

describe('checkImportFileSize', () => {
  it('accepte la taille limite exacte', () => {
    expect(checkImportFileSize(MAX_IMPORT_FILE_SIZE)).toBeNull()
  })

  it('refuse un octet de plus, avec une limite dérivée de la constante', () => {
    const message = checkImportFileSize(MAX_IMPORT_FILE_SIZE + 1)
    expect(message).toBe('Le fichier dépasse ' + MAX_IMPORT_FILE_SIZE / (1024 * 1024) + ' Mo.')
    expect(message).toBe('Le fichier dépasse 25 Mo.')
  })

  it('accepte 0 et les valeurs négatives (ce n\'est pas une question de taille)', () => {
    expect(checkImportFileSize(0)).toBeNull()
    expect(checkImportFileSize(-1)).toBeNull()
  })

  it('refuse NaN et l\'infini', () => {
    expect(checkImportFileSize(Number.NaN)).toBe('La taille du fichier est invalide.')
    expect(checkImportFileSize(Number.POSITIVE_INFINITY)).toBe('Le fichier dépasse 25 Mo.')
  })

  it('la limite vaut 25 Mo', () => {
    expect(MAX_IMPORT_FILE_SIZE).toBe(25 * 1024 * 1024)
  })
})

describe('parsePresentation : taille du texte', () => {
  it('refuse un texte plus long que la limite, avant tout JSON.parse', () => {
    const spy = vi.spyOn(JSON, 'parse')
    try {
      const result = parsePresentation(' '.repeat(MAX_IMPORT_FILE_SIZE + 1))
      expect(errorsOf(result)).toEqual(['Le fichier dépasse 25 Mo.'])
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it('accepte un texte de la taille limite exacte (ici refusé ensuite comme JSON invalide)', () => {
    const errors = errorsOf(parsePresentation(' '.repeat(MAX_IMPORT_FILE_SIZE)))
    expect(errors).toEqual(["Le fichier n'est pas un JSON valide."])
  })
})

describe('limites partagées avec l\'éditeur', () => {
  it('une présentation exactement à la limite est acceptée', () => {
    const elements = Array.from({ length: MAX_ELEMENTS_PER_SLIDE }, (_, i) =>
      rawText('e' + i, { text: 'a'.repeat(MAX_TEXT_LENGTH) }),
    )
    const data = rawPresentation(elements, { title: 'x'.repeat(MAX_TITLE_LENGTH) })
    expect(validatePresentation(data).ok).toBe(true)
  })
})

describe('prepareExport', () => {
  const small: Presentation = {
    version: 1,
    title: 'Été 2026',
    slides: [{ id: 's1', elements: [] }],
  }

  it('retourne le texte sérialisé et le nom de fichier dérivé du titre', () => {
    const result = prepareExport(small)
    expect(result).toEqual({ ok: true, fileName: 'ete-2026.json', text: serializePresentation(small) })
  })

  it('refuse une présentation que l\'import refuserait (texte trop long)', () => {
    const bad: Presentation = {
      version: 1,
      title: 'Trop',
      slides: [
        {
          id: 's1',
          elements: [
            {
              id: 'e1',
              type: 'text',
              x: 0,
              y: 0,
              width: 100,
              height: 100,
              opacity: 1,
              text: 'a'.repeat(MAX_TEXT_LENGTH + 1),
              fontSize: 20,
              color: '#000000',
              fill: null,
              bold: false,
              italic: false,
              align: 'left',
            },
          ],
        },
      ],
    }
    const result = prepareExport(bad)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('Diapositive 1, élément 1 : le texte')
  })

  it('refuse un fichier de plus de 25 Mo (mesuré en octets)', () => {
    // Des caractères sur 3 octets en UTF-8 : peu de caractères, beaucoup d'octets.
    const tripleByte = '€'.repeat(Math.ceil(MAX_IMPORT_FILE_SIZE / 3) + 10)
    const huge: Presentation = {
      version: 1,
      title: tripleByte,
      slides: [{ id: 's1', elements: [] }],
    }
    expect(prepareExport(huge)).toEqual({ ok: false, message: 'La présentation dépasse 25 Mo.' })
  })
})
