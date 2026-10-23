import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../model/types'
import {
  MIN_ELEMENT_SIZE,
  applyMove,
  applyResize,
  clamp,
  clampBounds,
  type Bounds,
  type ResizeHandle,
} from './geometry'

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

describe('applyMove', () => {
  const start: Bounds = { x: 100, y: 50, width: 300, height: 200 }

  it('déplace de dx et dy', () => {
    expect(applyMove(start, 30, -20)).toEqual({ x: 130, y: 30, width: 300, height: 200 })
  })

  it('arrondit la nouvelle position à l\'entier', () => {
    expect(applyMove(start, 10.4, 10.6)).toEqual({ x: 110, y: 61, width: 300, height: 200 })
  })

  it('ne change jamais la taille', () => {
    const result = applyMove(start, 9999, 9999)
    expect(result.width).toBe(300)
    expect(result.height).toBe(200)
  })

  it('borne contre les 4 côtés de la diapositive', () => {
    expect(applyMove(start, -5000, 0).x).toBe(0)
    expect(applyMove(start, 0, -5000).y).toBe(0)
    expect(applyMove(start, 5000, 0).x).toBe(SLIDE_WIDTH - 300)
    expect(applyMove(start, 0, 5000).y).toBe(SLIDE_HEIGHT - 200)
  })

  it('retourne start inchangé si dx ou dy n\'est pas fini', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(applyMove(start, bad, 5)).toBe(start)
      expect(applyMove(start, 5, bad)).toBe(start)
    }
  })
})

describe('applyResize', () => {
  const start: Bounds = { x: 200, y: 100, width: 400, height: 300 }
  const left = 200
  const top = 100
  const right = 600
  const bottom = 400
  const edges = (b: Bounds) => ({
    left: b.x,
    top: b.y,
    right: b.x + b.width,
    bottom: b.y + b.height,
  })

  // Pour chaque poignée : les bords qui doivent bouger avec dx = 20 et dy = 10.
  const cases: [ResizeHandle, Partial<ReturnType<typeof edges>>][] = [
    ['n', { top: top + 10 }],
    ['ne', { top: top + 10, right: right + 20 }],
    ['e', { right: right + 20 }],
    ['se', { right: right + 20, bottom: bottom + 10 }],
    ['s', { bottom: bottom + 10 }],
    ['sw', { left: left + 20, bottom: bottom + 10 }],
    ['w', { left: left + 20 }],
    ['nw', { left: left + 20, top: top + 10 }],
  ]

  it.each(cases)('poignée %s : seuls les bons bords bougent', (handle, moved) => {
    const result = edges(applyResize(start, handle, 20, 10))
    expect(result).toEqual({ left, top, right, bottom, ...moved })
  })

  it('arrondit les bords déplacés à l\'entier', () => {
    const result = applyResize(start, 'se', 10.4, 10.6)
    expect(result).toEqual({ x: 200, y: 100, width: 410, height: 311 })
  })

  it('permet d\'agrandir et de réduire (signe de dx et dy)', () => {
    expect(applyResize(start, 'se', -50, -50)).toEqual({ x: 200, y: 100, width: 350, height: 250 })
    expect(applyResize(start, 'nw', -50, -50)).toEqual({ x: 150, y: 50, width: 450, height: 350 })
  })

  it.each(cases)(
    'poignée %s : taille minimale atteinte, bord opposé exactement en place',
    (handle) => {
      // Un mouvement énorme vers l'intérieur (le sens qui réduit l'élément).
      const dx = handle.includes('w') ? 5000 : handle.includes('e') ? -5000 : 0
      const dy = handle.includes('n') ? 5000 : handle.includes('s') ? -5000 : 0
      const result = edges(applyResize(start, handle, dx, dy))

      if (handle.includes('w')) {
        expect(result.right).toBe(right)
        expect(result.right - result.left).toBe(MIN_ELEMENT_SIZE)
      }
      if (handle.includes('e')) {
        expect(result.left).toBe(left)
        expect(result.right - result.left).toBe(MIN_ELEMENT_SIZE)
      }
      if (handle.includes('n')) {
        expect(result.bottom).toBe(bottom)
        expect(result.bottom - result.top).toBe(MIN_ELEMENT_SIZE)
      }
      if (handle.includes('s')) {
        expect(result.top).toBe(top)
        expect(result.bottom - result.top).toBe(MIN_ELEMENT_SIZE)
      }
    },
  )

  it('borne contre les bords de la diapositive', () => {
    expect(applyResize(start, 'w', -5000, 0)).toEqual({ x: 0, y: 100, width: 600, height: 300 })
    expect(applyResize(start, 'n', 0, -5000)).toEqual({ x: 200, y: 0, width: 400, height: 400 })
    expect(applyResize(start, 'e', 5000, 0)).toEqual({
      x: 200,
      y: 100,
      width: SLIDE_WIDTH - 200,
      height: 300,
    })
    expect(applyResize(start, 's', 0, 5000)).toEqual({
      x: 200,
      y: 100,
      width: 400,
      height: SLIDE_HEIGHT - 100,
    })
  })

  it('retourne start inchangé si dx ou dy n\'est pas fini', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(applyResize(start, 'se', bad, 5)).toBe(start)
      expect(applyResize(start, 'nw', 5, bad)).toBe(start)
    }
  })

  it('propriété : toujours dans la diapositive, taille minimale respectée, bord opposé fixe', () => {
    const starts: Bounds[] = [
      start,
      { x: 0, y: 0, width: SLIDE_WIDTH, height: SLIDE_HEIGHT },
      { x: SLIDE_WIDTH - 20, y: SLIDE_HEIGHT - 20, width: 20, height: 20 },
      { x: 640, y: 360, width: 20, height: 20 },
    ]
    const handles: ResizeHandle[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']

    for (const s of starts) {
      const before = edges(s)
      for (const handle of handles) {
        for (let dx = -2000; dx <= 2000; dx += 137) {
          for (let dy = -2000; dy <= 2000; dy += 137) {
            const b = applyResize(s, handle, dx, dy)
            const after = edges(b)
            const ok =
              after.left >= 0 &&
              after.top >= 0 &&
              after.right <= SLIDE_WIDTH &&
              after.bottom <= SLIDE_HEIGHT &&
              b.width >= MIN_ELEMENT_SIZE &&
              b.height >= MIN_ELEMENT_SIZE &&
              (handle.includes('w') || after.left === before.left) &&
              (handle.includes('e') || after.right === before.right) &&
              (handle.includes('n') || after.top === before.top) &&
              (handle.includes('s') || after.bottom === before.bottom)
            // Un seul expect.fail avec le contexte : plus lisible qu'un million d'assertions.
            if (!ok) expect.fail(`propriété violée : ${handle} dx=${dx} dy=${dy} ${JSON.stringify(b)}`)
          }
        }
      }
    }
  })
})
