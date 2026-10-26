import { BUILT_IN_FONTS, cssFontFamily, isBuiltInFont, isSafeFontName } from './fonts'
import { MAX_FONT_NAME_LENGTH } from './limits'

describe('BUILT_IN_FONTS', () => {
  it('contient exactement les 8 polices courantes, avec leur pile CSS', () => {
    expect(BUILT_IN_FONTS).toEqual([
      { name: 'Arial', stack: 'Arial, Helvetica, sans-serif' },
      { name: 'Verdana', stack: 'Verdana, Geneva, sans-serif' },
      { name: 'Trebuchet MS', stack: '"Trebuchet MS", Helvetica, sans-serif' },
      { name: 'Tahoma', stack: 'Tahoma, Geneva, sans-serif' },
      { name: 'Georgia', stack: 'Georgia, "Times New Roman", serif' },
      { name: 'Times New Roman', stack: '"Times New Roman", Times, serif' },
      { name: 'Courier New', stack: '"Courier New", Courier, monospace' },
      { name: 'Impact', stack: 'Impact, "Arial Black", sans-serif' },
    ])
  })

  it('a des noms tous sûrs', () => {
    for (const font of BUILT_IN_FONTS) expect(isSafeFontName(font.name)).toBe(true)
  })
})

describe('isBuiltInFont', () => {
  it('reconnaît une police de la liste et pas les autres', () => {
    expect(isBuiltInFont('Georgia')).toBe(true)
    expect(isBuiltInFont('Calibri')).toBe(false)
  })

  it("est sensible à la casse : « georgia » n'est pas « Georgia »", () => {
    expect(isBuiltInFont('georgia')).toBe(false)
    expect(isBuiltInFont('GEORGIA')).toBe(false)
  })
})

describe('isSafeFontName', () => {
  it.each([
    ['Arial'],
    ['Trebuchet MS'],
    ['Open Sans'],
    ['Roboto-Mono'],
    ['my_font 2'],
    ['Fira Code'],
    ['Cambria Math'],
    ['Times New Roman'],
    ['Courier New'],
    ['A'],
    ['7'],
    ['a-b'],
    ['a_b c'],
    ['a'.repeat(MAX_FONT_NAME_LENGTH)],
  ])('accepte « %s »', (value) => {
    expect(isSafeFontName(value)).toBe(true)
  })

  it.each([
    ["une tentative d'injection CSS", 'Arial"; background:url(x)'],
    ['un point virgule', 'a;b'],
    ['un antislash', 'x\\y'],
    ['un chevron', 'a<b'],
    ['un guillemet simple', "a'b"],
    ['un guillemet double', 'a"b'],
    ['des parenthèses', 'Gill Sans (MT)'],
    ['un retour à la ligne', 'a\nb'],
    ['un retour à la ligne final', 'Arial\n'],
    ['un caractère nul final', 'Arial\u0000'],
    ['une tabulation', 'a\tb'],
    ['une lettre accentuée', 'Cambria é'],
    ['une lettre pleine chasse', 'Ａrial'],
    ['un point', 'a.b'],
    ['un tiret en tête', '-a'],
    ['un tiret bas en tête', '_a'],
    ['un espace en tête', ' Arial'],
    ['un espace final', 'Arial '],
    ['un double espace', 'a  b'],
    ['un tiret final', 'a-'],
    ['un tiret bas final', 'a_'],
    ['un nom de 65 caractères', 'a'.repeat(65)],
    ['une chaîne vide', ''],
  ])('refuse %s', (_label, value) => {
    expect(isSafeFontName(value)).toBe(false)
  })

  it('accepte un nom de 64 caractères valides et refuse 65', () => {
    expect(isSafeFontName('a'.repeat(64))).toBe(true)
    expect(isSafeFontName('a'.repeat(65))).toBe(false)
  })

  it.each([[42], [null], [undefined], [{}], [['Arial']], [true]])(
    "refuse une valeur qui n'est pas du texte (%j)",
    (value) => {
      expect(isSafeFontName(value)).toBe(false)
    },
  )
})

describe('cssFontFamily', () => {
  it('null donne undefined : la police par défaut est héritée', () => {
    expect(cssFontFamily(null)).toBeUndefined()
  })

  it.each(BUILT_IN_FONTS.map((font) => [font.name, font.stack] as const))(
    'donne la pile de la liste pour « %s »',
    (name, stack) => {
      expect(cssFontFamily(name)).toBe(stack)
    },
  )

  it.each([
    ['Calibri', '"Calibri", sans-serif'],
    ['Open Sans', '"Open Sans", sans-serif'],
  ])('un autre nom sûr (« %s ») donne un nom entre guillemets et un repli', (name, expected) => {
    expect(cssFontFamily(name)).toBe(expected)
  })

  it('la casse compte : « arial » est une police non listée, pas « Arial »', () => {
    expect(cssFontFamily('arial')).toBe('"arial", sans-serif')
    expect(cssFontFamily('Arial')).toBe('Arial, Helvetica, sans-serif')
  })

  it.each([
    ['Arial"; background:url(x)'],
    ['a;b'],
    ['x\\y'],
    ['a<b'],
    ['Arial '],
    ['a'.repeat(MAX_FONT_NAME_LENGTH + 1)],
    [''],
  ])('un nom non sûr (« %s ») donne undefined', (name) => {
    expect(cssFontFamily(name)).toBeUndefined()
  })

  it("un type inattendu venu d'un appelant non typé donne undefined", () => {
    expect(cssFontFamily(42 as never)).toBeUndefined()
    expect(cssFontFamily({} as never)).toBeUndefined()
  })
})
