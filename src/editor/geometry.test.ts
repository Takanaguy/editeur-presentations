import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../model/types'
import { MIN_ELEMENT_SIZE, clamp, clampBounds } from './geometry'

describe('clamp', () => {
  it('borne entre min et max', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-5, 0, 10)).toBe(0)
    expect(clamp(15, 0, 10)).toBe(10)
  })

  it('ramène NaN au minimum et borne les infinis', () => {
    expect(clamp(NaN, 3, 10)).toBe(3)
    expect(clamp(Infinity, 0, 10)).toBe(10)
    expect(clamp(-Infinity, 0, 10)).toBe(0)
  })
})

describe('clampBounds', () => {
  it('laisse intactes des bounds déjà dans les limites', () => {
    const bounds = { x: 100, y: 50, width: 300, height: 200 }
    expect(clampBounds(bounds)).toEqual(bounds)
  })

  it('accepte un élément exactement aux limites', () => {
    const bounds = { x: 0, y: 0, width: SLIDE_WIDTH, height: SLIDE_HEIGHT }
    expect(clampBounds(bounds)).toEqual(bounds)
  })

  it('réduit un élément plus grand que la diapositive', () => {
    const result = clampBounds({ x: 100, y: 100, width: 5000, height: 4000 })
    expect(result).toEqual({ x: 0, y: 0, width: SLIDE_WIDTH, height: SLIDE_HEIGHT })
  })

  it('agrandit un élément plus petit que la taille minimale', () => {
    const result = clampBounds({ x: 100, y: 100, width: 5, height: -30 })
    expect(result.width).toBe(MIN_ELEMENT_SIZE)
    expect(result.height).toBe(MIN_ELEMENT_SIZE)
  })

  it('ramène des x et y négatifs à 0', () => {
    const result = clampBounds({ x: -50, y: -10, width: 100, height: 100 })
    expect(result.x).toBe(0)
    expect(result.y).toBe(0)
  })

  it('ramène un élément qui déborde à droite et en bas contre le bord', () => {
    const result = clampBounds({ x: 1200, y: 700, width: 200, height: 100 })
    expect(result.x).toBe(SLIDE_WIDTH - 200)
    expect(result.y).toBe(SLIDE_HEIGHT - 100)
    expect(result.width).toBe(200)
    expect(result.height).toBe(100)
  })

  it('borne la taille avant la position (taille minimale contre le bord)', () => {
    const result = clampBounds({ x: SLIDE_WIDTH, y: SLIDE_HEIGHT, width: 1, height: 1 })
    expect(result).toEqual({
      x: SLIDE_WIDTH - MIN_ELEMENT_SIZE,
      y: SLIDE_HEIGHT - MIN_ELEMENT_SIZE,
      width: MIN_ELEMENT_SIZE,
      height: MIN_ELEMENT_SIZE,
    })
  })

  it('ne modifie pas l\'objet reçu', () => {
    const bounds = Object.freeze({ x: -5, y: 9999, width: 1, height: 1 })
    expect(() => clampBounds(bounds)).not.toThrow()
  })

  it('traite NaN comme la plus petite valeur permise', () => {
    const result = clampBounds({ x: NaN, y: NaN, width: NaN, height: NaN })
    expect(result).toEqual({ x: 0, y: 0, width: MIN_ELEMENT_SIZE, height: MIN_ELEMENT_SIZE })
  })

  it('borne les infinis aux limites de la diapositive', () => {
    expect(clampBounds({ x: 0, y: 0, width: Infinity, height: Infinity })).toEqual({
      x: 0,
      y: 0,
      width: SLIDE_WIDTH,
      height: SLIDE_HEIGHT,
    })
    expect(clampBounds({ x: Infinity, y: -Infinity, width: 100, height: 100 })).toEqual({
      x: SLIDE_WIDTH - 100,
      y: 0,
      width: 100,
      height: 100,
    })
    expect(clampBounds({ x: 0, y: 0, width: -Infinity, height: -Infinity }).width).toBe(
      MIN_ELEMENT_SIZE,
    )
  })

  it('retourne toujours des valeurs finies, quelle que soit l\'entrée', () => {
    const values = [NaN, Infinity, -Infinity, -1e9, 1e9, 0, 37]
    for (const x of values) {
      for (const width of values) {
        const result = clampBounds({ x, y: x, width, height: width })
        expect(Object.values(result).every(Number.isFinite)).toBe(true)
        expect(result.x + result.width).toBeLessThanOrEqual(SLIDE_WIDTH)
        expect(result.y + result.height).toBeLessThanOrEqual(SLIDE_HEIGHT)
      }
    }
  })
})
