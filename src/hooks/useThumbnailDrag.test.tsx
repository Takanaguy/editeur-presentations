import { act, fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { firePointer } from '../test/pointer'
import { itemCenter, mockThumbnailLayout } from '../test/thumbnailLayout'
import { AUTOSCROLL_STEP, useThumbnailDrag } from './useThumbnailDrag'

interface HarnessProps {
  slideIds?: string[]
  withContainer?: boolean
  onSelect: (slideId: string) => void
  onMoveSlide: (slideId: string, toIndex: number) => void
  onItemClick: (slideId: string) => void
}

// Petit composant qui branche le hook sur trois boutons et affiche l'état du glisser.
function Harness({
  slideIds = ['a', 'b', 'c'],
  withContainer = true,
  onSelect,
  onMoveSlide,
  onItemClick,
}: HarnessProps) {
  const items = useRef(new Map<string, HTMLElement>())
  const container = useRef<HTMLElement | null>(null)
  const { drag, startDrag } = useThumbnailDrag({
    slideIds,
    onSelect,
    onMoveSlide,
    getItemElement: (slideId) => items.current.get(slideId) ?? null,
    scrollContainerRef: withContainer ? container : { current: null },
  })
  return (
    <nav ref={container} aria-label="Vignettes des diapositives">
      {slideIds.map((id, index) => (
        <button
          key={id}
          type="button"
          aria-label={`Diapositive ${index + 1}`}
          ref={(element) => {
            if (element) items.current.set(id, element)
            else items.current.delete(id)
          }}
          onPointerDown={(event) => startDrag(event, id)}
          onClick={() => onItemClick(id)}
        />
      ))}
      <output data-testid="drag">{drag ? JSON.stringify(drag) : 'null'}</output>
    </nav>
  )
}

function setup(props: Partial<HarnessProps> = {}) {
  const onSelect = vi.fn()
  const onMoveSlide = vi.fn()
  const onItemClick = vi.fn()
  const view = render(
    <Harness onSelect={onSelect} onMoveSlide={onMoveSlide} onItemClick={onItemClick} {...props} />,
  )
  const item = (n: number) => screen.getByRole('button', { name: `Diapositive ${n}` })
  const drag = () => JSON.parse(screen.getByTestId('drag').textContent ?? 'null')
  return { onSelect, onMoveSlide, onItemClick, item, drag, ...view }
}

// Mouvement vertical depuis la vignette 3 (index 2), centre à y = 278.
const startY = itemCenter(2)

describe('useThumbnailDrag', () => {
  beforeEach(() => {
    mockThumbnailLayout()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('au repos, drag vaut null', () => {
    const { drag } = setup()
    expect(drag()).toBeNull()
  })

  it('un clic sans mouvement n\'appelle rien et ne lance pas de glisser', () => {
    const { item, onSelect, onMoveSlide, onItemClick, drag } = setup()

    firePointer(item(3), 'pointerdown', { clientX: 10, clientY: startY })
    firePointer(window, 'pointerup', { clientX: 10, clientY: startY })
    fireEvent.click(item(3))

    expect(onSelect).not.toHaveBeenCalled()
    expect(onMoveSlide).not.toHaveBeenCalled()
    // Le clic de sélection habituel passe.
    expect(onItemClick).toHaveBeenCalledTimes(1)
    expect(drag()).toBeNull()
  })

  it('sous le seuil de 5 pixels, pas de glisser', () => {
    const { item, onSelect, onMoveSlide, drag } = setup()

    firePointer(item(3), 'pointerdown', { clientX: 10, clientY: startY })
    firePointer(window, 'pointermove', { clientX: 13, clientY: startY - 3 })
    firePointer(window, 'pointermove', { clientX: 10, clientY: startY - 4 })

    expect(drag()).toBeNull()
    expect(onSelect).not.toHaveBeenCalled()

    firePointer(window, 'pointerup', { clientX: 10, clientY: startY - 4 })
    expect(onMoveSlide).not.toHaveBeenCalled()
  })

  it('au dessus du seuil, appelle onSelect une fois et met drag à jour', () => {
    const { item, onSelect, onMoveSlide, drag } = setup()

    firePointer(item(3), 'pointerdown', { clientX: 10, clientY: startY })
    firePointer(window, 'pointermove', { clientX: 10, clientY: startY - 5 })

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('c')
    // Autres centres : 58 et 168. Pointeur à 273 : les deux sont au dessus.
    expect(drag()).toMatchObject({ slideId: 'c', toIndex: 2 })

    firePointer(window, 'pointermove', { clientX: 10, clientY: 100 })
    expect(drag()).toMatchObject({ slideId: 'c', toIndex: 1 })
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onMoveSlide).not.toHaveBeenCalled()
  })

  it('place la barre d\'insertion entre les voisines, ou dans le vide aux extrémités', () => {
    const { item, drag } = setup()

    firePointer(item(3), 'pointerdown', { clientX: 10, clientY: startY })
    // Avant tout : le haut de la première (8) moins la moitié de l'écart mesuré (5). Les
    // positions restent hors des zones de défilement automatique (40 px des bords).
    firePointer(window, 'pointermove', { clientX: 10, clientY: 45 })
    expect(drag()).toMatchObject({ toIndex: 0, indicatorTop: 3 })
    // Entre a (bas 108) et b (haut 118).
    firePointer(window, 'pointermove', { clientX: 10, clientY: 100 })
    expect(drag()).toMatchObject({ toIndex: 1, indicatorTop: 113 })
    // Après la dernière autre (b, bas 218) plus 5.
    firePointer(window, 'pointermove', { clientX: 10, clientY: 350 })
    expect(drag()).toMatchObject({ toIndex: 2, indicatorTop: 223 })
  })

  it('déduit le demi-écart des rects réels : un écart de 20 px donne 10', () => {
    mockThumbnailLayout({ gap: 20 })
    const { item, drag } = setup()

    firePointer(item(3), 'pointerdown', { clientX: 10, clientY: itemCenter(2, 20) })
    // Autres : a (8 à 108) et b (128 à 228).
    firePointer(window, 'pointermove', { clientX: 10, clientY: 45 })
    expect(drag()).toMatchObject({ toIndex: 0, indicatorTop: -2 })
    firePointer(window, 'pointermove', { clientX: 10, clientY: 100 })
    expect(drag()).toMatchObject({ toIndex: 1, indicatorTop: 118 })
    firePointer(window, 'pointermove', { clientX: 10, clientY: 350 })
    expect(drag()).toMatchObject({ toIndex: 2, indicatorTop: 238 })
  })

  it('indicatorTop est en coordonnées du contenu quand la liste est défilée', () => {
    mockThumbnailLayout({ gap: 20 })
    const { item, drag } = setup()
    // Liste défilée de 50 px : les rects se décalent de -50, scrollTop est ajouté en retour.
    Object.defineProperty(screen.getByRole('navigation'), 'scrollTop', {
      configurable: true,
      get: () => 50,
      set: () => {},
    })

    firePointer(item(3), 'pointerdown', { clientX: 10, clientY: itemCenter(2, 20) - 50 })
    // Écran : a de -42 à 58, b de 78 à 178. Entre les deux : 68, soit 118 dans le contenu.
    firePointer(window, 'pointermove', { clientX: 10, clientY: 100 })
    expect(drag()).toMatchObject({ toIndex: 1, indicatorTop: 118 })
    // Après b (bas 178 à l'écran) plus 10, soit 238 dans le contenu.
    firePointer(window, 'pointermove', { clientX: 10, clientY: 350 })
    expect(drag()).toMatchObject({ toIndex: 2, indicatorTop: 238 })
  })

  it('pointerup appelle onMoveSlide une seule fois avec le bon toIndex, après beaucoup de mouvements', () => {
    const { item, onMoveSlide, drag } = setup()

    firePointer(item(3), 'pointerdown', { clientX: 10, clientY: startY })
    for (let y = startY; y >= 20; y -= 10) firePointer(window, 'pointermove', { clientX: 10, clientY: y })
    expect(onMoveSlide).not.toHaveBeenCalled()
    firePointer(window, 'pointerup', { clientX: 10, clientY: 20 })

    expect(onMoveSlide).toHaveBeenCalledTimes(1)
    expect(onMoveSlide).toHaveBeenCalledWith('c', 0)
    expect(drag()).toBeNull()
  })

  it('descendre une diapositive donne l\'index après retrait', () => {
    const { item, onMoveSlide } = setup()

    firePointer(item(1), 'pointerdown', { clientX: 10, clientY: itemCenter(0) })
    firePointer(window, 'pointermove', { clientX: 10, clientY: 300 })
    firePointer(window, 'pointerup', { clientX: 10, clientY: 300 })

    // Autres : b (168) et c (278), tous deux au dessus de 300 : arrivée à l'index 2.
    expect(onMoveSlide).toHaveBeenCalledTimes(1)
    expect(onMoveSlide).toHaveBeenCalledWith('a', 2)
  })

  it('revenir à la position de départ avant de relâcher n\'appelle rien', () => {
    const { item, onMoveSlide, onSelect, drag } = setup()

    firePointer(item(3), 'pointerdown', { clientX: 10, clientY: startY })
    firePointer(window, 'pointermove', { clientX: 10, clientY: 20 })
    expect(drag()).toMatchObject({ toIndex: 0 })
    firePointer(window, 'pointermove', { clientX: 10, clientY: startY })
    firePointer(window, 'pointerup', { clientX: 10, clientY: startY })

    expect(onMoveSlide).not.toHaveBeenCalled()
    // Le glisser avait bien commencé : la diapositive a été sélectionnée.
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(drag()).toBeNull()
  })

  it('Échap annule sans appeler onMoveSlide', () => {
    const { item, onMoveSlide, drag } = setup()

    firePointer(item(3), 'pointerdown', { clientX: 10, clientY: startY })
    firePointer(window, 'pointermove', { clientX: 10, clientY: 20 })
    expect(drag()).not.toBeNull()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(drag()).toBeNull()
    firePointer(window, 'pointerup', { clientX: 10, clientY: 20 })

    expect(onMoveSlide).not.toHaveBeenCalled()
  })

  it('pointercancel annule sans appeler onMoveSlide', () => {
    const { item, onMoveSlide, drag } = setup()

    firePointer(item(3), 'pointerdown', { clientX: 10, clientY: startY })
    firePointer(window, 'pointermove', { clientX: 10, clientY: 20 })
    firePointer(window, 'pointercancel', { clientX: 10, clientY: 20 })
    expect(drag()).toBeNull()
    firePointer(window, 'pointerup', { clientX: 10, clientY: 20 })

    expect(onMoveSlide).not.toHaveBeenCalled()
  })

  it('ignore le bouton droit', () => {
    const { item, onMoveSlide, onSelect, drag } = setup()

    firePointer(item(3), 'pointerdown', { clientX: 10, clientY: startY, button: 2 })
    firePointer(window, 'pointermove', { clientX: 10, clientY: 20 })
    firePointer(window, 'pointerup', { clientX: 10, clientY: 20 })

    expect(drag()).toBeNull()
    expect(onSelect).not.toHaveBeenCalled()
    expect(onMoveSlide).not.toHaveBeenCalled()
  })

  it('ignore le tactile (la liste doit continuer à défiler)', () => {
    const { item, onMoveSlide, onSelect, drag } = setup()

    firePointer(item(3), 'pointerdown', { clientX: 10, clientY: startY, pointerType: 'touch' })
    firePointer(window, 'pointermove', { clientX: 10, clientY: 20 })
    firePointer(window, 'pointerup', { clientX: 10, clientY: 20 })

    expect(drag()).toBeNull()
    expect(onSelect).not.toHaveBeenCalled()
    expect(onMoveSlide).not.toHaveBeenCalled()
  })

  it('ignore un second geste pendant le premier', () => {
    const { item, onMoveSlide } = setup()

    firePointer(item(3), 'pointerdown', { clientX: 10, clientY: startY })
    // Un autre pointeur appuie sur la vignette 1 : ignoré, comme ses mouvements.
    firePointer(item(1), 'pointerdown', { clientX: 10, clientY: 58, pointerId: 2 })
    firePointer(window, 'pointermove', { clientX: 10, clientY: 300, pointerId: 2 })
    firePointer(window, 'pointermove', { clientX: 10, clientY: 20 })
    firePointer(window, 'pointerup', { clientX: 10, clientY: 20, pointerId: 2 })
    expect(onMoveSlide).not.toHaveBeenCalled()
    firePointer(window, 'pointerup', { clientX: 10, clientY: 20 })

    expect(onMoveSlide).toHaveBeenCalledTimes(1)
    expect(onMoveSlide).toHaveBeenCalledWith('c', 0)
  })

  it('neutralise le click qui suit un vrai glisser, pas les clics suivants', () => {
    const { item, onItemClick } = setup()

    firePointer(item(3), 'pointerdown', { clientX: 10, clientY: startY })
    firePointer(window, 'pointermove', { clientX: 10, clientY: 20 })
    firePointer(window, 'pointerup', { clientX: 10, clientY: 20 })
    fireEvent.click(item(3))
    expect(onItemClick).not.toHaveBeenCalled()

    // Un clic ultérieur normal fonctionne.
    fireEvent.click(item(3))
    expect(onItemClick).toHaveBeenCalledTimes(1)
  })

  it('le garde-clic se retire de lui-même si aucun click ne vient', async () => {
    const { item, onItemClick } = setup()

    firePointer(item(3), 'pointerdown', { clientX: 10, clientY: startY })
    firePointer(window, 'pointermove', { clientX: 10, clientY: 20 })
    firePointer(window, 'pointerup', { clientX: 10, clientY: 20 })
    await act(() => new Promise((resolve) => setTimeout(resolve, 5)))

    fireEvent.click(item(3))
    expect(onItemClick).toHaveBeenCalledTimes(1)
  })

  it('un glisser annulé ne neutralise pas le clic suivant', () => {
    const { item, onItemClick } = setup()

    firePointer(item(3), 'pointerdown', { clientX: 10, clientY: startY })
    firePointer(window, 'pointermove', { clientX: 10, clientY: 20 })
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(item(3))

    expect(onItemClick).toHaveBeenCalledTimes(1)
  })

  it('retire ses écouteurs au démontage, même en plein glisser', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { item, onMoveSlide, onSelect, unmount } = setup()

    firePointer(item(3), 'pointerdown', { clientX: 10, clientY: startY })
    unmount()

    const removed = removeSpy.mock.calls.map(([type]) => type)
    expect(removed).toEqual(
      expect.arrayContaining(['pointermove', 'pointerup', 'pointercancel', 'keydown', 'blur']),
    )
    firePointer(window, 'pointermove', { clientX: 10, clientY: 20 })
    firePointer(window, 'pointerup', { clientX: 10, clientY: 20 })
    expect(onSelect).not.toHaveBeenCalled()
    expect(onMoveSlide).not.toHaveBeenCalled()
  })

  it('retire ses écouteurs à la fin du geste', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { item } = setup()

    firePointer(item(3), 'pointerdown', { clientX: 10, clientY: startY })
    firePointer(window, 'pointerup', { clientX: 10, clientY: startY })

    const removed = removeSpy.mock.calls.map(([type]) => type)
    expect(removed).toEqual(
      expect.arrayContaining(['pointermove', 'pointerup', 'pointercancel', 'keydown', 'blur']),
    )
  })

  it('recalcule toIndex au relâchement, à la position du pointeur', () => {
    const { item, onMoveSlide } = setup()

    firePointer(item(1), 'pointerdown', { clientX: 10, clientY: itemCenter(0) })
    firePointer(window, 'pointermove', { clientX: 10, clientY: 300 })
    // Relâché ailleurs, sans nouveau mouvement : c'est cette position qui compte.
    // Autres : b (168) et c (278). À 200, seul b est au dessus : index 1.
    firePointer(window, 'pointerup', { clientX: 10, clientY: 200 })

    expect(onMoveSlide).toHaveBeenCalledTimes(1)
    expect(onMoveSlide).toHaveBeenCalledWith('a', 1)
  })

  it('relâché à la place de départ après un autre mouvement : aucun appel', () => {
    const { item, onMoveSlide } = setup()

    firePointer(item(1), 'pointerdown', { clientX: 10, clientY: itemCenter(0) })
    firePointer(window, 'pointermove', { clientX: 10, clientY: 300 })
    firePointer(window, 'pointerup', { clientX: 10, clientY: 20 })

    expect(onMoveSlide).not.toHaveBeenCalled()
  })

  it('une liste modifiée sans mouvement (Ctrl+Z, Suppr) ne laisse pas un index périmé', () => {
    const onSelect = vi.fn()
    const onMoveSlide = vi.fn()
    const onItemClick = vi.fn()
    const props = { onSelect, onMoveSlide, onItemClick }
    const { rerender } = render(<Harness {...props} />)

    firePointer(screen.getByRole('button', { name: 'Diapositive 3' }), 'pointerdown', {
      clientX: 10,
      clientY: startY,
    })
    // Pointeur entre a et b : toIndex 1 au dernier mouvement.
    firePointer(window, 'pointermove', { clientX: 10, clientY: 100 })
    // La liste change sans que le pointeur bouge : c passe en tête.
    rerender(<Harness {...props} slideIds={['c', 'a', 'b']} />)
    firePointer(window, 'pointerup', { clientX: 10, clientY: 100 })

    // Recalculé : à y = 100, avant a (168) et b (278), donc index 0 = place actuelle de c.
    expect(onMoveSlide).not.toHaveBeenCalled()
  })

  describe('pointerup perdu', () => {
    it('un pointermove sans bouton enfoncé annule le geste sans callback', () => {
      const { item, onMoveSlide, drag } = setup()

      firePointer(item(3), 'pointerdown', { clientX: 10, clientY: startY })
      firePointer(window, 'pointermove', { clientX: 10, clientY: 20 })
      expect(drag()).not.toBeNull()
      firePointer(window, 'pointermove', { clientX: 10, clientY: 20, buttons: 0 })

      expect(drag()).toBeNull()
      firePointer(window, 'pointerup', { clientX: 10, clientY: 20 })
      expect(onMoveSlide).not.toHaveBeenCalled()
    })

    it('un blur de la fenêtre en plein glisser annule sans callback', () => {
      const { item, onMoveSlide, drag } = setup()

      firePointer(item(3), 'pointerdown', { clientX: 10, clientY: startY })
      firePointer(window, 'pointermove', { clientX: 10, clientY: 20 })
      fireEvent.blur(window)

      expect(drag()).toBeNull()
      firePointer(window, 'pointerup', { clientX: 10, clientY: 20 })
      expect(onMoveSlide).not.toHaveBeenCalled()
    })

    it('après annulation, un nouveau geste peut démarrer', () => {
      const { item, onMoveSlide } = setup()

      firePointer(item(3), 'pointerdown', { clientX: 10, clientY: startY })
      firePointer(window, 'pointermove', { clientX: 10, clientY: 20, buttons: 0 })
      fireEvent.blur(window)

      firePointer(item(3), 'pointerdown', { clientX: 10, clientY: startY })
      firePointer(window, 'pointermove', { clientX: 10, clientY: 20 })
      firePointer(window, 'pointerup', { clientX: 10, clientY: 20 })

      expect(onMoveSlide).toHaveBeenCalledTimes(1)
      expect(onMoveSlide).toHaveBeenCalledWith('c', 0)
    })

    it('le blur ne fait plus rien après le démontage', () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener')
      const { item, unmount } = setup()

      firePointer(item(3), 'pointerdown', { clientX: 10, clientY: startY })
      unmount()

      expect(removeSpy.mock.calls.map(([type]) => type)).toContain('blur')
    })
  })

  describe('défilement automatique', () => {
    // jsdom ne défile pas : on suit les écritures de scrollTop sur le conteneur.
    function trackScroll(nav: HTMLElement) {
      let value = 100
      Object.defineProperty(nav, 'scrollTop', {
        configurable: true,
        get: () => value,
        set: (next: number) => {
          value = next
        },
      })
      return () => value
    }

    it('défile vers le bas près du bord bas, vers le haut près du bord haut', () => {
      const { item } = setup()
      const scrollTop = trackScroll(screen.getByRole('navigation'))

      firePointer(item(3), 'pointerdown', { clientX: 10, clientY: startY })
      // Le conteneur simulé va de 0 à 400 : 390 est dans les 40 px du bas.
      firePointer(window, 'pointermove', { clientX: 10, clientY: 390 })
      expect(scrollTop()).toBe(100 + AUTOSCROLL_STEP)

      firePointer(window, 'pointermove', { clientX: 10, clientY: 10 })
      expect(scrollTop()).toBe(100)
    })

    it('ne défile pas au milieu de la liste ni avant le seuil', () => {
      const { item } = setup()
      const scrollTop = trackScroll(screen.getByRole('navigation'))

      firePointer(item(3), 'pointerdown', { clientX: 10, clientY: 395 })
      firePointer(window, 'pointermove', { clientX: 12, clientY: 395 })
      expect(scrollTop()).toBe(100)

      firePointer(window, 'pointermove', { clientX: 10, clientY: 200 })
      expect(scrollTop()).toBe(100)
    })

    it('sans conteneur, le glisser fonctionne sans planter', () => {
      const { item, onMoveSlide } = setup({ withContainer: false })

      firePointer(item(3), 'pointerdown', { clientX: 10, clientY: startY })
      firePointer(window, 'pointermove', { clientX: 10, clientY: 5 })
      firePointer(window, 'pointerup', { clientX: 10, clientY: 5 })

      expect(onMoveSlide).toHaveBeenCalledWith('c', 0)
    })
  })
})
