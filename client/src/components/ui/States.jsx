import { Spinner } from './Spinner'
import { Button } from './Button'

function LoadingBlock({ label = 'Loading…', className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-12 ${className}`} role="status">
      <Spinner size="md" />
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  )
}

function EmptyState({ title, description, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 py-12 text-center ${className}`}>
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

function ErrorState({ title = 'Could not load this data', message, onRetry, className = '' }) {
  return (
    <div
      className={`rounded-lg border border-red-200 bg-red-50 px-5 py-4 ${className}`}
      role="alert"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-red-800">{title}</p>
          {message && <p className="mt-1 text-sm text-red-700">{message}</p>}
      </div>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    </div>
  )
}

export { LoadingBlock, EmptyState, ErrorState }
