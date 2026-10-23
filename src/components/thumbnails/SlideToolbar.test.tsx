import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SlideToolbar } from './SlideToolbar'

function renderToolbar(overrides: Partial<Parameters<typeof SlideToolbar>[0]> = {}) {
  const handlers = {
    onAdd: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    onMoveUp: vi.fn(),
    onMoveDown: vi.fn(),
  }
  render(
    <SlideToolbar
      canAddSlide={true}
      canDelete={true}
      canMoveUp={true}
      canMoveDown={true}
      {...handlers}
      {...overrides}
    />,
  )
  return handlers
}

const ICON_LABELS = [
  'Dupliquer la diapositive',
  'Supprimer la diapositive',
  'Monter la diapositive',
  'Descendre la diapositive',
]

describe('SlideToolbar', () => {
  it('est une barre d\'outils nommée avec ses cinq boutons', () => {
    renderToolbar()

    expect(
      screen.getByRole('toolbar', { name: 'Actions sur les diapositives' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nouvelle diapositive' })).toBeInTheDocument()
    for (const label of ICON_LABELS) {
      const button = screen.getByRole('button', { name: label })
      expect(button).toHaveAttribute('title', label)
    }
    expect(screen.getAllByRole('button')).toHaveLength(5)
  })

  it('appelle le bon callback à chaque clic', async () => {
    const h = renderToolbar()

    await userEvent.click(screen.getByRole('button', { name: 'Nouvelle diapositive' }))
    await userEvent.click(screen.getByRole('button', { name: 'Dupliquer la diapositive' }))
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer la diapositive' }))
    await userEvent.click(screen.getByRole('button', { name: 'Monter la diapositive' }))
    await userEvent.click(screen.getByRole('button', { name: 'Descendre la diapositive' }))

    expect(h.onAdd).toHaveBeenCalledTimes(1)
    expect(h.onDuplicate).toHaveBeenCalledTimes(1)
    expect(h.onDelete).toHaveBeenCalledTimes(1)
    expect(h.onMoveUp).toHaveBeenCalledTimes(1)
    expect(h.onMoveDown).toHaveBeenCalledTimes(1)
  })

  it('désactive supprimer, monter et descendre selon les props, sans appeler les callbacks', async () => {
    const h = renderToolbar({ canDelete: false, canMoveUp: false, canMoveDown: false })

    const disabled = ['Supprimer la diapositive', 'Monter la diapositive', 'Descendre la diapositive']
    for (const label of disabled) {
      expect(screen.getByRole('button', { name: label })).toBeDisabled()
      await userEvent.click(screen.getByRole('button', { name: label }))
    }

    expect(h.onDelete).not.toHaveBeenCalled()
    expect(h.onMoveUp).not.toHaveBeenCalled()
    expect(h.onMoveDown).not.toHaveBeenCalled()
  })

  it('laisse ajouter et dupliquer actifs même quand le reste est désactivé', () => {
    renderToolbar({ canDelete: false, canMoveUp: false, canMoveDown: false })

    expect(screen.getByRole('button', { name: 'Nouvelle diapositive' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Dupliquer la diapositive' })).toBeEnabled()
  })

  it('à la limite de diapositives, désactive ajouter et dupliquer avec une infobulle explicite', async () => {
    const h = renderToolbar({ canAddSlide: false })

    for (const name of ['Nouvelle diapositive', 'Dupliquer la diapositive']) {
      const button = screen.getByRole('button', { name })
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('title', 'Limite de 200 diapositives atteinte.')
      await userEvent.click(button)
    }
    expect(h.onAdd).not.toHaveBeenCalled()
    expect(h.onDuplicate).not.toHaveBeenCalled()
    // Supprimer et déplacer ne sont pas concernés.
    expect(screen.getByRole('button', { name: 'Supprimer la diapositive' })).toBeEnabled()
  })

  it('sous la limite, le bouton de duplication garde son infobulle habituelle', () => {
    renderToolbar()

    expect(screen.getByRole('button', { name: 'Dupliquer la diapositive' })).toHaveAttribute(
      'title',
      'Dupliquer la diapositive',
    )
  })
})
