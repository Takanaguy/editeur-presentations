import { NAMED_COLORS, cssColorToHex } from './cssColor'

// [entrée, hex attendu, alpha attendu]
const VALID: [string, string, number][] = [
  // Hexadécimal
  ['#fff', 'FFFFFF', 1],
  ['#000', '000000', 1],
  ['#f80', 'FF8800', 1],
  ['#F80', 'FF8800', 1],
  ['#f808', 'FF8800', 0x88 / 255],
  ['#2e5d7c', '2E5D7C', 1],
  ['#2E5D7C', '2E5D7C', 1],
  ['#2e5d7c80', '2E5D7C', 0x80 / 255],
  ['#2e5d7cff', '2E5D7C', 1],
  ['#2e5d7c00', '2E5D7C', 0],
  ['  #2e5d7c  ', '2E5D7C', 1],
  // rgb et rgba, virgules ou espaces
  ['rgb(255, 0, 0)', 'FF0000', 1],
  ['rgb(255,0,0)', 'FF0000', 1],
  ['rgb(255 0 0)', 'FF0000', 1],
  ['RGB(255, 128, 0)', 'FF8000', 1],
  ['rgba(0, 128, 255, 0.5)', '0080FF', 0.5],
  ['rgba(0 128 255 / 0.25)', '0080FF', 0.25],
  ['rgb(0 128 255 / 50%)', '0080FF', 0.5],
  ['rgba(0,0,0,.2)', '000000', 0.2],
  ['rgb(100%, 0%, 50%)', 'FF0080', 1],
  ['rgb(50%, 50%, 50%)', '808080', 1],
  ['rgb(300, -20, 0)', 'FF0000', 1],
  ['rgb(12.6, 0, 0)', '0D0000', 1],
  ['rgba(1, 2, 3, 2)', '010203', 1],
  ['rgba(1, 2, 3, -1)', '010203', 0],
  ['  rgb( 1 , 2 , 3 )  ', '010203', 1],
  // hsl et hsla
  ['hsl(0, 100%, 50%)', 'FF0000', 1],
  ['hsl(120, 100%, 50%)', '00FF00', 1],
  ['hsl(240, 100%, 50%)', '0000FF', 1],
  ['hsl(0 0% 100%)', 'FFFFFF', 1],
  ['hsl(0, 0%, 0%)', '000000', 1],
  ['hsl(0, 0%, 50%)', '808080', 1],
  ['hsl(210, 50%, 50%)', '4080BF', 1],
  ['hsla(120, 100%, 25%, 0.5)', '008000', 0.5],
  ['hsl(120deg 100% 25% / 25%)', '008000', 0.25],
  ['hsl(0.5turn, 100%, 50%)', '00FFFF', 1],
  ['hsl(360, 100%, 50%)', 'FF0000', 1],
  ['hsl(-120, 100%, 50%)', '0000FF', 1],
  ['hsl(480, 100%, 50%)', '00FF00', 1],
  ['HSL(60, 100%, 50%)', 'FFFF00', 1],
  // Noms
  ['red', 'FF0000', 1],
  ['RED', 'FF0000', 1],
  ['  Blue  ', '0000FF', 1],
  ['rebeccapurple', '663399', 1],
  ['transparent', '000000', 0],
  ['Transparent', '000000', 0],
]

const INVALID = [
  '',
  '   ',
  'pas-une-couleur',
  'redd',
  'currentcolor',
  'inherit',
  '#',
  '#ff',
  '#fffff',
  '#fffffff',
  '#ggg',
  '#12345g',
  'ff0000',
  'rgb(1, 2)',
  'rgb(1, 2, 3, 4, 5)',
  'rgb(a, b, c)',
  'rgb(1, 2, 3',
  'rgb 1 2 3',
  'rgba(1, 2, 3, x)',
  'hsl(a, 50%, 50%)',
  'hsl(0, x, 50%)',
  'hsl(0, 50%)',
  'url(x)',
  'var(--x)',
  'rgb(var(--x), 0, 0)',
]

describe('cssColorToHex', () => {
  it.each(VALID)('%j devient #%s avec une opacité de %f', (input, hex, alpha) => {
    const result = cssColorToHex(input)

    expect(result).not.toBeNull()
    expect(result?.hex).toBe(hex)
    expect(result?.alpha).toBeCloseTo(alpha, 5)
  })

  it.each(INVALID)('%j est inconnue (null)', (input) => {
    expect(cssColorToHex(input)).toBeNull()
  })

  it('retourne toujours six chiffres hexadécimaux en majuscules', () => {
    for (const [input] of VALID) {
      expect(cssColorToHex(input)?.hex).toMatch(/^[0-9A-F]{6}$/)
    }
  })

  it('comprend les 148 noms de couleur CSS', () => {
    expect(NAMED_COLORS.size).toBe(148)
    for (const name of NAMED_COLORS.keys()) {
      const result = cssColorToHex(name)
      expect(result, name).not.toBeNull()
      expect(result?.alpha).toBe(1)
    }
  })

  it('donne les valeurs attendues pour les noms usuels', () => {
    const expected: Record<string, string> = {
      black: '000000',
      white: 'FFFFFF',
      red: 'FF0000',
      lime: '00FF00',
      green: '008000',
      blue: '0000FF',
      yellow: 'FFFF00',
      cyan: '00FFFF',
      aqua: '00FFFF',
      magenta: 'FF00FF',
      fuchsia: 'FF00FF',
      maroon: '800000',
      olive: '808000',
      navy: '000080',
      purple: '800080',
      teal: '008080',
      silver: 'C0C0C0',
      gray: '808080',
      grey: '808080',
      orange: 'FFA500',
      pink: 'FFC0CB',
      brown: 'A52A2A',
      gold: 'FFD700',
    }
    for (const [name, hex] of Object.entries(expected)) {
      expect(cssColorToHex(name)?.hex, name).toBe(hex)
    }
  })

  it('gray et grey, darkgray et darkgrey sont identiques', () => {
    expect(cssColorToHex('grey')).toEqual(cssColorToHex('gray'))
    expect(cssColorToHex('darkgrey')).toEqual(cssColorToHex('darkgray'))
    expect(cssColorToHex('lightslategrey')).toEqual(cssColorToHex('lightslategray'))
  })

  it('ne confond pas un nom hérité de Object.prototype avec une couleur', () => {
    expect(cssColorToHex('constructor')).toBeNull()
    expect(cssColorToHex('toString')).toBeNull()
    expect(cssColorToHex('__proto__')).toBeNull()
  })
})
