import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditorProvider } from '../../hooks/EditorProvider'
import { useEditor } from '../../hooks/useEditor'
import { createThreeSlidePresentation } from '../../test/fixtures'
import { EditorLayout } from './EditorLayout'

// Lit l'historique et la sélection via le contexte, pour vérifier que rien n'est modifié.
function HistorySpy() {
  const { history } = useEditor()
  const { presentation, selectedSlideId } = history.editor
  const slide = presentation.slides.find((s) => s.id === selectedSlideId)
  return (
    <>
      <output data-testid="past-count">{history.past.length}</output>
      <output data-testid="future-count">{history.future.length}</output>
      <output data-testid="element-count">{slide?.elements.length ?? 0}</output>
      <output data-testid="content">{JSON.stringify(presentation)}</output>
    </>
  )
}

function renderLayout() {
  return render(
    <EditorProvider presentation={createThreeSlidePresentation()}>
      <EditorLayout />
      <HistorySpy />
    </EditorProvider>,
  )
}

const presentButton = () => screen.getByRole('button', { name: 'Présenter' })
const dialog = () => screen.queryByRole('dialog', { name: 'Mode présentation' })
const inDialog = (text: string) => within(dialog() as HTMLElement).queryByText(text)
const count = (testId: string) => Number(screen.getByTestId(testId).textContent)
const content = () => screen.getByTestId('content').textContent
const press = (key: string, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(window, { key, ...init })

describe('EditorLayout : mode présentation', () => {
  it('le bouton Présenter ouvre le dialogue sur la première diapositive', async () => {
    renderLayout()
    expect(dialog()).not.toBeInTheDocument()

    await userEvent.click(presentButton())

    expect(dialog()).toBeInTheDocument()
    expect(inDialog('Alpha')).toBeInTheDocument()
    expect(inDialog('Bravo')).not.toBeInTheDocument()
  })

  it('démarre sur la diapositive sélectionnée', async () => {
    renderLayout()
    await userEvent.click(screen.getByRole('button', { name: 'Diapositive 2' }))

    await userEvent.click(presentButton())

    expect(inDialog('Bravo')).toBeInTheDocument()
    expect(await screen.findByText('Diapositive 2 sur 3')).toBeInTheDocument()
  })

  it('donne le focus au dialogue, puis Espace ne reclique pas sur Présenter', async () => {
    renderLayout()
    await userEvent.click(presentButton())

    expect(dialog()).toHaveFocus()
    await userEvent.keyboard(' ')

    expect(inDialog('Bravo')).toBeInTheDocument()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })

  it('les flèches et Espace changent de diapositive', async () => {
    renderLayout()
    await userEvent.click(presentButton())

    press('ArrowRight')
    expect(inDialog('Bravo')).toBeInTheDocument()
    press(' ')
    expect(inDialog('Charlie')).toBeInTheDocument()
    press('ArrowLeft')
    expect(inDialog('Bravo')).toBeInTheDocument()
    press('End')
    expect(inDialog('Charlie')).toBeInTheDocument()
    press('ArrowRight')
    expect(inDialog('Charlie')).toBeInTheDocument()
  })

  it('Échap ferme le dialogue et rend le focus au bouton Présenter', async () => {
    renderLayout()
    await userEvent.click(presentButton())

    press('Escape')

    expect(dialog()).not.toBeInTheDocument()
    expect(presentButton()).toHaveFocus()
  })

  it('rend l\'éditeur inert pendant la présentation, et plus après', async () => {
    const { container } = renderLayout()
    const editor = container.firstElementChild as HTMLElement
    expect(editor).not.toHaveAttribute('inert')

    await userEvent.click(presentButton())
    expect(editor).toHaveAttribute('inert')
    // Le dialogue est un frère de l'éditeur : il n'est pas rendu inert avec lui.
    expect(editor).not.toContainElement(dialog())

    press('Escape')
    expect(editor).not.toHaveAttribute('inert')
  })

  it('les raccourcis de l\'éditeur sont désactivés pendant la présentation', async () => {
    renderLayout()
    await userEvent.click(screen.getByRole('button', { name: 'Rectangle' }))
    expect(count('element-count')).toBe(2)
    expect(count('past-count')).toBe(1)
    await userEvent.click(presentButton())

    press('Delete')
    press('z', { ctrlKey: true })
    press('y', { ctrlKey: true })

    expect(count('element-count')).toBe(2)
    expect(count('past-count')).toBe(1)
    expect(count('future-count')).toBe(0)
  })

  it('les raccourcis fonctionnent de nouveau après la présentation', async () => {
    renderLayout()
    await userEvent.click(screen.getByRole('button', { name: 'Rectangle' }))
    await userEvent.click(presentButton())
    press('Escape')

    press('z', { ctrlKey: true })

    expect(count('element-count')).toBe(1)
    expect(count('past-count')).toBe(0)
  })

  it('Retour arrière recule dans la présentation sans supprimer l\'élément sélectionné', async () => {
    renderLayout()
    await userEvent.click(screen.getByRole('button', { name: 'Rectangle' }))
    await userEvent.click(presentButton())

    press('ArrowRight')
    press('Backspace')

    expect(inDialog('Alpha')).toBeInTheDocument()
    expect(count('element-count')).toBe(2)
    expect(count('past-count')).toBe(1)
  })

  it('une présentation complète ne change ni l\'historique, ni le contenu, ni la sélection', async () => {
    renderLayout()
    await userEvent.click(screen.getByRole('button', { name: 'Diapositive 2' }))
    const contentBefore = content()
    const pastBefore = count('past-count')

    await userEvent.click(presentButton())
    press('ArrowRight')
    press('Home')
    press('End')
    await userEvent.click(dialog() as HTMLElement)
    press('Escape')

    expect(count('past-count')).toBe(pastBefore)
    expect(count('future-count')).toBe(0)
    expect(content()).toBe(contentBefore)
    // La sélection de l'éditeur reste sur la diapositive de départ.
    expect(screen.getByRole('button', { name: 'Diapositive 2' })).toHaveAttribute(
      'aria-current',
      'true',
    )
  })

  it('peut être rouvert après une première présentation', async () => {
    renderLayout()
    await userEvent.click(presentButton())
    press('Escape')

    await userEvent.click(presentButton())

    expect(dialog()).toBeInTheDocument()
    expect(inDialog('Alpha')).toBeInTheDocument()
  })
})
