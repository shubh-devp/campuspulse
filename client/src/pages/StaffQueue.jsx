import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'
import { getToken } from '../auth'
import PageHeader from '../components/PageHeader'
import { StatusBadge, PriorityBadge } from '../components/Badges'
import {
  Card,
  Button,
  Input,
  Select,
  Table,
  Tr,
  Th,
  Td,
  LoadingBlock,
  EmptyState,
  ErrorState,
} from '../components/ui'

// The three queues are the same table scoped to a different step of the workflow.
const STEPS = {
  assigned: {
    label: 'Assigned',
    description: 'Work an admin has handed to you. Open one and start work to move it forward.',
    empty: 'Nothing is waiting to be started.',
  },
  in_progress: {
    label: 'In Progress',
    description: 'Work you have started but not finished yet.',
    empty: 'You have no work in progress.',
  },
  resolved: {
    label: 'Resolved',
    description: 'Work you have finished. Closed complaints stay here for reference.',
    empty: 'You have not resolved anything yet.',
  },
}

const STEP_ORDER = ['assigned', 'in_progress', 'resolved']
const STEP_PATHS = { assigned: '/staff/assigned', in_progress: '/staff/in-progress', resolved: '/staff/resolved' }

const inStep = (complaint, step) => {
  const status = complaint.status
  if (step === 'assigned') return status === 'assigned' || status === 'open'
  if (step === 'in_progress') return status === 'in_progress' || status === 'reopened'
  return status === 'resolved' || status === 'closed'
}

const PRIORITY_OPTIONS = [
  { value: 'all', label: 'All priorities' },
  ...['urgent', 'high', 'medium', 'low'].map((priority) => ({
    value: priority,
    label: priority.charAt(0).toUpperCase() + priority.slice(1),
  })),
]

function StaffQueue({ step = 'assigned' }) {
  const token = getToken()
  const config = STEPS[step] || STEPS.assigned
  const [complaints, setComplaints] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('all')
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
  }, [token, step])

  // /complaints/assigned returns the whole queue, so the step and filters are applied here
  const counts = useMemo(
    () => STEP_ORDER.reduce((acc, key) => ({ ...acc, [key]: complaints.filter((c) => inStep(c, key)).length }), {}),
    [complaints]
  )

  const visible = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return complaints.filter((complaint) => {
      if (!inStep(complaint, step)) return false
      if (priorityFilter !== 'all' && complaint.priority !== priorityFilter) return false
      if (!query) return true
      return (
        complaint.title.toLowerCase().includes(query) ||
        (complaint.location || '').toLowerCase().includes(query) ||
        (complaint.category || '').toLowerCase().includes(query)
      )
    })
  }, [complaints, step, searchQuery, priorityFilter])

  const hasFilters = searchQuery.trim() !== '' || priorityFilter !== 'all'

  return (
    <div className="space-y-5">
      <PageHeader
        title={config.label}
        description={config.description}
        crumbs={[
          { label: 'Staff', to: '/staff/dashboard' },
          { label: 'My Work Queue', to: '/staff/dashboard' },
          { label: config.label },
        ]}
      />

      {error && <ErrorState message={error} onRetry={load} />}

      {/* The pipeline, so the three steps are always one click apart */}
      <div className="flex flex-wrap gap-2" aria-label="Workflow steps">
        {STEP_ORDER.map((key) => (
          <Link
            key={key}
            to={STEP_PATHS[key]}
            aria-current={key === step ? 'page' : undefined}
            className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
              key === step
                ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {STEPS[key].label}
            <span className={`text-xs ${key === step ? 'text-indigo-600' : 'text-slate-400'}`}>
              {counts[key] ?? 0}
            </span>
          </Link>
        ))}
      </div>

      <Card padding="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            placeholder="Search by title, location or category…"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            aria-label="Search queue"
            wrapperClassName="flex-1"
          />
          <Select
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value)}
            options={PRIORITY_OPTIONS}
            placeholder={null}
            aria-label="Filter by priority"
            className="sm:w-40"
          />
          {hasFilters && (
            <Button
              variant="ghost"
              onClick={() => {
                setSearchQuery('')
                setPriorityFilter('all')
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </Card>

      <Card padding="p-0">
        {loading ? (
          <LoadingBlock label="Loading your queue…" />
        ) : visible.length === 0 ? (
          <EmptyState
            title={complaints.length === 0 ? config.empty : 'No complaints match these filters'}
            description={
              complaints.length === 0
                ? 'Complaints an admin assigns to you will appear in this queue.'
                : 'Try a different search term or clear the filters.'
            }
            action={
              hasFilters && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('')
                    setPriorityFilter('all')
                  }}
                >
                  Clear filters
                </Button>
              )
            }
          />
        ) : (
          <Table>
            <thead>
              <Tr header>
                <Th>Complaint</Th>
                <Th>Location</Th>
                <Th>Category</Th>
                <Th>Priority</Th>
                <Th>Status</Th>
                <Th align="right">Open</Th>
              </Tr>
            </thead>
            <tbody>
              {visible.map((complaint) => (
                <Tr key={complaint.id}>
                  <Td>
                    <Link
                      to={`/staff/complaints/${complaint.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      <span className="text-slate-400">#{complaint.id}</span> {complaint.title}
                    </Link>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      Assigned {complaint.assigned_at ? new Date(complaint.assigned_at).toLocaleDateString() : '—'}
                    </span>
                  </Td>
                  <Td className="text-slate-600">{complaint.location || '—'}</Td>
                  <Td className="text-slate-600">{complaint.category || 'Uncategorised'}</Td>
                  <Td><PriorityBadge priority={complaint.priority} /></Td>
                  <Td><StatusBadge status={complaint.status} size="sm" /></Td>
                  <Td align="right">
                    <Link to={`/staff/complaints/${complaint.id}`} className="text-sm font-medium text-indigo-600 hover:underline">
                      Open
                    </Link>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  )
}

export default StaffQueue
