import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'
import { getToken, getStoredUser } from '../auth'
import PageHeader from '../components/PageHeader'
import { Card, Button, Badge, StatCard, Alert } from '../components/ui'

// A complaint that still needs somebody to act on it
const ACTIVE_STATUSES = ['open', 'assigned', 'in_progress', 'reopened']
const DONE_STATUSES = ['resolved', 'closed']

// What the home page shows once somebody is signed in. One entry per role, so
// nothing meant for one role can leak into another.
const ROLE_HOME = {
  student: {
    description: 'Report a campus problem and follow it until it is fixed.',
    cta: { to: '/student/report', label: 'Report an Issue' },
    actions: [
      {
        to: '/student/report',
        label: 'Report an issue',
        text: 'Describe the problem, add the location and attach a photo if you have one.',
      },
      {
        to: '/student/complaints',
        label: 'Track my complaints',
        text: 'See where each complaint has reached and read the full status history.',
      },
      {
        to: '/student/notifications',
        label: 'Notifications',
        text: 'Updates are recorded here every time the status of a complaint changes.',
      },
    ],
    workflow: [
      'Report the issue with a location, and a photo if you have one.',
      'It gets a suggested category and priority from what you wrote.',
      'An admin assigns it to the staff member who handles that kind of work.',
      'You are notified at every status change until it is resolved.',
      'Rate the fix afterwards so recurring problems are visible.',
    ],
  },
  staff: {
    description: 'Work through the complaints assigned to you, from start to finish.',
    cta: { to: '/staff/assigned', label: 'Open My Queue' },
    actions: [
      {
        to: '/staff/assigned',
        label: 'Assigned to me',
        text: 'New work waiting for you to pick it up and start.',
      },
      {
        to: '/staff/in-progress',
        label: 'In progress',
        text: 'Complaints you have started but not finished yet.',
      },
      {
        to: '/staff/resolved',
        label: 'Resolved',
        text: 'Work you have completed, kept for your own record.',
      },
    ],
    workflow: [
      'New work appears in Assigned as soon as an admin sends it to you.',
      'Start work to move a complaint to In Progress.',
      'The workspace shows the complaint, the triage result and any photos.',
      'Mark it Resolved once the problem is actually fixed on site.',
      'An admin closes it after the student confirms.',
    ],
  },
  admin: {
    description: 'Monitor the whole campus, route work to staff and spot recurring problems.',
    cta: { to: '/admin/complaints', label: 'Manage Complaints' },
    actions: [
      {
        to: '/admin/complaints',
        label: 'Complaints',
        text: 'Search and filter everything reported, then assign or change status.',
      },
      {
        to: '/admin/clusters',
        label: 'Issue clusters',
        text: 'Problems reported again and again, grouped by place and category.',
      },
      {
        to: '/admin/staff',
        label: 'Staff and workload',
        text: 'Register staff accounts and check who is carrying how much.',
      },
      {
        to: '/admin/analytics',
        label: 'Analytics',
        text: 'Volume over time, category split, locations and resolution time.',
      },
    ],
    workflow: [
      'Watch volume and priority on the dashboard.',
      'Open a complaint to assign it to staff or move its status along.',
      'Group recurring problems in Issue Clusters so they get fixed at the source.',
      'Check staff workload before assigning more work.',
      'Use Analytics to see where complaints come from and how long fixes take.',
    ],
  },
}

// The numbers on the home tiles, counted from the complaints this user can see
function statusCounts(rows) {
  const isActive = (row) => ACTIVE_STATUSES.includes(row.status)

  return {
    total: rows.length,
    waiting: rows.filter((row) => row.status === 'assigned').length,
    working: rows.filter((row) => row.status === 'in_progress' || row.status === 'reopened').length,
    active: rows.filter(isActive).length,
    done: rows.filter((row) => DONE_STATUSES.includes(row.status)).length,
    urgent: rows.filter((row) => row.priority === 'urgent' && isActive(row)).length,
  }
}

