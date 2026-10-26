// Conversion d'une couleur CSS en hexadécimal : PowerPoint ne comprend que RRGGBB (6 chiffres,
// sans #) plus une transparence à part. Cette fonction lit les mêmes formes que celles que
// `isSafeColor` laisse passer à l'import (hexadécimal, nom, rgb, rgba, hsl, hsla).

export interface ParsedColor {
  // RRGGBB en majuscules, sans #.
  hex: string
  // 0 = invisible, 1 = opaque.
  alpha: number
}

// Les 148 noms de couleur CSS, en minuscules. Une chaîne compacte plutôt qu'un objet de 148
// lignes : « nom:rrggbb » séparés par des espaces, découpée une seule fois au chargement.
const NAMED_COLORS_SOURCE = `
aliceblue:f0f8ff antiquewhite:faebd7 aqua:00ffff aquamarine:7fffd4 azure:f0ffff beige:f5f5dc
bisque:ffe4c4 black:000000 blanchedalmond:ffebcd blue:0000ff blueviolet:8a2be2 brown:a52a2a
burlywood:deb887 cadetblue:5f9ea0 chartreuse:7fff00 chocolate:d2691e coral:ff7f50
cornflowerblue:6495ed cornsilk:fff8dc crimson:dc143c cyan:00ffff darkblue:00008b darkcyan:008b8b
darkgoldenrod:b8860b darkgray:a9a9a9 darkgreen:006400 darkgrey:a9a9a9 darkkhaki:bdb76b
darkmagenta:8b008b darkolivegreen:556b2f darkorange:ff8c00 darkorchid:9932cc darkred:8b0000
darksalmon:e9967a darkseagreen:8fbc8f darkslateblue:483d8b darkslategray:2f4f4f
darkslategrey:2f4f4f darkturquoise:00ced1 darkviolet:9400d3 deeppink:ff1493 deepskyblue:00bfff
dimgray:696969 dimgrey:696969 dodgerblue:1e90ff firebrick:b22222 floralwhite:fffaf0
forestgreen:228b22 fuchsia:ff00ff gainsboro:dcdcdc ghostwhite:f8f8ff gold:ffd700
goldenrod:daa520 gray:808080 green:008000 greenyellow:adff2f grey:808080 honeydew:f0fff0
hotpink:ff69b4 indianred:cd5c5c indigo:4b0082 ivory:fffff0 khaki:f0e68c lavender:e6e6fa
lavenderblush:fff0f5 lawngreen:7cfc00 lemonchiffon:fffacd lightblue:add8e6 lightcoral:f08080
lightcyan:e0ffff lightgoldenrodyellow:fafad2 lightgray:d3d3d3 lightgreen:90ee90
lightgrey:d3d3d3 lightpink:ffb6c1 lightsalmon:ffa07a lightseagreen:20b2aa lightskyblue:87cefa
lightslategray:778899 lightslategrey:778899 lightsteelblue:b0c4de lightyellow:ffffe0
lime:00ff00 limegreen:32cd32 linen:faf0e6 magenta:ff00ff maroon:800000
mediumaquamarine:66cdaa mediumblue:0000cd mediumorchid:ba55d3 mediumpurple:9370db
mediumseagreen:3cb371 mediumslateblue:7b68ee mediumspringgreen:00fa9a mediumturquoise:48d1cc
mediumvioletred:c71585 midnightblue:191970 mintcream:f5fffa mistyrose:ffe4e1 moccasin:ffe4b5
navajowhite:ffdead navy:000080 oldlace:fdf5e6 olive:808000 olivedrab:6b8e23 orange:ffa500
orangered:ff4500 orchid:da70d6 palegoldenrod:eee8aa palegreen:98fb98 paleturquoise:afeeee
palevioletred:db7093 papayawhip:ffefd5 peachpuff:ffdab9 peru:cd853f pink:ffc0cb plum:dda0dd
powderblue:b0e0e6 purple:800080 rebeccapurple:663399 red:ff0000 rosybrown:bc8f8f
royalblue:4169e1 saddlebrown:8b4513 salmon:fa8072 sandybrown:f4a460 seagreen:2e8b57
seashell:fff5ee sienna:a0522d silver:c0c0c0 skyblue:87ceeb slateblue:6a5acd slategray:708090
slategrey:708090 snow:fffafa springgreen:00ff7f steelblue:4682b4 tan:d2b48c teal:008080
thistle:d8bfd8 tomato:ff6347 turquoise:40e0d0 violet:ee82ee wheat:f5deb3 white:ffffff
whitesmoke:f5f5f5 yellow:ffff00 yellowgreen:9acd32
`

