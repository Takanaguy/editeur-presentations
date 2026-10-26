import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FileActions } from './FileActions'

function setup(disabled = false) {
  const onExportJson = vi.fn()
  const onExportPdf = vi.fn()
  const onExportPptx = vi.fn()
  const onImportFile = vi.fn()
  render(
    <FileActions
      onExportJson={onExportJson}
      onExportPdf={onExportPdf}
      onExportPptx={onExportPptx}
      onImportFile={onImportFile}
      disabled={disabled}
    />,
  )
  const input = screen.getByLabelText('Importer une présentation JSON') as HTMLInputElement
  return { onExportJson, onExportPdf, onExportPptx, onImportFile, input }
}

describe('FileActions', () => {
  it('affiche les boutons Exporter et Importer avec leurs infobulles', () => {
    setup()

    expect(screen.getByRole('button', { name: 'Exporter' })).toHaveAttribute(
      'title',
      'Exporter la présentation',
    )
    expect(screen.getByRole('button', { name: 'Importer' })).toHaveAttribute(
      'title',
      'Importer une présentation JSON',
    )
  })

  it('Exporter ouvre un menu sans rien exporter', async () => {
    const { onExportJson, onExportPdf } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'Exporter' }))

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(onExportJson).not.toHaveBeenCalled()
    expect(onExportPdf).not.toHaveBeenCalled()
  })

  it('le menu propose le JSON, le PDF et PowerPoint, chacun relié à son rappel', async () => {
    const { onExportJson, onExportPdf, onExportPptx } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'Exporter' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /^Fichier JSON/ }))
    expect(onExportJson).toHaveBeenCalledTimes(1)
    expect(onExportPdf).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Exporter' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /^PDF/ }))
    expect(onExportPdf).toHaveBeenCalledTimes(1)
    expect(onExportJson).toHaveBeenCalledTimes(1)
    expect(onExportPptx).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Exporter' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /^PowerPoint/ }))
    expect(onExportPptx).toHaveBeenCalledTimes(1)
    expect(onExportJson).toHaveBeenCalledTimes(1)
    expect(onExportPdf).toHaveBeenCalledTimes(1)
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
    const { onExportJson, onExportPdf, onExportPptx } = setup(true)

    expect(screen.getByRole('button', { name: 'Exporter' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Importer' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Exporter' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(onExportJson).not.toHaveBeenCalled()
    expect(onExportPdf).not.toHaveBeenCalled()
    expect(onExportPptx).not.toHaveBeenCalled()
  })

  it("le libellé PowerPoint annonce que le fichier s'ouvre aussi dans LibreOffice", async () => {
    setup()

    await userEvent.click(screen.getByRole('button', { name: 'Exporter' }))

    expect(screen.getByRole('menuitem', { name: /^PowerPoint/ })).toHaveTextContent(
      "PowerPoint (.pptx, s'ouvre aussi dans LibreOffice)",
    )
  })
})
