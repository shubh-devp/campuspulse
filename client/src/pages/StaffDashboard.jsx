import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'
import { getToken } from '../auth'
import PageHeader from '../components/PageHeader'
import WorkflowSteps from '../components/WorkflowSteps'
import { StatusBadge, PriorityBadge } from '../components/Badges'
import {
  Card,
  StatCard,
  Button,
  Table,
  Tr,
  Th,
  Td,
  LoadingBlock,
  EmptyState,
  ErrorState,
} from '../components/ui'

const QUEUES = [
  { key: 'assigned', to: '/staff/assigned', label: 'Assigned', hint: 'Waiting to be started' },
  { key: 'in_progress', to: '/staff/in-progress', label: 'In Progress', hint: 'Work you have started' },
  { key: 'resolved', to: '/staff/resolved', label: 'Resolved', hint: 'Work you have finished' },
]

const inQueue = (complaint, key) => {
  const status = complaint.status
  if (key === 'assigned') return status === 'assigned' || status === 'open'
  if (key === 'in_progress') return status === 'in_progress' || status === 'reopened'
  return status === 'resolved' || status === 'closed'
}

const isOpen = (complaint) => complaint.status !== 'resolved' && complaint.status !== 'closed'

// Staff home: the operational queue, grouped by the step each item is on.
function StaffDashboard() {
  const token = getToken()
  const [complaints, setComplaints] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const authConfig = { headers: { Authorization: `Bearer ${token}` } }

  async function load() {
    setLoading(true)
    setError('')
    try {
      const response = await api.get('/complaints/assigned', authConfig)
      setComplaints(response.data.complaints || [])
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load your work queue')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [token])

  if (loading) {
    return <LoadingBlock label="Loading your work queue…" />
  }

  const counts = QUEUES.reduce((acc, queue) => {
    acc[queue.key] = complaints.filter((c) => inQueue(c, queue.key)).length
    return acc
  }, {})

  const urgent = complaints
    .filter(isOpen)
    .filter((c) => c.priority === 'urgent' || c.priority === 'high')
    .sort((a, b) => (a.priority === 'urgent' ? -1 : 1) - (b.priority === 'urgent' ? -1 : 1))

  const recent = [...complaints]
    .filter((c) => c.assigned_at)
    .sort((a, b) => new Date(b.assigned_at) - new Date(a.assigned_at))
    .slice(0, 6)

  return (
    <div className="space-y-5">
      <PageHeader
        title="My Work Queue"
        description="Everything assigned to you, grouped by the step it is on."
        crumbs={[{ label: 'Staff' }, { label: 'My Work Queue' }]}
        actions={
          <Link to="/staff/assigned">
            <Button variant="primary">Open queue</Button>
          </Link>
        }
      />

      {error && <ErrorState message={error} onRetry={load} />}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {QUEUES.map((queue) => (
          <StatCard
            key={queue.key}
            label={queue.label}
            value={counts[queue.key]}
            hint={queue.hint}
            tone={queue.key === 'assigned' ? 'violet' : queue.key === 'in_progress' ? 'warning' : 'success'}
            to={queue.to}
          />
        ))}
        <StatCard label="Urgent" value={complaints.filter((c) => c.priority === 'urgent' && isOpen(c)).length} hint="Still open" tone="danger" />
      </div>

      <Card title="Workflow" description="Where your open work currently sits.">
        <WorkflowSteps status="assigned" />
        <p className="mt-3 text-xs text-slate-500">
          Open a complaint from any queue to move it to the next step.
        </p>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="Needs attention first"
          description="Open work with a high or urgent priority."
        >
          {urgent.length === 0 ? (
            <EmptyState
              title="Nothing urgent right now"
              description="No open complaint is marked high or urgent priority."
            />
          ) : (
            <Table>
              <thead>
                <Tr header>
                  <Th>Complaint</Th>
                  <Th>Priority</Th>
                  <Th>Status</Th>
                </Tr>
              </thead>
              <tbody>
                {urgent.map((complaint) => (
                  <Tr key={complaint.id}>
                    <Td>
                      <Link to={`/staff/complaints/${complaint.id}`} className="font-medium text-slate-900 hover:underline">
                        <span className="text-slate-400">#{complaint.id}</span> {complaint.title}
                      </Link>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {complaint.location || 'No location'}
                      </span>
                    </Td>
                    <Td><PriorityBadge priority={complaint.priority} /></Td>
                    <Td><StatusBadge status={complaint.status} size="sm" /></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card title="Recently assigned" description="Your six latest assignments.">
          {recent.length === 0 ? (
            <EmptyState title="Nothing assigned yet" description="Complaints an admin assigns to you will show up here." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {recent.map((complaint) => (
                <li key={complaint.id}>
                  <Link
                    to={`/staff/complaints/${complaint.id}`}
                    className="flex flex-wrap items-center gap-2 py-3 transition-colors hover:bg-slate-50"
                  >
                    <span className="text-sm font-medium text-slate-900">
                      <span className="text-slate-400">#{complaint.id}</span> {complaint.title}
                    </span>
                    <StatusBadge status={complaint.status} size="sm" />
                    <span className="ml-auto text-xs text-slate-500">
                      {new Date(complaint.assigned_at).toLocaleDateString()}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

export default StaffDashboard
