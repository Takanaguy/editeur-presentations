import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../model/types'
import { createImageElementFitted } from './imageElement'

describe('createImageElementFitted', () => {
  it('ajuste la taille et centre l\'image sur la diapositive', () => {
    const element = createImageElementFitted('data:image/png;base64,AAA', 'Logo', {
      width: 2000,
      height: 1000,
    })

    expect(element).toMatchObject({
      type: 'image',
      src: 'data:image/png;base64,AAA',
      alt: 'Logo',
      width: 640,
      height: 320,
      x: (SLIDE_WIDTH - 640) / 2,
      y: (SLIDE_HEIGHT - 320) / 2,
    })
  })

  it('reste dans les limites de la diapositive', () => {
    const element = createImageElementFitted('data:,a', '', { width: 5000, height: 5000 })

    expect(element.x).toBeGreaterThanOrEqual(0)
    expect(element.y).toBeGreaterThanOrEqual(0)
    expect(element.x + element.width).toBeLessThanOrEqual(SLIDE_WIDTH)
    expect(element.y + element.height).toBeLessThanOrEqual(SLIDE_HEIGHT)
  })

  it('utilise la taille de repli 480x270 centrée quand la taille est inconnue', () => {
    const element = createImageElementFitted('data:,a', 'x', null)

    expect(element).toMatchObject({ width: 480, height: 270, x: 400, y: 225 })
  })

  it('génère un id différent à chaque appel', () => {
    const a = createImageElementFitted('data:,a', '', null)
    const b = createImageElementFitted('data:,a', '', null)

    expect(a.id).not.toBe(b.id)
  })
})
