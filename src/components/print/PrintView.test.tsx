import { render, screen, within } from '@testing-library/react'
import { createImageElement, createRectElement, createSlide, createTextElement } from '../../model/factories'
import { SLIDE_HEIGHT, SLIDE_WIDTH, type Slide } from '../../model/types'
import { createThreeSlidePresentation } from '../../test/fixtures'
import { PrintView } from './PrintView'

const view = () => screen.getByTestId('print-view')
const pages = () => screen.getAllByTestId('print-page')

describe('PrintView', () => {
  it('rend une page par diapositive, dans l\'ordre', () => {
    const { slides } = createThreeSlidePresentation()

    render(<PrintView slides={slides} />)

    expect(pages()).toHaveLength(3)
    expect(pages().map((page) => page.textContent)).toEqual(['Alpha', 'Bravo', 'Charlie'])
  })

  it('donne à chaque page la taille logique 1280 x 720 en rognant le débordement', () => {
    render(<PrintView slides={createThreeSlidePresentation().slides} />)

    for (const page of pages()) {
      expect(page.style.width).toBe(`${SLIDE_WIDTH}px`)
      expect(page.style.height).toBe(`${SLIDE_HEIGHT}px`)
      expect(page.style.overflow).toBe('hidden')
    }
    expect(SLIDE_WIDTH).toBe(1280)
    expect(SLIDE_HEIGHT).toBe(720)
  })

  it('met un saut de page après chaque page SAUF la dernière', () => {
    render(<PrintView slides={createThreeSlidePresentation().slides} />)
    const all = pages()

    for (const page of all.slice(0, -1)) {
      expect(page.style.breakAfter).toBe('page')
      expect(page.style.pageBreakAfter).toBe('always')
    }
    const last = all[all.length - 1]!
    expect(last.style.breakAfter).toBe('')
    expect(last.style.pageBreakAfter).toBe('')
  })

  it('une seule diapositive : aucun saut de page', () => {
    render(<PrintView slides={[createSlide()]} />)

    expect(pages()[0]!.style.breakAfter).toBe('')
  })

  it('rend le contenu des éléments (texte, rectangle, image) à l\'échelle 1', () => {
    const slide: Slide = {
      ...createSlide(),
      elements: [
        createTextElement({ text: 'Bonjour', x: 10, y: 20, width: 300, height: 100 }),
        createRectElement({ fill: '#ff0000' }),
        createImageElement('data:image/png;base64,AAAA', { alt: 'Logo' }),
      ],
    }

    render(<PrintView slides={[slide]} />)

    const page = pages()[0]!
    expect(within(page).getByText('Bonjour')).toBeInTheDocument()
    expect(page.querySelector('img')).toHaveAttribute('src', 'data:image/png;base64,AAAA')
    // Aucune mise à l'échelle : la couche des éléments garde sa taille logique.
    expect(page.innerHTML).toContain('scale(1)')
  })

  it("rend la police choisie d'un texte (l'impression utilise le style)", () => {
    const slide: Slide = {
      ...createSlide(),
      elements: [createTextElement({ text: 'Titre', fontFamily: 'Impact' })],
    }

    render(<PrintView slides={[slide]} />)

    expect(within(pages()[0]!).getByText('Titre').style.fontFamily).toBe('Impact, "Arial Black", sans-serif')
  })

  it('est masqué aux lecteurs d\'écran et visible seulement à l\'impression', () => {
    render(<PrintView slides={[createSlide()]} />)

    expect(view()).toHaveAttribute('aria-hidden', 'true')
    expect(view()).toHaveClass('hidden', 'print:block')
  })

  it('se rend dans document.body via un portail, pas dans le conteneur du rendu', () => {
    const { container } = render(<PrintView slides={[createSlide()]} />)

    expect(container).toBeEmptyDOMElement()
    expect(view().parentElement).toBe(document.body)
  })

  it('n\'installe aucun gestionnaire d\'interaction (pas de poignées, pas de sélection)', () => {
    const slide: Slide = { ...createSlide(), elements: [createTextElement({ text: 'T' })] }

    render(<PrintView slides={[slide]} />)

    expect(screen.queryByTestId('selection-frame')).not.toBeInTheDocument()
    expect(view().querySelector('[data-handle]')).toBeNull()
    expect(view().querySelector('[contenteditable], textarea, input')).toBeNull()
    expect(view().querySelector('[style*="cursor"]')).toBeNull()
  })

  it('transmet sa référence de conteneur', () => {
    let node: HTMLDivElement | null = null
    render(<PrintView slides={[createSlide()]} containerRef={(el) => {
          node = el
        }} />)

    expect(node).toBe(view())
  })
})
