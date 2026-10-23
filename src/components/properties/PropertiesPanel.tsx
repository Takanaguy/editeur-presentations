import { useId, useState, type ReactNode } from 'react'
import { MAX_FONT_SIZE, MIN_FONT_SIZE } from '../../editor/elementOps'
import type { ElementChanges, ReorderTarget } from '../../editor/types'
import { MAX_ALT_LENGTH } from '../../model/limits'
import type {
  ElementType,
  ImageElement,
  RectElement,
  SlideElement,
  TextAlign,
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
const BUTTON_CLASS =
  'flex h-8 flex-1 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-300 disabled:hover:bg-slate-50'
const PRESSED_CLASS = 'border-blue-300 bg-blue-100 text-blue-800 hover:bg-blue-100'

// Un input de type color n'accepte que #rrggbb en minuscules : on développe #rgb et on
// abaisse la casse. Toute autre valeur donnerait du noir de toute façon, autant le dire.
export function toHexColor(value: string): string {
  const digits = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value)?.[1]?.toLowerCase()
  if (!digits) return '#000000'
  const full = digits.length === 3 ? [...digits].map((c) => c + c).join('') : digits
  return `#${full}`
}

interface CanReorder {
  // L'élément peut encore monter (il n'est pas au premier plan).
  front: boolean
  // L'élément peut encore descendre (il n'est pas à l'arrière-plan).
  back: boolean
}

interface PropertiesPanelProps {
  element: SlideElement | null
  onUpdate: (changes: ElementChanges) => void
  // Appelé quand un champ perd le focus : coupe la fusion des modifications d'historique.
  onSeal: () => void
  // Change la place de l'élément dans l'ordre d'empilement.
  onReorder: (to: ReorderTarget) => void
  canReorder: CanReorder
}

