import { useState } from 'react'
import api from '../api'
import { getToken } from '../auth'
import { Button } from './ui'

// Reply tools for staff and admin: a summary and a draft response. Everything here
// comes back as plain text and is only displayed, so nothing is sent and nothing
// changes the complaint.
function AiTools({ complaintId }) {
  const [summary, setSummary] = useState('')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  async function generate(kind, path, setResult) {
    setError('')
    setBusy(kind)

    try {
      const response = await api.post(
        `/complaints/${complaintId}/${path}`,
        {},
        { headers: { Authorization: `Bearer ${getToken()}` } }
      )
      setResult(response.data[kind])
    } catch (err) {
      setError(err.response?.data?.message || 'Could not generate the text, please try again')
    } finally {
      setBusy('')
    }
  }

  const working = busy !== ''

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => generate('summary', 'summary', setSummary)}
          loading={busy === 'summary'}
          disabled={working}
        >
          Generate summary
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => generate('draft', 'response-draft', setDraft)}
          loading={busy === 'draft'}
          disabled={working}
        >
          Draft response
        </Button>
      </div>

      {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {summary && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Summary — from this complaint&apos;s data
          </p>
          <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-700">{summary}</p>
        </div>
      )}

      {draft && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-800">
            Draft response — review before sending
          </p>
          <p className="mt-1.5 whitespace-pre-wrap text-sm text-amber-900">{draft}</p>
        </div>
      )}
    </div>
  )
}

export default AiTools
