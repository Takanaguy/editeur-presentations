import {
  createImageElement,
  createPresentation,
  createRectElement,
  createSlide,
  createTextElement,
} from '../model/factories'
import { BUILT_IN_FONTS } from '../model/fonts'
import type { Presentation, SlideElement } from '../model/types'
import {
  DEFAULT_FONT_FACE,
  PPTX_MIME_TYPE,
  PptxExportError,
  buildPptxPlan,
  containRect,
  cssColorToHex,
  escapeXmlAttr,
  exportToPptx,
  IMAGE_LOAD_CONCURRENCY,
  mapWithConcurrency,
  sanitizeForXml,
  type LoadedImages,
  type PlanImage,
  type PlanRect,
  type PlanText,
  type PptxLibrary,
} from './pptxExport'

const NO_IMAGES: LoadedImages = new Map()

function presentationOf(...slides: SlideElement[][]): Presentation {
  return {
    version: 1,
    title: 'Essai',
    slides: slides.map((elements) => ({ ...createSlide(), elements })),
  }
}

// Plan d'une diapositive d'un seul élément.
function planOf(element: SlideElement, images: LoadedImages = NO_IMAGES) {
  const plan = buildPptxPlan(presentationOf([element]), images)
  return { plan, item: plan.slides[0]!.items[0]! }
}

const PNG = 'image/png;base64,AAAA'

describe('buildPptxPlan : page et structure', () => {
  it('la page fait 13,333 x 7,5 pouces (format 16:9 large)', () => {
    const plan = buildPptxPlan(presentationOf([]), NO_IMAGES)

    expect(plan.pageWidth).toBeCloseTo(13.3333, 4)
    expect(plan.pageHeight).toBe(7.5)
  })

  it('une diapositive du plan par diapositive de la présentation, titre repris', () => {
    const plan = buildPptxPlan({ ...presentationOf([], [], []), title: 'Mon titre' }, NO_IMAGES)

    expect(plan.slides).toHaveLength(3)
    expect(plan.title).toBe('Mon titre')
    expect(plan.warnings).toEqual([])
  })

  it('une diapositive sans élément donne une diapositive vide', () => {
    const plan = buildPptxPlan(createPresentation('Vide'), NO_IMAGES)

    expect(plan.slides).toEqual([{ items: [] }])
  })

  it('conserve l\'ordre des éléments : le dernier est au premier plan', () => {
    const first = createRectElement({ fill: '#ff0000' })
    const second = createTextElement({ text: 'deux' })
    const third = createRectElement({ fill: '#0000ff' })

    const plan = buildPptxPlan(presentationOf([first, second, third]), NO_IMAGES)

    expect(plan.slides[0]!.items.map((item) => item.kind)).toEqual(['rect', 'text', 'rect'])
    expect((plan.slides[0]!.items[0] as PlanRect).fill).toBe('FF0000')
    expect((plan.slides[0]!.items[2] as PlanRect).fill).toBe('0000FF')
  })

  it('ne modifie pas la présentation', () => {
    const presentation = presentationOf([createTextElement(), createImageElement('data:image/png;base64,AAAA')])
    const before = JSON.stringify(presentation)

    buildPptxPlan(presentation, NO_IMAGES)

    expect(JSON.stringify(presentation)).toBe(before)
  })
})

describe('buildPptxPlan : conversions d\'unités', () => {
  it('convertit les pixels en pouces (1 pouce = 96 px)', () => {
    const { item } = planOf(createRectElement({ x: 96, y: 192, width: 480, height: 48 }))

    expect(item).toMatchObject({ x: 1, y: 2, w: 5, h: 0.5 })
  })

  it('la diapositive entière occupe exactement la page', () => {
    const { item, plan } = planOf(createRectElement({ x: 0, y: 0, width: 1280, height: 720 }))

    expect((item as PlanRect).w).toBeCloseTo(plan.pageWidth, 10)
    expect((item as PlanRect).h).toBeCloseTo(plan.pageHeight, 10)
  })

  it.each([
    [48, 36],
    [16, 12],
    [14, 10.5],
    [8, 6],
    [400, 300],
  ])('une police de %d px donne %d points', (px, pt) => {
    const { item } = planOf(createTextElement({ fontSize: px }))

    expect((item as PlanText).fontSize).toBe(pt)
  })

  it('la marge intérieure de 8 px donne 6 points', () => {
    const { item } = planOf(createTextElement())

    expect((item as PlanText).margin).toBe(6)
  })

  it('l\'interligne exact vaut 1,25 fois la taille en points', () => {
    const { item } = planOf(createTextElement({ fontSize: 48 }))

    // 48 px = 36 pt ; 36 x 1,25 = 45 pt
    expect((item as PlanText).lineSpacing).toBe(45)
  })
})