export const NAMED_COLORS: ReadonlyMap<string, string> = new Map(
  NAMED_COLORS_SOURCE.trim()
    .split(/\s+/)
    .map((entry): [string, string] => {
      const [name = '', hex = ''] = entry.split(':')
      return [name, hex]
    }),
)

const HEX_PATTERN = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/
const FUNCTION_PATTERN = /^(rgba?|hsla?)\(([^()]*)\)$/
const NUMBER_PATTERN = /^([+-]?(?:\d+\.?\d*|\.\d+))(%?)$/
const HUE_PATTERN = /^([+-]?(?:\d+\.?\d*|\.\d+))(deg|grad|rad|turn)?$/

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

// Le petit ajout évite qu'une erreur de calcul flottant (127,4999999 au lieu de 127,5)
// arrondisse du mauvais côté.
const ROUNDING_EPSILON = 1e-9

function toHex(channels: [number, number, number]): string {
  return channels
    .map((channel) =>
      clamp(Math.round(channel + ROUNDING_EPSILON), 0, 255).toString(16).padStart(2, '0'),
    )
    .join('')
    .toUpperCase()
}

function parseHex(digits: string): ParsedColor {
  // #rgb et #rgba : chaque chiffre est doublé (#f80 = #ff8800).
  const full =
    digits.length <= 4
      ? Array.from(digits, (digit) => digit + digit).join('')
      : digits
  const alpha = full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1
  return { hex: full.slice(0, 6).toUpperCase(), alpha }
}

// Un nombre, avec ou sans %. null si ce n'est pas un nombre.
function parseNumber(token: string): { value: number; percent: boolean } | null {
  const match = NUMBER_PATTERN.exec(token)
  if (!match?.[1]) return null
  return { value: Number(match[1]), percent: match[2] === '%' }
}

// Teinte en degrés (0 à 360), avec une unité facultative.
function parseHue(token: string): number | null {
  const match = HUE_PATTERN.exec(token)
  if (!match?.[1]) return null
  const value = Number(match[1])
  switch (match[2]) {
    case 'grad':
      return value * 0.9
    case 'rad':
      return (value * 180) / Math.PI
    case 'turn':
      return value * 360
    default:
      return value
  }
}

function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  const h = (((hue % 360) + 360) % 360) / 360
  const s = clamp(saturation, 0, 100) / 100
  const l = clamp(lightness, 0, 100) / 100
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const channel = (t: number): number => {
    const x = (t + 1) % 1
    if (x < 1 / 6) return p + (q - p) * 6 * x
    if (x < 1 / 2) return q
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
    return p
  }
  return [channel(h + 1 / 3) * 255, channel(h) * 255, channel(h - 1 / 3) * 255]
}

function parseFunction(name: string, args: string): ParsedColor | null {
  // Virgules, espaces et barre oblique (« rgb(0 0 0 / 50%) ») séparent les valeurs.
  const tokens = args.replace(/[,/]/g, ' ').trim().split(/\s+/)
  if (tokens.length !== 3 && tokens.length !== 4) return null

  let alpha = 1
  if (tokens[3] !== undefined) {
    const parsed = parseNumber(tokens[3])
    if (!parsed) return null
    alpha = clamp(parsed.percent ? parsed.value / 100 : parsed.value, 0, 1)
  }

  const [first = '', second = '', third = ''] = tokens
  if (name.startsWith('rgb')) {
    const channels = [first, second, third].map((token) => {
      const parsed = parseNumber(token)
      if (!parsed) return null
      return parsed.percent ? (parsed.value * 255) / 100 : parsed.value
    })
    const [r, g, b] = channels
    if (r == null || g == null || b == null) return null
    return { hex: toHex([r, g, b]), alpha }
  }

  const hue = parseHue(first)
  const saturation = parseNumber(second)
  const lightness = parseNumber(third)
  if (hue === null || !saturation || !lightness) return null
  return { hex: toHex(hslToRgb(hue, saturation.value, lightness.value)), alpha }
}

// Retourne la couleur en RRGGBB et sa transparence, ou null si la valeur n'est pas comprise.
export function cssColorToHex(value: string): ParsedColor | null {
  const text = value.trim().toLowerCase()

  if (text === 'transparent') return { hex: '000000', alpha: 0 }

  const hex = HEX_PATTERN.exec(text)?.[1]
  if (hex) return parseHex(hex)

  const named = NAMED_COLORS.get(text)
  if (named) return { hex: named.toUpperCase(), alpha: 1 }

  const call = FUNCTION_PATTERN.exec(text)
  if (call?.[1] && call[2] !== undefined) return parseFunction(call[1], call[2])

  return null
}
