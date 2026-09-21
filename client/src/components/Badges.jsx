import { Badge } from './ui/Badge'

// Status and priority deliberately look different:
//   status   -> soft pill with a dot  (what stage the complaint is at)
//   priority -> small uppercase text with a dot (how urgent it is)
// That way a table row shows both without either shouting.

const STATUS_TONES = {
  open: 'info',
  assigned: 'violet',
  in_progress: 'warning',
  resolved: 'success',
  closed: 'neutral',
  rejected: 'danger',
  duplicate: 'warning',
  reopened: 'info',
}

const STATUS_LABELS = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
  rejected: 'Rejected',
  duplicate: 'Duplicate',
  reopened: 'Reopened',
}

const PRIORITY_DOTS = {
  low: 'bg-slate-300',
  medium: 'bg-slate-400',
  high: 'bg-amber-500',
  urgent: 'bg-red-500',
}

const PRIORITY_TEXT = {
  low: 'text-slate-500',
  medium: 'text-slate-600',
  high: 'text-amber-700',
  urgent: 'text-red-700',
}

export function StatusBadge({ status, size = 'md' }) {
  const label = STATUS_LABELS[status] || status?.replace('_', ' ') || 'Unknown'
  return (
    <Badge tone={STATUS_TONES[status] || 'neutral'} size={size} dot>
      {label}
    </Badge>
  )
}

export function PriorityBadge({ priority }) {
  if (!priority) {
    return <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">—</span>
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide ${
        PRIORITY_TEXT[priority] || PRIORITY_TEXT.medium
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${PRIORITY_DOTS[priority] || PRIORITY_DOTS.medium}`} aria-hidden="true" />
      {priority}
    </span>
  )
}

export function CategoryBadge({ category }) {
  if (!category) {
    return (
      <Badge tone="neutral" size="sm">
        Uncategorised
      </Badge>
    )
  }

  return (
    <Badge tone="neutral" size="sm">
      {category}
    </Badge>
  )
}
