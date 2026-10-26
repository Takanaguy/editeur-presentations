import type PptxGenJS from 'pptxgenjs'
import {
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  type ImageElement,
  type Presentation,
  type RectElement,
  type TextAlign,
  type TextElement,
} from '../model/types'
import { isBuiltInFont } from '../model/fonts'
import { cssColorToHex } from './cssColor'
import { loadBrowserImage, type LoadImage, type PptxImage } from './pptxImages'

export { cssColorToHex } from './cssColor'
export type { LoadImage, PptxImage } from './pptxImages'

// Export PowerPoint en deux couches :
// 1. buildPptxPlan : fonction PURE qui traduit la présentation en un « plan » (positions en
//    pouces, tailles en points, couleurs en hexadécimal). Aucune bibliothèque, aucun
//    navigateur : elle se teste avec des nombres.
// 2. exportToPptx : la colle. Elle charge les images, construit le plan, puis le confie à
//    PptxGenJS qui écrit le fichier.

// --- Conversions -----------------------------------------------------------------------------

// Une unité logique de l'éditeur = un pixel CSS = 1/96 de pouce.
const PX_PER_INCH = 96
// Un pixel CSS = 0,75 point typographique (96 px = 72 pt = 1 pouce).
const PT_PER_PX = 0.75

// Mêmes valeurs que TEXT_PADDING et TEXT_LINE_HEIGHT de ElementView : le module io ne peut pas
// importer un composant React, la valeur est donc répétée ici.
const TEXT_PADDING_PX = 8
const TEXT_LINE_HEIGHT = 1.25

// Police présente sur tous les ordinateurs. L'application affiche Segoe UI ou la police sans
// empattement du système, qu'un autre poste n'a pas forcément.
export const DEFAULT_FONT_FACE = 'Arial'
// Langue du texte, pour le correcteur orthographique de PowerPoint.
export const PPTX_LANGUAGE = 'fr-FR'
export const PPTX_LAYOUT = 'LAYOUT_WIDE'
export const PPTX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'

// Cadre gris qui remplace une image impossible à lire.
const PLACEHOLDER_FILL_HEX = 'E5E7EB'
const PLACEHOLDER_TEXT_HEX = '4B5563'
const PLACEHOLDER_FONT_SIZE_PX = 18
const MISSING_IMAGE_LABEL = 'Image non incluse'
const UNKNOWN_COLOR_HEX = '000000'

const toInches = (px: number): number => px / PX_PER_INCH
const toPoints = (px: number): number => px * PT_PER_PX

// Opacité (0 à 1) vers transparence PowerPoint (0 à 100 %).
function toTransparency(opacity: number): number {
  const clamped = Math.min(1, Math.max(0, opacity))
  return Math.round((1 - clamped) * 100)
}

// --- Texte sûr pour le XML ---------------------------------------------------------------------

// XML 1.0 interdit la plupart des caractères de contrôle (U+0000 à U+001F sauf tabulation, saut
// de ligne et retour chariot), U+FFFE et U+FFFF, et les moitiés de paire de substitution isolées.
// La bibliothèque échappe &, <, > et les guillemets mais ne filtre rien d'autre : un seul de ces
// caractères rend le fichier invalide et PowerPoint refuse de l'ouvrir ou propose de le « réparer ».
// Boucle sur les codes plutôt qu'une expression régulière : le linter interdit les caractères de
// contrôle dans une regex, et la boucle gère aussi les paires de substitution.
export function sanitizeForXml(text: string): string {
  let result = ''
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    const isForbiddenControl = code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d
    if (isForbiddenControl || code === 0xfffe || code === 0xffff) continue
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        // Paire valide (emoji, caractère rare) : conservée telle quelle.
        result += text.slice(index, index + 2)
        index += 1
      } else {
        result += '\uFFFD'
      }
      continue
    }
    // Moitié basse sans moitié haute devant elle.
    result += code >= 0xdc00 && code <= 0xdfff ? '\uFFFD' : text[index]
  }
  return result
}

