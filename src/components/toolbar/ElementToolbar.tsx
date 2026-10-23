import { useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react'
import { isValidImageUrl } from '../../io/imageUrl'

interface ElementToolbarProps {
  onAddText: () => void
  onAddRect: () => void
  onAddImageFromUrl: (url: string) => void
  onAddImageFromFile: (file: File) => void
  onDelete: () => void
  canDelete: boolean
  // Erreur venant du parent (import d'image échoué).
  error: string | null
}

const BASE_CLASS =
  'flex h-8 cursor-pointer items-center rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-300'
const BUTTON_CLASS = `${BASE_CLASS} hover:bg-slate-100 hover:text-slate-900`
// La suppression passe en rouge au survol, seulement quand elle est active.
const DELETE_CLASS = `${BASE_CLASS} ml-auto enabled:hover:border-red-200 enabled:hover:bg-red-50 enabled:hover:text-red-600`

// Présentationnel : valide seulement la forme de l'URL saisie, le reste est relayé au parent.
export function ElementToolbar({
  onAddText,
  onAddRect,
  onAddImageFromUrl,
  onAddImageFromFile,
  onDelete,
  canDelete,
  error,
}: ElementToolbarProps) {
  const [urlFormOpen, setUrlFormOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [urlError, setUrlError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const urlButtonRef = useRef<HTMLButtonElement>(null)

  function closeUrlForm() {
    setUrlFormOpen(false)
    setUrl('')
    setUrlError(null)
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const value = url.trim()
    if (!isValidImageUrl(value)) {
      setUrlError("Adresse d'image invalide (http, https ou data:image).")
      return
    }
    onAddImageFromUrl(value)
    closeUrlForm()
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return
    closeUrlForm()
    urlButtonRef.current?.focus()
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (file) onAddImageFromFile(file)
    // Vidé pour pouvoir choisir deux fois de suite le même fichier.
    input.value = ''
  }

  const message = urlError ?? error

  return (
    <div
      role="toolbar"
      aria-label="Ajouter des éléments"
      className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2"
    >
      <button type="button" className={BUTTON_CLASS} onClick={onAddText}>
        Texte
      </button>
      <button type="button" className={BUTTON_CLASS} onClick={onAddRect}>
        Rectangle
      </button>
      <button
        ref={urlButtonRef}
        type="button"
        className={BUTTON_CLASS}
        aria-expanded={urlFormOpen}
        onClick={() => (urlFormOpen ? closeUrlForm() : setUrlFormOpen(true))}
      >
        Image (URL)
      </button>
      <button type="button" className={BUTTON_CLASS} onClick={() => fileInputRef.current?.click()}>
        Image (fichier)
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        aria-label="Choisir un fichier image"
        onChange={handleFileChange}
      />

      {urlFormOpen && (
        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="flex items-center gap-2">
          <input
            type="text"
            autoFocus
            aria-label="Adresse de l'image"
            placeholder="https://..."
            value={url}
            onChange={(event) => {
              setUrl(event.target.value)
              setUrlError(null)
            }}
            className="h-8 w-64 rounded-md border border-slate-300 px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500"
          />
          <button
            type="submit"
            className="flex h-8 cursor-pointer items-center rounded-md bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            Ajouter
          </button>
        </form>
      )}

      <button
        type="button"
        disabled={!canDelete}
        onClick={onDelete}
        className={DELETE_CLASS}
      >
        Supprimer l&apos;élément
      </button>

      {message && (
        <p role="alert" className="basis-full text-sm text-red-600">
          {message}
        </p>
      )}
    </div>
  )
}
