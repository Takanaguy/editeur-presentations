import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
  it('démarre sur une présentation vide avec une seule diapositive', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Sans titre' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Diapositive \d+$/ })).toHaveLength(1)
    expect(screen.getByRole('main', { name: 'Zone d\'édition' })).toBeInTheDocument()
    expect(screen.getByRole('toolbar', { name: 'Ajouter des éléments' })).toBeInTheDocument()
  })
})
