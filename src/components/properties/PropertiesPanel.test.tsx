import { render, screen } from '@testing-library/react'
import {
  createImageElement,
  createRectElement,
  createTextElement,
} from '../../model/factories'
import { PropertiesPanel } from './PropertiesPanel'

describe('PropertiesPanel', () => {
  it('affiche le titre et "Aucun élément sélectionné" sans sélection', () => {
    render(<PropertiesPanel element={null} />)

    expect(screen.getByRole('heading', { name: 'Propriétés' })).toBeInTheDocument()
    expect(screen.getByText('Aucun élément sélectionné')).toBeInTheDocument()
  })

  it.each([
    ['Texte', createTextElement()],
    ['Rectangle', createRectElement()],
    ['Image', createImageElement('data:image/png;base64,AAAA')],
  ])('affiche le type "%s" quand un élément est sélectionné', (label, element) => {
    render(<PropertiesPanel element={element} />)

    expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.queryByText('Aucun élément sélectionné')).not.toBeInTheDocument()
  })
})
