import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  createImageElement,
  createRectElement,
  createTextElement,
} from '../../model/factories'
import type { SlideElement } from '../../model/types'
import { PropertiesPanel, toHexColor } from './PropertiesPanel'

function setup(element: SlideElement | null) {
  const onUpdate = vi.fn()
  const onSeal = vi.fn()
  const view = render(<PropertiesPanel element={element} onUpdate={onUpdate} onSeal={onSeal} />)
  const rerender = (next: SlideElement | null) =>
    view.rerender(<PropertiesPanel element={next} onUpdate={onUpdate} onSeal={onSeal} />)
  return { onUpdate, onSeal, rerender }
}

describe('PropertiesPanel', () => {
  it('affiche le titre et "Aucun élément sélectionné" sans sélection', () => {
    setup(null)

    expect(screen.getByRole('heading', { name: 'Propriétés' })).toBeInTheDocument()
    expect(screen.getByText('Aucun élément sélectionné')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it.each([
    ['Texte', createTextElement()],
    ['Rectangle', createRectElement()],
    ['Image', createImageElement('data:image/png;base64,AAAA')],
  ])('affiche le type "%s" quand un élément est sélectionné', (label, element) => {
    setup(element)

    expect(screen.getByRole('heading', { name: label })).toBeInTheDocument()
    expect(screen.queryByText('Aucun élément sélectionné')).not.toBeInTheDocument()
  })

  it('rappelle la position et la taille arrondies, en lecture seule', () => {
    setup(createRectElement({ x: 10.4, y: 20.6, width: 300.2, height: 99.5 }))

    expect(screen.getByText('Position X, Y').nextElementSibling).toHaveTextContent('10, 21')
    expect(screen.getByText('Taille L x H').nextElementSibling).toHaveTextContent('300 x 100')
  })
})

describe('PropertiesPanel : texte', () => {
  it('affiche les contrôles du texte avec de vrais labels', () => {
    setup(createTextElement({ fontSize: 40, color: '#ff0000', fill: null }))

    expect(screen.getByLabelText('Taille de police')).toHaveValue(40)
    expect(screen.getByLabelText('Taille de police')).toHaveAttribute('min', '8')
    expect(screen.getByLabelText('Taille de police')).toHaveAttribute('max', '400')
    expect(screen.getByLabelText('Couleur du texte')).toHaveValue('#ff0000')
    expect(screen.getByLabelText('Fond')).not.toBeChecked()
    expect(screen.queryByLabelText('Couleur de fond')).not.toBeInTheDocument()
  })

  it('un entier valide appelle onUpdate avec fontSize', () => {
    const { onUpdate } = setup(createTextElement({ fontSize: 40 }))

    fireEvent.change(screen.getByLabelText('Taille de police'), { target: { value: '55' } })

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate).toHaveBeenCalledWith({ fontSize: 55 })
  })

  it('une valeur vide ou invalide n\'appelle pas onUpdate', async () => {
    const { onUpdate } = setup(createTextElement({ fontSize: 40 }))
    const input = screen.getByLabelText('Taille de police')

    await userEvent.clear(input)
    expect(onUpdate).not.toHaveBeenCalled()
    expect(input).toHaveValue(null)

    fireEvent.change(input, { target: { value: '12.5' } })
    fireEvent.change(input, { target: { value: '-3' } })
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('permet d\'effacer puis de retaper la taille', async () => {
    const { onUpdate } = setup(createTextElement({ fontSize: 40 }))
    const input = screen.getByLabelText('Taille de police')

    await userEvent.clear(input)
    await userEvent.type(input, '72')

    expect(onUpdate).toHaveBeenLastCalledWith({ fontSize: 72 })
  })

  it('se resynchronise avec la valeur réelle au blur et appelle onSeal', async () => {
    const { onUpdate, onSeal } = setup(createTextElement({ fontSize: 40 }))
    const input = screen.getByLabelText('Taille de police')

    await userEvent.clear(input)
    fireEvent.blur(input)

    expect(input).toHaveValue(40)
    expect(onSeal).toHaveBeenCalledTimes(1)
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('affiche la valeur bornée par le modèle après le blur', () => {
    const element = createTextElement({ fontSize: 40 })
    const { rerender } = setup(element)
    const input = screen.getByLabelText('Taille de police')

    fireEvent.change(input, { target: { value: '5' } })
    expect(input).toHaveValue(5)
    // Le reducer a borné à 8 : l'élément reçu en props vaut 8.
    rerender({ ...element, fontSize: 8 })
    fireEvent.blur(input)

    expect(input).toHaveValue(8)
  })

  it('la couleur du texte appelle onUpdate à chaque changement', () => {
    const { onUpdate } = setup(createTextElement())

    fireEvent.change(screen.getByLabelText('Couleur du texte'), { target: { value: '#123456' } })

    expect(onUpdate).toHaveBeenCalledWith({ color: '#123456' })
  })

  it('la case Fond met fill à null puis rend la dernière couleur connue', () => {
    const element = createTextElement({ fill: '#abcdef' })
    const { onUpdate, rerender } = setup(element)
    expect(screen.getByLabelText('Fond')).toBeChecked()
    expect(screen.getByLabelText('Couleur de fond')).toHaveValue('#abcdef')

    fireEvent.click(screen.getByLabelText('Fond'))
    expect(onUpdate).toHaveBeenLastCalledWith({ fill: null })

    rerender({ ...element, fill: null })
    expect(screen.getByLabelText('Fond')).not.toBeChecked()
    expect(screen.queryByLabelText('Couleur de fond')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Fond'))
    expect(onUpdate).toHaveBeenLastCalledWith({ fill: '#abcdef' })
  })

  it('la case Fond utilise le blanc quand aucune couleur n\'est connue', () => {
    const { onUpdate } = setup(createTextElement({ fill: null }))

    fireEvent.click(screen.getByLabelText('Fond'))

    expect(onUpdate).toHaveBeenCalledWith({ fill: '#ffffff' })
  })

  it('la couleur de fond appelle onUpdate avec fill', () => {
    const { onUpdate } = setup(createTextElement({ fill: '#abcdef' }))

    fireEvent.change(screen.getByLabelText('Couleur de fond'), { target: { value: '#000011' } })

    expect(onUpdate).toHaveBeenCalledWith({ fill: '#000011' })
  })

  it('appelle onSeal quand un champ perd le focus', () => {
    const { onSeal } = setup(createTextElement({ fill: '#abcdef' }))

    fireEvent.blur(screen.getByLabelText('Couleur du texte'))
    fireEvent.blur(screen.getByLabelText('Couleur de fond'))
    fireEvent.blur(screen.getByLabelText('Fond'))

    expect(onSeal).toHaveBeenCalledTimes(3)
  })
})

describe('PropertiesPanel : rectangle et image', () => {
  it('la couleur de remplissage du rectangle appelle onUpdate avec fill', () => {
    const { onUpdate, onSeal } = setup(createRectElement({ fill: '#2e5d7c' }))
    const input = screen.getByLabelText('Couleur de remplissage')
    expect(input).toHaveValue('#2e5d7c')

    fireEvent.change(input, { target: { value: '#ff00ff' } })
    fireEvent.blur(input)

    expect(onUpdate).toHaveBeenCalledWith({ fill: '#ff00ff' })
    expect(onSeal).toHaveBeenCalledTimes(1)
  })

  it('le texte alternatif de l\'image appelle onUpdate avec alt', () => {
    const { onUpdate, onSeal } = setup(createImageElement('data:,a', { alt: 'Logo' }))
    const input = screen.getByLabelText('Texte alternatif')
    expect(input).toHaveValue('Logo')

    fireEvent.change(input, { target: { value: 'Mon logo' } })
    fireEvent.blur(input)

    expect(onUpdate).toHaveBeenCalledWith({ alt: 'Mon logo' })
    expect(onSeal).toHaveBeenCalledTimes(1)
  })

  it('n\'affiche pas les champs d\'un autre type', () => {
    setup(createRectElement())

    expect(screen.queryByLabelText('Taille de police')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Texte alternatif')).not.toBeInTheDocument()
  })
})

describe('toHexColor', () => {
  it.each(['#000000', '#ffffff', '#2e5d7c'])('garde la valeur valide %s', (value) => {
    expect(toHexColor(value)).toBe(value)
  })

  it('abaisse la casse', () => {
    expect(toHexColor('#ABCDEF')).toBe('#abcdef')
  })

  it.each([
    ['#fff', '#ffffff'],
    ['#ABC', '#aabbcc'],
    ['#1a2', '#11aa22'],
  ])('développe la forme courte %s en %s', (value, expected) => {
    expect(toHexColor(value)).toBe(expected)
  })

  it.each(['', 'red', '#ff', '#12345', '#1234567', '123456', 'abc', '#gggggg', '#ggg', 'rgb(0,0,0)'])(
    'remplace la valeur invalide "%s" par du noir',
    (value) => {
      expect(toHexColor(value)).toBe('#000000')
    },
  )
})
