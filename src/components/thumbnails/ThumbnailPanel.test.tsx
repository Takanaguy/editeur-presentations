import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createTextElement } from '../../model/factories'
import type { Slide } from '../../model/types'
import { ThumbnailPanel } from './ThumbnailPanel'

const slides: Slide[] = [
  { id: 'a', elements: [createTextElement({ text: 'Texte A' })] },
  { id: 'b', elements: [createTextElement({ text: 'Texte B' })] },
  { id: 'c', elements: [] },
]

describe('ThumbnailPanel', () => {
  it('affiche une vignette par diapositive, numérotée', () => {
    render(<ThumbnailPanel slides={slides} selectedSlideId="a" onSelect={() => {}} />)

    const nav = screen.getByRole('navigation', { name: 'Vignettes des diapositives' })
    expect(within(nav).getAllByRole('button')).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Diapositive 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Diapositive 2' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Diapositive 3' })).toBeInTheDocument()
  })

  it('marque seulement la diapositive sélectionnée avec aria-current', () => {
    render(<ThumbnailPanel slides={slides} selectedSlideId="b" onSelect={() => {}} />)

    expect(screen.getByRole('button', { name: 'Diapositive 2' })).toHaveAttribute(
      'aria-current',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Diapositive 1' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('button', { name: 'Diapositive 3' })).not.toHaveAttribute('aria-current')
  })

  it('appelle onSelect avec l\'id de la vignette cliquée', async () => {
    const onSelect = vi.fn()
    render(<ThumbnailPanel slides={slides} selectedSlideId="a" onSelect={onSelect} />)

    await userEvent.click(screen.getByRole('button', { name: 'Diapositive 3' }))

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('c')
  })

  it('affiche le contenu de chaque diapositive dans sa vignette', () => {
    render(<ThumbnailPanel slides={slides} selectedSlideId="a" onSelect={() => {}} />)

    expect(screen.getByText('Texte A')).toBeInTheDocument()
    expect(screen.getByText('Texte B')).toBeInTheDocument()
  })
})
