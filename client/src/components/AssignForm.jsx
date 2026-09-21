import { useState } from 'react'
import api from '../api'
import { Button } from './ui'

// Content only: the page wraps this in a Card.
function AssignForm({ complaint, staff, token, onAssigned }) {
  const [staffId, setStaffId] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setMessage('')
    setError('')
    setSaving(true)
    try {
      const response = await api.post(
        `/complaints/${complaint.id}/assign`,
        { staff_id: Number(staffId) },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setMessage(response.data.message || 'Assigned')
      setStaffId('')
      onAssigned()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not assign')
    } finally {
      setSaving(false)
    }
  }

  if (staff.length === 0) {
    return <p className="text-sm text-slate-500">No staff accounts are available to assign.</p>
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm text-slate-600">
        Currently assigned to{' '}
        <span className="font-medium text-slate-800">{complaint.assigned_staff_name || 'nobody'}</span>.
      </p>

      <div>
        <label className="block text-sm font-medium text-slate-700" htmlFor="assign-staff">
          Assign to
        </label>
        <select
          id="assign-staff"
          value={staffId}
          onChange={(event) => setStaffId(event.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Choose a staff member</option>
          {staff.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
              {member.department ? ` — ${member.department}` : ''}
              {member.active !== undefined ? ` — ${member.active} active` : ''}
            </option>
          ))}
        </select>
      </div>

      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" variant="primary" disabled={!staffId} loading={saving}>
        Assign
      </Button>
    </form>
  )
}

export default AssignForm
