import { MAX_FONT_SIZE, MIN_FONT_SIZE } from '../editor/elementOps'
import { clamp, clampBounds } from '../editor/geometry'
import {
  MAX_ALT_LENGTH,
  MAX_ELEMENTS_PER_SLIDE,
  MAX_SLIDES,
  MAX_TEXT_LENGTH,
  MAX_TITLE_LENGTH,
} from '../model/limits'
import type {
  ImageElement,
  Presentation,
  RectElement,
  Slide,
  SlideElement,
  TextAlign,
  TextElement,
} from '../model/types'
import { isValidImageUrl } from './imageUrl'

// Un fichier importé est une ENTRÉE NON FIABLE. On le valide strictement puis on
// reconstruit un objet neuf, champ par champ : l'objet d'entrée n'est jamais copié
// ni injecté tel quel, donc aucun champ inconnu ni aucune référence ne passe.

export const MAX_ID_LENGTH = 100
export const MAX_COLOR_LENGTH = 64
// Une image importée fait au plus 2 Mo (MAX_IMAGE_FILE_SIZE), soit environ 2,8 millions de
// caractères en data URL base64 (4/3 de la taille). 4 Mo de caractères laissent une marge
// confortable et bornent ce qu'un fichier piégé peut nous faire stocker par image.
export const MAX_IMAGE_SRC_LENGTH = 4 * 1024 * 1024
// Taille maximale du fichier accepté ; c'est l'interface qui la vérifie avant de le lire.
export const MAX_IMPORT_FILE_SIZE = 25 * 1024 * 1024
// Au delà, on n'affiche plus de détail : une liste de milliers de lignes n'aide personne.
export const MAX_ERRORS = 20

const DEFAULT_TITLE = 'Sans titre'

export type ParseResult = { ok: true; presentation: Presentation } | { ok: false; errors: string[] }

export function serializePresentation(presentation: Presentation): string {
  return JSON.stringify(presentation, null, 2)
}

// Taille maximale en Mo, pour les messages : dérivée de la constante, jamais écrite en dur.
const MAX_IMPORT_MB = Math.round(MAX_IMPORT_FILE_SIZE / (1024 * 1024))

// Noms réservés par Windows : un fichier « con.json » y pose problème.
const WINDOWS_RESERVED_NAMES = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/

// Nom de fichier sûr dérivé du titre : lettres minuscules sans accent, chiffres et tirets.
export function exportFileName(title: string): string {
  const slug = title
    .toLowerCase()
    // Ces lettres n'ont pas de décomposition NFD : on les transcrit à la main.
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss')
    // NFD sépare la lettre de son accent ; \p{M} (marques) supprime ensuite les accents isolés.
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    // La troncature peut laisser un tiret à la fin.
    .replace(/-+$/, '')
  const name = slug || 'presentation'
  return `${WINDOWS_RESERVED_NAMES.test(name) ? 'presentation-' : ''}${name}.json`
}

export function checkImportFileSize(size: number): string | null {
  // NaN ne se compare à rien : on le refuse explicitement plutôt que de le laisser passer.
  if (Number.isNaN(size)) return 'La taille du fichier est invalide.'
  return size > MAX_IMPORT_FILE_SIZE ? `Le fichier dépasse ${MAX_IMPORT_MB} Mo.` : null
}

// Trois formes seulement : hexadécimal (3, 4, 6 ou 8 chiffres), nom de couleur, ou fonction
// rgb, rgba, hsl, hsla. Tout le reste est refusé (url(), var(), guillemets, points virgules,
// accolades, barres obliques, retours à la ligne, espaces Unicode) : c'est ce qui empêche
// une injection CSS par la valeur d'une couleur.
const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const NAMED_COLOR_PATTERN = /^[a-zA-Z]{1,30}$/
// Espaces simples seulement (pas \s), et au moins un chiffre vérifié à part.
const COLOR_FUNCTION_PATTERN = /^(?:rgba?|hsla?)\(([0-9 ,.%-]*)\)$/i

export function isSafeColor(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > MAX_COLOR_LENGTH) return false
  if (HEX_COLOR_PATTERN.test(value) || NAMED_COLOR_PATTERN.test(value)) return true
  const args = COLOR_FUNCTION_PATTERN.exec(value)?.[1]
  return args !== undefined && /[0-9]/.test(args)
}

export function parsePresentation(text: string): ParseResult {
  // Première vérification, avant tout JSON.parse : un texte démesuré est refusé tout de suite.
  const tooBig = checkImportFileSize(text.length)
  if (tooBig) return { ok: false, errors: [tooBig] }

  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, errors: ["Le fichier n'est pas un JSON valide."] }
  }
  return validatePresentation(data)
}

export type ExportResult =
  | { ok: true; fileName: string; text: string }
  | { ok: false; message: string }

