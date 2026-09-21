import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'
import { getToken } from '../auth'
import PageHeader from '../components/PageHeader'
import { StatusBadge, PriorityBadge } from '../components/Badges'
import { Card, StatCard, Button, Alert, LoadingBlock, EmptyState, ErrorState } from '../components/ui'

// Quick links to the rest of the admin section
const SECTIONS = [
  {
    to: '/admin/complaints',
    label: 'Complaints',
    description: 'Search, filter and manage every complaint',
    tone: 'info',
  },
  {
    to: '/admin/clusters',
    label: 'Issue Clusters',
    description: 'Recurring problems grouped together',
    tone: 'violet',
  },
  {
    to: '/admin/staff',
    label: 'Staff',
    description: 'Accounts and current workload',
    tone: 'success',
  },
  {
    to: '/admin/analytics',
    label: 'Analytics',
    description: 'Volume, distribution and resolution metrics',
    tone: 'warning',
  },
]

// Step 1 of the admin flow: where the complaints stand, at a glance
function AdminDashboard() {
  const token = getToken()
  const [stats, setStats] = useState(null)
  const [staff, setStaff] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const authConfig = { headers: { Authorization: `Bearer ${token}` } }

  async function loadAll() {
    setLoading(true)
    setError('')
    try {
      const [dashboardResponse, staffResponse] = await Promise.all([
        api.get('/complaints/admin/dashboard', authConfig),
        api.get('/users/staff', authConfig),
      ])
      setStats(dashboardResponse.data.stats || null)
      setStaff(staffResponse.data.staff || [])
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load dashboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  if (loading) {
    return <LoadingBlock label="Loading dashboard…" />
  }

  if (error && !stats) {
    return <ErrorState title="Could not load the dashboard" message={error} onRetry={loadAll} />
  }

  const avgResolution =
    stats?.avg_resolution_days !== null && stats?.avg_resolution_days !== undefined
      ? `${stats.avg_resolution_days}d`
      : '—'

  const sectionValues = {
    Complaints: stats?.total,
    'Issue Clusters': stats?.active_clusters,
    Staff: staff.length,
    Analytics: avgResolution,
  }

  const recent = stats?.recent_complaints || []

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        description="An overview of campus complaints and where they stand."
        crumbs={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Dashboard' }]}
        actions={
          <Link to="/admin/complaints">
            <Button variant="primary">Manage Complaints</Button>
          </Link>
        }
      />

      {error && (
        <Alert type="error" title="Some data could not be refreshed" onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <StatCard label="Total" value={stats?.total} tone="neutral" hint="All complaints" />
        <StatCard label="Open" value={stats?.open} tone="info" hint="Not started yet" />
        <StatCard label="Assigned" value={stats?.assigned} tone="violet" hint="With a staff member" />
        <StatCard label="In Progress" value={stats?.in_progress} tone="warning" hint="Being worked on" />
        <StatCard label="Resolved" value={stats?.resolved} tone="success" hint="Resolved or closed" />
        <StatCard label="Urgent" value={stats?.urgent} tone="danger" hint="Highest priority" />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="High priority" value={stats?.high} tone="warning" hint="Priority flagged high" />
        <StatCard label="Active clusters" value={stats?.active_clusters} tone="violet" hint="Open issue groups" />
        <StatCard label="Avg resolution" value={avgResolution} tone="neutral" hint="Resolved or closed" />
        <StatCard label="Total staff" value={staff.length} tone="info" hint="Staff accounts" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SECTIONS.map((section) => (
          <StatCard
            key={section.to}
            label={section.label}
            value={sectionValues[section.label]}
            hint={section.description}
            tone={section.tone}
            to={section.to}
          />
        ))}
      </div>

      <Card
        title="Recently reported"
        description="The most recent complaints reported on campus."
        padding="p-0"
        actions={
          <Link to="/admin/complaints">
            <Button size="sm" variant="ghost">View all</Button>
          </Link>
        }
      >
        {recent.length === 0 ? (
          <EmptyState
            title="No complaints yet"
            description="New complaints will appear here as students report them."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {recent.map((complaint) => (
              <li key={complaint.id}>
                <Link
                  to={`/admin/complaints/${complaint.id}`}
                  className="flex flex-wrap items-center gap-3 px-5 py-3 transition-colors hover:bg-slate-50"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                    <span className="text-slate-400">#{complaint.id}</span> {complaint.title}
                  </span>
                  <PriorityBadge priority={complaint.priority} />
                  <StatusBadge status={complaint.status} size="sm" />
                  <span className="text-xs text-slate-500">
                    {new Date(complaint.created_at).toLocaleDateString()}
                    {complaint.reporter_name ? ` · ${complaint.reporter_name}` : ''}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

export default AdminDashboard
