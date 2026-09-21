import { Link } from 'react-router-dom'

const DOT_CLASSES = {
  neutral: 'bg-slate-300',
  info: 'bg-sky-500',
  violet: 'bg-violet-500',
  warning: 'bg-amber-500',
  success: 'bg-emerald-500',
  danger: 'bg-red-500',
}


function StatCard({ label, value, hint, tone = 'neutral', to, className = '' }) {
  const content = (
    <>
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASSES[tone] || DOT_CLASSES.neutral}`} aria-hidden="true" />
        <p className="truncate text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value ?? '—'}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </>
  )

  const classes = `block rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${className}`

  if (!to) {
    return <div className={classes}>{content}</div>
  }

  return (
    <Link to={to} className={`${classes} transition-colors hover:border-slate-300 hover:bg-slate-50`}>
      {content}
  </Link>
)
}

export { StatCard }