// Prépare l'export et vérifie que le fichier produit pourra être relu par l'import : sinon
// l'utilisateur téléchargerait un fichier que l'application refuserait, et perdrait son travail.
export function prepareExport(presentation: Presentation): ExportResult {
  const text = serializePresentation(presentation)
  // En octets (le fichier est en UTF-8), pas en caractères.
  if (new Blob([text]).size > MAX_IMPORT_FILE_SIZE) {
    return { ok: false, message: `La présentation dépasse ${MAX_IMPORT_MB} Mo.` }
  }
  const check = parsePresentation(text)
  if (!check.ok) return { ok: false, message: check.errors[0] ?? 'La présentation est invalide.' }
  return { ok: true, fileName: exportFileName(presentation.title), text }
}

// Accumule les messages, plafonnés : les MAX_ERRORS premiers, puis une phrase de fin.
// `count` compte toutes les erreurs, même celles qu'on n'affiche plus.
interface ErrorList {
  messages: string[]
  count: number
}

function addError(errors: ErrorList, message: string): void {
  errors.count += 1
  if (errors.messages.length < MAX_ERRORS) errors.messages.push(message)
  else if (errors.messages.length === MAX_ERRORS) errors.messages.push("… et d'autres erreurs.")
}

// Objet « simple » : ni tableau, ni null, ni instance de classe.
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value) as unknown
  return proto === Object.prototype || proto === null
}

// Lit une propriété PROPRE seulement (jamais via la chaîne de prototypes). Absente = undefined.
function own(source: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(source, key) ? source[key] : undefined
}

// Lecteurs de champs liés à un objet source et à un chemin humain (« Diapositive 2, élément 3 »).
// Chaque lecteur retourne toujours une valeur (un repli en cas d'erreur) : si une erreur a
// été notée, le résultat entier est jeté, la valeur de repli ne sort jamais.
function createReader(source: Record<string, unknown>, path: string, errors: ErrorList) {
  const fail = (label: string, problem: string) => addError(errors, `${path} : ${label} ${problem}`)

  return {
    number(key: string, label: string, defaultValue?: number): number {
      const raw = own(source, key)
      if (raw === undefined && defaultValue !== undefined) return defaultValue
      if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        fail(label, 'doit être un nombre.')
        return 0
      }
      return raw
    },

    text(
      key: string,
      label: string,
      options: { max: number; nonEmpty?: boolean; defaultValue?: string; tooLong?: string },
    ): string {
      const raw = own(source, key)
      if (raw === undefined && options.defaultValue !== undefined) return options.defaultValue
      if (typeof raw !== 'string') {
        fail(label, 'doit être du texte.')
        return ''
      }
      if (options.nonEmpty && raw === '') {
        fail(label, 'ne doit pas être vide.')
        return ''
      }
      if (raw.length > options.max) {
        fail(label, options.tooLong ?? `ne doit pas dépasser ${options.max} caractères.`)
        return ''
      }
      return raw
    },

    boolean(key: string, label: string, defaultValue: boolean): boolean {
      const raw = own(source, key)
      if (raw === undefined) return defaultValue
      if (typeof raw !== 'boolean') {
        fail(label, 'doit valoir vrai ou faux.')
        return defaultValue
      }
      return raw
    },

    align(key: string, label: string): TextAlign {
      const raw = own(source, key)
      if (raw === undefined) return 'left'
      if (raw === 'left' || raw === 'center' || raw === 'right') return raw
      fail(label, 'doit valoir « left », « center » ou « right ».')
      return 'left'
    },

    color(key: string, label: string): string {
      const raw = own(source, key)
      if (isSafeColor(raw)) return raw
      fail(label, 'doit être une couleur valide (par exemple #2e5d7c).')
      return '#000000'
    },

    // Couleur ou null ; absente = null (pas de fond).
    nullableColor(key: string, label: string): string | null {
      const raw = own(source, key)
      if (raw === undefined || raw === null) return null
      if (isSafeColor(raw)) return raw
      fail(label, 'doit être une couleur valide (par exemple #2e5d7c) ou null.')
      return null
    },
  }
}

