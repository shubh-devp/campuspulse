import { Badge } from './ui/Badge'


const STATUS_META = [
  { key: 'open', label: 'Open', tone: 'info', bar: 'bg-sky-500' },
  { key: 'assigned', label: 'Assigned', tone: 'violet', bar: 'bg-violet-500' },
  { key: 'in_progress', label: 'In Progress', tone: 'warning', bar: 'bg-amber-500' },
  { key: 'reopened', label: 'Reopened', tone: 'info', bar: 'bg-sky-300' },
  { key: 'resolved', label: 'Resolved', tone: 'success', bar: 'bg-emerald-500' },
  { key: 'closed', label: 'Closed', tone: 'neutral', bar: 'bg-slate-400' },
  { key: 'rejected', label: 'Rejected', tone: 'danger', bar: 'bg-red-500' },
  { key: 'duplicate', label: 'Duplicate', tone: 'warning', bar: 'bg-orange-500' },
]

function StatusBreakdown({ counts = {}, emptyLabel = 'Nothing to show yet.' }) {
  const rows = STATUS_META.map((meta) => ({ ...meta, value: counts[meta.key] || 0 })).filter(
    (row) => row.value > 0
  )
  const total = rows.reduce((sum, row) => sum + row.value, 0)

  if (total === 0) {
    return <p className="text-sm text-slate-500">{emptyLabel}</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100" role="img" aria-label="Complaints by status">
        {rows.map((row) => (
          <span
            key={row.key}
            className={row.bar}
            style={{ width: `${(row.value / total) * 100}%` }}
            title={`${row.label}: ${row.value}`}
          />
        ))}
      </div>

      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-3">
            <Badge tone={row.tone} size="sm" dot>
              {row.label}
            </Badge>
            <span className="text-sm font-medium text-slate-800">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default StatusBreakdown
export { STATUS_META }
