
function Card({ title, description, actions, children, className = '', bodyClassName = '', padding = 'p-5' }) {
  const hasHeader = Boolean(title || description || actions)
  const  flush = padding=== 'p-0'

  return (
    <section
      className={`rounded-lg border border-slate-200 bg-white shadow-sm ${flush ? 'overflow-hidden' : ''} ${className}`}
    >
      {hasHeader && (
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
             {title && <h3 className="text-sm font-semibold text-slate-900">{title}</h3>}
            {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={`${padding} ${bodyClassName}`}>{children}</div>
      </section>
  )
}

export { Card }
