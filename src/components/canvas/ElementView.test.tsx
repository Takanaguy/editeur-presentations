import { render, screen } from '@testing-library/react'
import {
  createImageElement,
  createRectElement,
  createTextElement,
} from '../../model/factories'
import { ElementView } from './ElementView'

describe('ElementView', () => {
  it('rend un texte avec sa position, sa taille, sa couleur et son fond', () => {
    const element = createTextElement({
      text: 'Bonjour',
      x: 10,
      y: 20,
      width: 300,
      height: 80,
      fontSize: 40,
      color: '#ff0000',
      fill: '#00ff00',
    })
    render(<ElementView element={element} />)

    const node = screen.getByText('Bonjour')
    expect(node).toHaveStyle({
      position: 'absolute',
      left: '10px',
      top: '20px',
      width: '300px',
      height: '80px',
      fontSize: '40px',
      color: '#ff0000',
      backgroundColor: '#00ff00',
      whiteSpace: 'pre-wrap',
      overflow: 'hidden',
    })
  })

  it('ne met pas de fond à un texte sans fill', () => {
    render(<ElementView element={createTextElement({ text: 'Sans fond', fill: null })} />)
    expect(screen.getByText('Sans fond').style.backgroundColor).toBe('')
  })

  it('rend un rectangle avec son fond', () => {
    const element = createRectElement({ x: 5, y: 6, width: 100, height: 50, fill: '#123456' })
    const { container } = render(<ElementView element={element} />)

    const node = container.firstElementChild
    expect(node).toHaveStyle({
      left: '5px',
      top: '6px',
      width: '100px',
      height: '50px',
      backgroundColor: '#123456',
    })
  })

  it('rend une image avec src, alt, object-fit contain et sans glisser', () => {
    const element = createImageElement('data:image/png;base64,AAAA', { alt: 'Un logo' })
    render(<ElementView element={element} />)

    const img = screen.getByRole('img', { name: 'Un logo' })
    expect(img).toHaveAttribute('src', 'data:image/png;base64,AAAA')
    expect(img).toHaveAttribute('draggable', 'false')
    expect(img).toHaveStyle({ objectFit: 'contain' })
  })
})
