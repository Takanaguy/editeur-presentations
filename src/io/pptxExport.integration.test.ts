import JSZip from 'jszip'
import {
  createImageElement,
  createRectElement,
  createSlide,
  createTextElement,
} from '../model/factories'
import type { Presentation, SlideElement } from '../model/types'
import { PPTX_MIME_TYPE, exportToPptx } from './pptxExport'

// Ces tests appellent la VRAIE bibliothèque PptxGenJS (pas de faux) : ils vérifient que le
// fichier produit est bien une archive PowerPoint. Le rendu dans PowerPoint ou LibreOffice
// n'est pas vérifiable ici.

// PNG de 1 x 1 pixel.
const TINY_PNG =
  'image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function presentationOf(title: string, ...slides: SlideElement[][]): Presentation {
  return {
    version: 1,
    title,
    fonts: [],
    slides: slides.map((elements) => ({ ...createSlide(), elements })),
  }
}

async function exportAndOpen(presentation: Presentation, loadImage?: () => Promise<null>) {
  const { blob, warnings } = await exportToPptx(presentation, loadImage ? { loadImage } : {})
  const bytes = await blob.arrayBuffer()
  const zip = await JSZip.loadAsync(bytes)
  const text = (path: string) => {
    const file = zip.file(path)
    if (!file) throw new Error(`Fichier absent de l'archive : ${path}`)
    return file.async('string')
  }
  return { blob, bytes, zip, warnings, text }
}