describe('buildPptxPlan : texte', () => {
  it('traduit un texte simple', () => {
    const { item } = planOf(
      createTextElement({ text: 'Bonjour', x: 96, y: 48, width: 960, height: 120, color: '#2e5d7c' }),
    )

    expect(item).toEqual({
      kind: 'text',
      x: 1,
      y: 0.5,
      w: 10,
      h: 1.25,
      text: 'Bonjour',
      fontFace: DEFAULT_FONT_FACE,
      fontSize: 36,
      bold: false,
      italic: false,
      align: 'left',
      valign: 'top',
      color: '2E5D7C',
      colorTransparency: 0,
      fill: null,
      fillTransparency: 0,
      margin: 6,
      lineSpacing: 45,
    })
  })

  it('la police par défaut est Arial', () => {
    expect(DEFAULT_FONT_FACE).toBe('Arial')
  })

  it('sans police choisie (null), garde Arial', () => {
    const { item } = planOf(createTextElement({ fontFamily: null }))

    expect((item as PlanText).fontFace).toBe('Arial')
  })

  it.each(BUILT_IN_FONTS.map((font) => font.name))(
    'reprend la police courante « %s » sans avertissement',
    (name) => {
      const { item, plan } = planOf(createTextElement({ fontFamily: name }))

      expect((item as PlanText).fontFace).toBe(name)
      expect(plan.warnings).toEqual([])
    },
  )

  it('une police hors liste est reprise telle quelle, avec un avertissement', () => {
    const { item, plan } = planOf(createTextElement({ fontFamily: 'Calibri' }))

    expect((item as PlanText).fontFace).toBe('Calibri')
    expect(plan.warnings).toEqual([
      "La police « Calibri » doit être installée sur l'ordinateur qui ouvre le fichier PowerPoint.",
    ])
  })

  it('avertit une seule fois par police, même utilisée sur plusieurs textes et diapositives', () => {
    const plan = buildPptxPlan(
      presentationOf(
        [createTextElement({ fontFamily: 'Calibri' }), createTextElement({ fontFamily: 'Calibri' })],
        [createTextElement({ fontFamily: 'Calibri' }), createTextElement({ fontFamily: 'Open Sans' })],
      ),
      NO_IMAGES,
    )

    expect(plan.warnings).toEqual([
      "La police « Calibri » doit être installée sur l'ordinateur qui ouvre le fichier PowerPoint.",
      "La police « Open Sans » doit être installée sur l'ordinateur qui ouvre le fichier PowerPoint.",
    ])
  })

  it('le cadre gris d\'une image manquante garde Arial', () => {
    const { item } = planOf(createImageElement('https://exemple.fr/x.png'))

    expect((item as PlanText).fontFace).toBe('Arial')
  })

  it('reprend gras, italique et alignement', () => {
    const { item } = planOf(createTextElement({ bold: true, italic: true, align: 'right' }))

    expect(item).toMatchObject({ bold: true, italic: true, align: 'right', valign: 'top' })
  })

  it.each(['left', 'center', 'right'] as const)('reprend l\'alignement %s', (align) => {
    const { item } = planOf(createTextElement({ align }))

    expect((item as PlanText).align).toBe(align)
  })

  it('le fond du texte devient un remplissage de la zone', () => {
    const { item } = planOf(createTextElement({ fill: '#ffeeaa' }))

    expect(item).toMatchObject({ fill: 'FFEEAA', fillTransparency: 0 })
  })

  it('sans fond, aucun remplissage', () => {
    const { item } = planOf(createTextElement({ fill: null }))

    expect(item).toMatchObject({ fill: null, fillTransparency: 0 })
  })

  it('garde le texte multiligne tel quel (les \\n sont traités à l\'écriture)', () => {
    const { item } = planOf(createTextElement({ text: 'ligne 1\nligne 2\n\nligne 4' }))

    expect((item as PlanText).text).toBe('ligne 1\nligne 2\n\nligne 4')
  })

  it('l\'opacité devient la transparence du texte ET du fond', () => {
    const { item } = planOf(createTextElement({ opacity: 0.4, fill: '#ffffff' }))

    // (1 - 0,4) x 100 = 60 %
    expect(item).toMatchObject({ colorTransparency: 60, fillTransparency: 60 })
  })

  it('combine l\'opacité de l\'élément et celle de la couleur (rgba)', () => {
    const { item } = planOf(createTextElement({ color: 'rgba(0, 0, 0, 0.5)', opacity: 0.5 }))

    // 0,5 x 0,5 = 0,25 d'opacité, donc 75 % de transparence
    expect((item as PlanText).colorTransparency).toBe(75)
  })
})

describe('buildPptxPlan : opacité', () => {
  it.each([
    [1, 0],
    [0.75, 25],
    [0.5, 50],
    [0.3, 70],
    [0.333, 67],
    [0.1, 90],
    [0, 100],
  ])('une opacité de %f donne %d %% de transparence sur un rectangle', (opacity, transparency) => {
    const { item } = planOf(createRectElement({ opacity }))

    expect((item as PlanRect).fillTransparency).toBe(transparency)
  })

  it('borne une opacité hors de 0 à 1', () => {
    expect((planOf(createRectElement({ opacity: 2 })).item as PlanRect).fillTransparency).toBe(0)
    expect((planOf(createRectElement({ opacity: -1 })).item as PlanRect).fillTransparency).toBe(100)
  })

  it('une image reçoit la transparence de son opacité', () => {
    const element = createImageElement('data:image/png;base64,AAAA', { opacity: 0.6 })

    const { item } = planOf(element, new Map([[element.src, { data: PNG, width: 10, height: 10 }]]))

    expect((item as PlanImage).transparency).toBe(40)
  })
})