function Home() {
  const token = getToken()
  const user = getStoredUser()
  const role = user?.role
  const signedIn = Boolean(token && role)

  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // One small read from the endpoint that belongs to this role, so the numbers
  // on this page are the same ones the rest of the app uses.
  useEffect(() => {
    if (!signedIn) {
      return
    }

    let cancelled = false
    const config = { headers: { Authorization: `Bearer ${token}` } }

    async function loadSummary() {
      setLoading(true)
      setError('')
      try {
        if (role === 'admin') {
          const response = await api.get('/complaints/admin/dashboard', config)
          if (!cancelled) setSummary(response.data.stats)
        } else {
          const path = role === 'staff' ? '/complaints/assigned' : '/complaints/my'
          const response = await api.get(path, config)
          if (!cancelled) setSummary(statusCounts(response.data.complaints || []))
        }
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || 'Could not load your summary')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadSummary()
    return () => {
      cancelled = true
    }
  }, [signedIn, role, token])

  if (!signedIn) {
    return <SignedOutHome />
  }

  const content = ROLE_HOME[role] || ROLE_HOME.student

  const tiles = {
    student: [
      { label: 'Reported', value: summary?.total, tone: 'neutral', to: '/student/complaints', hint: 'Everything you have reported' },
      { label: 'Active', value: summary?.active, tone: 'info', to: '/student/complaints', hint: 'Still being worked on' },
      { label: 'Resolved', value: summary?.done, tone: 'success', to: '/student/complaints', hint: 'Fixed or closed' },
      { label: 'Urgent', value: summary?.urgent, tone: 'danger', to: '/student/complaints', hint: 'Highest priority, still open' },
    ],
    staff: [
      { label: 'Assigned', value: summary?.waiting, tone: 'violet', to: '/staff/assigned', hint: 'Waiting to be started' },
      { label: 'In progress', value: summary?.working, tone: 'warning', to: '/staff/in-progress', hint: 'Work you have started' },
      { label: 'Resolved', value: summary?.done, tone: 'success', to: '/staff/resolved', hint: 'Work you have finished' },
      { label: 'Urgent', value: summary?.urgent, tone: 'danger', to: '/staff/assigned', hint: 'Needs attention first' },
    ],
    admin: [
      { label: 'Total', value: summary?.total, tone: 'neutral', to: '/admin/complaints', hint: 'All complaints' },
      { label: 'Open', value: summary?.open, tone: 'info', to: '/admin/complaints', hint: 'Not started yet' },
      { label: 'In progress', value: summary?.in_progress, tone: 'warning', to: '/admin/complaints', hint: 'Being worked on' },
      { label: 'Urgent', value: summary?.urgent, tone: 'danger', to: '/admin/complaints', hint: 'Highest priority' },
    ],
  }[role] || []

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Welcome back, ${user.name?.split(' ')[0] || 'there'}`}
        description={content.description}
        actions={
          <>
            <Badge tone="info">{role.charAt(0).toUpperCase() + role.slice(1)}</Badge>
            <Link to={content.cta.to}>
              <Button variant="primary">{content.cta.label}</Button>
            </Link>
          </>
        }
      />

      {error && (
        <Alert type="error" title="Some of your numbers could not be loaded" onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((tile) => (
          <StatCard
            key={tile.label}
            label={tile.label}
            value={loading ? '…' : tile.value}
            hint={tile.hint}
            tone={tile.tone}
            to={tile.to}
          />
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Where to go next" description="The parts of CampusPulse your role uses." padding="p-0">
            <ul className="divide-y divide-slate-100">
              {content.actions.map((action) => (
                <li key={action.to}>
                  <Link
                    to={action.to}
                    className="group flex items-start justify-between gap-4 px-5 py-4 transition-colors hover:bg-slate-50"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-900 group-hover:text-indigo-700">
                        {action.label}
                      </span>
                      <span className="mt-0.5 block text-sm text-slate-600">{action.text}</span>
                    </span>
                    <span className="mt-0.5 shrink-0 text-slate-300 group-hover:text-indigo-600" aria-hidden="true">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card title="How it works" description={`Your ${role} workflow, in order.`}>
          <ol className="space-y-3">
            {content.workflow.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                  {index + 1}
                </span>
                <span className="text-sm text-slate-600">{step}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  )
}

// What a visitor sees before signing in: what the platform is for, and who it
// is for. Kept to the same cards and spacing as the rest of the app.
const HOW_IT_WORKS = [
  { label: 'Report', text: 'A student describes the problem, adds the location and attaches a photo.' },
  { label: 'Auto-triage', text: 'Category and priority are predicted, and near-duplicates of the same problem are flagged.' },
  { label: 'Route', text: 'An admin sends the complaint to the staff member who handles that kind of work.' },
  { label: 'Resolve', text: 'Staff work the complaint through assigned, in progress and resolved, with a full audit trail.' },
  { label: 'Feedback', text: 'The student rates the fix, and repeated problems are grouped into issue clusters.' },
]

const ROLES = [
  {
    name: 'Students',
    text: 'Report a problem once, then follow it from submission to resolution without having to ask anyone.',
  },
  {
    name: 'Staff',
    text: 'A queue of only the complaints assigned to you, with the triage result and the photos on one page.',
  },
  {
    name: 'Admins',
    text: 'The whole campus in one place: assignments, staff workload, recurring issues and analytics.',
  },
]

function SignedOutHome() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Campus issue management platform"
        description="Students report campus problems, staff resolve the ones assigned to them, and admins keep track of everything."
        actions={
          <>
            <Link to="/login">
              <Button variant="primary">Login</Button>
            </Link>
            <Link to="/register">
              <Button variant="secondary">Register as a student</Button>
            </Link>
          </>
        }
      />

      <Card
        title="How a complaint moves through CampusPulse"
        description="Every complaint follows the same route, whichever role you are in."
      >
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {HOW_IT_WORKS.map((step, index) => (
            <li key={step.label} className="rounded-md border border-slate-200 bg-slate-50/60 p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                  {index + 1}
                </span>
                <span className="text-sm font-semibold text-slate-900">{step.label}</span>
              </div>
              <p className="mt-2 text-sm text-slate-600">{step.text}</p>
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        {ROLES.map((role) => (
          <Card key={role.name} title={role.name}>
            <p className="text-sm text-slate-600">{role.text}</p>
          </Card>
        ))}
      </div>

      <Card title="Getting an account" description="Registration is for students.">
        <p className="text-sm text-slate-600">
          Student accounts can be created from the{' '}
          <Link to="/register" className="font-medium text-indigo-600 hover:underline">
            registration page
          </Link>
          . Staff and admin accounts are not self-service: an administrator creates them, and the account holder
          then signs in here with the email and password they were given.
        </p>
      </Card>
    </div>
  )
}

export default Home
