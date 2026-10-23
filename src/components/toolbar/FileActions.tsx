import { useRef, type ChangeEvent, type ReactNode, type Ref } from 'react'

interface FileActionsProps {
  onExport: () => void
  onImportFile: (file: File) => void
  // Vrai pendant le mode présentation : rien ne doit partir ni arriver.
  disabled: boolean
  // Pour que le parent puisse rendre le focus au bouton qui a déclenché un message.
  exportRef?: Ref<HTMLButtonElement>
  importRef?: Ref<HTMLButtonElement>
}

interface FileButtonProps {
  buttonRef?: Ref<HTMLButtonElement>
  label: string
  title: string
  disabled: boolean
  onClick: () => void
  children: ReactNode
}

const BUTTON_CLASS =
  'flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 enabled:hover:bg-slate-100 enabled:hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:text-slate-300'

// Le nom accessible vient de l'aria-label ; le texte visible et l'icône sont décoratifs.
function FileButton({ buttonRef, label, title, disabled, onClick, children }: FileButtonProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={BUTTON_CLASS}
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
        {children}
      </svg>
      {label}
    </button>
  )
}

// Présentationnel : exporter et importer sont relayés au parent.
export function FileActions({
  onExport,
  onImportFile,
  disabled,
  exportRef,
  importRef,
}: FileActionsProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (file) onImportFile(file)
    // Vidé pour pouvoir réimporter deux fois de suite le même fichier.
    input.value = ''
  }

  return (
    <div role="group" aria-label="Fichier" className="flex items-center gap-1.5">
      <FileButton
        buttonRef={exportRef}
        label="Exporter"
        title="Exporter la présentation en JSON"
        disabled={disabled}
        onClick={onExport}
      >
        <path d="M12 4v11" />
        <path d="M7 10l5 5 5-5" />
        <path d="M5 20h14" />
      </FileButton>
      <FileButton
        buttonRef={importRef}
        label="Importer"
        title="Importer une présentation JSON"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <path d="M12 15V4" />
        <path d="M7 9l5-5 5 5" />
        <path d="M5 20h14" />
      </FileButton>
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label="Importer une présentation JSON"
        onChange={handleChange}
      />
    </div>
  )
}
