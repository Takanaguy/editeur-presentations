import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditorProvider } from '../../hooks/EditorProvider'
import { useEditor } from '../../hooks/useEditor'
import { createDemoPresentation } from '../../model/demo'
import { EditorLayout } from './EditorLayout'

function renderLayout() {
  return render(
    <EditorProvider presentation={createDemoPresentation()}>
      <EditorLayout />
    </EditorProvider>,
  )
}

describe('EditorLayout', () => {
  it('affiche l\'en-tête et les trois zones', () => {
    renderLayout()

    expect(
      screen.getByRole('heading', { level: 1, name: 'Présentation de démonstration' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Vignettes des diapositives' })).toBeInTheDocument()
    expect(screen.getByRole('main', { name: 'Zone d\'édition' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Propriétés' })).toBeInTheDocument()
  })

  it('sélectionne la première diapositive au départ', () => {
    renderLayout()

    expect(screen.getByRole('button', { name: 'Diapositive 1' })).toHaveAttribute(
      'aria-current',
      'true',
    )
    const main = screen.getByRole('main', { name: 'Zone d\'édition' })
    expect(within(main).getByText('Diapositive 1 : titre')).toBeInTheDocument()
    expect(within(main).queryByText('Diapositive 2 : titre')).not.toBeInTheDocument()
  })

  it('affiche la diapositive cliquée dans la zone centrale', async () => {
    renderLayout()

    await userEvent.click(screen.getByRole('button', { name: 'Diapositive 2' }))

    const main = screen.getByRole('main', { name: 'Zone d\'édition' })
    expect(within(main).getByText('Diapositive 2 : titre')).toBeInTheDocument()
    expect(within(main).queryByText('Diapositive 1 : titre')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Diapositive 2' })).toHaveAttribute(
      'aria-current',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Diapositive 1' })).not.toHaveAttribute('aria-current')
  })

  it('indique qu\'aucun élément n\'est sélectionné', () => {
    renderLayout()

    const panel = screen.getByRole('complementary', { name: 'Propriétés' })
    expect(within(panel).getByText('Aucun élément sélectionné')).toBeInTheDocument()
  })
})

describe('useEditor', () => {
  function Probe() {
    useEditor()
    return null
  }

  it('lève une erreur claire hors EditorProvider', () => {
    // React logue l'erreur attendue : on coupe le bruit pour ce test.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow('EditorProvider')
    spy.mockRestore()
  })
})
