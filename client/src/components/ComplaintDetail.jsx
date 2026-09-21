import { imageUrl } from '../api'
import { Card } from './ui'
import StatusTimeline from './StatusTimeline'
import { StatusBadge, PriorityBadge, CategoryBadge } from './Badges'

// The shared complaint record. Every role renders this and then adds its own
// action panel through `children`, so a complaint looks the same everywhere.
//
// Sections: summary, duplicate/cluster notices, description, complaint details,
// auto-triage, images, status history, feedback, then the caller's actions.
function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5 py-2">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-800">{children || '—'}</dd>
    </div>
  )
}

function Tag({ children, tone = 'slate' }) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    sky: 'bg-sky-50 text-sky-700 ring-sky-200',
    slate: 'bg-slate-50 text-slate-700 ring-slate-200',
  }
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}>
      {children}
    </span>
  )
}

function ComplaintDetail({
  complaint,
  statusHistory = [],
  images = [],
  aiPrediction = null,
  entities = { locations: [], facilities: [] },
  duplicateWarning = null,
  cluster = null,
  feedback = [],
  historyTitle = 'Status history',
  onClose,
  children,
}) {
  const locations = entities?.locations || []
  const facilities = entities?.facilities || []
  const hasEntities = locations.length > 0 || facilities.length > 0

  return (
    <div className="space-y-5 text-sm">
      {/* Summary */}
      <Card padding="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">
              <span className="text-slate-400">#{complaint.id}</span> {complaint.title}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Reported {new Date(complaint.created_at).toLocaleString()}
              {complaint.reporter_name ? ` · by ${complaint.reporter_name}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={complaint.status} />
            <PriorityBadge priority={complaint.priority} />
            <CategoryBadge category={complaint.category} />
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* Duplicate notice */}
      {duplicateWarning && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-900">
            Possible duplicate of complaint #{duplicateWarning.complaint_id}
          </p>
          {duplicateWarning.similarity !== null && duplicateWarning.similarity !== undefined && (
            <p className="mt-0.5 text-sm text-amber-800">
              {Math.round(duplicateWarning.similarity * 100)}% similar to that complaint.
            </p>
          )}
        </div>
      )}

      {/* Cluster notice */}
      {cluster && cluster.complaint_count > 1 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm text-slate-700">
            Part of cluster <span className="font-medium">#{cluster.id} {cluster.title}</span> —{' '}
            {cluster.complaint_count} complaints about the same problem.
          </p>
        </div>
      )}

      {/* Description */}
      <Card title="Description">
        {complaint.description ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{complaint.description}</p>
        ) : (
          <p className="text-sm text-slate-500">No description was provided.</p>
        )}
      </Card>

      {/* Complaint information + auto-triage */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Complaint information">
          <dl className="divide-y divide-slate-100">
            <Field label="Location">{complaint.location || 'Not specified'}</Field>
            <Field label="Reported">{new Date(complaint.created_at).toLocaleString()}</Field>
            <Field label="Last updated">
              {complaint.updated_at ? new Date(complaint.updated_at).toLocaleString() : '—'}
            </Field>
            {complaint.resolved_at && (
              <Field label="Resolved">{new Date(complaint.resolved_at).toLocaleString()}</Field>
            )}
            <Field label="Assigned to">{complaint.assigned_staff_name || 'Unassigned'}</Field>
          </dl>
        </Card>

        <Card title="Auto-triage" description="Predicted from the complaint text and photo.">
          {aiPrediction ? (
            <>
              <dl className="divide-y divide-slate-100">
                <Field label="Predicted category">{aiPrediction.category || 'Not available'}</Field>
                <Field label="Predicted priority">{aiPrediction.priority || 'Not available'}</Field>
                <Field label="Confidence">
                  {aiPrediction.confidence !== null && aiPrediction.confidence !== undefined
                    ? `${Math.round(aiPrediction.confidence * 100)}%`
                    : 'Not available'}
                </Field>
              </dl>

              {hasEntities && (
                <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                  {locations.length > 0 && (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Places detected</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {locations.map((location) => (
                          <Tag key={location} tone="emerald">{location}</Tag>
                        ))}
                      </div>
                    </div>
                  )}
                  {facilities.length > 0 && (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Facilities detected</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {facilities.map((facility) => (
                          <Tag key={facility} tone="sky">{facility}</Tag>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-500">This complaint has not been analysed yet.</p>
          )}
        </Card>
      </div>

      {/* Images */}
      {images.length > 0 && (
        <Card title="Photos" description={`${images.length} attached to this complaint.`}>
          <div className="flex flex-wrap gap-3">
            {images.map((image) => (
              <a
                key={image.id}
                href={imageUrl(image.file_url)}
                target="_blank"
                rel="noreferrer"
                className="group block w-32"
              >
                <img
                  src={imageUrl(image.file_url)}
                  alt={image.file_name}
                  className="h-32 w-32 rounded-md border border-slate-200 object-cover transition-opacity group-hover:opacity-90"
                />
              </a>
            ))}
          </div>
        </Card>
      )}

      {/* Status history */}
      <Card title={historyTitle}>
        <StatusTimeline entries={statusHistory} />
      </Card>

      {/* Feedback */}
      {feedback.length > 0 && (
        <Card title="Feedback">
          <ul className="space-y-3">
            {feedback.map((entry) => (
              <li key={entry.id} className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-900">{entry.reviewer_name}</span>
                  <span className="text-xs text-slate-500">{new Date(entry.created_at).toLocaleString()}</span>
                </div>
                <p className="mt-1 text-sm text-amber-600">
                  {'★'.repeat(entry.rating)}
                  <span className="text-slate-300">{'★'.repeat(5 - entry.rating)}</span>
                </p>
                {entry.comment && <p className="mt-1 text-sm text-slate-600">{entry.comment}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Caller's action panels */}
      {children}
    </div>
  )
}

export default ComplaintDetail