// Échappe un texte destiné à une valeur d'attribut XML (entre guillemets doubles ou simples).
// Le & passe en premier, sinon les entités produites par les autres remplacements seraient
// elles-mêmes échappées.
export function escapeXmlAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// Texte alternatif d'une image dans le fichier. Vide, PptxGenJS écrit à la place le nom de
// repli « preencoded.png », que lirait un lecteur d'écran : on lui donne une espace, qu'il
// conserve (elle est « vraie » pour lui) et qui ne dit rien.
const EMPTY_ALT_TEXT = ' '

// --- Plan ------------------------------------------------------------------------------------

// Position et taille en pouces, depuis le coin haut gauche de la page.
interface PlanBox {
  x: number
  y: number
  w: number
  h: number
}

export interface PlanText extends PlanBox {
  kind: 'text'
  text: string
  fontFace: string
  // En points.
  fontSize: number
  bold: boolean
  italic: boolean
  align: TextAlign
  valign: 'top' | 'middle'
  // RRGGBB sans #.
  color: string
  // 0 (opaque) à 100 (invisible).
  colorTransparency: number
  fill: string | null
  fillTransparency: number
  // Marge intérieure, en points.
  margin: number
  // Interligne exact, en points.
  lineSpacing: number
}

export interface PlanRect extends PlanBox {
  kind: 'rect'
  fill: string
  fillTransparency: number
}

export interface PlanImage extends PlanBox {
  kind: 'image'
  data: string
  altText: string
  transparency: number
}

export type PlanItem = PlanText | PlanRect | PlanImage

export interface PlanSlide {
  items: PlanItem[]
}

export interface PptxPlan {
  title: string
  // Taille de la page, en pouces.
  pageWidth: number
  pageHeight: number
  slides: PlanSlide[]
  warnings: string[]
}

// Images déjà chargées, par adresse (`src`). null ou absente = image illisible.
export type LoadedImages = ReadonlyMap<string, PptxImage | null>

// Rectangle occupé par une image affichée en `object-fit: contain` dans sa boîte, comme à
// l'écran : même rapport largeur sur hauteur que l'image, centré, sans sortir de la boîte.
// Les tailles sont en pixels logiques, le résultat aussi.
export function containRect(
  box: { x: number; y: number; width: number; height: number },
  natural: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const scale = Math.min(box.width / natural.width, box.height / natural.height)
  const width = natural.width * scale
  const height = natural.height * scale
  return {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
  }
}

const REMOTE_URL = /^https?:/i

// Une taille nulle ou absurde ne permet pas de calculer le rectangle contenu.
function isUsable(image: PptxImage | null | undefined): image is PptxImage {
  return (
    !!image &&
    Number.isFinite(image.width) &&
    Number.isFinite(image.height) &&
    image.width > 0 &&
    image.height > 0
  )
}

// Accumule les avertissements sans doublon : dix textes de la même couleur inconnue sur une
// même diapositive ne donnent qu'une ligne.
function createWarnings() {
  const messages: string[] = []
  return {
    messages,
    add(message: string) {
      if (!messages.includes(message)) messages.push(message)
    },
  }
}

