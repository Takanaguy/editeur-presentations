import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FileActions } from './FileActions'

function setup(disabled = false) {
  const onExport = vi.fn()
  const onImportFile = vi.fn()
  render(<FileActions onExport={onExport} onImportFile={onImportFile} disabled={disabled} />)
  const input = screen.getByLabelText('Importer une présentation JSON') as HTMLInputElement
  return { onExport, onImportFile, input }
}

describe('FileActions', () => {
  it('affiche les boutons Exporter et Importer avec leurs infobulles', () => {
    setup()

    expect(screen.getByRole('button', { name: 'Exporter' })).toHaveAttribute(
      'title',
      'Exporter la présentation en JSON',
    )
    expect(screen.getByRole('button', { name: 'Importer' })).toHaveAttribute(
      'title',
      'Importer une présentation JSON',
    )
  })

  it('Exporter appelle onExport', async () => {
    const { onExport } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'Exporter' }))

    expect(onExport).toHaveBeenCalledTimes(1)
  })

  it('le champ fichier est caché et n\'accepte que du JSON', () => {
    const { input } = setup()

    expect(input).toHaveAttribute('type', 'file')
    expect(input).toHaveAttribute('accept', '.json,application/json')
    expect(input).not.toBeVisible()
  })

  it('Importer ouvre le sélecteur de fichier', async () => {
    const { input } = setup()
    const click = vi.spyOn(input, 'click')

    await userEvent.click(screen.getByRole('button', { name: 'Importer' }))

    expect(click).toHaveBeenCalled()
  })

  it('transmet le fichier choisi à onImportFile et vide le champ', () => {
    const { input, onImportFile } = setup()
    const file = new File(['{}'], 'a.json', { type: 'application/json' })

    fireEvent.change(input, { target: { files: [file] } })

    expect(onImportFile).toHaveBeenCalledTimes(1)
    expect(onImportFile).toHaveBeenCalledWith(file)
    expect(input.value).toBe('')
  })

  it('ne fait rien quand aucun fichier n\'est choisi', () => {
    const { input, onImportFile } = setup()

    fireEvent.change(input, { target: { files: [] } })

    expect(onImportFile).not.toHaveBeenCalled()
  })

  it('désactive les deux boutons quand disabled est vrai', async () => {
    const { onExport } = setup(true)

    expect(screen.getByRole('button', { name: 'Exporter' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Importer' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Exporter' }))
    expect(onExport).not.toHaveBeenCalled()
  })
})
