import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  createImageElement,
  createRectElement,
  createTextElement,
} from '../../model/factories'
import { BUILT_IN_FONTS } from '../../model/fonts'
import { MAX_ALT_LENGTH } from '../../model/limits'
import type { SlideElement } from '../../model/types'
import { PropertiesPanel, toHexColor } from './PropertiesPanel'

const MIDDLE = { front: true, back: true }

function setup(element: SlideElement | null, canReorder = MIDDLE) {
  const onUpdate = vi.fn()
  const onSeal = vi.fn()
  const onReorder = vi.fn()
  const view = render(
    <PropertiesPanel
      element={element}
      onUpdate={onUpdate}
      onSeal={onSeal}
      onReorder={onReorder}
      canReorder={canReorder}
    />,
  )
  const rerender = (next: SlideElement | null) =>
    view.rerender(
      <PropertiesPanel
        element={next}
        onUpdate={onUpdate}
        onSeal={onSeal}
        onReorder={onReorder}
        canReorder={canReorder}
      />,
    )
  return { onUpdate, onSeal, onReorder, rerender }
}

describe('PropertiesPanel', () => {
  it('affiche le titre et "Aucun élément sélectionné" sans sélection', () => {
    setup(null)

    expect(screen.getByRole('heading', { name: 'Propriétés' })).toBeInTheDocument()
    expect(screen.getByText('Aucun élément sélectionné')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it.each([
    ['Texte', createTextElement()],
    ['Rectangle', createRectElement()],
    ['Image', createImageElement('data:image/png;base64,AAAA')],
  ])('affiche le type "%s" quand un élément est sélectionné', (label, element) => {
    setup(element)

    expect(screen.getByRole('heading', { name: label })).toBeInTheDocument()
    expect(screen.queryByText('Aucun élément sélectionné')).not.toBeInTheDocument()
  })

  it('rappelle la position et la taille arrondies, en lecture seule', () => {
    setup(createRectElement({ x: 10.4, y: 20.6, width: 300.2, height: 99.5 }))

    expect(screen.getByText('Position X, Y').nextElementSibling).toHaveTextContent('10, 21')
    expect(screen.getByText('Taille L x H').nextElementSibling).toHaveTextContent('300 x 100')
  })
})

describe('PropertiesPanel : texte', () => {
  it('affiche les contrôles du texte avec de vrais labels', () => {
    setup(createTextElement({ fontSize: 40, color: '#ff0000', fill: null }))

    expect(screen.getByLabelText('Taille de police')).toHaveValue(40)
    expect(screen.getByLabelText('Taille de police')).toHaveAttribute('min', '8')
    expect(screen.getByLabelText('Taille de police')).toHaveAttribute('max', '400')
    expect(screen.getByLabelText('Couleur du texte')).toHaveValue('#ff0000')
    expect(screen.getByLabelText('Fond')).not.toBeChecked()
    expect(screen.queryByLabelText('Couleur de fond')).not.toBeInTheDocument()
  })

  it('un entier valide appelle onUpdate avec fontSize', () => {
    const { onUpdate } = setup(createTextElement({ fontSize: 40 }))

    fireEvent.change(screen.getByLabelText('Taille de police'), { target: { value: '55' } })

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate).toHaveBeenCalledWith({ fontSize: 55 })
  })

  it('une valeur vide ou invalide n\'appelle pas onUpdate', async () => {
    const { onUpdate } = setup(createTextElement({ fontSize: 40 }))
    const input = screen.getByLabelText('Taille de police')

    await userEvent.clear(input)
    expect(onUpdate).not.toHaveBeenCalled()
    expect(input).toHaveValue(null)

    fireEvent.change(input, { target: { value: '12.5' } })
    fireEvent.change(input, { target: { value: '-3' } })
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('permet d\'effacer puis de retaper la taille', async () => {
    const { onUpdate } = setup(createTextElement({ fontSize: 40 }))
    const input = screen.getByLabelText('Taille de police')

    await userEvent.clear(input)
    await userEvent.type(input, '72')

    expect(onUpdate).toHaveBeenLastCalledWith({ fontSize: 72 })
  })

  it('se resynchronise avec la valeur réelle au blur et appelle onSeal', async () => {
    const { onUpdate, onSeal } = setup(createTextElement({ fontSize: 40 }))
    const input = screen.getByLabelText('Taille de police')

    await userEvent.clear(input)
    fireEvent.blur(input)

    expect(input).toHaveValue(40)
    expect(onSeal).toHaveBeenCalledTimes(1)
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('affiche la valeur bornée par le modèle après le blur', () => {
    const element = createTextElement({ fontSize: 40 })
    const { rerender } = setup(element)
    const input = screen.getByLabelText('Taille de police')

    fireEvent.change(input, { target: { value: '5' } })
    expect(input).toHaveValue(5)
    // Le reducer a borné à 8 : l'élément reçu en props vaut 8.
    rerender({ ...element, fontSize: 8 })
    fireEvent.blur(input)

    expect(input).toHaveValue(8)
  })

  it('la couleur du texte appelle onUpdate à chaque changement', () => {
    const { onUpdate } = setup(createTextElement())

    fireEvent.change(screen.getByLabelText('Couleur du texte'), { target: { value: '#123456' } })

    expect(onUpdate).toHaveBeenCalledWith({ color: '#123456' })
  })

  it('la case Fond met fill à null puis rend la dernière couleur connue', () => {
    const element = createTextElement({ fill: '#abcdef' })
    const { onUpdate, rerender } = setup(element)
    expect(screen.getByLabelText('Fond')).toBeChecked()
    expect(screen.getByLabelText('Couleur de fond')).toHaveValue('#abcdef')

    fireEvent.click(screen.getByLabelText('Fond'))
    expect(onUpdate).toHaveBeenLastCalledWith({ fill: null })

    rerender({ ...element, fill: null })
    expect(screen.getByLabelText('Fond')).not.toBeChecked()
    expect(screen.queryByLabelText('Couleur de fond')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Fond'))
    expect(onUpdate).toHaveBeenLastCalledWith({ fill: '#abcdef' })
  })

  it('la case Fond utilise le blanc quand aucune couleur n\'est connue', () => {
    const { onUpdate } = setup(createTextElement({ fill: null }))

    fireEvent.click(screen.getByLabelText('Fond'))

    expect(onUpdate).toHaveBeenCalledWith({ fill: '#ffffff' })
  })

  it('la couleur de fond appelle onUpdate avec fill', () => {
    const { onUpdate } = setup(createTextElement({ fill: '#abcdef' }))

    fireEvent.change(screen.getByLabelText('Couleur de fond'), { target: { value: '#000011' } })

    expect(onUpdate).toHaveBeenCalledWith({ fill: '#000011' })
  })

  it('appelle onSeal quand un champ perd le focus', () => {
    const { onSeal } = setup(createTextElement({ fill: '#abcdef' }))

    fireEvent.blur(screen.getByLabelText('Couleur du texte'))
    fireEvent.blur(screen.getByLabelText('Couleur de fond'))
    fireEvent.blur(screen.getByLabelText('Fond'))

    expect(onSeal).toHaveBeenCalledTimes(3)
  })
})

describe('PropertiesPanel : rectangle et image', () => {
  it('la couleur de remplissage du rectangle appelle onUpdate avec fill', () => {
    const { onUpdate, onSeal } = setup(createRectElement({ fill: '#2e5d7c' }))
    const input = screen.getByLabelText('Couleur de remplissage')
    expect(input).toHaveValue('#2e5d7c')

    fireEvent.change(input, { target: { value: '#ff00ff' } })
    fireEvent.blur(input)

    expect(onUpdate).toHaveBeenCalledWith({ fill: '#ff00ff' })
    expect(onSeal).toHaveBeenCalledTimes(1)
  })

  it('le texte alternatif de l\'image appelle onUpdate avec alt', () => {
    const { onUpdate, onSeal } = setup(createImageElement('data:,a', { alt: 'Logo' }))
    const input = screen.getByLabelText('Texte alternatif')
    expect(input).toHaveValue('Logo')

    fireEvent.change(input, { target: { value: 'Mon logo' } })
    fireEvent.blur(input)

    expect(onUpdate).toHaveBeenCalledWith({ alt: 'Mon logo' })
    expect(onSeal).toHaveBeenCalledTimes(1)
  })

  it("limite le texte alternatif à la longueur acceptée par l'import de fichier", () => {
    setup(createImageElement('data:,a'))

    expect(screen.getByLabelText('Texte alternatif')).toHaveAttribute('maxlength', String(MAX_ALT_LENGTH))
  })

  it('n\'affiche pas les champs d\'un autre type', () => {
    setup(createRectElement())

    expect(screen.queryByLabelText('Taille de police')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Texte alternatif')).not.toBeInTheDocument()
  })
})

describe('PropertiesPanel : ordre d\'empilement', () => {
  const NAMES = ['Premier plan', 'Avancer', 'Reculer', 'Arrière-plan']
  const group = () => screen.getByRole('group', { name: 'Ordre d\'empilement' })

  it.each([
    ['texte', createTextElement()],
    ['rectangle', createRectElement()],
    ['image', createImageElement('data:,a')],
  ])('propose les 4 boutons pour un %s', (_label, element) => {
    setup(element)

    for (const name of NAMES) {
      expect(within(group()).getByRole('button', { name })).toBeEnabled()
    }
  })

  it('désactive Premier plan et Avancer quand l\'élément est déjà devant', () => {
    setup(createRectElement(), { front: false, back: true })

    expect(screen.getByRole('button', { name: 'Premier plan' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Avancer' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reculer' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Arrière-plan' })).toBeEnabled()
  })

  it('désactive Arrière-plan et Reculer quand l\'élément est déjà derrière', () => {
    setup(createRectElement(), { front: true, back: false })

    expect(screen.getByRole('button', { name: 'Arrière-plan' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reculer' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Premier plan' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Avancer' })).toBeEnabled()
  })

  it('désactive les quatre boutons quand l\'élément est seul', () => {
    setup(createRectElement(), { front: false, back: false })

    for (const name of NAMES) {
      expect(screen.getByRole('button', { name })).toBeDisabled()
    }
  })

  it('chaque bouton appelle onReorder avec sa direction', async () => {
    const { onReorder } = setup(createRectElement())

    await userEvent.click(screen.getByRole('button', { name: 'Premier plan' }))
    await userEvent.click(screen.getByRole('button', { name: 'Avancer' }))
    await userEvent.click(screen.getByRole('button', { name: 'Reculer' }))
    await userEvent.click(screen.getByRole('button', { name: 'Arrière-plan' }))

    expect(onReorder.mock.calls).toEqual([['front'], ['forward'], ['backward'], ['back']])
  })

  it('un bouton désactivé n\'appelle pas onReorder', async () => {
    const { onReorder } = setup(createRectElement(), { front: false, back: true })

    await userEvent.click(screen.getByRole('button', { name: 'Avancer' }))

    expect(onReorder).not.toHaveBeenCalled()
  })

  it('n\'apparaît pas sans sélection', () => {
    setup(null)

    expect(screen.queryByRole('group', { name: 'Ordre d\'empilement' })).not.toBeInTheDocument()
  })
})

describe('PropertiesPanel : opacité', () => {
  it.each([
    ['texte', createTextElement()],
    ['rectangle', createRectElement()],
    ['image', createImageElement('data:,a')],
  ])('propose un curseur de 0 à 100 pour un %s', (_label, element) => {
    setup(element)

    const slider = screen.getByLabelText('Opacité')
    expect(slider).toHaveAttribute('type', 'range')
    expect(slider).toHaveAttribute('min', '0')
    expect(slider).toHaveAttribute('max', '100')
    expect(slider).toHaveAttribute('step', '1')
    expect(slider).toHaveValue('100')
    expect(screen.getByText('100 %')).toBeInTheDocument()
  })

  it('affiche la valeur de l\'élément en pourcentage', () => {
    setup(createRectElement({ opacity: 0.8 }))

    expect(screen.getByLabelText('Opacité')).toHaveValue('80')
    expect(screen.getByText('80 %')).toBeInTheDocument()
  })

  it('appelle onUpdate avec la fraction, sans erreur d\'arrondi', () => {
    const { onUpdate } = setup(createRectElement())
    const slider = screen.getByLabelText('Opacité')

    fireEvent.change(slider, { target: { value: '30' } })
    fireEvent.change(slider, { target: { value: '0' } })
    fireEvent.change(slider, { target: { value: '57' } })

    expect(onUpdate.mock.calls).toEqual([[{ opacity: 0.3 }], [{ opacity: 0 }], [{ opacity: 0.57 }]])
  })

  it('appelle onSeal au blur', () => {
    const { onSeal } = setup(createRectElement())

    fireEvent.blur(screen.getByLabelText('Opacité'))

    expect(onSeal).toHaveBeenCalledTimes(1)
  })
})

describe('PropertiesPanel : style du texte', () => {
  it('propose Gras, Italique et les trois alignements pour un texte', () => {
    setup(createTextElement())

    const style = screen.getByRole('group', { name: 'Style du texte' })
    expect(within(style).getByRole('button', { name: 'Gras' })).toBeInTheDocument()
    expect(within(style).getByRole('button', { name: 'Italique' })).toBeInTheDocument()
    const align = screen.getByRole('group', { name: 'Alignement du texte' })
    for (const name of ['Aligner à gauche', 'Centrer', 'Aligner à droite']) {
      expect(within(align).getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it.each([
    ['rectangle', createRectElement()],
    ['image', createImageElement('data:,a')],
  ])('ne propose rien de tout cela pour un %s', (_label, element) => {
    setup(element)

    expect(screen.queryByRole('group', { name: 'Style du texte' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Alignement du texte' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gras' })).not.toBeInTheDocument()
  })

  it('reflète l\'état de l\'élément avec aria-pressed', () => {
    setup(createTextElement({ bold: true, italic: false, align: 'center' }))

    expect(screen.getByRole('button', { name: 'Gras' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Italique' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Aligner à gauche' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Centrer' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Aligner à droite' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('Gras et Italique appellent onUpdate avec la valeur inverse, puis onSeal', async () => {
    const { onUpdate, onSeal } = setup(createTextElement({ bold: false, italic: true }))

    await userEvent.click(screen.getByRole('button', { name: 'Gras' }))
    expect(onUpdate).toHaveBeenLastCalledWith({ bold: true })
    expect(onSeal).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: 'Italique' }))
    expect(onUpdate).toHaveBeenLastCalledWith({ italic: false })
    expect(onSeal).toHaveBeenCalledTimes(2)
  })

  it('les alignements appellent onUpdate avec la bonne valeur, puis onSeal', async () => {
    const { onUpdate, onSeal } = setup(createTextElement())

    await userEvent.click(screen.getByRole('button', { name: 'Centrer' }))
    expect(onUpdate).toHaveBeenLastCalledWith({ align: 'center' })
    await userEvent.click(screen.getByRole('button', { name: 'Aligner à droite' }))
    expect(onUpdate).toHaveBeenLastCalledWith({ align: 'right' })
    await userEvent.click(screen.getByRole('button', { name: 'Aligner à gauche' }))
    expect(onUpdate).toHaveBeenLastCalledWith({ align: 'left' })

    expect(onSeal).toHaveBeenCalledTimes(3)
  })
})

describe('PropertiesPanel : police', () => {
  const select = () => screen.getByLabelText('Police') as HTMLSelectElement

  it('propose Police par défaut puis les 8 polices courantes dans un groupe', () => {
    setup(createTextElement())

    expect(select().tagName).toBe('SELECT')
    const options = within(select()).getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual([
      'Police par défaut',
      ...BUILT_IN_FONTS.map((font) => font.name),
    ])
    const group = within(select()).getByRole('group', { name: 'Polices courantes' })
    expect(within(group).getAllByRole('option')).toHaveLength(8)
  })

  it('écrit chaque option dans sa propre police', () => {
    setup(createTextElement())

    for (const font of BUILT_IN_FONTS) {
      const option = within(select()).getByRole('option', { name: font.name }) as HTMLOptionElement
      expect(option.style.fontFamily).toBe(font.stack)
      expect(option).toHaveValue(font.name)
    }
  })

  it('sélectionne Police par défaut quand fontFamily vaut null', () => {
    setup(createTextElement({ fontFamily: null }))

    expect(select()).toHaveValue('')
    expect(screen.getByRole('option', { name: 'Police par défaut' })).toHaveValue('')
  })

  it("sélectionne la police de l'élément", () => {
    setup(createTextElement({ fontFamily: 'Georgia' }))

    expect(select()).toHaveValue('Georgia')
    expect(screen.queryByRole('option', { name: /non listée/ })).not.toBeInTheDocument()
  })

  it('une police hors liste ajoute une option « non listée », sélectionnée', () => {
    setup(createTextElement({ fontFamily: 'Calibri' }))

    expect(screen.getByRole('option', { name: 'Calibri (non listée)' })).toBeInTheDocument()
    expect(select()).toHaveValue('Calibri')
    expect(within(select()).getAllByRole('option')).toHaveLength(10)
  })

  it('un choix appelle onUpdate avec le nom puis onSeal', () => {
    const { onUpdate, onSeal } = setup(createTextElement())

    fireEvent.change(select(), { target: { value: 'Verdana' } })

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate).toHaveBeenCalledWith({ fontFamily: 'Verdana' })
    expect(onSeal).toHaveBeenCalledTimes(1)
  })

  it('Police par défaut appelle onUpdate avec null, puis onSeal', () => {
    const { onUpdate, onSeal } = setup(createTextElement({ fontFamily: 'Georgia' }))

    fireEvent.change(select(), { target: { value: '' } })

    expect(onUpdate).toHaveBeenCalledWith({ fontFamily: null })
    expect(onSeal).toHaveBeenCalledTimes(1)
  })

  it('le champ Police vient avant la taille de police', () => {
    setup(createTextElement())

    const position = select().compareDocumentPosition(screen.getByLabelText('Taille de police'))
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it.each([
    ['rectangle', createRectElement()],
    ['image', createImageElement('data:,a')],
  ])('est absent pour un %s', (_label, element) => {
    setup(element)

    expect(screen.queryByLabelText('Police')).not.toBeInTheDocument()
  })

  it('est absent sans sélection', () => {
    setup(null)

    expect(screen.queryByLabelText('Police')).not.toBeInTheDocument()
  })
})

describe('toHexColor', () => {
  it.each(['#000000', '#ffffff', '#2e5d7c'])('garde la valeur valide %s', (value) => {
    expect(toHexColor(value)).toBe(value)
  })

  it('abaisse la casse', () => {
    expect(toHexColor('#ABCDEF')).toBe('#abcdef')
  })

  it.each([
    ['#fff', '#ffffff'],
    ['#ABC', '#aabbcc'],
    ['#1a2', '#11aa22'],
  ])('développe la forme courte %s en %s', (value, expected) => {
    expect(toHexColor(value)).toBe(expected)
  })

  it.each(['', 'red', '#ff', '#12345', '#1234567', '123456', 'abc', '#gggggg', '#ggg', 'rgb(0,0,0)'])(
    'remplace la valeur invalide "%s" par du noir',
    (value) => {
      expect(toHexColor(value)).toBe('#000000')
    },
  )
})
