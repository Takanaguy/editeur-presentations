import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NoticeBanner, type Notice } from './NoticeBanner'

const error = (messages: string[], title = 'Import impossible'): Notice => ({
  kind: 'error',
  title,
  messages,
})
const success = (title: string): Notice => ({ kind: 'success', title, messages: [] })

describe('NoticeBanner', () => {
  it('garde deux zones live montées, vides et sans bouton, quand il n\'y a pas de message', () => {
    render(<NoticeBanner notice={null} onClose={vi.fn()} />)

    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(screen.getByRole('alert')).toBeEmptyDOMElement()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    // Rien de visible : pas de style de bandeau sur une zone vide.
    expect(screen.getByRole('status')).not.toHaveAttribute('class')
    expect(screen.getByRole('alert')).not.toHaveAttribute('class')
  })

  it('une erreur remplit la zone alert avec son titre et ses messages, la zone status reste vide', () => {
    render(<NoticeBanner notice={error(['Premier', 'Second'])} onClose={vi.fn()} />)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Import impossible')
    const items = within(alert).getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual(['Premier', 'Second'])
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('un succès remplit la zone status, la zone alert reste vide', () => {
    render(<NoticeBanner notice={success('Présentation exportée : a.json')} onClose={vi.fn()} />)

    expect(screen.getByRole('status')).toHaveTextContent('Présentation exportée : a.json')
    expect(screen.getByRole('alert')).toBeEmptyDOMElement()
    expect(within(screen.getByRole('status')).queryByRole('list')).not.toBeInTheDocument()
  })

  it('les deux zones restent les mêmes éléments du DOM quand le message change', () => {
    const { rerender } = render(<NoticeBanner notice={null} onClose={vi.fn()} />)
    const status = screen.getByRole('status')
    const alert = screen.getByRole('alert')

    rerender(<NoticeBanner notice={error(['Oups'])} onClose={vi.fn()} />)
    expect(screen.getByRole('alert')).toBe(alert)
    expect(alert).toHaveTextContent('Oups')

    rerender(<NoticeBanner notice={success('Bravo')} onClose={vi.fn()} />)
    expect(screen.getByRole('status')).toBe(status)
    expect(screen.getByRole('alert')).toBe(alert)
    expect(status).toHaveTextContent('Bravo')
    expect(alert).toBeEmptyDOMElement()

    rerender(<NoticeBanner notice={null} onClose={vi.fn()} />)
    expect(status).toBeEmptyDOMElement()
  })

  it('affiche 5 messages au plus puis le nombre de messages restants', () => {
    const messages = Array.from({ length: 8 }, (_, i) => `Erreur ${i + 1}`)
    render(<NoticeBanner notice={error(messages, 'T')} onClose={vi.fn()} />)

    const items = within(screen.getByRole('alert')).getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual([
      'Erreur 1',
      'Erreur 2',
      'Erreur 3',
      'Erreur 4',
      'Erreur 5',
      '… et 3 autres.',
    ])
  })

  it('affiche exactement 5 messages sans résumé', () => {
    const messages = Array.from({ length: 5 }, (_, i) => `Erreur ${i + 1}`)
    render(<NoticeBanner notice={error(messages, 'T')} onClose={vi.fn()} />)

    expect(within(screen.getByRole('alert')).getAllByRole('listitem')).toHaveLength(5)
    expect(screen.queryByText(/autres/)).not.toBeInTheDocument()
  })

  it('le bouton Fermer (erreur ou succès) appelle onClose', async () => {
    const onClose = vi.fn()
    const { rerender } = render(<NoticeBanner notice={error([], 'T')} onClose={onClose} />)

    await userEvent.click(screen.getByRole('button', { name: 'Fermer le message' }))
    rerender(<NoticeBanner notice={success('Ok')} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Fermer le message' }))

    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