// Traduit la présentation en plan PowerPoint. Les éléments restent dans l'ordre du tableau :
// le dernier est au premier plan, comme à l'écran. Ne modifie pas la présentation.
export function buildPptxPlan(presentation: Presentation, images: LoadedImages): PptxPlan {
  const warnings = createWarnings()

  const slides = presentation.slides.map((slide, slideIndex): PlanSlide => {
    const slideLabel = `Diapositive ${slideIndex + 1}`

    // Couleur CSS vers hexadécimal et transparence. L'opacité de l'élément s'ajoute à celle
    // de la couleur (rgba, #rrggbbaa). Couleur inconnue : noir, et un avertissement.
    function resolveColor(value: string, opacity: number): { hex: string; transparency: number } {
      const parsed = cssColorToHex(value)
      if (!parsed) {
        warnings.add(
          `${slideLabel} : la couleur « ${value} » n'est pas reconnue, elle est remplacée par du noir.`,
        )
        return { hex: UNKNOWN_COLOR_HEX, transparency: toTransparency(opacity) }
      }
      return { hex: parsed.hex, transparency: toTransparency(parsed.alpha * opacity) }
    }

    function boxOf(element: { x: number; y: number; width: number; height: number }): PlanBox {
      return {
        x: toInches(element.x),
        y: toInches(element.y),
        w: toInches(element.width),
        h: toInches(element.height),
      }
    }

    function textItem(element: TextElement): PlanText {
      const color = resolveColor(element.color, element.opacity)
      const fill = element.fill === null ? null : resolveColor(element.fill, element.opacity)
      const fontSize = toPoints(element.fontSize)
      // Les 8 polices courantes sont présentes sur les postes Windows et macOS : pas d'alerte.
      // Toute autre famille doit être installée sur l'ordinateur qui ouvrira le fichier
      // (le fichier PowerPoint ne contient que le nom de la police, pas la police elle-même).
      if (element.fontFamily !== null && !isBuiltInFont(element.fontFamily)) {
        warnings.add(
          `La police « ${element.fontFamily} » doit être installée sur l'ordinateur qui ouvre le fichier PowerPoint.`,
        )
      }
      return {
        kind: 'text',
        ...boxOf(element),
        text: sanitizeForXml(element.text),
        // PptxGenJS écrit fontFace tel quel dans typeface="...". sanitizeForXml ne retire que les
        // caractères de contrôle : c'est escapeXmlAttr qui empêche de sortir de l'attribut. Le nom
        // est déjà validé (isSafeFontName), c'est une défense en profondeur au cas où cette règle
        // serait un jour assouplie. Un nom normal (« Georgia ») n'est pas modifié.
        fontFace: escapeXmlAttr(sanitizeForXml(element.fontFamily ?? DEFAULT_FONT_FACE)),
        fontSize,
        bold: element.bold,
        italic: element.italic,
        align: element.align,
        valign: 'top',
        color: color.hex,
        colorTransparency: color.transparency,
        fill: fill?.hex ?? null,
        fillTransparency: fill?.transparency ?? 0,
        margin: toPoints(TEXT_PADDING_PX),
        // Interligne EXACT (1,25 fois la taille), pas un multiple : le multiple de PowerPoint
        // part de l'interligne naturel de la police (environ 1,15 pour Arial), qui varie selon
        // la police, alors que l'écran utilise toujours 1,25 fois la taille.
        lineSpacing: fontSize * TEXT_LINE_HEIGHT,
      }
    }

    function rectItem(element: RectElement): PlanRect {
      const fill = resolveColor(element.fill, element.opacity)
      return {
        kind: 'rect',
        ...boxOf(element),
        fill: fill.hex,
        fillTransparency: fill.transparency,
      }
    }

    // Image illisible : cadre gris avec le texte alternatif, centré. La place reste occupée,
    // la mise en page de la diapositive ne bouge pas.
    function placeholderItem(element: ImageElement): PlanText {
      const warning = REMOTE_URL.test(element.src.trim())
        ? `${slideLabel} : une image distante n'a pas pu être incluse (le site l'interdit).`
        : `${slideLabel} : une image n'a pas pu être incluse (format illisible).`
      warnings.add(warning)
      const transparency = toTransparency(element.opacity)
      return {
        kind: 'text',
        ...boxOf(element),
        text: sanitizeForXml(element.alt).trim() || MISSING_IMAGE_LABEL,
        fontFace: DEFAULT_FONT_FACE,
        fontSize: toPoints(PLACEHOLDER_FONT_SIZE_PX),
        bold: false,
        italic: false,
        align: 'center',
        valign: 'middle',
        color: PLACEHOLDER_TEXT_HEX,
        colorTransparency: transparency,
        fill: PLACEHOLDER_FILL_HEX,
        fillTransparency: transparency,
        margin: toPoints(TEXT_PADDING_PX),
        lineSpacing: toPoints(PLACEHOLDER_FONT_SIZE_PX) * TEXT_LINE_HEIGHT,
      }
    }

    function imageItem(element: ImageElement): PlanImage | PlanText {
      const loaded = images.get(element.src)
      if (!isUsable(loaded)) return placeholderItem(element)
      const fitted = containRect(element, loaded)
      const alt = sanitizeForXml(element.alt)
      return {
        kind: 'image',
        ...boxOf(fitted),
        data: loaded.data,
        altText: alt.trim() === '' ? EMPTY_ALT_TEXT : alt,
        transparency: toTransparency(element.opacity),
      }
    }

    const items = slide.elements.map((element): PlanItem => {
      switch (element.type) {
        case 'text':
          return textItem(element)
        case 'rect':
          return rectItem(element)
        case 'image':
          return imageItem(element)
        default: {
          // Si on ajoute un type d'élément sans le gérer ici, le build échoue.
          const unreachable: never = element
          return unreachable
        }
      }
    })
    return { items }
  })

  return {
    title: sanitizeForXml(presentation.title),
    pageWidth: toInches(SLIDE_WIDTH),
    pageHeight: toInches(SLIDE_HEIGHT),
    slides,
    warnings: warnings.messages,
  }
}

