import {
  FONT_MIMES,
  FONT_SIGNATURE_BYTES,
  fontBytes,
  fontSrcOf,
  toBase64,
  type FixtureFontFormat,
} from '../test/fixtures'
import {
  checkFontSrc,
  detectFontFormat,
  FONT_FORMATS,
  fontDataUrl,
  fontFormatFromExtension,
  fontNameFromFileName,
  uniqueFontName,
} from './fontFormats'
import { BUILT_IN_FONTS, isReservedFontName, isSafeFontName } from './fonts'
import { MAX_FONT_NAME_LENGTH } from './limits'

const FORMATS: FixtureFontFormat[] = ['woff2', 'woff', 'ttf', 'otf']

describe('FONT_FORMATS', () => {
  it.each(FORMATS)('le format %s a le mime attendu', (format) => {
    expect(FONT_FORMATS[format].mime).toBe(FONT_MIMES[format])
  })
})

describe('fontFormatFromExtension', () => {
  it.each([
    ['a.woff2', 'woff2'],
    ['a.woff', 'woff'],
    ['a.ttf', 'ttf'],
    ['a.otf', 'otf'],
    ['A.WOFF2', 'woff2'],
    ['Fira Code.Ttf', 'ttf'],
    ['archive.v1.2.otf', 'otf'],
    ['C:\\polices\\a.woff', 'woff'],
  ])('%s donne %s', (fileName, expected) => {
    expect(fontFormatFromExtension(fileName)).toBe(expected)
  })

  it.each(['a.txt', 'a.png', 'a', '', 'a.woff2.txt', 'a.', '.', 'woff2', 'a.constructor', 'a.__proto__'])(
    '%j donne null',
    (fileName) => {
      expect(fontFormatFromExtension(fileName)).toBeNull()
    },
  )
})

describe('detectFontFormat', () => {
  it.each(FORMATS)('reconnaît la signature de %s', (format) => {
    expect(detectFontFormat(fontBytes(format))).toBe(format)
  })

  it('reconnaît la deuxième signature TrueType (true)', () => {
    expect(detectFontFormat(new Uint8Array([0x74, 0x72, 0x75, 0x65, 0, 0]))).toBe('ttf')
  })

  it('accepte exactement les 4 octets de signature', () => {
    expect(detectFontFormat(new Uint8Array(FONT_SIGNATURE_BYTES.woff2))).toBe('woff2')
  })

  it.each([
    ['vide', new Uint8Array([])],
    ['trop court', new Uint8Array([0x77, 0x4f, 0x46])],
    ['inconnu', new Uint8Array([1, 2, 3, 4, 5])],
    ['du texte', new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c])],
    ['presque TrueType', new Uint8Array([0x00, 0x01, 0x00, 0x01])],
    ['casse différente', new Uint8Array([0x57, 0x4f, 0x46, 0x32])],
  ])('retourne null pour un contenu %s', (_label, bytes) => {
    expect(detectFontFormat(bytes)).toBeNull()
  })
})

describe('fontDataUrl', () => {
  it.each(FORMATS)('utilise le mime fixe de %s', (format) => {
    expect(fontDataUrl(format, 'AAAA')).toBe(`data:${FONT_MIMES[format]};base64,AAAA`)
  })
})

describe('checkFontSrc', () => {
  it.each(FORMATS)('accepte une data URL %s cohérente', (format) => {
    expect(checkFontSrc(fontSrcOf(format))).toBeNull()
  })

  it('accepte du base64 sans, avec un ou avec deux signes = de fin', () => {
    expect(checkFontSrc(fontSrcOf('woff2'))).toBeNull()
    expect(checkFontSrc(fontSrcOf('woff2', 11))).toBeNull()
    expect(checkFontSrc(fontSrcOf('woff2', 10))).toBeNull()
  })

  it('refuse une signature incohérente avec le mime', () => {
    const src = `data:font/otf;base64,${toBase64(fontBytes('woff2'))}`
    expect(checkFontSrc(src)).toBe('signature')
  })

  it.each([
    ['mime image', `data:image/png;base64,${toBase64(fontBytes('otf'))}`],
    ['mime texte', `data:text/html;base64,${toBase64(fontBytes('otf'))}`],
    ['mime font/ttc', `data:font/ttc;base64,${toBase64(fontBytes('ttf'))}`],
    ['sans base64', `data:font/woff2,${toBase64(fontBytes('woff2'))}`],
    ['base64 invalide', 'data:font/woff2;base64,d09GMg$$$$$$$$'],
    ['espace dans le base64', 'data:font/woff2;base64,d09GMgAB AgMEBQYH'],
    ['guillemet', 'data:font/woff2;base64,d09GMgABAgMEBQYH"x'],
    ['http', 'https://exemple.test/a.woff2'],
    ['vide', ''],
    ['trop court pour la signature', 'data:font/woff2;base64,d09G'],
    ['retour à la ligne final', `${fontSrcOf('woff2')}\n`],
    ['majuscules dans le préfixe', fontSrcOf('woff2').replace('data:', 'DATA:')],
  ])('refuse : %s', (_label, src) => {
    expect(checkFontSrc(src)).toBe('format')
  })
})

