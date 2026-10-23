import { useId, useState } from 'react'
import { MAX_FONT_SIZE, MIN_FONT_SIZE } from '../../editor/elementOps'
import type { ElementChanges } from '../../editor/types'
import type {
  ElementType,
  ImageElement,
  RectElement,
  SlideElement,
  TextElement,
} from '../../model/types'

const TYPE_LABELS: Record<ElementType, string> = {
  text: 'Texte',
  rect: 'Rectangle',
  image: 'Image',
}

const DEFAULT_FILL = '#ffffff'
const LABEL_CLASS = 'text-sm text-slate-700'
const INPUT_CLASS =
  'rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600'

// Un input de type color n'accepte que #rrggbb en minuscules : on développe #rgb et on
// abaisse la casse. Toute autre valeur donnerait du noir de toute façon, autant le dire.
export function toHexColor(value: string): string {
  const digits = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value)?.[1]?.toLowerCase()
  if (!digits) return '#000000'
  const full = digits.length === 3 ? [...digits].map((c) => c + c).join('') : digits
  return `#${full}`
}

interface PropertiesPanelProps {
  element: SlideElement | null
  onUpdate: (changes: ElementChanges) => void
  // Appelé quand un champ perd le focus : coupe la fusion des modifications d'historique.
  onSeal: () => void
}

export function PropertiesPanel({ element, onUpdate, onSeal }: PropertiesPanelProps) {
  return (
    <aside
      aria-label="Propriétés"
      className="min-h-0 w-64 shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-4"
    >
      <h2 className="text-sm font-semibold text-slate-800">Propriétés</h2>
      {element ? (
        // key : changer d'élément repart de champs neufs (brouillon, dernière couleur de fond).
        <ElementFields key={element.id} element={element} onUpdate={onUpdate} onSeal={onSeal} />
      ) : (
        <p className="mt-3 text-sm text-slate-500">Aucun élément sélectionné</p>
      )}
    </aside>
  )
}

interface FieldsProps<T extends SlideElement> {
  element: T
  onUpdate: (changes: ElementChanges) => void
  onSeal: () => void
}

function ElementFields({ element, onUpdate, onSeal }: FieldsProps<SlideElement>) {
  return (
    <div className="mt-3 flex flex-col gap-3">
      <h3 className="text-sm font-medium text-slate-600">{TYPE_LABELS[element.type]}</h3>
      {element.type === 'text' && <TextFields element={element} onUpdate={onUpdate} onSeal={onSeal} />}
      {element.type === 'rect' && <RectFields element={element} onUpdate={onUpdate} onSeal={onSeal} />}
      {element.type === 'image' && (
        <ImageFields element={element} onUpdate={onUpdate} onSeal={onSeal} />
      )}
      <Geometry element={element} />
    </div>
  )
}

interface ColorFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  onBlur: () => void
}

function ColorField({ label, value, onChange, onBlur }: ColorFieldProps) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-2">
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <input
        id={id}
        type="color"
        value={toHexColor(value)}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        className="h-8 w-12 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
      />
    </div>
  )
}

function TextFields({ element, onUpdate, onSeal }: FieldsProps<TextElement>) {
  const sizeId = useId()
  const fillToggleId = useId()
  // Brouillon de la taille, en texte pour pouvoir effacer et retaper. null = pas de
  // saisie en cours : on affiche la valeur réelle de l'élément, sans effet de synchronisation.
  const [sizeDraft, setSizeDraft] = useState<string | null>(null)
  // Dernière couleur de fond connue, pour la retrouver en recochant la case.
  const [lastFill, setLastFill] = useState(element.fill ?? DEFAULT_FILL)

  function changeSize(value: string) {
    setSizeDraft(value)
    // Vide ou invalide : on attend la suite de la saisie sans toucher à l'élément.
    if (/^\d+$/.test(value)) onUpdate({ fontSize: Number(value) })
  }

  function toggleFill(checked: boolean) {
    if (checked) {
      onUpdate({ fill: lastFill })
    } else {
      if (element.fill !== null) setLastFill(element.fill)
      onUpdate({ fill: null })
    }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={sizeId} className={LABEL_CLASS}>
          Taille de police
        </label>
        <input
          id={sizeId}
          type="number"
          min={MIN_FONT_SIZE}
          max={MAX_FONT_SIZE}
          step={1}
          value={sizeDraft ?? String(element.fontSize)}
          onChange={(event) => changeSize(event.target.value)}
          onBlur={() => {
            // Resynchronise avec la valeur réelle (bornée par le reducer).
            setSizeDraft(null)
            onSeal()
          }}
          className={`${INPUT_CLASS} w-20`}
        />
      </div>
      <ColorField
        label="Couleur du texte"
        value={element.color}
        onChange={(color) => onUpdate({ color })}
        onBlur={onSeal}
      />
      <div className="flex items-center gap-2">
        <input
          id={fillToggleId}
          type="checkbox"
          checked={element.fill !== null}
          onChange={(event) => toggleFill(event.target.checked)}
          onBlur={onSeal}
          className="h-4 w-4 accent-blue-600"
        />
        <label htmlFor={fillToggleId} className={LABEL_CLASS}>
          Fond
        </label>
      </div>
      {element.fill !== null && (
        <ColorField
          label="Couleur de fond"
          value={element.fill}
          onChange={(fill) => onUpdate({ fill })}
          onBlur={onSeal}
        />
      )}
    </>
  )
}

function RectFields({ element, onUpdate, onSeal }: FieldsProps<RectElement>) {
  return (
    <ColorField
      label="Couleur de remplissage"
      value={element.fill}
      onChange={(fill) => onUpdate({ fill })}
      onBlur={onSeal}
    />
  )
}

function ImageFields({ element, onUpdate, onSeal }: FieldsProps<ImageElement>) {
  const altId = useId()
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={altId} className={LABEL_CLASS}>
        Texte alternatif
      </label>
      <input
        id={altId}
        type="text"
        value={element.alt}
        onChange={(event) => onUpdate({ alt: event.target.value })}
        onBlur={onSeal}
        className={INPUT_CLASS}
      />
    </div>
  )
}

// Rappel en lecture seule : la géométrie se change à la souris, pas ici.
function Geometry({ element }: { element: SlideElement }) {
  return (
    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-slate-200 pt-3 text-xs text-slate-500">
      <dt>Position X, Y</dt>
      <dd className="text-right tabular-nums">
        {Math.round(element.x)}, {Math.round(element.y)}
      </dd>
      <dt>Taille L x H</dt>
      <dd className="text-right tabular-nums">
        {Math.round(element.width)} x {Math.round(element.height)}
      </dd>
    </dl>
  )
}
