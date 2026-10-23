import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UndoRedoButtons } from './UndoRedoButtons'

function setup(canUndo: boolean, canRedo: boolean) {
  const onUndo = vi.fn()
  const onRedo = vi.fn()
  render(<UndoRedoButtons canUndo={canUndo} canRedo={canRedo} onUndo={onUndo} onRedo={onRedo} />)
  return { onUndo, onRedo }
}

describe('UndoRedoButtons', () => {
  it('expose un groupe Historique avec deux boutons nommés', () => {
    setup(true, true)

    const group = screen.getByRole('group', { name: 'Historique' })
    expect(group).toContainElement(screen.getByRole('button', { name: 'Annuler' }))
    expect(group).toContainElement(screen.getByRole('button', { name: 'Rétablir' }))
    expect(screen.getByRole('button', { name: 'Annuler' })).toHaveAttribute(
      'title',
      'Annuler (Ctrl+Z)',
    )
    expect(screen.getByRole('button', { name: 'Rétablir' })).toHaveAttribute(
      'title',
      'Rétablir (Ctrl+Y)',
    )
  })

  it('relaie les clics quand les boutons sont actifs', async () => {
    const { onUndo, onRedo } = setup(true, true)

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    await userEvent.click(screen.getByRole('button', { name: 'Rétablir' }))

    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(onRedo).toHaveBeenCalledTimes(1)
  })

  it('désactive vraiment les boutons selon canUndo et canRedo', async () => {
    const { onUndo, onRedo } = setup(false, false)

    expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Rétablir' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    await userEvent.click(screen.getByRole('button', { name: 'Rétablir' }))

    expect(onUndo).not.toHaveBeenCalled()
    expect(onRedo).not.toHaveBeenCalled()
  })

  it('ne désactive que le bouton concerné', () => {
    setup(true, false)

    expect(screen.getByRole('button', { name: 'Annuler' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Rétablir' })).toBeDisabled()
  })
})
