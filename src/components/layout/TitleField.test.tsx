import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MAX_TITLE_LENGTH } from '../../model/limits'
import { TitleField } from './TitleField'

describe('TitleField', () => {
  it('affiche la valeur dans un champ nommé', () => {
    render(<TitleField value="Mon titre" onChange={vi.fn()} onBlur={vi.fn()} />)

    expect(screen.getByRole('textbox', { name: 'Titre de la présentation' })).toHaveValue('Mon titre')
  })

  it('limite la longueur du titre', () => {
    render(<TitleField value="" onChange={vi.fn()} onBlur={vi.fn()} />)

    expect(screen.getByRole('textbox', { name: 'Titre de la présentation' })).toHaveAttribute(
      'maxlength',
      String(MAX_TITLE_LENGTH),
    )
  })

  it('appelle onChange avec le nouveau titre', () => {
    const onChange = vi.fn()
    render(<TitleField value="A" onChange={onChange} onBlur={vi.fn()} />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'AB' } })

    expect(onChange).toHaveBeenCalledWith('AB')
  })

  it('appelle onBlur quand le champ perd le focus', async () => {
    const onBlur = vi.fn()
    render(<TitleField value="A" onChange={vi.fn()} onBlur={onBlur} />)

    await userEvent.click(screen.getByRole('textbox'))
    await userEvent.tab()

    expect(onBlur).toHaveBeenCalledTimes(1)
  })
})
