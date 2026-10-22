import type { ElementType, SlideElement } from '../../model/types'

const TYPE_LABELS: Record<ElementType, string> = {
  text: 'Texte',
  rect: 'Rectangle',
  image: 'Image',
}

interface PropertiesPanelProps {
  element: SlideElement | null
}

// Squelette : les champs de propriétés arriveront avec l'édition.
export function PropertiesPanel({ element }: PropertiesPanelProps) {
  return (
    <aside
      aria-label="Propriétés"
      className="min-h-0 w-64 shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-4"
    >
      <h2 className="text-sm font-semibold text-slate-800">Propriétés</h2>
      <p className="mt-3 text-sm text-slate-500">
        {element ? TYPE_LABELS[element.type] : 'Aucun élément sélectionné'}
      </p>
    </aside>
  )
}
