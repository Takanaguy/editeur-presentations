export interface Notice {
  kind: 'error' | 'success'
  title: string
  messages: string[]
}

interface NoticeBannerProps {
  notice: Notice | null
  onClose: () => void
}

// Au delà, une liste trop longue n'aide personne : on résume le reste.
const MAX_VISIBLE_MESSAGES = 5

const VISIBLE_CLASS = {
  error: 'border-red-200 bg-red-50 text-red-800',
  success: 'border-green-200 bg-green-50 text-green-800',
} as const

interface LiveRegionProps {
  role: 'status' | 'alert'
  // null = rien à annoncer : le conteneur reste dans la page, vide et sans style.
  notice: Notice | null
  onClose: () => void
}

// Un conteneur « live » doit exister AVANT que son contenu change, sinon les lecteurs
// d'écran n'annoncent pas toujours le message. On le garde donc toujours monté.
function LiveRegion({ role, notice, onClose }: LiveRegionProps) {
  const visible = notice?.messages.slice(0, MAX_VISIBLE_MESSAGES) ?? []
  const hidden = (notice?.messages.length ?? 0) - visible.length

  return (
    <div
      role={role}
      className={
        notice
          ? `flex shrink-0 items-start justify-between gap-4 border-b px-4 py-2 text-sm ${VISIBLE_CLASS[notice.kind]}`
          : undefined
      }
    >
      {notice && (
        <>
          <div className="min-w-0">
            <p className="font-medium">{notice.title}</p>
            {visible.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {visible.map((message, index) => (
                  <li key={index}>{message}</li>
                ))}
                {hidden > 0 && <li className="list-none">… et {hidden} autres.</li>}
              </ul>
            )}
          </div>
          <button
            type="button"
            aria-label="Fermer le message"
            title="Fermer"
            onClick={onClose}
            className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
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
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </>
      )}
    </div>
  )
}

// Présentationnel : bandeau sous l'en-tête. Deux zones live toujours présentes : une
// pour les erreurs (role alert, annoncée tout de suite) et une pour les succès (role
// status, annoncée poliment). Seul leur contenu change.
export function NoticeBanner({ notice, onClose }: NoticeBannerProps) {
  return (
    <>
      <LiveRegion
        role="status"
        notice={notice?.kind === 'success' ? notice : null}
        onClose={onClose}
      />
      <LiveRegion role="alert" notice={notice?.kind === 'error' ? notice : null} onClose={onClose} />
    </>
  )
}
