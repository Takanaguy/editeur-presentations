import { fireEvent, render, screen } from '@testing-library/react'
import type { Bounds } from '../editor/geometry'
import { createRectElement } from '../model/factories'
import { firePointer } from '../test/pointer'
import { useElementGesture, type GestureMode } from './useElementGesture'

const element = createRectElement({ x: 100, y: 100, width: 200, height: 100 })

interface HarnessProps {
  scale?: number
  mode?: GestureMode
  onMove: (elementId: string, x: number, y: number) => void
  onResize: (elementId: string, bounds: Bounds) => void
}

// Petit composant qui branche le hook sur une zone cliquable et affiche le brouillon.
function Harness({ scale = 1, mode = 'move', onMove, onResize }: HarnessProps) {
  const { preview, startGesture } = useElementGesture({ scale, onMove, onResize })
  return (
    <div>
      <div data-testid="target" onPointerDown={(event) => startGesture(event, element, mode)} />
      <output data-testid="preview">{preview ? JSON.stringify(preview) : 'null'}</output>
    </div>
  )
}

function setup(props: Partial<HarnessProps> = {}) {
  const onMove = vi.fn()
  const onResize = vi.fn()
  const view = render(<Harness onMove={onMove} onResize={onResize} {...props} />)
  const target = screen.getByTestId('target')
  const preview = () => JSON.parse(screen.getByTestId('preview').textContent ?? 'null')
  return { onMove, onResize, target, preview, ...view }
}

