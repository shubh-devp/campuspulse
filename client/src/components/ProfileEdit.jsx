import { useState } from 'react'
import api from '../api'
import { getToken } from '../auth'
import { Button, Input } from './ui'

function ProfileEdit({ profile, onProfileUpdated }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: '', department: '', phone: '' })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const token = getToken()
  const authConfig = { headers: { Authorization: `Bearer ${token}` } }

  function startEdit() {
    setForm({ name: profile.name || '', department: profile.department || '', phone: profile.phone || '' })
    setEditing(true)
    setMessage('')
    setError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const response = await api.patch('/users/profile', form, authConfig)
      setEditing(false)
      setMessage('Profile updated')
      onProfileUpdated(response.data.user)
    } catch (err) {
      setError(err.response?.data?.message || 'Could not update profile')
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <Button variant="secondary" onClick={startEdit}>
        Edit profile
      </Button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Input
          label="Name"
          name="name"
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
          required
        />
        <Input
          label="Department"
          name="department"
          value={form.department}
          onChange={(event) => setForm({ ...form, department: event.target.value })}
        />
        <Input
          label="Phone"
          name="phone"
          value={form.phone}
          onChange={(event) => setForm({ ...form, phone: event.target.value })}
        />
      </div>

      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" variant="primary" loading={saving}>
          Save changes
        </Button>
        <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function ChangePassword({ onSuccess }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const token = getToken()
  const authConfig = { headers: { Authorization: `Bearer ${token}` } }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    setError('')

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters')
      setSaving(false)
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      setSaving(false)
      return
    }

    try {
      await api.patch(
        '/users/change-password',
        { current_password: currentPassword, new_password: newPassword },
        authConfig
      )
      setMessage('Password changed successfully')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not change password')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Input
          type="password"
          label="Current password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          required
        />
        <Input
          type="password"
          label="New password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          required
        />
        <Input
          type="password"
          label="Confirm new password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
        />
      </div>

      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" variant="primary" loading={saving}>
        Change password
      </Button>
    </form>
  )
}

export { ProfileEdit, ChangePassword }
