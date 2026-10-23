import { navigationTarget } from './navigation'

const go = (index: number) => ({ type: 'go', index })

describe('navigationTarget', () => {
  // Au milieu d'une présentation de 5 diapositives (index 2).
  it.each([
    ['ArrowRight', false, go(3)],
    ['ArrowDown', false, go(3)],
    ['PageDown', false, go(3)],
    ['Enter', false, go(3)],
    [' ', false, go(3)],
    [' ', true, go(1)],
    ['ArrowLeft', false, go(1)],
    ['ArrowUp', false, go(1)],
    ['PageUp', false, go(1)],
    ['Backspace', false, go(1)],
    ['Home', false, go(0)],
    ['End', false, go(4)],
    ['Escape', false, { type: 'exit' }],
    // Maj ne change que l'Espace.
    ['ArrowRight', true, go(3)],
    ['ArrowLeft', true, go(1)],
    ['Enter', true, go(3)],
    ['Escape', true, { type: 'exit' }],
  ])('touche %j (Maj : %s) au milieu', (key, shiftKey, expected) => {
    expect(navigationTarget(key, shiftKey, 2, 5)).toEqual(expected)
  })

  it.each(['a', 'Tab', 'F1', 'Shift', 'Control', 'Delete', 'Spacebar', '', 'arrowright', 'Space'])(
    'touche inconnue %j : null',
    (key) => {
      expect(navigationTarget(key, false, 2, 5)).toBeNull()
    },
  )

  describe('bornes, sans rebouclage', () => {
    it.each(['ArrowRight', 'ArrowDown', 'PageDown', 'Enter', ' '])(
      'suivante (%j) sur la dernière reste sur la dernière',
      (key) => {
        expect(navigationTarget(key, false, 4, 5)).toEqual(go(4))
      },
    )

    it.each(['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'])(
      'précédente (%j) sur la première reste sur la première',
      (key) => {
        expect(navigationTarget(key, false, 0, 5)).toEqual(go(0))
      },
    )

    it('Maj+Espace sur la première reste sur la première', () => {
      expect(navigationTarget(' ', true, 0, 5)).toEqual(go(0))
    })

    it('Home sur la première et End sur la dernière ne bougent pas', () => {
      expect(navigationTarget('Home', false, 0, 5)).toEqual(go(0))
      expect(navigationTarget('End', false, 4, 5)).toEqual(go(4))
    })

    it('la dernière diapositive ne reboucle pas sur la première', () => {
      expect(navigationTarget('ArrowRight', false, 4, 5)).not.toEqual(go(0))
    })
  })

  describe('une seule diapositive', () => {
    it.each([
      ['ArrowRight', false],
      [' ', false],
      [' ', true],
      ['ArrowLeft', false],
      ['Home', false],
      ['End', false],
      ['Backspace', false],
    ])('touche %j (Maj : %s) reste sur la 0', (key, shiftKey) => {
      expect(navigationTarget(key, shiftKey, 0, 1)).toEqual(go(0))
    })

    it('Échap quitte quand même', () => {
      expect(navigationTarget('Escape', false, 0, 1)).toEqual({ type: 'exit' })
    })
  })

  it('ramène un index hors bornes dans la plage', () => {
    expect(navigationTarget('ArrowRight', false, 9, 3)).toEqual(go(2))
    expect(navigationTarget('ArrowLeft', false, -4, 3)).toEqual(go(0))
  })

  it('ne renvoie jamais un index négatif avec zéro diapositive', () => {
    expect(navigationTarget('End', false, 0, 0)).toEqual(go(0))
  })
})