// --- Colle PptxGenJS -------------------------------------------------------------------------

// Erreur dont le message est en français et peut être affiché tel quel à l'utilisateur.
export class PptxExportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PptxExportError'
  }
}

type PptxConstructor = new () => PptxGenJS
export interface PptxLibrary {
  default: PptxConstructor
}

export interface PptxExportDeps {
  // Accès aux images. Par défaut : l'implémentation navigateur (canvas).
  loadImage?: LoadImage
  // Chargement de la bibliothèque. Par défaut : import dynamique, qui la sort du bundle principal.
  loadLibrary?: () => Promise<PptxLibrary>
}

// PptxGenJS est chargée à la demande : ~ 400 ko de JavaScript qui ne servent qu'à l'export.
// L'entrée par défaut du paquet (dist/pptxgen.es.js, champ « exports ») convient : son champ
// « browser » neutralise fs, https et image-size, que seul Node utilise.
function importLibrary(): Promise<PptxLibrary> {
  return import('pptxgenjs')
}

// Une ligne de texte = un paragraphe. On découpe nous-mêmes les retours à la ligne pour ne pas
// dépendre de la façon dont la bibliothèque traite \n, ni d'un \n final.
function textRuns(text: string): PptxGenJS.TextProps[] {
  const lines = text.split(/\r\n|\r|\n/)
  return lines.map((line, index) => ({
    text: line,
    options: index < lines.length - 1 ? { breakLine: true } : {},
  }))
}

// La bibliothèque modifie les objets d'options qu'on lui passe : on les fabrique à chaque appel.
function renderPlan(pptx: PptxGenJS, plan: PptxPlan): void {
  pptx.layout = PPTX_LAYOUT
  pptx.title = plan.title
  // Valeurs par défaut de la bibliothèque (auteur « PptxGenJS »...) : on ne veut rien d'inventé.
  pptx.author = ''
  pptx.company = ''
  pptx.subject = ''

  for (const planSlide of plan.slides) {
    const slide = pptx.addSlide()
    for (const item of planSlide.items) {
      const position = { x: item.x, y: item.y, w: item.w, h: item.h }
      switch (item.kind) {
        case 'text':
          slide.addText(textRuns(item.text), {
            ...position,
            fontFace: item.fontFace,
            fontSize: item.fontSize,
            bold: item.bold,
            italic: item.italic,
            align: item.align,
            valign: item.valign,
            color: item.color,
            // Transparence du texte : native dans PowerPoint (et LibreOffice 7 ou plus).
            transparency: item.colorTransparency,
            fill:
              item.fill === null
                ? undefined
                : { color: item.fill, transparency: item.fillTransparency },
            margin: item.margin,
            lineSpacing: item.lineSpacing,
            wrap: true,
            fit: 'none',
            lang: PPTX_LANGUAGE,
          })
          break
        case 'rect':
          slide.addShape(pptx.ShapeType.rect, {
            ...position,
            fill: { color: item.fill, transparency: item.fillTransparency },
            line: { type: 'none' },
          })
          break
        case 'image':
          slide.addImage({
            ...position,
            data: item.data,
            altText: item.altText,
            transparency: item.transparency,
          })
          break
      }
    }
  }
}

