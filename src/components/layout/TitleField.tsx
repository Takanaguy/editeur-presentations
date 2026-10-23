import { MAX_TITLE_LENGTH } from '../../model/limits'

interface TitleFieldProps {
  value: string
  onChange: (title: string) => void
  onBlur: () => void
}

// Présentationnel : champ discret (sans cadre au repos, bordure au survol et au focus).
export function TitleField({ value, onChange, onBlur }: TitleFieldProps) {
  return (
    <input
      type="text"
      aria-label="Titre de la présentation"
      placeholder="Sans titre"
      maxLength={MAX_TITLE_LENGTH}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      className="h-7 w-56 rounded-md border border-transparent bg-transparent px-2 text-sm font-semibold hover:border-slate-300 focus-visible:border-blue-500 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-blue-500"
    />
  )
}
