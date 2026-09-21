
// complaint sits: Assigned -> In Progress -> Resolved -> Closed.
const STEPS = [
  { key: 'assigned', label: 'Assigned' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'closed', label: 'Closed' },
]

export function stepIndexFor(status) {
  if (status === 'open' || status === 'assigned') return 0
  if (status === 'in_progress' || status === 'reopened') return 1
  if (status === 'resolved') return 2
  if (status === 'closed') return 3
  return -1
}

function WorkflowSteps({ status, className = '' }) {
  const current = stepIndexFor(status)

  if (current === -1) {
    return (
      <p className={`text-sm text-slate-500 ${className}`}>
        This complaint left the normal workflow and is marked {status.replace('_', ' ')}.
      </p>
    )
  }

  return (
    <ol className={`flex flex-wrap items-center gap-y-2 ${className}`} aria-label="Workflow progress">
      {STEPS.map((step, index) => {
        const done = index <= current
        return (
          <li key={step.key} className="flex items-center">
            {index > 0 && (
              <span
                className={`mx-2 hidden h-px w-6 sm:block sm:w-10 ${index <= current ? 'bg-indigo-300' : 'bg-slate-200'}`}
                aria-hidden="true"
              />
            )}
            <span className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${done ? 'bg-indigo-600' : 'bg-slate-300'}`}
                aria-hidden="true"
              />
              <span
                className={`text-xs font-medium ${done ? 'text-slate-900' : 'text-slate-400'} ${
                  index === current ? 'font-semibold' : ''
                }`}
              >
                {step.label}
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export default WorkflowSteps
