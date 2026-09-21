import { useState } from 'react'
import api from '../api'
import { Button, Select, Textarea } from './ui'

// Mirrors the lists the API accepts, which are the same lists the classifier is
// limited to. Offering anything else would let a person invent a category the
// pipeline could never have produced.
const CATEGORY_OPTIONS = ['Infrastructure', 'IT & Network', 'Sanitation', 'Electrical', 'General'].map(
  (category) => ({ value: category, label: category })
)

const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'].map((priority) => ({
  value: priority,
  label: priority.charAt(0).toUpperCase() + priority.slice(1),
}))

// Lets a staff member or an admin overrule what the classifier decided. Saving does
// not touch the stored prediction: the disagreement is written to ai_feedback so the
// model's answer and the human's answer can be compared later.
function ClassificationCorrection({ complaint, token, onCorrected }) {
  const [category, setCategory] = useState(complaint.category || '')
  const [priority, setPriority] = useState(complaint.priority || '')
  const [note, setNote] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const changed = category !== (complaint.category || '') || priority !== (complaint.priority || '')

  async function handleSubmit(event) {
    event.preventDefault()
    setMessage('')
    setError('')
    setSaving(true)

    try {
      const response = await api.patch(
        `/complaints/${complaint.id}/classification`,
        { category, priority, note },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setMessage(response.data.message || 'Correction saved')
      setNote('')
      // The page merges the updated category and priority in rather than refetching,
      // so this card stays on screen and the confirmation above is actually readable
      onCorrected(response.data.complaint)
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save the correction')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-slate-600">
        Disagree with what the classifier decided? Set what it should have been. The prediction is kept as it
        is, so the two can be compared later.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          options={CATEGORY_OPTIONS}
          placeholder={null}
        />
        <Select
          label="Priority"
          value={priority}
          onChange={(event) => setPriority(event.target.value)}
          options={PRIORITY_OPTIONS}
          placeholder={null}
        />
      </div>

      <Textarea
        label="Why (optional)"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Lab equipment counts as IT, not general."
        rows={2}
      />

      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" variant="secondary" loading={saving} disabled={!changed}>
        Save correction
      </Button>
    </form>
  )
}

export default ClassificationCorrection