describe('buildPptxPlan : rectangle', () => {
  it('traduit un rectangle : position, taille, couleur', () => {
    const { item } = planOf(
      createRectElement({ x: 192, y: 96, width: 384, height: 192, fill: 'rgb(255, 128, 0)' }),
    )

    expect(item).toEqual({
      kind: 'rect',
      x: 2,
      y: 1,
      w: 4,
      h: 2,
      fill: 'FF8000',
      fillTransparency: 0,
    })
  })

  it('comprend les noms de couleur', () => {
    expect((planOf(createRectElement({ fill: 'teal' })).item as PlanRect).fill).toBe('008080')
  })
})

describe('buildPptxPlan : couleurs inconnues', () => {
  it('une couleur inconnue devient du noir, avec un avertissement nommant la diapositive', () => {
    const presentation = presentationOf([], [createRectElement({ fill: 'zzz' })])

    const plan = buildPptxPlan(presentation, NO_IMAGES)

    expect((plan.slides[1]!.items[0] as PlanRect).fill).toBe('000000')
    expect(plan.warnings).toEqual([
      'Diapositive 2 : la couleur « zzz » n\'est pas reconnue, elle est remplacée par du noir.',
    ])
  })

  it('vaut aussi pour la couleur du texte et pour son fond', () => {
    const { item, plan } = planOf(createTextElement({ color: 'foo', fill: 'bar' }))

    expect(item).toMatchObject({ color: '000000', fill: '000000' })
    expect(plan.warnings).toHaveLength(2)
  })

  it('une même couleur inconnue sur une même diapositive n\'est signalée qu\'une fois', () => {
    const plan = buildPptxPlan(
      presentationOf([createRectElement({ fill: 'zzz' }), createRectElement({ fill: 'zzz' })]),
      NO_IMAGES,
    )

    expect(plan.warnings).toHaveLength(1)
  })

  it('la couleur inconnue garde la transparence de l\'élément', () => {
    const { item } = planOf(createRectElement({ fill: 'zzz', opacity: 0.5 }))

    expect((item as PlanRect).fillTransparency).toBe(50)
  })
})

describe('containRect : image contenue dans sa boîte', () => {
  it('image large dans une boîte carrée : pleine largeur, centrée verticalement', () => {
    const result = containRect(
      { x: 0, y: 0, width: 400, height: 400 },
      { width: 200, height: 100 },
    )

    expect(result).toEqual({ x: 0, y: 100, width: 400, height: 200 })
  })

  it('image haute dans une boîte carrée : pleine hauteur, centrée horizontalement', () => {
    const result = containRect(
      { x: 0, y: 0, width: 400, height: 400 },
      { width: 100, height: 200 },
    )

    expect(result).toEqual({ x: 100, y: 0, width: 200, height: 400 })
  })

  it('même ratio que la boîte : la remplit', () => {
    const result = containRect(
      { x: 50, y: 60, width: 320, height: 180 },
      { width: 1920, height: 1080 },
    )

    expect(result).toEqual({ x: 50, y: 60, width: 320, height: 180 })
  })

  it('une petite image est agrandie jusqu\'aux bords de la boîte, comme à l\'écran', () => {
    const result = containRect({ x: 0, y: 0, width: 400, height: 400 }, { width: 10, height: 10 })

    expect(result).toEqual({ x: 0, y: 0, width: 400, height: 400 })
  })

  it('tient toujours dans la boîte', () => {
    const box = { x: 10, y: 20, width: 300, height: 120 }
    for (const [width, height] of [[1, 1], [5000, 100], [100, 5000], [640, 360]] as const) {
      const r = containRect(box, { width, height })
      expect(r.x).toBeGreaterThanOrEqual(box.x - 1e-9)
      expect(r.y).toBeGreaterThanOrEqual(box.y - 1e-9)
      expect(r.x + r.width).toBeLessThanOrEqual(box.x + box.width + 1e-9)
      expect(r.y + r.height).toBeLessThanOrEqual(box.y + box.height + 1e-9)
      expect(r.width / r.height).toBeCloseTo(width / height, 8)
    }
  })
})

