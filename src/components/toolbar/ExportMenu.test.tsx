import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExportMenu, type ExportMenuItem } from './ExportMenu'

function setup(disabled = false) {
  const onJson = vi.fn()
  const onPdf = vi.fn()
  const items: ExportMenuItem[] = [
    { id: 'json', label: "Fichier JSON (se rouvre dans l'éditeur)", onSelect: onJson },
    { id: 'pdf', label: "PDF (via l'impression du navigateur)", onSelect: onPdf },
  ]
  const view = render(
    <>
      <ExportMenu items={items} disabled={disabled} />
      <button type="button">Autre bouton</button>
    </>,
  )
  return { onJson, onPdf, view }
}

const trigger = () => screen.getByRole('button', { name: 'Exporter' })
const menu = () => screen.queryByRole('menu')
const jsonItem = () => screen.getByRole('menuitem', { name: /^Fichier JSON/ })
const pdfItem = () => screen.getByRole('menuitem', { name: /^PDF/ })

describe('ExportMenu', () => {
  it('est fermé au départ, avec aria-haspopup="menu" et aria-expanded="false"', () => {
    setup()

    expect(trigger()).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(menu()).not.toBeInTheDocument()
  })

  it('s\'ouvre au clic et place le focus sur le premier élément', async () => {
    setup()

    await userEvent.click(trigger())

    expect(menu()).toBeInTheDocument()
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    expect(jsonItem()).toHaveFocus()
  })

  it('expose deux éléments menuitem avec leurs noms', async () => {
    setup()
    await userEvent.click(trigger())

    const names = screen.getAllByRole('menuitem').map((item) => item.textContent)

    expect(names).toEqual([
      "Fichier JSON (se rouvre dans l'éditeur)",
      "PDF (via l'impression du navigateur)",
    ])
  })

  it.each([
    ['Entrée', '{Enter}'],
    ['Espace', ' '],
    ['flèche bas', '{ArrowDown}'],
  ])('%s ouvre le menu et place le focus sur le premier élément', async (_name, key) => {
    setup()
    trigger().focus()

    await userEvent.keyboard(key)

    expect(menu()).toBeInTheDocument()
    expect(jsonItem()).toHaveFocus()
  })

  it('les flèches se déplacent avec rebouclage', async () => {
    setup()
    await userEvent.click(trigger())

    await userEvent.keyboard('{ArrowDown}')
    expect(pdfItem()).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(jsonItem()).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}')
    expect(pdfItem()).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}')
    expect(jsonItem()).toHaveFocus()
  })

  it('Fin et Début vont au dernier et au premier élément', async () => {
    setup()
    await userEvent.click(trigger())

    await userEvent.keyboard('{End}')
    expect(pdfItem()).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(jsonItem()).toHaveFocus()
  })

  it('Échap ferme le menu et rend le focus au bouton', async () => {
    setup()
    await userEvent.click(trigger())

    await userEvent.keyboard('{Escape}')

    expect(menu()).not.toBeInTheDocument()
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(trigger()).toHaveFocus()
  })

  it('Tab ferme le menu et le focus continue vers l\'élément suivant de la page', async () => {
    setup()
    await userEvent.click(trigger())

    await userEvent.tab()

    expect(menu()).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Autre bouton' })).toHaveFocus()
  })

  it('un clic en dehors ferme le menu', async () => {
    setup()
    await userEvent.click(trigger())

    await userEvent.click(document.body)

    expect(menu()).not.toBeInTheDocument()
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
  })

  it('un clic dans le menu ne le ferme pas avant le choix', async () => {
    setup()
    await userEvent.click(trigger())

    await userEvent.pointer({ target: menu()!, keys: '[MouseLeft]' })

    expect(menu()).toBeInTheDocument()
  })

  it('un second clic sur le bouton referme le menu', async () => {
    setup()
    await userEvent.click(trigger())

    await userEvent.click(trigger())

    expect(menu()).not.toBeInTheDocument()
  })

  it('choisir le JSON appelle son rappel, ferme le menu et rend le focus au bouton', async () => {
    const { onJson, onPdf } = setup()
    await userEvent.click(trigger())

    await userEvent.click(jsonItem())

    expect(onJson).toHaveBeenCalledTimes(1)
    expect(onPdf).not.toHaveBeenCalled()
    expect(menu()).not.toBeInTheDocument()
    expect(trigger()).toHaveFocus()
  })

  it('choisir le PDF au clavier appelle son rappel et ferme le menu', async () => {
    const { onJson, onPdf } = setup()
    await userEvent.click(trigger())

    await userEvent.keyboard('{ArrowDown}{Enter}')

    expect(onPdf).toHaveBeenCalledTimes(1)
    expect(onJson).not.toHaveBeenCalled()
    expect(menu()).not.toBeInTheDocument()
  })

  it('désactivé : le bouton est inactif et le menu ne s\'ouvre pas', async () => {
    setup(true)

    expect(trigger()).toBeDisabled()
    await userEvent.click(trigger())
    expect(menu()).not.toBeInTheDocument()
  })

  it('se referme si le bouton devient désactivé alors que le menu est ouvert', async () => {
    const { view, onJson } = setup()
    await userEvent.click(trigger())
    expect(menu()).toBeInTheDocument()

    view.rerender(
      <>
        <ExportMenu items={[{ id: 'json', label: 'JSON', onSelect: onJson }]} disabled />
        <button type="button">Autre bouton</button>
      </>,
    )

    expect(menu()).not.toBeInTheDocument()
  })

  it('affiche les éléments fournis en données', async () => {
    render(
      <ExportMenu
        disabled={false}
        items={[
          { id: 'a', label: 'Format A', onSelect: () => {} },
          { id: 'b', label: 'Format B', onSelect: () => {} },
          { id: 'c', label: 'Format C', onSelect: () => {} },
        ]}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Exporter' }))

    expect(screen.getAllByRole('menuitem')).toHaveLength(3)
  })
})
