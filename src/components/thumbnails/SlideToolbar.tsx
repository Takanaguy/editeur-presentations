import type { ReactNode } from 'react'

interface SlideToolbarProps {
  canDelete: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onAdd: () => void
  onDuplicate: () => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}

interface IconButtonProps {
  label: string
  disabled?: boolean
  onClick: () => void
  // Classes de survol propres au bouton (la suppression passe en rouge).
  hoverClass?: string
  children: ReactNode
}

// Bouton carré avec une icône : le nom accessible vient de l'aria-label, pas de l'icône.
function IconButton({
  label,
  disabled = false,
  onClick,
  hoverClass = 'enabled:hover:bg-slate-100 enabled:hover:text-slate-900',
  children,
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-8 flex-1 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-300 ${hoverClass}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
    </button>
  )
}

// Présentationnel : il ne sait pas ce que font les actions, il les relaie.
export function SlideToolbar({
  canDelete,
  canMoveUp,
  canMoveDown,
  onAdd,
  onDuplicate,
  onDelete,
  onMoveUp,
  onMoveDown,
}: SlideToolbarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Actions sur les diapositives"
      className="flex shrink-0 flex-col gap-2 border-b border-slate-200 p-2"
    >
      <button
        type="button"
        onClick={onAdd}
        className="flex h-8 w-full cursor-pointer items-center justify-center gap-1.5 rounded-md bg-blue-600 px-2 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
      >
        <span aria-hidden="true" className="text-base leading-none">
          +
        </span>
        Nouvelle diapositive
      </button>
      <div className="flex gap-1">
        <IconButton label="Dupliquer la diapositive" onClick={onDuplicate}>
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V6a2 2 0 0 1 2-2h9" />
        </IconButton>
        <IconButton
          label="Supprimer la diapositive"
          disabled={!canDelete}
          onClick={onDelete}
          hoverClass="enabled:hover:border-red-200 enabled:hover:bg-red-50 enabled:hover:text-red-600"
        >
          <path d="M4 7h16" />
          <path d="M10 11v6M14 11v6" />
          <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
          <path d="M9 7V4h6v3" />
        </IconButton>
        <IconButton label="Monter la diapositive" disabled={!canMoveUp} onClick={onMoveUp}>
          <path d="M12 19V5" />
          <path d="M5 12l7-7 7 7" />
        </IconButton>
        <IconButton label="Descendre la diapositive" disabled={!canMoveDown} onClick={onMoveDown}>
          <path d="M12 5v14" />
          <path d="M19 12l-7 7-7-7" />
        </IconButton>
      </div>
    </div>
  )
}