describe('buildPptxPlan : images', () => {
  it('place l\'image contenue dans sa boîte, en pouces', () => {
    // Boîte 384 x 384 px en (96, 192) ; image 200 x 100 : rectangle 384 x 192 px, décalé de 96 px.
    const element = createImageElement('data:image/png;base64,AAAA', {
      x: 96,
      y: 192,
      width: 384,
      height: 384,
      alt: 'Un logo',
    })

    const { item } = planOf(element, new Map([[element.src, { data: PNG, width: 200, height: 100 }]]))

    expect(item).toEqual({
      kind: 'image',
      x: 1,
      y: 3,
      w: 4,
      h: 2,
      data: PNG,
      altText: 'Un logo',
      transparency: 0,
    })
  })

  it('exemple de la spécification : image 200 x 100 dans une boîte 400 x 400', () => {
    const element = createImageElement('data:image/png;base64,AAAA', {
      x: 0,
      y: 0,
      width: 400,
      height: 400,
    })

    const { item } = planOf(element, new Map([[element.src, { data: PNG, width: 200, height: 100 }]]))

    expect(item).toMatchObject({ kind: 'image', x: 0, w: 400 / 96, h: 200 / 96, y: 100 / 96 })
  })

  it('une image absente de la table est remplacée par un cadre gris avec le texte alternatif', () => {
    const element = createImageElement('data:image/png;base64,AAAA', {
      x: 96,
      y: 96,
      width: 192,
      height: 96,
      alt: 'Schéma du réseau',
    })

    const { item, plan } = planOf(element)

    expect(item).toMatchObject({
      kind: 'text',
      x: 1,
      y: 1,
      w: 2,
      h: 1,
      text: 'Schéma du réseau',
      fill: 'E5E7EB',
      align: 'center',
      valign: 'middle',
    })
    expect(plan.warnings).toEqual([
      'Diapositive 1 : une image n\'a pas pu être incluse (format illisible).',
    ])
  })

  it('sans texte alternatif, le cadre gris dit « Image non incluse »', () => {
    const { item } = planOf(createImageElement('data:image/png;base64,AAAA', { alt: '   ' }))

    expect((item as PlanText).text).toBe('Image non incluse')
  })

  it('une image distante illisible donne l\'avertissement sur le site, avec le bon numéro de diapositive', () => {
    const remote = createImageElement('https://exemple.fr/photo.png')
    const presentation = presentationOf([], [], [remote])

    const plan = buildPptxPlan(presentation, new Map([[remote.src, null]]))

    expect(plan.slides[2]!.items[0]).toMatchObject({ kind: 'text', fill: 'E5E7EB' })
    expect(plan.warnings).toEqual([
      'Diapositive 3 : une image distante n\'a pas pu être incluse (le site l\'interdit).',
    ])
  })

  it('une image dont la taille est nulle ou invalide est traitée comme absente', () => {
    for (const bad of [
      { data: PNG, width: 0, height: 10 },
      { data: PNG, width: 10, height: 0 },
      { data: PNG, width: NaN, height: 10 },
      { data: PNG, width: Infinity, height: 10 },
    ]) {
      const element = createImageElement('data:image/png;base64,AAAA')
      const { item, plan } = planOf(element, new Map([[element.src, bad]]))

      expect(item.kind).toBe('text')
      expect(plan.warnings).toHaveLength(1)
    }
  })

  it('le cadre gris reprend l\'opacité de l\'image', () => {
    const { item } = planOf(createImageElement('data:image/png;base64,AAAA', { opacity: 0.5 }))

    expect(item).toMatchObject({ colorTransparency: 50, fillTransparency: 50 })
  })

  it('deux images illisibles de la même diapositive donnent un seul avertissement identique', () => {
    const plan = buildPptxPlan(
      presentationOf([createImageElement('data:image/png;base64,AAAA'), createImageElement('data:image/png;base64,BBBB')]),
      NO_IMAGES,
    )

    expect(plan.warnings).toHaveLength(1)
  })

  it('le même avertissement sur deux diapositives donne deux lignes (numéros différents)', () => {
    const plan = buildPptxPlan(
      presentationOf([createImageElement('https://a.fr/1.png')], [createImageElement('https://a.fr/1.png')]),
      NO_IMAGES,
    )

    expect(plan.warnings).toHaveLength(2)
    expect(plan.warnings[0]).toContain('Diapositive 1')
    expect(plan.warnings[1]).toContain('Diapositive 2')
  })
})

describe('cssColorToHex réexportée', () => {
  it('est disponible depuis le module d\'export', () => {
    expect(cssColorToHex('#fff')).toEqual({ hex: 'FFFFFF', alpha: 1 })
  })
})

// --- Colle : dépendances injectées ----------------------------------------------------------

// Fausse bibliothèque qui enregistre ce qu'on lui demande d'écrire.
function createFakeLibrary(options: { failWrite?: Error; output?: unknown } = {}) {
  const calls = {
    slides: [] as { texts: unknown[][]; shapes: unknown[][]; images: unknown[] }[],
    props: {} as Record<string, unknown>,
    writeArgs: undefined as unknown,
  }
  class FakePptx {
    ShapeType = { rect: 'rect' }
    set layout(value: string) {
      calls.props.layout = value
    }
    set title(value: string) {
      calls.props.title = value
    }
    set author(value: string) {
      calls.props.author = value
    }
    set company(value: string) {
      calls.props.company = value
    }
    set subject(value: string) {
      calls.props.subject = value
    }
    addSlide() {
      const slide = { texts: [] as unknown[][], shapes: [] as unknown[][], images: [] as unknown[] }
      calls.slides.push(slide)
      return {
        addText: (...args: unknown[]) => slide.texts.push(args),
        addShape: (...args: unknown[]) => slide.shapes.push(args),
        addImage: (arg: unknown) => slide.images.push(arg),
      }
    }
    write(args: unknown) {
      calls.writeArgs = args
      if (options.failWrite) return Promise.reject(options.failWrite)
      return Promise.resolve(options.output ?? new Uint8Array([80, 75, 3, 4]).buffer)
    }
  }
  const library = { default: FakePptx } as unknown as PptxLibrary
  return { library, loadLibrary: () => Promise.resolve(library), calls }
}