// Sources d'images distinctes : une image utilisée dix fois n'est chargée qu'une fois.
function imageSources(presentation: Presentation): string[] {
  const sources = new Set<string>()
  for (const slide of presentation.slides) {
    for (const element of slide.elements) {
      if (element.type === 'image') sources.add(element.src)
    }
  }
  return [...sources]
}

// Images chargées en même temps au plus : chacune peut être dessinée dans un canvas jusqu'à
// 4096 x 4096 pixels, et tout charger d'un coup (jusqu'à des dizaines d'images) saturerait la mémoire.
export const IMAGE_LOAD_CONCURRENCY = 3

// Applique `fn` à chaque élément, avec au plus `limit` appels en cours en même temps. Les
// résultats restent dans l'ordre des éléments. Une erreur ne stoppe pas les autres : chaque
// résultat dit s'il a réussi ou échoué (comme Promise.allSettled).
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length)
  let next = 0
  // Chaque « ouvrier » prend l'élément suivant dès qu'il a fini le sien.
  async function worker() {
    while (next < items.length) {
      const index = next++
      try {
        results[index] = { status: 'fulfilled', value: await fn(items[index] as T, index) }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }
  const workers = Math.max(1, Math.min(Math.floor(limit) || 1, items.length))
  await Promise.all(Array.from({ length: workers }, worker))
  return results
}

async function loadImages(presentation: Presentation, loadImage: LoadImage): Promise<LoadedImages> {
  const sources = imageSources(presentation)
  const results = await mapWithConcurrency(sources, IMAGE_LOAD_CONCURRENCY, (src) => loadImage(src))
  // Une image qui plante ne doit pas faire échouer tout l'export : elle devient « illisible ».
  return new Map(
    sources.map((src, index): [string, PptxImage | null] => {
      const result = results[index]
      return [src, result?.status === 'fulfilled' ? result.value : null]
    }),
  )
}

export interface PptxExportResult {
  blob: Blob
  warnings: string[]
}

// Produit le fichier .pptx. Une image illisible n'est PAS une erreur (cadre gris et
// avertissement). Lève PptxExportError si la bibliothèque ne se charge pas ou si l'écriture
// du fichier échoue.
export async function exportToPptx(
  presentation: Presentation,
  deps: PptxExportDeps = {},
): Promise<PptxExportResult> {
  const { loadImage = loadBrowserImage, loadLibrary = importLibrary } = deps

  // La bibliothèque d'abord : si elle ne vient pas (hors ligne), inutile de décoder les images.
  let library: PptxLibrary
  try {
    library = await loadLibrary()
  } catch {
    throw new PptxExportError(
      "La bibliothèque d'export PowerPoint n'a pas pu être chargée. Vérifiez la connexion et réessayez.",
    )
  }

  const images = await loadImages(presentation, loadImage)
  const plan = buildPptxPlan(presentation, images)

  try {
    const pptx = new library.default()
    renderPlan(pptx, plan)
    const output = await pptx.write({ outputType: 'arraybuffer', compression: true })
    if (typeof output === 'string') throw new Error('Sortie inattendue.')
    return { blob: new Blob([output as BlobPart], { type: PPTX_MIME_TYPE }), warnings: plan.warnings }
  } catch (error) {
    const detail = error instanceof Error && error.message ? ` (${error.message})` : ''
    throw new PptxExportError(`Le fichier PowerPoint n'a pas pu être créé${detail}.`)
  }
}
