import { useRef, type ChangeEvent, type Ref } from 'react'
import { ExportMenu, type ExportMenuItem } from './ExportMenu'
import { FILE_BUTTON_CLASS } from './fileButtonClass'

interface FileActionsProps {
  onExportJson: () => void
  onExportPdf: () => void
  onExportPptx: () => void
  onImportFile: (file: File) => void
  // Vrai pendant le mode présentation, l'impression ou un export en cours : rien ne doit partir
  // ni arriver.
  disabled: boolean
  // Pour que le parent puisse rendre le focus au bouton qui a déclenché un message.
  exportRef?: Ref<HTMLButtonElement>
  importRef?: Ref<HTMLButtonElement>
}

// Présentationnel : exporter et importer sont relayés au parent.
export function FileActions({
  onExportJson,
  onExportPdf,
  onExportPptx,
  onImportFile,
  disabled,
  exportRef,
  importRef,
}: FileActionsProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  // Les formats d'export sont des données : un nouveau format = une ligne de plus ici.
  const exportItems: ExportMenuItem[] = [
    { id: 'json', label: 'Fichier JSON (se rouvre dans l\'éditeur)', onSelect: onExportJson },
    { id: 'pdf', label: 'PDF (via l\'impression du navigateur)', onSelect: onExportPdf },
    {
      id: 'pptx',
      label: 'PowerPoint (.pptx, s\'ouvre aussi dans LibreOffice)',
      onSelect: onExportPptx,
    },
  ]

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (file) onImportFile(file)
    // Vidé pour pouvoir réimporter deux fois de suite le même fichier.
    input.value = ''
  }

  return (
    <div role="group" aria-label="Fichier" className="flex items-center gap-1.5">
      <ExportMenu items={exportItems} disabled={disabled} buttonRef={exportRef} />
      {/* Le nom accessible vient de l'aria-label ; le texte visible et l'icône sont décoratifs. */}
      <button
        ref={importRef}
        type="button"
        aria-label="Importer"
        title="Importer une présentation JSON"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
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
          <path d="M12 15V4" />
          <path d="M7 9l5-5 5 5" />
          <path d="M5 20h14" />
        </svg>
        Importer
      </button>
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