describe('exportToPptx : colle avec dépendances injectées', () => {
  it('produit un Blob du bon type et la liste des avertissements', async () => {
    const fake = createFakeLibrary()
    const presentation = presentationOf([createRectElement({ fill: 'zzz' })])

    const result = await exportToPptx(presentation, {
      loadLibrary: fake.loadLibrary,
      loadImage: () => Promise.resolve(null),
    })

    expect(result.blob).toBeInstanceOf(Blob)
    expect(result.blob.type).toBe(PPTX_MIME_TYPE)
    expect(result.blob.size).toBe(4)
    expect(result.warnings).toHaveLength(1)
  })

  it('règle la page, le titre et ne met aucun auteur', async () => {
    const fake = createFakeLibrary()

    await exportToPptx(
      { ...presentationOf([]), title: 'Cours de réseau' },
      { loadLibrary: fake.loadLibrary },
    )

    expect(fake.calls.props).toEqual({
      layout: 'LAYOUT_WIDE',
      title: 'Cours de réseau',
      author: '',
      company: '',
      subject: '',
    })
  })

  it('transmet la police du texte à la bibliothèque', async () => {
    const fake = createFakeLibrary()

    await exportToPptx(presentationOf([createTextElement({ fontFamily: 'Georgia' })]), {
      loadLibrary: fake.loadLibrary,
    })

    expect(fake.calls.slides[0]!.texts[0]![1]).toMatchObject({ fontFace: 'Georgia' })
  })

  it('demande l\'écriture compressée en ArrayBuffer', async () => {
    const fake = createFakeLibrary()

    await exportToPptx(presentationOf([]), { loadLibrary: fake.loadLibrary })

    expect(fake.calls.writeArgs).toEqual({ outputType: 'arraybuffer', compression: true })
  })

  it('crée une diapositive PowerPoint par diapositive et dispatche les éléments par type', async () => {
    const fake = createFakeLibrary()
    const image = createImageElement('data:image/png;base64,AAAA')
    const presentation = presentationOf(
      [createTextElement({ text: 'a' }), createRectElement(), image],
      [],
    )

    await exportToPptx(presentation, {
      loadLibrary: fake.loadLibrary,
      loadImage: () => Promise.resolve({ data: PNG, width: 10, height: 10 }),
    })

    expect(fake.calls.slides).toHaveLength(2)
    expect(fake.calls.slides[0]!.texts).toHaveLength(1)
    expect(fake.calls.slides[0]!.shapes).toHaveLength(1)
    expect(fake.calls.slides[0]!.images).toHaveLength(1)
    expect(fake.calls.slides[1]).toEqual({ texts: [], shapes: [], images: [] })
  })

  it('passe au texte les options PowerPoint attendues', async () => {
    const fake = createFakeLibrary()
    const element = createTextElement({
      text: 'l1\nl2',
      x: 96,
      y: 96,
      width: 960,
      height: 96,
      fontSize: 48,
      color: '#ff0000',
      fill: '#00ff00',
      bold: true,
      italic: true,
      align: 'center',
      opacity: 0.5,
    })

    await exportToPptx(presentationOf([element]), { loadLibrary: fake.loadLibrary })

    const [runs, options] = fake.calls.slides[0]!.texts[0]!
    expect(runs).toEqual([
      { text: 'l1', options: { breakLine: true } },
      { text: 'l2', options: {} },
    ])
    expect(options).toEqual({
      x: 1,
      y: 1,
      w: 10,
      h: 1,
      fontFace: 'Arial',
      fontSize: 36,
      bold: true,
      italic: true,
      align: 'center',
      valign: 'top',
      color: 'FF0000',
      transparency: 50,
      fill: { color: '00FF00', transparency: 50 },
      margin: 6,
      lineSpacing: 45,
      wrap: true,
      fit: 'none',
      lang: 'fr-FR',
    })
  })

  it('découpe les retours à la ligne Windows, Unix et Mac en paragraphes', async () => {
    const fake = createFakeLibrary()

    await exportToPptx(presentationOf([createTextElement({ text: 'a\r\nb\nc\rd' })]), {
      loadLibrary: fake.loadLibrary,
    })

    const [runs] = fake.calls.slides[0]!.texts[0]!
    expect((runs as { text: string }[]).map((run) => run.text)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('un texte vide donne un seul paragraphe vide', async () => {
    const fake = createFakeLibrary()

    await exportToPptx(presentationOf([createTextElement({ text: '' })]), {
      loadLibrary: fake.loadLibrary,
    })

    expect(fake.calls.slides[0]!.texts[0]![0]).toEqual([{ text: '', options: {} }])
  })

  it('un rectangle n\'a ni contour ni remplissage opaque forcé', async () => {
    const fake = createFakeLibrary()

    await exportToPptx(presentationOf([createRectElement({ fill: '#2e5d7c', opacity: 0.5 })]), {
      loadLibrary: fake.loadLibrary,
    })

    const [shape, options] = fake.calls.slides[0]!.shapes[0]!
    expect(shape).toBe('rect')
    expect(options).toMatchObject({
      fill: { color: '2E5D7C', transparency: 50 },
      line: { type: 'none' },
    })
  })

  it('passe l\'image avec son texte alternatif et sa transparence', async () => {
    const fake = createFakeLibrary()
    const element = createImageElement('data:image/png;base64,AAAA', {
      x: 0,
      y: 0,
      width: 400,
      height: 400,
      alt: 'Logo',
      opacity: 0.8,
    })

    await exportToPptx(presentationOf([element]), {
      loadLibrary: fake.loadLibrary,
      loadImage: () => Promise.resolve({ data: PNG, width: 200, height: 100 }),
    })

    expect(fake.calls.slides[0]!.images[0]).toEqual({
      x: 0,
      y: 100 / 96,
      w: 400 / 96,
      h: 200 / 96,
      data: PNG,
      altText: 'Logo',
      transparency: 20,
    })
  })

  it('charge une image utilisée plusieurs fois une seule fois', async () => {
    const fake = createFakeLibrary()
    const loadImage = vi.fn(() => Promise.resolve({ data: PNG, width: 10, height: 10 }))
    const src = 'data:image/png;base64,AAAA'

    await exportToPptx(
      presentationOf([createImageElement(src), createImageElement(src)], [createImageElement(src)]),
      { loadLibrary: fake.loadLibrary, loadImage },
    )

    expect(loadImage).toHaveBeenCalledTimes(1)
    expect(loadImage).toHaveBeenCalledWith(src)
    expect(fake.calls.slides[0]!.images).toHaveLength(2)
    expect(fake.calls.slides[1]!.images).toHaveLength(1)
  })

  it('une image illisible ne fait pas échouer l\'export : cadre gris et avertissement', async () => {
    const fake = createFakeLibrary()

    const result = await exportToPptx(
      presentationOf([createImageElement('https://exemple.fr/x.png', { alt: 'Photo' })]),
      { loadLibrary: fake.loadLibrary, loadImage: () => Promise.resolve(null) },
    )

    expect(fake.calls.slides[0]!.images).toHaveLength(0)
    expect(fake.calls.slides[0]!.texts).toHaveLength(1)
    expect(result.warnings).toEqual([
      'Diapositive 1 : une image distante n\'a pas pu être incluse (le site l\'interdit).',
    ])
  })

  it('un chargeur d\'image qui lève est traité comme une image illisible', async () => {
    const fake = createFakeLibrary()

    const result = await exportToPptx(presentationOf([createImageElement('data:image/png;base64,AAAA')]), {
      loadLibrary: fake.loadLibrary,
      loadImage: () => Promise.reject(new Error('boom')),
    })

    expect(result.warnings).toHaveLength(1)
    expect(fake.calls.slides[0]!.texts).toHaveLength(1)
  })

  it('lève une erreur claire quand la bibliothèque ne peut pas être chargée', async () => {
    const loadImage = vi.fn(() => Promise.resolve(null))

    const promise = exportToPptx(presentationOf([createImageElement('data:image/png;base64,AAAA')]), {
      loadLibrary: () => Promise.reject(new Error('Failed to fetch dynamically imported module')),
      loadImage,
    })

    await expect(promise).rejects.toBeInstanceOf(PptxExportError)
    await expect(promise).rejects.toThrow(/bibliothèque d'export PowerPoint n'a pas pu être chargée/)
    // Inutile de décoder les images quand la bibliothèque manque.
    expect(loadImage).not.toHaveBeenCalled()
  })

  it('lève une erreur claire quand write échoue, avec la cause', async () => {
    const fake = createFakeLibrary({ failWrite: new Error('zip cassé') })

    const promise = exportToPptx(presentationOf([]), { loadLibrary: fake.loadLibrary })

    await expect(promise).rejects.toBeInstanceOf(PptxExportError)
    await expect(promise).rejects.toThrow("Le fichier PowerPoint n'a pas pu être créé (zip cassé).")
  })

  it('lève une erreur claire quand write rend du texte au lieu d\'un fichier', async () => {
    const fake = createFakeLibrary({ output: 'pas un fichier' })

    await expect(exportToPptx(presentationOf([]), { loadLibrary: fake.loadLibrary })).rejects.toBeInstanceOf(
      PptxExportError,
    )
  })

  it('ne modifie pas la présentation reçue', async () => {
    const fake = createFakeLibrary()
    const presentation = presentationOf([createTextElement(), createRectElement()])
    const before = JSON.stringify(presentation)

    await exportToPptx(presentation, { loadLibrary: fake.loadLibrary })

    expect(JSON.stringify(presentation)).toBe(before)
  })
})

// Caractères écrits par leur code : les noms visibles risqueraient d'être mal relus par un éditeur.
const FFFD = String.fromCharCode(0xfffd)
const FFFE = String.fromCharCode(0xfffe)
const FFFF = String.fromCharCode(0xffff)
const EMOJI = String.fromCodePoint(0x1f600)

describe('escapeXmlAttr', () => {
  it.each([
    ['Georgia', 'Georgia'],
    ['Fira Code', 'Fira Code'],
    ['', ''],
    ['a&b', 'a&amp;b'],
    ['a<b>c', 'a&lt;b&gt;c'],
    ['a"b', 'a&quot;b'],
    ["a'b", 'a&apos;b'],
    ['&lt;', '&amp;lt;'],
    ['A" onload="x', 'A&quot; onload=&quot;x'],
  ])('« %s » devient « %s »', (input, expected) => {
    expect(escapeXmlAttr(input)).toBe(expected)
  })
})

describe('buildPptxPlan : police hostile (hors validation)', () => {
  it('échappe le nom de police dans le plan', () => {
    const { item } = planOf(createTextElement({ fontFamily: 'A" onload="x' }))

    expect((item as PlanText).fontFace).toBe('A&quot; onload=&quot;x')
  })

  it('laisse un nom normal intact', () => {
    const { item } = planOf(createTextElement({ fontFamily: 'Fira Code' }))

    expect((item as PlanText).fontFace).toBe('Fira Code')
  })
})

describe('sanitizeForXml', () => {
  it('garde un texte ordinaire, accents compris', () => {
    const text = 'Été à Noël : l\'œuvre "ok" <b> & co'

    expect(sanitizeForXml(text)).toBe(text)
    expect(sanitizeForXml('')).toBe('')
  })

  it('garde la tabulation, le saut de ligne et le retour chariot', () => {
    expect(sanitizeForXml('a\tb\nc\rd\r\ne')).toBe('a\tb\nc\rd\r\ne')
  })

  it.each([
    [0x00, 0x08],
    [0x0b, 0x0c],
    [0x0e, 0x1f],
  ])('supprime les caractères de %d à %d (codes)', (from, to) => {
    for (let code = from; code <= to; code++) {
      expect(sanitizeForXml(`a${String.fromCharCode(code)}b`), `code ${code}`).toBe('ab')
    }
  })

  it('supprime U+FFFE et U+FFFF', () => {
    expect(sanitizeForXml(`a${FFFE}b${FFFF}c`)).toBe('abc')
  })

  it('conserve les caractères voisins des plages interdites', () => {
    for (const code of [0x09, 0x0a, 0x0d, 0x20, 0x7f, 0x80, 0x9f, 0xa0, 0xfffd]) {
      const char = String.fromCharCode(code)
      expect(sanitizeForXml(`a${char}b`), `code ${code}`).toBe(`a${char}b`)
    }
  })

  it('exemple de la relecture : des caractères de contrôle entre a, b, c et d', () => {
    expect(sanitizeForXml('a\u0000b\u000bc\u0001d')).toBe('abcd')
  })

  it('conserve les paires de substitution valides (emojis, caractères rares)', () => {
    const rare = String.fromCodePoint(0x10000) + String.fromCodePoint(0x10ffff)

    expect(sanitizeForXml(`x${EMOJI}y`)).toBe(`x${EMOJI}y`)
    expect(sanitizeForXml(rare)).toBe(rare)
    expect(sanitizeForXml(EMOJI + EMOJI)).toBe(EMOJI + EMOJI)
  })

  it('remplace une moitié haute isolée par U+FFFD', () => {
    expect(sanitizeForXml('a\uD800b')).toBe(`a${FFFD}b`)
    expect(sanitizeForXml('a\uD83D')).toBe(`a${FFFD}`)
    expect(sanitizeForXml('\uD83D\uD83D')).toBe(`${FFFD}${FFFD}`)
  })

  it('remplace une moitié basse isolée par U+FFFD', () => {
    expect(sanitizeForXml('a\uDC00b')).toBe(`a${FFFD}b`)
    expect(sanitizeForXml('\uDE00')).toBe(FFFD)
  })

  it('une paire à l\'envers (basse puis haute) donne deux remplacements', () => {
    expect(sanitizeForXml('\uDC00\uD800')).toBe(`${FFFD}${FFFD}`)
  })

  it('traite un mélange', () => {
    expect(sanitizeForXml(`\u0001a${EMOJI}\uD800\u0000b\uDC00`)).toBe(`a${EMOJI}${FFFD}b${FFFD}`)
  })
})

describe('buildPptxPlan : texte sûr pour le XML', () => {
  const DIRTY = 'a\u0000b\u000bc\u0001d\uD800'

  it('nettoie le texte des zones de texte', () => {
    const { item } = planOf(createTextElement({ text: `un\n${DIRTY}\tfin` }))

    expect((item as PlanText).text).toBe(`un\nabcd${FFFD}\tfin`)
  })

  it('nettoie le titre du document', () => {
    const plan = buildPptxPlan({ ...presentationOf([]), title: 'T\u0001itre\uDC00' }, NO_IMAGES)

    expect(plan.title).toBe(`Titre${FFFD}`)
  })

  it('nettoie le texte alternatif de l\'image', () => {
    const element = createImageElement('data:image/png;base64,AAAA', { alt: DIRTY })

    const { item } = planOf(element, new Map([[element.src, { data: PNG, width: 10, height: 10 }]]))

    expect((item as PlanImage).altText).toBe(`abcd${FFFD}`)
  })

  it('nettoie le texte du cadre gris d\'une image manquante', () => {
    const { item } = planOf(createImageElement('data:image/png;base64,AAAA', { alt: DIRTY }))

    expect((item as PlanText).text).toBe(`abcd${FFFD}`)
  })

  it('un texte alternatif fait seulement de caractères interdits donne le libellé du cadre gris', () => {
    const { item } = planOf(createImageElement('data:image/png;base64,AAAA', { alt: '\u0001\u0000' }))

    expect((item as PlanText).text).toBe('Image non incluse')
  })
})

describe('buildPptxPlan : texte alternatif vide', () => {
  it.each(['', '   ', '\u0001\u0000', '\n'])('%j donne une espace (jamais vide, jamais le nom de repli)', (alt) => {
    const element = createImageElement('data:image/png;base64,AAAA', { alt })

    const { item } = planOf(element, new Map([[element.src, { data: PNG, width: 10, height: 10 }]]))

    expect((item as PlanImage).altText).toBe(' ')
  })

  it('un texte alternatif renseigné est conservé tel quel', () => {
    const element = createImageElement('data:image/png;base64,AAAA', { alt: ' Schéma 1 ' })

    const { item } = planOf(element, new Map([[element.src, { data: PNG, width: 10, height: 10 }]]))

    expect((item as PlanImage).altText).toBe(' Schéma 1 ')
  })
})

describe('mapWithConcurrency', () => {
  it('conserve l\'ordre des résultats même si les appels finissent dans le désordre', async () => {
    const delays = [30, 5, 20, 1, 10]

    const results = await mapWithConcurrency(delays, 3, async (delay, index) => {
      await new Promise((resolve) => setTimeout(resolve, delay))
      return `${index}:${delay}`
    })

    expect(results).toEqual(
      delays.map((delay, index) => ({ status: 'fulfilled', value: `${index}:${delay}` })),
    )
  })

  it('ne dépasse jamais la limite d\'appels simultanés, et l\'atteint', async () => {
    let running = 0
    let peak = 0

    await mapWithConcurrency(Array.from({ length: 10 }, (_, index) => index), 3, async () => {
      running += 1
      peak = Math.max(peak, running)
      await new Promise((resolve) => setTimeout(resolve, 5))
      running -= 1
    })

    expect(peak).toBe(3)
    expect(running).toBe(0)
  })

  it('la limite de l\'export est de 3', () => {
    expect(IMAGE_LOAD_CONCURRENCY).toBe(3)
  })

  it('une limite de 1 fait tout à la suite', async () => {
    let running = 0
    let peak = 0

    await mapWithConcurrency([1, 2, 3, 4], 1, async () => {
      running += 1
      peak = Math.max(peak, running)
      await Promise.resolve()
      running -= 1
    })

    expect(peak).toBe(1)
  })

  it('une erreur n\'arrête pas les autres appels', async () => {
    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      if (value === 2) throw new Error('boom')
      return value * 10
    })

    expect(results.map((result) => result.status)).toEqual([
      'fulfilled',
      'rejected',
      'fulfilled',
      'fulfilled',
      'fulfilled',
    ])
    expect((results[1] as PromiseRejectedResult).reason).toEqual(new Error('boom'))
    const values = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
    expect(values).toEqual([10, 30, 40, 50])
  })

  it('un résultat null n\'arrête pas les autres', async () => {
    const results = await mapWithConcurrency(['a', 'b', 'c'], 3, async (value) =>
      value === 'b' ? null : value,
    )

    expect(results).toEqual([
      { status: 'fulfilled', value: 'a' },
      { status: 'fulfilled', value: null },
      { status: 'fulfilled', value: 'c' },
    ])
  })

  it('une liste vide ne lance rien', async () => {
    const fn = vi.fn(() => Promise.resolve(1))

    expect(await mapWithConcurrency([], 3, fn)).toEqual([])
    expect(fn).not.toHaveBeenCalled()
  })

  it('une limite invalide (0, NaN, négative) se comporte comme 1', async () => {
    for (const limit of [0, NaN, -2]) {
      const results = await mapWithConcurrency([1, 2], limit, async (value) => value)
      expect(results).toHaveLength(2)
    }
  })

  it('donne à la fonction l\'élément et son index', async () => {
    const fn = vi.fn((value: string, index: number) => Promise.resolve(`${value}${index}`))

    await mapWithConcurrency(['x', 'y'], 2, fn)

    expect(fn).toHaveBeenCalledWith('x', 0)
    expect(fn).toHaveBeenCalledWith('y', 1)
  })
})

describe('exportToPptx : chargement des images par lots', () => {
  it('ne charge jamais plus de 3 images en même temps', async () => {
    const fake = createFakeLibrary()
    let running = 0
    let peak = 0
    const elements = Array.from({ length: 9 }, (_, index) =>
      createImageElement(`data:image/png;base64,AA${index}`),
    )

    const result = await exportToPptx(presentationOf(elements), {
      loadLibrary: fake.loadLibrary,
      loadImage: async () => {
        running += 1
        peak = Math.max(peak, running)
        await new Promise((resolve) => setTimeout(resolve, 5))
        running -= 1
        return { data: PNG, width: 10, height: 10 }
      },
    })

    expect(peak).toBe(3)
    expect(fake.calls.slides[0]!.images).toHaveLength(9)
    expect(result.warnings).toEqual([])
  })
})