describe('useElementGesture', () => {
  it('au repos, preview vaut null', () => {
    const { preview } = setup()
    expect(preview()).toBeNull()
  })

  it('met preview à jour avec dx / scale (échelle 0,5 : 50 px écran = 100 unités)', () => {
    const { target, preview } = setup({ scale: 0.5 })

    firePointer(target, 'pointerdown', { clientX: 10, clientY: 10 })
    firePointer(window, 'pointermove', { clientX: 60, clientY: 35 })

    expect(preview()).toEqual({
      elementId: element.id,
      bounds: { x: 200, y: 150, width: 200, height: 100 },
    })
  })

  it('appelle onMove une seule fois au relâchement, même après beaucoup de mouvements', () => {
    const { target, onMove, onResize, preview } = setup()

    firePointer(target, 'pointerdown', { clientX: 0, clientY: 0 })
    for (let i = 1; i <= 30; i++) firePointer(window, 'pointermove', { clientX: i, clientY: 2 * i })
    expect(onMove).not.toHaveBeenCalled()
    firePointer(window, 'pointerup', { clientX: 30, clientY: 60 })

    expect(onMove).toHaveBeenCalledTimes(1)
    expect(onMove).toHaveBeenCalledWith(element.id, 130, 160)
    expect(onResize).not.toHaveBeenCalled()
    expect(preview()).toBeNull()
  })

  it('un clic sans mouvement n\'appelle rien', () => {
    const { target, onMove, onResize, preview } = setup()

    firePointer(target, 'pointerdown', { clientX: 5, clientY: 5 })
    firePointer(window, 'pointerup', { clientX: 5, clientY: 5 })

    expect(onMove).not.toHaveBeenCalled()
    expect(onResize).not.toHaveBeenCalled()
    expect(preview()).toBeNull()
  })

  it('revenir au point de départ avant de relâcher n\'appelle rien', () => {
    const { target, onMove } = setup()

    firePointer(target, 'pointerdown', { clientX: 5, clientY: 5 })
    firePointer(window, 'pointermove', { clientX: 50, clientY: 50 })
    firePointer(window, 'pointermove', { clientX: 5, clientY: 5 })
    firePointer(window, 'pointerup', { clientX: 5, clientY: 5 })

    expect(onMove).not.toHaveBeenCalled()
  })

  it('pointercancel annule sans callback et efface preview', () => {
    const { target, onMove, preview } = setup()

    firePointer(target, 'pointerdown')
    firePointer(window, 'pointermove', { clientX: 40, clientY: 40 })
    expect(preview()).not.toBeNull()
    firePointer(window, 'pointercancel')

    expect(preview()).toBeNull()
    // Les écouteurs sont retirés : la suite du mouvement n'a plus d'effet.
    firePointer(window, 'pointermove', { clientX: 80, clientY: 80 })
    firePointer(window, 'pointerup', { clientX: 80, clientY: 80 })
    expect(preview()).toBeNull()
    expect(onMove).not.toHaveBeenCalled()
  })

  it('Échap annule sans callback et efface preview', () => {
    const { target, onMove, preview } = setup()

    firePointer(target, 'pointerdown')
    firePointer(window, 'pointermove', { clientX: 40, clientY: 40 })
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(preview()).toBeNull()
    firePointer(window, 'pointerup', { clientX: 40, clientY: 40 })
    expect(onMove).not.toHaveBeenCalled()
  })

  it('une autre touche ne change rien au geste', () => {
    const { target, onMove } = setup()

    firePointer(target, 'pointerdown')
    firePointer(window, 'pointermove', { clientX: 40, clientY: 0 })
    fireEvent.keyDown(window, { key: 'a' })
    firePointer(window, 'pointerup', { clientX: 40, clientY: 0 })

    expect(onMove).toHaveBeenCalledWith(element.id, 140, 100)
  })

  it('on peut recommencer un geste après une annulation', () => {
    const { target, onMove } = setup()

    firePointer(target, 'pointerdown')
    fireEvent.keyDown(window, { key: 'Escape' })
    firePointer(target, 'pointerdown')
    firePointer(window, 'pointermove', { clientX: 10, clientY: 0 })
    firePointer(window, 'pointerup', { clientX: 10, clientY: 0 })

    expect(onMove).toHaveBeenCalledTimes(1)
    expect(onMove).toHaveBeenCalledWith(element.id, 110, 100)
  })

  it('ignore un bouton non principal', () => {
    const { target, onMove, preview } = setup()

    firePointer(target, 'pointerdown', { button: 2 })
    firePointer(window, 'pointermove', { clientX: 40, clientY: 40 })
    firePointer(window, 'pointerup', { clientX: 40, clientY: 40 })

    expect(preview()).toBeNull()
    expect(onMove).not.toHaveBeenCalled()
  })

  it('ignore les événements d\'un autre pointerId', () => {
    const { target, onMove, preview } = setup()

    firePointer(target, 'pointerdown', { pointerId: 1 })
    firePointer(window, 'pointermove', { clientX: 40, clientY: 0, pointerId: 2 })
    expect(preview()).toBeNull()

    firePointer(window, 'pointermove', { clientX: 10, clientY: 0, pointerId: 1 })
    // Un pointerup ou pointercancel d'un autre pointeur ne termine pas le geste.
    firePointer(window, 'pointerup', { clientX: 99, clientY: 0, pointerId: 2 })
    firePointer(window, 'pointercancel', { pointerId: 2 })
    expect(preview()).not.toBeNull()
    expect(onMove).not.toHaveBeenCalled()

    firePointer(window, 'pointerup', { clientX: 10, clientY: 0, pointerId: 1 })
    expect(onMove).toHaveBeenCalledWith(element.id, 110, 100)
  })

  it('un deuxième pointerdown pendant un geste est ignoré', () => {
    const { target, onMove } = setup()

    firePointer(target, 'pointerdown', { clientX: 0, clientY: 0, pointerId: 1 })
    // Même pointeur, autre position : le point de départ ne doit pas être remplacé.
    firePointer(target, 'pointerdown', { clientX: 500, clientY: 500, pointerId: 1 })
    // Autre pointeur : ne doit pas non plus prendre la main.
    firePointer(target, 'pointerdown', { clientX: 0, clientY: 0, pointerId: 2 })
    firePointer(window, 'pointermove', { clientX: 20, clientY: 0, pointerId: 2 })
    firePointer(window, 'pointermove', { clientX: 20, clientY: 0, pointerId: 1 })
    firePointer(window, 'pointerup', { clientX: 20, clientY: 0, pointerId: 1 })

    expect(onMove).toHaveBeenCalledTimes(1)
    expect(onMove).toHaveBeenCalledWith(element.id, 120, 100)
  })

  it('mode poignée : appelle onResize avec les bounds complètes, pas onMove', () => {
    const { target, onMove, onResize } = setup({ mode: 'nw' })

    firePointer(target, 'pointerdown', { clientX: 0, clientY: 0 })
    firePointer(window, 'pointermove', { clientX: 30, clientY: 20 })
    firePointer(window, 'pointerup', { clientX: 30, clientY: 20 })

    expect(onMove).not.toHaveBeenCalled()
    expect(onResize).toHaveBeenCalledTimes(1)
    // Coin haut gauche déplacé de (30, 20) : le coin bas droit (300, 200) reste fixe.
    expect(onResize).toHaveBeenCalledWith(element.id, { x: 130, y: 120, width: 170, height: 80 })
  })

  it('mode poignée : la taille minimale garde le bord opposé en place', () => {
    const { target, onResize } = setup({ mode: 'e' })

    firePointer(target, 'pointerdown', { clientX: 0, clientY: 0 })
    firePointer(window, 'pointermove', { clientX: -5000, clientY: 0 })
    firePointer(window, 'pointerup', { clientX: -5000, clientY: 0 })

    expect(onResize).toHaveBeenCalledWith(element.id, { x: 100, y: 100, width: 20, height: 100 })
  })

  it('après le démontage en plein geste, plus aucun callback', () => {
    const { target, onMove, onResize, unmount } = setup()

    firePointer(target, 'pointerdown')
    firePointer(window, 'pointermove', { clientX: 40, clientY: 40 })
    unmount()
    firePointer(window, 'pointermove', { clientX: 80, clientY: 80 })
    firePointer(window, 'pointerup', { clientX: 80, clientY: 80 })
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onMove).not.toHaveBeenCalled()
    expect(onResize).not.toHaveBeenCalled()
  })

  it('retire ses écouteurs de window à la fin du geste', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const { target } = setup()
    const names = ['pointermove', 'pointerup', 'pointercancel', 'keydown']
    const count = (spy: typeof add) => spy.mock.calls.filter(([type]) => names.includes(type)).length
    const before = { add: count(add), remove: count(remove) }

    firePointer(target, 'pointerdown')
    expect(count(add) - before.add).toBe(4)
    firePointer(window, 'pointerup')

    expect(count(remove) - before.remove).toBe(4)
    add.mockRestore()
    remove.mockRestore()
  })

  it('utilise le dernier callback et la dernière échelle, sans réinstaller les écouteurs', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { target, rerender } = setup({ onMove: first, scale: 1 })

    firePointer(target, 'pointerdown', { clientX: 0, clientY: 0 })
    // Re-rendu en plein geste : nouveau callback et nouvelle échelle.
    rerender(<Harness onMove={second} onResize={vi.fn()} scale={0.5} />)
    firePointer(window, 'pointermove', { clientX: 10, clientY: 0 })
    firePointer(window, 'pointerup', { clientX: 10, clientY: 0 })

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith(element.id, 120, 100)
  })

  it('capture le pointeur sur l\'élément quand le navigateur le permet', () => {
    const capture = vi.fn()
    Object.defineProperty(Element.prototype, 'setPointerCapture', {
      value: capture,
      configurable: true,
    })
    try {
      const { target } = setup()
      firePointer(target, 'pointerdown', { pointerId: 7 })
      expect(capture).toHaveBeenCalledWith(7)
    } finally {
      Reflect.deleteProperty(Element.prototype, 'setPointerCapture')
    }
  })

  it('une échelle nulle ne produit aucune valeur absurde', () => {
    const { target, onMove } = setup({ scale: 0 })

    firePointer(target, 'pointerdown', { clientX: 0, clientY: 0 })
    firePointer(window, 'pointermove', { clientX: 40, clientY: 40 })
    firePointer(window, 'pointerup', { clientX: 40, clientY: 40 })

    expect(onMove).not.toHaveBeenCalled()
  })
})