function validateElement(
  raw: unknown,
  path: string,
  errors: ErrorList,
  seenElementIds: Set<string>,
): SlideElement | undefined {
  if (!isPlainObject(raw)) {
    addError(errors, `${path} : un élément doit être un objet.`)
    return undefined
  }
  const read = createReader(raw, path, errors)

  const id = read.text('id', "l'identifiant", { max: MAX_ID_LENGTH, nonEmpty: true })
  if (id !== '') {
    if (seenElementIds.has(id)) addError(errors, `Identifiant en double : « ${id} » (${path}).`)
    seenElementIds.add(id)
  }

  // Géométrie : on exige des nombres finis, puis on NORMALISE (arrondi, taille minimale,
  // dans la diapositive) plutôt que de rejeter un fichier à peine hors limites.
  const bounds = clampBounds({
    x: Math.round(read.number('x', 'la position horizontale (x)')),
    y: Math.round(read.number('y', 'la position verticale (y)')),
    width: Math.round(read.number('width', 'la largeur')),
    height: Math.round(read.number('height', 'la hauteur')),
  })
  const opacity = clamp(read.number('opacity', "l'opacité", 1), 0, 1)
  const base = { id, ...bounds, opacity }

  const type = own(raw, 'type')
  switch (type) {
    case 'text': {
      const element: TextElement = {
        ...base,
        type: 'text',
        text: read.text('text', 'le texte', { max: MAX_TEXT_LENGTH }),
        fontSize: clamp(read.number('fontSize', 'la taille de police'), MIN_FONT_SIZE, MAX_FONT_SIZE),
        color: read.color('color', 'la couleur du texte'),
        fill: read.nullableColor('fill', 'la couleur de fond'),
        bold: read.boolean('bold', 'le gras', false),
        italic: read.boolean('italic', "l'italique", false),
        align: read.align('align', "l'alignement"),
      }
      return element
    }
    case 'rect': {
      const element: RectElement = {
        ...base,
        type: 'rect',
        fill: read.color('fill', 'la couleur de remplissage'),
      }
      return element
    }
    case 'image': {
      const before = errors.count
      const rawSrc = read.text('src', "la source de l'image", {
        max: MAX_IMAGE_SRC_LENGTH,
        nonEmpty: true,
        tooLong: 'est trop volumineuse (4 Mo de caractères au maximum).',
      })
      // Seuls http, https et data:image/ passent. Si la source est déjà refusée (absente,
      // vide, trop grande), on ne la teste pas : l'erreur est déjà notée.
      if (errors.count === before && !isValidImageUrl(rawSrc)) {
        addError(
          errors,
          `${path} : la source de l'image doit être une adresse http ou https, ou une image encodée (data:image/).`,
        )
      }
      const src = rawSrc.trim()
      const element: ImageElement = {
        ...base,
        type: 'image',
        src,
        alt: read.text('alt', 'le texte alternatif', { max: MAX_ALT_LENGTH, defaultValue: '' }),
      }
      return element
    }
    default:
      addError(errors, `${path} : le type d'élément doit être « text », « rect » ou « image ».`)
      return undefined
  }
}

function validateSlide(
  raw: unknown,
  slideNumber: number,
  errors: ErrorList,
  seenSlideIds: Set<string>,
  seenElementIds: Set<string>,
): Slide {
  const path = `Diapositive ${slideNumber}`
  const slide: Slide = { id: '', elements: [] }
  if (!isPlainObject(raw)) {
    addError(errors, `${path} : une diapositive doit être un objet.`)
    return slide
  }

  slide.id = createReader(raw, path, errors).text('id', "l'identifiant", {
    max: MAX_ID_LENGTH,
    nonEmpty: true,
  })
  if (slide.id !== '') {
    if (seenSlideIds.has(slide.id)) {
      addError(errors, `Identifiant en double : « ${slide.id} » (${path}).`)
    }
    seenSlideIds.add(slide.id)
  }

  const elements = own(raw, 'elements')
  if (!Array.isArray(elements)) {
    addError(errors, `${path} : la liste des éléments doit être un tableau.`)
  } else if (elements.length > MAX_ELEMENTS_PER_SLIDE) {
    // On ne parcourt pas une liste démesurée : le fichier est refusé de toute façon.
    addError(errors, `${path} : au plus ${MAX_ELEMENTS_PER_SLIDE} éléments sont acceptés.`)
  } else {
    elements.forEach((item: unknown, index) => {
      const element = validateElement(
        item,
        `${path}, élément ${index + 1}`,
        errors,
        seenElementIds,
      )
      if (element) slide.elements.push(element)
    })
  }
  return slide
}

// Valide la structure et reconstruit une présentation neuve. Si au moins une erreur est
// notée, on retourne { ok: false } et la reconstruction partielle est jetée.
export function validatePresentation(data: unknown): ParseResult {
  const errors: ErrorList = { messages: [], count: 0 }

  if (!isPlainObject(data)) {
    return { ok: false, errors: ['Le fichier doit contenir une présentation (un objet JSON).'] }
  }

  if (own(data, 'version') !== 1) addError(errors, 'Version de fichier non prise en charge.')

  let title = DEFAULT_TITLE
  const rawTitle = own(data, 'title')
  if (rawTitle !== undefined) {
    if (typeof rawTitle === 'string') title = rawTitle.trim().slice(0, MAX_TITLE_LENGTH)
    else addError(errors, 'Le titre doit être du texte.')
  }

  const slides: Slide[] = []
  const rawSlides = own(data, 'slides')
  if (!Array.isArray(rawSlides)) {
    addError(errors, 'La liste des diapositives (slides) doit être un tableau.')
  } else if (rawSlides.length === 0) {
    addError(errors, 'La présentation doit contenir au moins une diapositive.')
  } else if (rawSlides.length > MAX_SLIDES) {
    addError(errors, `La présentation ne peut pas dépasser ${MAX_SLIDES} diapositives.`)
  } else {
    const seenSlideIds = new Set<string>()
    const seenElementIds = new Set<string>()
    rawSlides.forEach((item: unknown, index) => {
      slides.push(validateSlide(item, index + 1, errors, seenSlideIds, seenElementIds))
    })
  }

  if (errors.count > 0) return { ok: false, errors: errors.messages }
  return { ok: true, presentation: { version: 1, title, slides } }
}