describe('exportToPptx avec la vraie bibliothèque', () => {
  it('produit une archive zip (signature PK) du bon type MIME', async () => {
    const { blob, bytes } = await exportAndOpen(presentationOf('Essai', [createTextElement()]))

    expect(blob.type).toBe(PPTX_MIME_TYPE)
    const head = new Uint8Array(bytes.slice(0, 2))
    expect(String.fromCharCode(head[0]!, head[1]!)).toBe('PK')
  })

  it('contient [Content_Types].xml et une diapositive XML par diapositive', async () => {
    const { zip } = await exportAndOpen(
      presentationOf('Trois', [createTextElement()], [createRectElement()], []),
    )

    expect(zip.file('[Content_Types].xml')).not.toBeNull()
    expect(zip.file('ppt/presentation.xml')).not.toBeNull()
    const slides = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    expect(slides.sort()).toEqual([
      'ppt/slides/slide1.xml',
      'ppt/slides/slide2.xml',
      'ppt/slides/slide3.xml',
    ])
  })

  it('gère 12 diapositives', async () => {
    const slides = Array.from({ length: 12 }, () => [createTextElement()])

    const { zip } = await exportAndOpen(presentationOf('Douze', ...slides))

    const names = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    expect(names).toHaveLength(12)
  })

  it('la page est au format large 16:9 (12192000 x 6858000 EMU)', async () => {
    const { text } = await exportAndOpen(presentationOf('Page', [createTextElement()]))

    expect(await text('ppt/presentation.xml')).toContain('<p:sldSz cx="12192000" cy="6858000"')
  })

  it('reprend le titre, sans auteur inventé', async () => {
    const { text } = await exportAndOpen(presentationOf('Ça va, « Réseau » & co', [createTextElement()]))

    const core = await text('docProps/core.xml')
    expect(core).toContain('<dc:title>Ça va, « Réseau » &amp; co</dc:title>')
    expect(core).toContain('<dc:creator></dc:creator>')
    expect(core).not.toContain('PptxGenJS')
  })

  it('écrit le texte, en français, avec police, taille, style, couleur et interligne', async () => {
    const { text } = await exportAndOpen(
      presentationOf('Texte', [
        createTextElement({
          text: 'Bonjour <le> & "monde"',
          x: 96,
          y: 96,
          width: 960,
          height: 96,
          fontSize: 48,
          color: '#ff0000',
          bold: true,
          italic: true,
          align: 'center',
        }),
      ]),
    )

    const xml = await text('ppt/slides/slide1.xml')
    expect(xml).toContain('Bonjour &lt;le&gt; &amp; &quot;monde&quot;')
    expect(xml).toContain('lang="fr-FR"')
    expect(xml).toContain('sz="3600"')
    expect(xml).toContain('b="1"')
    expect(xml).toContain('i="1"')
    expect(xml).toContain('<a:srgbClr val="FF0000"')
    expect(xml).toContain('typeface="Arial"')
    expect(xml).toContain('algn="ctr"')
    // Position et taille : 1 pouce = 914400 EMU.
    expect(xml).toContain('<a:off x="914400" y="914400"/>')
    expect(xml).toContain('<a:ext cx="9144000" cy="914400"/>')
    // Marge de 8 px = 6 points = 76200 EMU, alignement vertical en haut, interligne de 45 pt.
    expect(xml).toContain('lIns="76200"')
    expect(xml).toContain('tIns="76200"')
    expect(xml).toContain('anchor="t"')
    expect(xml).toContain('<a:spcPts val="4500"/>')
    expect(xml).toContain('wrap="square"')
  })

  it('écrit la police choisie (Georgia) dans la diapositive, sans avertissement', async () => {
    const { text, warnings } = await exportAndOpen(
      presentationOf('Police', [createTextElement({ fontFamily: 'Georgia' })]),
    )

    const xml = await text('ppt/slides/slide1.xml')
    expect(xml).toContain('typeface="Georgia"')
    expect(xml).not.toContain('typeface="Arial"')
    expect(warnings).toEqual([])
  })

  it.each(['Georgia', 'Fira Code'])(
    'un nom normal (%s) est écrit tel quel, sans double échappement',
    async (name) => {
      const { text } = await exportAndOpen(
        presentationOf('Police', [createTextElement({ fontFamily: name })]),
      )

      const xml = await text('ppt/slides/slide1.xml')
      expect(xml).toContain(`typeface="${name}"`)
      expect(xml).not.toContain('&amp;')
    },
  )

  it('un nom hostile passé hors validation reste dans son attribut : XML bien formé, aucun onload', async () => {
    const { text } = await exportAndOpen(
      presentationOf('Police', [createTextElement({ fontFamily: 'A" onload="x' })]),
    )

    const xml = await text('ppt/slides/slide1.xml')
    const document = parseXml(xml)
    expect(hasParserError(document)).toBe(false)
    // Aucun attribut onload nulle part dans le document (le texte reste dans la valeur de typeface).
    const attributeNames = Array.from(document.getElementsByTagName('*')).flatMap((node) =>
      Array.from(node.attributes).map((attribute) => attribute.name),
    )
    expect(attributeNames).not.toContain('onload')
    expect(xml).toContain('typeface="A&quot; onload=&quot;x"')
  })

  it('une police hors liste (Calibri) est écrite et signalée par un avertissement', async () => {
    const { text, warnings } = await exportAndOpen(
      presentationOf('Police', [createTextElement({ fontFamily: 'Calibri' })]),
    )

    expect(await text('ppt/slides/slide1.xml')).toContain('typeface="Calibri"')
    expect(warnings).toEqual([
      "La police « Calibri » doit être installée sur l'ordinateur qui ouvre le fichier PowerPoint.",
    ])
  })

  it('un texte sur plusieurs lignes donne un paragraphe par ligne, lignes vides comprises', async () => {
    const { text } = await exportAndOpen(
      presentationOf('Lignes', [createTextElement({ text: 'un\ndeux\n\nquatre' })]),
    )

    const xml = await text('ppt/slides/slide1.xml')
    expect(xml.match(/<a:p>/g)).toHaveLength(4)
    for (const word of ['un', 'deux', 'quatre']) expect(xml).toContain(`<a:t>${word}</a:t>`)
  })

  it('applique la transparence au texte, à son fond et au rectangle', async () => {
    const { text } = await exportAndOpen(
      presentationOf(
        'Opacité',
        [createTextElement({ color: '#000000', fill: '#00ff00', opacity: 0.5 })],
        [createRectElement({ fill: '#0000ff', opacity: 0.25 })],
      ),
    )

    const slide1 = await text('ppt/slides/slide1.xml')
    // Fond 00FF00 à 50 % et texte 000000 à 50 %.
    expect(slide1).toContain('<a:srgbClr val="00FF00"><a:alpha val="50000"/></a:srgbClr>')
    expect(slide1).toContain('<a:srgbClr val="000000"><a:alpha val="50000"/></a:srgbClr>')
    const slide2 = await text('ppt/slides/slide2.xml')
    expect(slide2).toContain('<a:srgbClr val="0000FF"><a:alpha val="25000"/></a:srgbClr>')
  })

  it('un rectangle est une forme rectangle sans contour', async () => {
    const { text } = await exportAndOpen(
      presentationOf('Forme', [createRectElement({ fill: '#2e5d7c' })]),
    )

    const xml = await text('ppt/slides/slide1.xml')
    expect(xml).toContain('<a:prstGeom prst="rect">')
    expect(xml).toContain('<a:srgbClr val="2E5D7C"/>')
    expect(xml).not.toMatch(/<a:ln[^>]*><a:solidFill/)
  })
})

