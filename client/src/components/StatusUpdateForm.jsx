import { useState } from 'react'
import api from '../api'
import { Button } from './ui'


const ALLOWED_TRANSITIONS = {
  open: ['assigned', 'rejected', 'duplicate'],
  assigned: ['in_progress', 'rejected', 'duplicate'],
  in_progress: ['resolved', 'reopened'],
  resolved: ['closed'],
  closed: ['reopened'],
  reopened: ['assigned', 'in_progress'],
  rejected: [],
  duplicate: [],
}

const ACTION_LABELS = {
  assigned: 'Take ownership',
  in_progress: 'Start Work',
  resolved: 'Mark Resolved',
  closed: 'Close Complaint',
  reopened: 'Reopen',
  rejected: 'Reject',
  duplicate: 'Mark Duplicate',
}

function StatusUpdateForm({ complaint, token, onUpdated }) {
  const options = ALLOWED_TRANSITIONS[complaint.status] || []
  const [status, setStatus] = useState(options[0] || '')
  const [note, setNote] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setMessage('')
    setError('')
    setSaving(true)

    try {
      const response = await api.patch(
        `/complaints/${complaint.id}/status`,
        { status, note },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setMessage(response.data.message || 'Status updated')
      setNote('')
      onUpdated()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not update the status')
    } finally {
      setSaving(false)
    }
  }

  if (options.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        This complaint is {complaint.status.replace('_', ' ')} and cannot move to another status.
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Choose the next step</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setStatus(option)}
              aria-pressed={option === status}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                option === status
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                  : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {ACTION_LABELS[option] || option.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700" htmlFor="status-note">
          Note <span className="font-normal text-slate-400">(optional, shown in the timeline)</span>
        </label>
        <input
          id="status-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Technician dispatched, parts ordered…"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" variant="primary" loading={saving}>
        {ACTION_LABELS[status] || 'Update status'}
      </Button>
    </form>
  )
}

export default StatusUpdateForm
export { ALLOWED_TRANSITIONS, ACTION_LABELS }