describe('uniqueFontName', () => {
  it('garde le nom quand il est libre', () => {
    expect(uniqueFontName('Roboto', [])).toBe('Roboto')
    expect(uniqueFontName('Roboto', ['Fira Code'])).toBe('Roboto')
  })

  it.each([
    ['Roboto', ['Roboto'], 'Roboto 2'],
    ['Roboto', ['roboto'], 'Roboto 2'],
    ['roboto', ['ROBOTO'], 'roboto 2'],
    ['Roboto', ['Roboto', 'Roboto 2'], 'Roboto 3'],
    ['Roboto', ['Roboto 2', 'Roboto'], 'Roboto 3'],
    ['Roboto', ['Roboto', 'roboto 2', 'ROBOTO 3'], 'Roboto 4'],
    ['Arial', [], 'Arial 2'],
    ['arial', [], 'arial 2'],
    ['Times New Roman', [], 'Times New Roman 2'],
    ['Arial', ['Arial 2'], 'Arial 3'],
  ])('%s parmi %j donne %s', (name, existing, expected) => {
    expect(uniqueFontName(name, existing)).toBe(expected)
  })

  it('refuse chaque police de la liste', () => {
    for (const font of BUILT_IN_FONTS) {
      expect(uniqueFontName(font.name, [])).toBe(`${font.name} 2`)
    }
  })

  it('reste un nom sûr et de longueur maximale, même rogné', () => {
    const long = 'a'.repeat(MAX_FONT_NAME_LENGTH)
    const result = uniqueFontName(long, [long])
    expect(result.length).toBeLessThanOrEqual(MAX_FONT_NAME_LENGTH)
    expect(result.endsWith(' 2')).toBe(true)
    expect(isSafeFontName(result)).toBe(true)
  })

  it('ne laisse pas un tiret ou une espace avant le suffixe après la coupure', () => {
    // Coupure juste après un tiret : la base rognée ne doit pas finir par « - ».
    const name = `${'a'.repeat(MAX_FONT_NAME_LENGTH - 3)}-bc`
    const result = uniqueFontName(name, [name])
    expect(isSafeFontName(result)).toBe(true)
    expect(result.length).toBeLessThanOrEqual(MAX_FONT_NAME_LENGTH)
    expect(result).not.toMatch(/[-_ ] \d+$/)
  })

  it('un nom plein de chiffres de suffixe reste sûr', () => {
    const long = 'a'.repeat(MAX_FONT_NAME_LENGTH)
    const existing = [long]
    for (let n = 2; n <= 12; n += 1) {
      const next = uniqueFontName(long, existing)
      expect(isSafeFontName(next)).toBe(true)
      expect(next.length).toBeLessThanOrEqual(MAX_FONT_NAME_LENGTH)
      expect(existing).not.toContain(next)
      existing.push(next)
    }
  })

  it('un nom non sûr donne un nom de repli sûr', () => {
    expect(uniqueFontName('', [])).toBe('Police')
    expect(uniqueFontName('é"', [])).toBe('Police')
    expect(uniqueFontName('', ['Police'])).toBe('Police 2')
  })
})

describe('fontNameFromFileName', () => {
  it.each([
    ['Fira-Code Regular.ttf', 'Fira-Code Regular'],
    ['Roboto.woff2', 'Roboto'],
    ['roboto_bold.otf', 'roboto_bold'],
    ['é.woff2', 'Police'],
    ['.ttf', 'Police'],
    ['', 'Police'],
    ['....', 'Police'],
    ['Roboto', 'Roboto'],
    ['Open.Sans.Regular.woff', 'Open Sans Regular'],
    ['Open   Sans.woff', 'Open Sans'],
    ['  Open Sans  .woff', 'Open Sans'],
    ['-Open Sans-.woff', 'Open Sans'],
    ['_Open_.woff', 'Open'],
    ['Café Crème.ttf', 'Caf Cr me'],
    ['Police (1).woff2', 'Police 1'],
    ['Polic\u00e9 + Bold.otf', 'Polic Bold'],
    ['C:\\Users\\moi\\Fonts\\Lato-Regular.ttf', 'Lato-Regular'],
    ['/home/moi/fonts/Lato.woff', 'Lato'],
    ['../../etc/passwd.ttf', 'passwd'],
    ['Ma police 😀.woff2', 'Ma police'],
    ['😀😀.woff2', 'Police'],
    ['😀 Fun 😀.woff2', 'Fun'],
    ['a"b;c.woff', 'a b c'],
    ['a\tb.woff', 'a b'],
    ['Police 2026-v1.ttf', 'Police 2026-v1'],
  ])('%j donne %j', (fileName, expected) => {
    expect(fontNameFromFileName(fileName)).toBe(expected)
  })

  it('tronque à la longueur maximale sans finir par un tiret', () => {
    const name = fontNameFromFileName(`${'a'.repeat(MAX_FONT_NAME_LENGTH - 1)}-bcd.ttf`)
    expect(name.length).toBeLessThanOrEqual(MAX_FONT_NAME_LENGTH)
    expect(isSafeFontName(name)).toBe(true)
    expect(name.endsWith('-')).toBe(false)
  })

  it('un nom très long est tronqué à 64 caractères', () => {
    expect(fontNameFromFileName(`${'b'.repeat(200)}.woff2`)).toBe('b'.repeat(MAX_FONT_NAME_LENGTH))
  })

  it('retourne toujours un nom sûr', () => {
    for (const fileName of ['é', '..', 'a  b', '- -', 'x'.repeat(100), '😀a😀b😀', 'a_ _b', 'a - b']) {
      expect(isSafeFontName(fontNameFromFileName(`${fileName}.ttf`))).toBe(true)
    }
  })
})

describe('isReservedFontName', () => {
  it('reconnaît les polices de la liste sans tenir compte de la casse', () => {
    expect(isReservedFontName('Arial')).toBe(true)
    expect(isReservedFontName('arial')).toBe(true)
    expect(isReservedFontName('TIMES NEW ROMAN')).toBe(true)
    expect(isReservedFontName('Roboto')).toBe(false)
    expect(isReservedFontName('Arial 2')).toBe(false)
  })
})