describe('exportToPptx avec la vraie bibliothèque : images', () => {
  it('intègre l\'image fournie par loadImage, contenue dans sa boîte', async () => {
    const image = createImageElement('data:image/png;base64,AAAA', {
      x: 0,
      y: 0,
      width: 480,
      height: 480,
      alt: 'Un pixel',
      opacity: 0.5,
    })
    const presentation = presentationOf('Image', [image])

    const { blob } = await exportToPptx(presentation, {
      loadImage: () => Promise.resolve({ data: TINY_PNG, width: 200, height: 100 }),
    })
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())

    const media = Object.keys(zip.files).filter((name) => /^ppt\/media\/.+\.png$/.test(name))
    expect(media).toHaveLength(1)
    const xml = await zip.file('ppt/slides/slide1.xml')!.async('string')
    expect(xml).toContain('descr="Un pixel"')
    expect(xml).toContain('<a:alphaModFix amt="50000"/>')
    // Boîte de 480 px (5 pouces) : l'image 2:1 occupe 5 x 2,5 pouces, centrée verticalement (1,25 pouce = 1143000 EMU).
    expect(xml).toContain('<a:off x="0" y="1143000"/>')
    expect(xml).toContain('<a:ext cx="4572000" cy="2286000"/>')
  })

  it('une image illisible donne un cadre gris, sans média, et un avertissement', async () => {
    const image = createImageElement('https://exemple.fr/x.png', { alt: 'Photo du site' })

    const { zip, text, warnings } = await exportAndOpen(
      presentationOf('Cadre', [image]),
      () => Promise.resolve(null),
    )

    expect(Object.keys(zip.files).filter((name) => name.startsWith('ppt/media/') && !name.endsWith('/'))).toEqual([])
    const xml = await text('ppt/slides/slide1.xml')
    expect(xml).toContain('<a:srgbClr val="E5E7EB"/>')
    expect(xml).toContain('Photo du site')
    expect(warnings).toEqual([
      "Diapositive 1 : une image distante n'a pas pu être incluse (le site l'interdit).",
    ])
  })
})

// Caractères interdits en XML 1.0, cherchés un par un (sans expression régulière : le linter
// refuse les caractères de contrôle dans une regex, et ce contrôle reste indépendant du code testé).
function forbiddenCharacters(xml: string): string[] {
  const found: string[] = []
  for (let index = 0; index < xml.length; index++) {
    const code = xml.charCodeAt(index)
    const isHigh = code >= 0xd800 && code <= 0xdbff
    const isLow = code >= 0xdc00 && code <= 0xdfff
    if (isHigh && xml.charCodeAt(index + 1) >= 0xdc00 && xml.charCodeAt(index + 1) <= 0xdfff) {
      index += 1
    } else if (
      (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) ||
      isHigh ||
      isLow ||
      code === 0xfffe ||
      code === 0xffff
    ) {
      found.push(`U+${code.toString(16).toUpperCase().padStart(4, '0')}`)
    }
  }
  return found
}

function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xml')
}

const hasParserError = (document: Document) => document.getElementsByTagName('parsererror').length > 0

