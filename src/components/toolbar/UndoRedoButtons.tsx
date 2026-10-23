import type { ReactNode } from 'react'

interface UndoRedoButtonsProps {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}

interface HistoryButtonProps {
  label: string
  title: string
  disabled: boolean
  onClick: () => void
  children: ReactNode
}

// Le nom accessible vient de l'aria-label ; le title ajoute le raccourci clavier.
function HistoryButton({ label, title, disabled, onClick, children }: HistoryButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
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

// Présentationnel : l'état de l'historique et les actions viennent du parent.
export function UndoRedoButtons({ canUndo, canRedo, onUndo, onRedo }: UndoRedoButtonsProps) {
  return (
    <div role="group" aria-label="Historique" className="flex items-center gap-0.5">
      <HistoryButton label="Annuler" title="Annuler (Ctrl+Z)" disabled={!canUndo} onClick={onUndo}>
        <path d="M9 14L4 9l5-5" />
        <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
      </HistoryButton>
      <HistoryButton label="Rétablir" title="Rétablir (Ctrl+Y)" disabled={!canRedo} onClick={onRedo}>
        <path d="M15 14l5-5-5-5" />
        <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
      </HistoryButton>
    </div>
  )
}
