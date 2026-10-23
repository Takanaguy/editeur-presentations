import { ImageImportError, MAX_IMAGE_FILE_SIZE, readImageFile } from './readImageFile'

describe('readImageFile', () => {
  it('lit une image valide en data URL', async () => {
    const file = new File(['abc'], 'a.png', { type: 'image/png' })

    const result = await readImageFile(file)

    expect(result.startsWith('data:image/')).toBe(true)
  })

  it('accepte un fichier d\'exactement 2 Mo', async () => {
    const file = new File([new Uint8Array(MAX_IMAGE_FILE_SIZE)], 'limite.png', {
      type: 'image/png',
    })

    await expect(readImageFile(file)).resolves.toMatch(/^data:image\//)
  })

  it('refuse un fichier trop gros avec le bon message', async () => {
    const file = new File([new Uint8Array(MAX_IMAGE_FILE_SIZE + 1)], 'gros.png', {
      type: 'image/png',
    })

    const promise = readImageFile(file)

    await expect(promise).rejects.toBeInstanceOf(ImageImportError)
    await expect(promise).rejects.toThrow('L\'image dépasse 2 Mo.')
  })

  it('refuse un fichier qui n\'est pas une image avec le bon message', async () => {
    const file = new File(['texte'], 'a.txt', { type: 'text/plain' })

    const promise = readImageFile(file)

    await expect(promise).rejects.toBeInstanceOf(ImageImportError)
    await expect(promise).rejects.toThrow('Le fichier n\'est pas une image.')
  })
})
