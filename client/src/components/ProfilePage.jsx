import { useEffect, useState } from 'react'
import api from '../api'
import { getToken, roleCrumb } from '../auth'
import PageHeader from './PageHeader'
import { ProfileEdit, ChangePassword } from './ProfileEdit'
import { Card, EmptyState, LoadingBlock, ErrorState } from './ui'

const fieldsFor = (profile) => [
  { label: 'Name', value: profile.name },
  { label: 'Email', value: profile.email },
  { label: 'Role', value: profile.role },
  { label: 'Department', value: profile.department || 'Not specified' },
  { label: 'Phone', value: profile.phone || 'Not provided' },
  { label: 'Created', value: new Date(profile.created_at).toLocaleDateString() },
]


function ProfilePage({ role = 'student' }) {
  const token = getToken()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const authConfig = { headers: { Authorization: `Bearer ${token}` } }

  async function loadProfile() {
    if (!token) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const response = await api.get('/users/me', authConfig)
      setProfile(response.data.user)
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load your profile')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProfile()
  }, [token])

  const crumbs = [roleCrumb(role), { label: 'Profile' }]

  if (loading) {
    return <LoadingBlock label="Loading your profile…" />
  }

  if (error) {
    return (
      <div className="space-y-5">
        <PageHeader title="Profile" crumbs={crumbs} />
        <ErrorState message={error} onRetry={loadProfile} />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="space-y-5">
        <PageHeader title="Profile" crumbs={crumbs} />
        <Card>
          <EmptyState title="Profile not found" description="Your account details could not be loaded." />
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Profile" description="Your account details." crumbs={crumbs} />

      <Card
        title="Personal information"
        actions={<ProfileEdit profile={profile} onProfileUpdated={setProfile} />}
      >
        <dl className="grid gap-4 sm:grid-cols-2">
          {fieldsFor(profile).map((field) => (
            <div key={field.label}>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{field.label}</dt>
              <dd className="mt-0.5 text-sm text-slate-800">{field.value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card title="Password" description="Use at least 6 characters.">
        <ChangePassword onSuccess={() => {}} />
      </Card>
    </div>
  )
}

export default ProfilePage
