import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, Badge } from './ui'

// How many items a group shows before it is folded away. Insights are only
// useful if you can read them, and an eight-item list per group buries the page.
const VISIBLE_ITEMS = 3

function InsightItem({ item }) {
  return (
    <li className="rounded-md border border-slate-200 bg-white p-3">
      <p className="text-sm font-medium text-slate-900">{item.title}</p>
      <p className="mt-0.5 text-sm text-slate-600">{item.detail}</p>

      {/* The figures the sentence was built from, so the claim can be checked */}
      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {item.evidence.map((entry) => (
          <div key={entry.label} className="flex items-baseline gap-1.5">
            <dt className="text-[11px] uppercase tracking-wide text-slate-400">{entry.label}</dt>
            <dd className="text-xs font-semibold text-slate-700">{entry.value}</dd>
          </div>
        ))}
      </dl>

      {item.to && (
        <Link to={item.to} className="mt-2 inline-block text-xs font-medium text-indigo-600 hover:underline">
          Open the cluster
        </Link>
      )}
    </li>
  )
}

function InsightGroup({ group }) {
  const [expanded, setExpanded] = useState(false)
  const hidden = group.items.length - VISIBLE_ITEMS
  const items = expanded ? group.items : group.items.slice(0, VISIBLE_ITEMS)

  return (
    <section>
      <h3 className="text-sm font-semibold text-slate-900">{group.title}</h3>
      <p className="mt-0.5 text-xs text-slate-500">{group.description}</p>

      {group.items.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed border-slate-200 p-3 text-sm text-slate-500">
          {group.empty}
        </p>
      ) : (
        <>
          <ul className="mt-3 space-y-2">
            {items.map((item, index) => (
              <InsightItem key={`${item.title}-${index}`} item={item} />
            ))}
          </ul>

          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
              className="mt-2 text-xs font-medium text-indigo-600 hover:underline"
            >
              {expanded ? 'Show fewer' : `Show ${hidden} more`}
            </button>
          )}
        </>
      )}
    </section>
  )
}

/**
 * Patterns found in the complaint data. Every item carries the numbers it was
 * derived from, so nothing here has to be taken on trust.
 *
 * These are campus-wide on purpose: the filters on the page narrow the charts,
 * but a pattern like "this area is getting worse" is only meaningful over the
 * whole set.
 */
function AiInsights({ insights }) {
  if (!insights || insights.groups.length === 0) {
    return null
  }

  return (
    <Card
      title="Issue insights"
      description={`Patterns in the complaint data. Each one shows the figures behind it. These are campus-wide, so the filters above do not change them. A change compares the last ${insights.windowDays} days with the ${insights.windowDays} before.`}
    >
      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {insights.groups.map((group) => (
          <InsightGroup key={group.key} group={group} />
        ))}
      </div>
    </Card>
  )
}

// How each outcome of the retraining workflow is described to an admin
const DECISIONS = {
  promote: { label: 'A better model was found', tone: 'success' },
  keep_current: { label: 'The model in use is still better', tone: 'neutral' },
  insufficient_data: { label: 'Not enough labelled rows yet', tone: 'warning' },
  no_current_model: { label: 'No model to compare against', tone: 'info' },
}

// What the model predicted, what actually happened, and whether a candidate has been
// measured against the model in use. Nothing is retrained automatically.
function AiLearningLoop({ feedback }) {
  if (!feedback) {
    return null
  }

  const dataset = feedback.dataset || {}
  const evaluation = feedback.lastEvaluation
  const decision = evaluation ? DECISIONS[evaluation.decision] || { label: evaluation.decision, tone: 'neutral' } : null

  const cells = [
    { label: 'Complaints with a prediction', value: dataset.with_prediction, hint: 'Stored model output' },
    { label: 'Corrected by a person', value: (dataset.corrected_categories || 0) + (dataset.corrected_priorities || 0), hint: 'Independent labels' },
    { label: 'With student feedback', value: dataset.with_feedback, hint: `Rated ${dataset.average_rating ?? '—'} out of 5` },
    { label: 'Average confidence', value: dataset.average_confidence ?? '—', hint: 'Across stored predictions' },
  ]

  return (
    <Card
      title="Model feedback"
      description="Every prediction is kept next to what actually happened, what a person corrected and what the student rated. That is the data a retrained model is measured against."
    >
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cells.map((cell) => (
          <div key={cell.label} className="rounded-md border border-slate-200 p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{cell.label}</dt>
            <dd className="mt-1 text-xl font-semibold text-slate-900">{cell.value ?? '—'}</dd>
            <p className="mt-0.5 text-xs text-slate-500">{cell.hint}</p>
          </div>
        ))}
      </dl>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Last retraining check</h3>
          {decision && <Badge tone={decision.tone}>{decision.label}</Badge>}
        </div>

        {!evaluation ? (
          <p className="mt-2 text-sm text-slate-600">
            Not run yet. Export the dataset and evaluate a candidate model when there are enough labelled
            rows to compare honestly.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-600">
              {evaluation.test_rows
                ? `Measured on ${evaluation.test_rows} held-out rows on ${new Date(evaluation.generated_at).toLocaleString()}.`
                : `Checked on ${new Date(evaluation.generated_at).toLocaleString()}, before any rows were held back.`}
              {evaluation.promoted
                ? ' The candidate was better and has replaced the model in use.'
                : ' The model in use has not been changed.'}
            </p>

            {/* A run with too few labels stops before training, so there is nothing
                to compare and no boxes to show */}
            {evaluation.candidate_model && (
              <div className="mt-3 flex flex-wrap gap-4">
                <div className="rounded-md border border-slate-200 px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Model in use</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {evaluation.current_model?.accuracy ?? '—'} accuracy
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Candidate</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {evaluation.candidate_model.accuracy} accuracy
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Trained on</p>
                  <p className="text-sm font-semibold text-slate-900">{evaluation.train_rows} rows</p>
                </div>
              </div>
            )}

            {(evaluation.notes || []).length > 0 && (
              <ul className="mt-3 space-y-1">
                {evaluation.notes.map((note) => (
                  <li key={note} className="text-xs text-slate-500">
                    {note}
                  </li>
                ))}
              </ul>
            )}

            {evaluation.label_sources?.human_corrected !== undefined && (
              <p className="mt-3 text-xs text-slate-500">
                Labels used: {evaluation.dataset_rows} rows, of which{' '}
                {evaluation.label_sources.human_corrected || 0} were corrected by a person and{' '}
                {evaluation.label_sources.ai_uncorrected || 0} carry the model&apos;s own answer.
              </p>
            )}
          </>
        )}

        {(dataset.corrections || []).length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">What has been corrected</p>
            <ul className="mt-2 space-y-1">
              {dataset.corrections.map((row) => (
                <li key={`${row.field}-${row.predicted_value}-${row.corrected_value}`} className="text-sm text-slate-600">
                  {row.field}: predicted{' '}
                  <span className="text-slate-500">{row.predicted_value || 'nothing'}</span>, set to{' '}
                  <span className="font-medium text-slate-800">{row.corrected_value}</span>{' '}
                  <span className="text-xs text-slate-400">({row.count})</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-4 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
          To run a check: <code className="font-mono">npm run export:dataset</code> in <code className="font-mono">server/</code>,
          then <code className="font-mono">python ai/evaluate_model.py</code>. Add <code className="font-mono">--promote</code>{' '}
          to let a better candidate replace the model in use. Without it nothing is ever overwritten.
        </p>
      </div>
    </Card>
  )
}

export default AiInsights
export { AiLearningLoop }
