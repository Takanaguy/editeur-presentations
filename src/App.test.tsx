import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
  it('affiche l\'éditeur avec la présentation de démonstration', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { name: 'Présentation de démonstration' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Diapositive \d+$/ })).toHaveLength(3)
    expect(screen.getByRole('main', { name: 'Zone d\'édition' })).toBeInTheDocument()
  })
})