describe('exportToPptx avec la vraie bibliothèque : caractères interdits en XML', () => {
  const DIRTY_TEXT = 'a\u0000b\u000bc\u0001d \uD800 e \uDC00 f\uFFFE\uFFFF g \u{1F600}'
  const DIRTY_ALT = 'x\u0000y\u000bz\u0001 \uD83D fin'
  const DIRTY_TITLE = 'T\u0001itre\u0000 \uD800'

  it('le contrôle de test détecte bien un XML invalide (sinon les tests suivants ne prouveraient rien)', () => {
    const xml = `<?xml version="1.0"?><a><t>x\u0001y</t></a>`

    expect(forbiddenCharacters(xml)).toEqual(['U+0001'])
    expect(hasParserError(parseXml(xml))).toBe(true)
    expect(hasParserError(parseXml('<?xml version="1.0"?><a><t>xy</t></a>'))).toBe(false)
  })

  it('aucun caractère interdit dans les diapositives ni dans les propriétés, XML bien formé', async () => {
    const image = createImageElement('data:image/png;base64,AAAA', { alt: DIRTY_ALT })
    const missing = createImageElement('https://exemple.fr/x.png', { alt: DIRTY_ALT })
    // Deux images : l'une lue, l'autre non, pour couvrir le texte alternatif et le cadre gris.
    const { blob } = await exportToPptx(
      presentationOf(DIRTY_TITLE, [createTextElement({ text: DIRTY_TEXT }), image, missing]),
      {
        loadImage: (src) =>
          Promise.resolve(src.startsWith('data:') ? { data: TINY_PNG, width: 10, height: 10 } : null),
      },
    )
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const slide = await zip.file('ppt/slides/slide1.xml')!.async('string')
    const core = await zip.file('docProps/core.xml')!.async('string')

    expect(forbiddenCharacters(slide)).toEqual([])
    expect(forbiddenCharacters(core)).toEqual([])
    expect(hasParserError(parseXml(slide))).toBe(false)
    expect(hasParserError(parseXml(core))).toBe(false)
    // Le reste du texte est conservé : seuls les caractères interdits disparaissent.
    expect(slide).toContain('<a:t>abc')
    expect(slide).toContain('\u{1F600}')
    expect(slide).toContain('descr="xyz \uFFFD fin"')
    expect(core).toContain('<dc:title>Titre \uFFFD</dc:title>')
  })

  it('tous les fichiers XML de l\'archive restent bien formés', async () => {
    const { zip } = await exportAndOpen(
      presentationOf(DIRTY_TITLE, [createTextElement({ text: DIRTY_TEXT })], [createRectElement()]),
    )

    for (const name of Object.keys(zip.files).filter((n) => /\.(xml|rels)$/.test(n))) {
      const xml = await zip.file(name)!.async('string')
      expect(forbiddenCharacters(xml), name).toEqual([])
      expect(hasParserError(parseXml(xml)), name).toBe(false)
    }
  })

  it('le texte du cadre gris d\'une image manquante est nettoyé aussi', async () => {
    const { text } = await exportAndOpen(
      presentationOf('Cadre', [createImageElement('https://exemple.fr/x.png', { alt: 'Sch\u0001éma\u000b' })]),
      () => Promise.resolve(null),
    )

    const xml = await text('ppt/slides/slide1.xml')
    expect(xml).toContain('<a:t>Schéma</a:t>')
    expect(forbiddenCharacters(xml)).toEqual([])
    expect(hasParserError(parseXml(xml))).toBe(false)
  })
})

describe('exportToPptx avec la vraie bibliothèque : échappement', () => {
  const HOSTILE = `"><x a='1'>&`

  it('échappe l\'apostrophe, les guillemets, & et les chevrons dans le texte', async () => {
    const { text } = await exportAndOpen(
      presentationOf('L\'été', [createTextElement({ text: `l'avion "rapide" <b> & co` })]),
    )

    const xml = await text('ppt/slides/slide1.xml')
    expect(xml).toContain('l&apos;avion &quot;rapide&quot; &lt;b&gt; &amp; co')
    expect(await text('docProps/core.xml')).toContain('<dc:title>L&apos;été</dc:title>')
  })

  it('un texte alternatif hostile est échappé et n\'ajoute aucun élément', async () => {
    const image = createImageElement('data:image/png;base64,AAAA', { alt: HOSTILE })
    const { blob } = await exportToPptx(presentationOf('Hostile', [image]), {
      loadImage: () => Promise.resolve({ data: TINY_PNG, width: 10, height: 10 }),
    })
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const xml = await zip.file('ppt/slides/slide1.xml')!.async('string')

    expect(xml).toContain('descr="&quot;&gt;&lt;x a=&apos;1&apos;&gt;&amp;"')
    expect(xml).not.toContain('<x')
    const document = parseXml(xml)
    expect(hasParserError(document)).toBe(false)
    expect(document.getElementsByTagName('x')).toHaveLength(0)
  })

  it('un texte hostile dans le cadre gris est échappé aussi', async () => {
    const { text } = await exportAndOpen(
      presentationOf('Hostile', [createImageElement('https://exemple.fr/x.png', { alt: HOSTILE })]),
      () => Promise.resolve(null),
    )

    const xml = await text('ppt/slides/slide1.xml')
    expect(xml).toContain('<a:t>&quot;&gt;&lt;x a=&apos;1&apos;&gt;&amp;</a:t>')
    expect(xml).not.toContain('<x')
  })
})

describe('exportToPptx avec la vraie bibliothèque : texte alternatif vide', () => {
  it('ne laisse jamais le nom de repli « preencoded.png »', async () => {
    const empty = createImageElement('data:image/png;base64,AAAA', { alt: '' })
    const blank = createImageElement('data:image/png;base64,BBBB', { alt: '   ' })
    const control = createImageElement('data:image/png;base64,CCCC', { alt: '\u0001\u0000' })
    const { blob } = await exportToPptx(presentationOf('Alt', [empty, blank, control]), {
      loadImage: () => Promise.resolve({ data: TINY_PNG, width: 10, height: 10 }),
    })
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const xml = await zip.file('ppt/slides/slide1.xml')!.async('string')

    expect(xml).not.toContain('preencoded')
    expect(xml.match(/descr=" "/g)).toHaveLength(3)
  })
})
