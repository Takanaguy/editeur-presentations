import { fireEvent, render, screen } from '@testing-library/react'
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

  it('garde le texte à l\'écart des bords de sa boîte', () => {
    render(<ElementView element={createTextElement({ text: 'Marge', width: 300 })} />)

    expect(screen.getByText('Marge')).toHaveStyle({
      padding: '8px',
      boxSizing: 'border-box',
      lineHeight: '1.25',
    })
  })

  it('appelle onDoubleClick sur un texte', () => {
    const onDoubleClick = vi.fn()
    render(<ElementView element={createTextElement({ text: 'Double' })} onDoubleClick={onDoubleClick} />)

    fireEvent.doubleClick(screen.getByText('Double'))

    expect(onDoubleClick).toHaveBeenCalledTimes(1)
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

  it('applique l\'opacité aux trois types d\'éléments', () => {
    const { container: text } = render(<ElementView element={createTextElement({ opacity: 0.3 })} />)
    const { container: rect } = render(<ElementView element={createRectElement({ opacity: 0.5 })} />)
    const { container: image } = render(
      <ElementView element={createImageElement('data:,a', { opacity: 0.7 })} />,
    )

    expect(text.firstElementChild).toHaveStyle({ opacity: '0.3' })
    expect(rect.firstElementChild).toHaveStyle({ opacity: '0.5' })
    expect(image.firstElementChild).toHaveStyle({ opacity: '0.7' })
  })

  it('un élément opaque a une opacité de 1', () => {
    const { container } = render(<ElementView element={createRectElement()} />)

    expect(container.firstElementChild).toHaveStyle({ opacity: '1' })
  })

  it('un texte par défaut est en graisse normale, sans italique, aligné à gauche', () => {
    render(<ElementView element={createTextElement({ text: 'Simple' })} />)

    // Lecture directe du style en ligne : jsdom calcule mal la valeur « normal ».
    const { style } = screen.getByText('Simple')
    expect([style.fontWeight, style.fontStyle, style.textAlign]).toEqual(['normal', 'normal', 'left'])
  })

  it('applique gras, italique et alignement à un texte', () => {
    render(
      <ElementView
        element={createTextElement({ text: 'Style', bold: true, italic: true, align: 'center' })}
      />,
    )

    expect(screen.getByText('Style')).toHaveStyle({
      fontWeight: '700',
      fontStyle: 'italic',
      textAlign: 'center',
    })
  })

  it('applique l\'alignement à droite', () => {
    render(<ElementView element={createTextElement({ text: 'Droite', align: 'right' })} />)

    expect(screen.getByText('Droite')).toHaveStyle({ textAlign: 'right' })
  })

  it('rend une image avec src, alt, object-fit contain et sans glisser', () => {
    const element = createImageElement('data:image/png;base64,AAAA', { alt: 'Un logo' })
    render(<ElementView element={element} />)

    const img = screen.getByRole('img', { name: 'Un logo' })
    expect(img).toHaveAttribute('src', 'data:image/png;base64,AAAA')
    expect(img).toHaveAttribute('draggable', 'false')
    expect(img).toHaveStyle({ objectFit: 'contain' })
  })

  it("n'envoie pas l'adresse de la page au serveur de l'image (referrerPolicy)", () => {
    const element = createImageElement('https://exemple.fr/a.png', { alt: 'Un logo' })
    render(<ElementView element={element} />)

    expect(screen.getByRole('img', { name: 'Un logo' })).toHaveAttribute('referrerpolicy', 'no-referrer')
  })
})
