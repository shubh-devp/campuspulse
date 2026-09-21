const TONE_CLASSES = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
}

const DOT_CLASSES = {
  neutral: 'bg-slate-400',
  info: 'bg-sky-500',
  violet: 'bg-violet-500',
  warning: 'bg-amber-500',
  success: 'bg-emerald-500',
  danger: 'bg-red-500',
}

function Badge({ tone = 'neutral', size = 'md', dot = false, children, className = '' }) {
  const sizeClasses = size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs'

  return (
  <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full ring-1 ring-inset ${
        TONE_CLASSES[tone] || TONE_CLASSES.neutral
      } ${sizeClasses} font-medium ${className}`}
  >
    {dot && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT_CLASSES[tone] || DOT_CLASSES.neutral}`} aria-hidden="true" />}
      {children}
  </span>
  )
}

export { Badge, TONE_CLASSES, DOT_CLASSES }