export function PropertiesPanel({
  element,
  onUpdate,
  onSeal,
  onReorder,
  canReorder,
}: PropertiesPanelProps) {
  return (
    <aside
      aria-label="Propriétés"
      className="min-h-0 w-64 shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-4"
    >
      <h2 className="text-sm font-semibold text-slate-800">Propriétés</h2>
      {element ? (
        // key : changer d'élément repart de champs neufs (brouillon, dernière couleur de fond).
        <ElementFields
          key={element.id}
          element={element}
          onUpdate={onUpdate}
          onSeal={onSeal}
          onReorder={onReorder}
          canReorder={canReorder}
        />
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

interface ElementFieldsProps extends FieldsProps<SlideElement> {
  onReorder: (to: ReorderTarget) => void
  canReorder: CanReorder
}

function ElementFields({ element, onUpdate, onSeal, onReorder, canReorder }: ElementFieldsProps) {
  return (
    <div className="mt-3 flex flex-col gap-3">
      <h3 className="text-sm font-medium text-slate-600">{TYPE_LABELS[element.type]}</h3>
      {element.type === 'text' && <TextFields element={element} onUpdate={onUpdate} onSeal={onSeal} />}
      {element.type === 'rect' && <RectFields element={element} onUpdate={onUpdate} onSeal={onSeal} />}
      {element.type === 'image' && (
        <ImageFields element={element} onUpdate={onUpdate} onSeal={onSeal} />
      )}
      <OpacityField opacity={element.opacity} onUpdate={onUpdate} onSeal={onSeal} />
      <OrderButtons onReorder={onReorder} canReorder={canReorder} />
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

interface ToggleButtonProps {
  label: string
  pressed: boolean
  onClick: () => void
  children: ReactNode
}

// Bouton à bascule : l'état actif est dit au lecteur d'écran par aria-pressed, pas seulement
// par la couleur.
function ToggleButton({ label, pressed, onClick, children }: ToggleButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={`${BUTTON_CLASS} ${pressed ? PRESSED_CLASS : ''}`}
    >
      {children}
    </button>
  )
}

// Icône d'alignement : (x1, x2) de chacune des 4 lignes, dans une grille de 16.
const ALIGN_LINES: Record<TextAlign, [number, number][]> = {
  left: [
    [2, 14],
    [2, 9],
    [2, 14],
    [2, 9],
  ],
  center: [
    [2, 14],
    [4.5, 11.5],
    [2, 14],
    [4.5, 11.5],
  ],
  right: [
    [2, 14],
    [7, 14],
    [2, 14],
    [7, 14],
  ],
}

const ALIGN_BUTTONS: { align: TextAlign; label: string }[] = [
  { align: 'left', label: 'Aligner à gauche' },
  { align: 'center', label: 'Centrer' },
  { align: 'right', label: 'Aligner à droite' },
]

function TextStyleButtons({ element, onUpdate, onSeal }: FieldsProps<TextElement>) {
  // Un clic de bouton est une intention complète : on coupe aussitôt la fusion de l'historique.
  // Sinon deux bascules de Gras de suite (même clé de fusion) ne feraient qu'une entrée.
  function apply(changes: ElementChanges) {
    onUpdate(changes)
    onSeal()
  }

  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label="Style du texte" className="flex gap-1">
        <ToggleButton label="Gras" pressed={element.bold} onClick={() => apply({ bold: !element.bold })}>
          <span aria-hidden="true" className="font-bold">
            G
          </span>
        </ToggleButton>
        <ToggleButton
          label="Italique"
          pressed={element.italic}
          onClick={() => apply({ italic: !element.italic })}
        >
          <span aria-hidden="true" className="italic">
            I
          </span>
        </ToggleButton>
      </div>
      <div role="group" aria-label="Alignement du texte" className="flex gap-1">
        {ALIGN_BUTTONS.map(({ align, label }) => (
          <ToggleButton
            key={align}
            label={label}
            pressed={element.align === align}
            onClick={() => apply({ align })}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              width="16"
              height="16"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              {ALIGN_LINES[align].map(([x1, x2], row) => (
                <line key={row} x1={x1} x2={x2} y1={3 + row * 3.3} y2={3 + row * 3.3} />
              ))}
            </svg>
          </ToggleButton>
        ))}
      </div>
    </div>
  )
}

interface OpacityFieldProps {
  opacity: number
  onUpdate: (changes: ElementChanges) => void
  onSeal: () => void
}

function OpacityField({ opacity, onUpdate, onSeal }: OpacityFieldProps) {
  const id = useId()
  const percent = Math.round(opacity * 100)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className={LABEL_CLASS}>
          Opacité
        </label>
        <span className="text-sm text-slate-500 tabular-nums">{percent} %</span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={1}
        value={percent}
        // Sans cela, un lecteur d'écran annonce « 40 » et pas « 40 % ».
        aria-valuetext={`${percent} %`}
        // Entier divisé par 100 : 30 donne 0.3 exactement, jamais 0.30000000000000004.
        onChange={(event) => onUpdate({ opacity: Math.round(Number(event.target.value)) / 100 })}
        onBlur={onSeal}
        className="w-full cursor-pointer accent-blue-600"
      />
    </div>
  )
}

interface OrderButtonsProps {
  onReorder: (to: ReorderTarget) => void
  canReorder: CanReorder
}

function OrderButtons({ onReorder, canReorder }: OrderButtonsProps) {
  const buttons: { to: ReorderTarget; label: string; enabled: boolean }[] = [
    { to: 'front', label: 'Premier plan', enabled: canReorder.front },
    { to: 'forward', label: 'Avancer', enabled: canReorder.front },
    { to: 'backward', label: 'Reculer', enabled: canReorder.back },
    { to: 'back', label: 'Arrière-plan', enabled: canReorder.back },
  ]
  return (
    <div className="flex flex-col gap-1">
      <span className={LABEL_CLASS}>Ordre</span>
      <div role="group" aria-label="Ordre d'empilement" className="grid grid-cols-2 gap-1">
        {buttons.map(({ to, label, enabled }) => (
          <button
            key={to}
            type="button"
            title={label}
            disabled={!enabled}
            onClick={() => onReorder(to)}
            className={BUTTON_CLASS}
          >
            {label}
          </button>
        ))}
      </div>
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
      <TextStyleButtons element={element} onUpdate={onUpdate} onSeal={onSeal} />
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
        maxLength={MAX_ALT_LENGTH}
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
