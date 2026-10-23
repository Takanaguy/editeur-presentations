import { altFromImageUrl, isValidImageUrl } from './imageUrl'

describe('isValidImageUrl', () => {
  it.each([
    'http://exemple.fr/a.png',
    'https://exemple.fr/a.png',
    'https://exemple.fr/a.png?x=1#y',
    '  https://exemple.fr/a.png  ',
    'data:image/png;base64,AAA',
    'data:image/svg+xml;charset=utf-8,%3Csvg%3E',
  ])('accepte %j', (value) => {
    expect(isValidImageUrl(value)).toBe(true)
  })

  it.each([
    '',
    '   ',
    'javascript:alert(1)',
    'file:///x',
    'ftp://exemple.fr/a.png',
    'texte libre',
    'exemple.fr/a.png',
    'http://',
    'data:text/html,<script>alert(1)</script>',
    'data:application/json,{}',
  ])('refuse %j', (value) => {
    expect(isValidImageUrl(value)).toBe(false)
  })
})

describe('altFromImageUrl', () => {
  it.each([
    ['https://exemple.fr/images/photo.png', 'photo.png'],
    ['https://exemple.fr/a/photo.png?x=1#y', 'photo.png'],
    ['https://exemple.fr/ma%20photo%20%C3%A9t%C3%A9.jpg', 'ma photo été.jpg'],
    ['https://exemple.fr/dossier/', 'dossier'],
    ['  https://exemple.fr/a.png  ', 'a.png'],
  ])('%j donne %j', (value, expected) => {
    expect(altFromImageUrl(value)).toBe(expected)
  })

  it.each([
    'https://exemple.fr',
    'https://exemple.fr/',
    'data:image/png;base64,AAA',
    'texte libre',
    '',
  ])('retombe sur "Image" pour %j', (value) => {
    expect(altFromImageUrl(value)).toBe('Image')
  })

  it('garde le segment brut si le décodage échoue', () => {
    expect(altFromImageUrl('https://exemple.fr/100%.png')).toBe('100%.png')
  })
})
