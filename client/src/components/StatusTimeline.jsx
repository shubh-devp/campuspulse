import { StatusBadge } from './Badges'


const DOT_CLASSES = {
  open: 'bg-sky-500',
  assigned: 'bg-violet-500',
  in_progress: 'bg-amber-500',
  resolved: 'bg-emerald-500',
  closed: 'bg-slate-400',
  rejected: 'bg-red-500',
  duplicate: 'bg-orange-500',
  reopened: 'bg-sky-500',
}

function StatusTimeline({ entries = [], emptyLabel = 'No status updates yet.', className = '' }) {
  if (entries.length === 0) {
    return <p className="text-sm text-slate-500">{emptyLabel}</p>
  }

  return (
    <ol className={`space-y-4 ${className}`}>
      {entries.map((entry, index) => (
        <li key={entry.id ?? `${entry.status}-${index}`} className="relative pl-6">
          {index < entries.length - 1 && (
            <span className="absolute bottom-[-1rem] left-[5px] top-5 w-px bg-slate-200" aria-hidden="true" />
          )}
          <span
            className={`absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${
              DOT_CLASSES[entry.status] || 'bg-slate-400'
            }`}
            aria-hidden="true"
          />
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={entry.status} size="sm" />
            <time className="text-xs text-slate-500" dateTime={entry.created_at}>
              {new Date(entry.created_at).toLocaleString()}
            </time>
          </div>
          {entry.note && <p className="mt-1 text-sm text-slate-600">{entry.note}</p>}
        </li>
      ))}
    </ol>
  )
}

export default StatusTimeline
