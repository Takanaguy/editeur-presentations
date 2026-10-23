// jsdom renvoie des rectangles à zéro. Ce helper simule la liste de vignettes :
// le conteneur (nav) commence en haut de l'écran, chaque vignette « Diapositive N »
// mesure 100 px de haut avec 10 px d'écart, la première à 8 px du haut (le padding).
export const ITEM_HEIGHT = 100
export const ITEM_GAP = 10
export const FIRST_TOP = 8
export const NAV_HEIGHT = 400

function rect(top: number, height: number): DOMRect {
  return {
    x: 0,
    y: top,
    left: 0,
    right: 176,
    top,
    bottom: top + height,
    width: 176,
    height,
    toJSON: () => ({}),
  }
}

// Haut de la vignette de rang `index` (à partir de 0) dans le contenu de la liste
// (sans défilement), l'ordre étant celui du DOM. `gap` : écart entre vignettes.
export function itemTop(index: number, gap = ITEM_GAP): number {
  return FIRST_TOP + index * (ITEM_HEIGHT + gap)
}

// Centre vertical de la vignette de rang `index`.
export function itemCenter(index: number, gap = ITEM_GAP): number {
  return itemTop(index, gap) + ITEM_HEIGHT / 2
}

// À appeler dans le test (ou beforeEach) ; vi.restoreAllMocks() la retire.
// Les rects des vignettes se décalent de -scrollTop du conteneur, comme dans un navigateur.
export function mockThumbnailLayout({ gap = ITEM_GAP }: { gap?: number } = {}) {
  return vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute('aria-label') === 'Vignettes des diapositives') return rect(0, NAV_HEIGHT)
      const match = /^Diapositive (\d+)$/.exec(this.getAttribute('aria-label') ?? '')
      if (match) {
        const scrollTop = this.closest('nav')?.scrollTop ?? 0
        return rect(itemTop(Number(match[1]) - 1, gap) - scrollTop, ITEM_HEIGHT)
      }
      return rect(0, 0)
    })
}
