import { useEffect, useId, useImperativeHandle, useRef, useState, type KeyboardEvent, type Ref } from 'react'
import { FILE_BUTTON_CLASS } from './fileButtonClass'

// Un format d'export : la liste est une donnée, pas du JSX, pour en ajouter facilement.
export interface ExportMenuItem {
  id: string
  label: string
  onSelect: () => void
}

interface ExportMenuProps {
  items: ExportMenuItem[]
  // Vrai pendant le mode présentation : le bouton est inactif et le menu se referme.
  disabled: boolean
  // Pour que le parent puisse rendre le focus au bouton après un message.
  buttonRef?: Ref<HTMLButtonElement>
}

// Menu déroulant selon le motif ARIA « menu button » : un seul élément du menu est dans
// l'ordre de tabulation (aucun : le focus est géré à la main avec les flèches).
// Présentationnel : choisir un élément appelle son onSelect, rien d'autre.
export function ExportMenu({ items, disabled, buttonRef }: ExportMenuProps) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const buttonElement = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Si le menu est ouvert quand l'export devient indisponible, il se referme.
  // (Ajustement pendant le rendu, sans effet.)
  if (disabled && open) setOpen(false)

  function menuItems(): HTMLElement[] {
    return Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
  }

  // À l'ouverture, le focus va au premier élément (au clic comme au clavier).
  useEffect(() => {
    if (open) menuItems()[0]?.focus()
  }, [open])

  // Un clic en dehors du bouton et du menu ferme le menu.
  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !wrapperRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  // Le parent reçoit le même bouton que celui qu'on garde en interne.
  useImperativeHandle(buttonRef, () => buttonElement.current as HTMLButtonElement, [])

  function closeAndFocusButton() {
    setOpen(false)
    buttonElement.current?.focus()
  }

  function handleButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowDown') return
    // Évite le défilement de la page ; Entrée et Espace ouvrent déjà via le clic du bouton.
    event.preventDefault()
    if (open) menuItems()[0]?.focus()
    else setOpen(true)
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const elements = menuItems()
    const current = elements.indexOf(document.activeElement as HTMLElement)
    let target: number
    switch (event.key) {
      case 'ArrowDown':
        target = (current + 1) % elements.length
        break
      case 'ArrowUp':
        target = (current - 1 + elements.length) % elements.length
        break
      case 'Home':
        target = 0
        break
      case 'End':
        target = elements.length - 1
        break
      case 'Escape':
        event.preventDefault()
        closeAndFocusButton()
        return
      case 'Tab':
        // Pas de preventDefault : le focus part du bouton vers l'élément suivant ou précédent
        // de la page, et non depuis un élément du menu qui va disparaître.
        closeAndFocusButton()
        return
      default:
        return
    }
    event.preventDefault()
    elements[target]?.focus()
  }

  function choose(item: ExportMenuItem) {
    closeAndFocusButton()
    item.onSelect()
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={buttonElement}
        type="button"
        aria-label="Exporter"
        title="Exporter la présentation"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={handleButtonKeyDown}
        className={FILE_BUTTON_CLASS}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 4v11" />
          <path d="M7 10l5 5 5-5" />
          <path d="M5 20h14" />
        </svg>
        Exporter
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Exporter"
          onKeyDown={handleMenuKeyDown}
          className="absolute top-full right-0 z-40 mt-1 w-96 rounded-md border border-slate-200 bg-white py-1 shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => choose(item)}
              className="block w-full cursor-pointer px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
