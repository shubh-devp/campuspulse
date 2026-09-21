import { Link } from 'react-router-dom'
import { StatusBadge, PriorityBadge, CategoryBadge } from '../Badges'

// The compact complaint summary used in lists. `to` turns the whole card into a
// link; without it the card is just a static block.
function ComplaintCard({ complaint, to, footer }) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900">
            <span className="text-slate-400">#{complaint.id}</span> {complaint.title}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {complaint.location || 'No location'}
          </p>
        </div>
        <StatusBadge status={complaint.status} size="sm" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <PriorityBadge priority={complaint.priority} />
        <CategoryBadge category={complaint.category} />
        <span className="ml-auto text-xs text-slate-500">
          {new Date(complaint.created_at).toLocaleDateString()}
        </span>
      </div>

      {footer}
    </>
  )

  const classes = 'block rounded-lg border border-slate-200 bg-white p-4 shadow-sm'

  if (!to) {
    return <div className={classes}>{content}</div>
  }

  return (
    <Link to={to} className={`${classes} transition-colors hover:border-slate-300 hover:bg-slate-50`}>
      {content}
    </Link>
  )
}

export default ComplaintCard
