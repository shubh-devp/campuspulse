import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'
import { getToken } from '../auth'
import PageHeader from '../components/PageHeader'
import ComplaintCard from '../components/complaints/ComplaintCard'
import { Card, Button, Input, Select, EmptyState, LoadingBlock, ErrorState } from '../components/ui'

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  ...['open', 'assigned', 'in_progress', 'resolved', 'closed', 'reopened'].map((status) => ({
    value: status,
    label: status.replace('_', ' ').replace(/\b\w/g, (w) => w.toUpperCase()),
  })),
]

const PRIORITY_OPTIONS = [
  { value: 'all', label: 'All priorities' },
  ...['low', 'medium', 'high', 'urgent'].map((priority) => ({
    value: priority,
    label: priority.charAt(0).toUpperCase() + priority.slice(1),
  })),
]

// Tracking view: everything this student has reported, with search and filters.
function Complaints() {
  const token = getToken()
  const [complaints, setComplaints] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const authConfig = { headers: { Authorization: `Bearer ${token}` } }

  async function load() {
    setLoading(true)
    setError('')
    try {
      const response = await api.get('/complaints/my', authConfig)
      setComplaints(response.data.complaints || [])
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load your complaints')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [token])

  // GET /complaints/my returns everything the student filed, so filtering happens here
  const visible = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return complaints.filter((complaint) => {
      if (statusFilter !== 'all' && complaint.status !== statusFilter) return false
      if (priorityFilter !== 'all' && complaint.priority !== priorityFilter) return false
      if (!query) return true
      return (
        complaint.title.toLowerCase().includes(query) ||
        (complaint.location || '').toLowerCase().includes(query) ||
        (complaint.category || '').toLowerCase().includes(query)
      )
    })
  }, [complaints, searchQuery, statusFilter, priorityFilter])

  const hasFilters = searchQuery.trim() !== '' || statusFilter !== 'all' || priorityFilter !== 'all'

  function clearFilters() {
    setSearchQuery('')
    setStatusFilter('all')
    setPriorityFilter('all')
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="My Complaints"
        description={
          complaints.length > 0
            ? `${complaints.length} report${complaints.length === 1 ? '' : 's'} in total.`
            : 'Everything you report will appear here.'
        }
        crumbs={[{ label: 'Student', to: '/student/dashboard' }, { label: 'My Complaints' }]}
        actions={
          <Link to="/student/report">
            <Button variant="primary">Report an Issue</Button>
          </Link>
        }
      />

      {error && <ErrorState message={error} onRetry={load} />}

      <Card padding="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            placeholder="Search by title, location or category…"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            aria-label="Search complaints"
            wrapperClassName="flex-1"
          />
          <Select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            options={STATUS_OPTIONS}
            placeholder={null}
            aria-label="Filter by status"
            className="sm:w-44"
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
            <Button variant="ghost" onClick={clearFilters}>
              Clear
            </Button>
          )}
        </div>
      </Card>

      {loading ? (
        <Card>
          <LoadingBlock label="Loading your complaints…" />
        </Card>
      ) : complaints.length === 0 ? (
        <Card>
          <EmptyState
            title="You have not reported anything yet"
            description="When something on campus needs fixing, report it here and you can follow its progress."
            action={
              <Link to="/student/report">
                <Button variant="primary" size="sm">Report an Issue</Button>
              </Link>
            }
          />
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            title="No complaints match these filters"
            description="Try a different search term or clear the filters."
            action={
              <Button variant="secondary" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            Showing {visible.length} of {complaints.length}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((complaint) => (
              <ComplaintCard
                key={complaint.id}
                complaint={complaint}
                to={`/student/complaints/${complaint.id}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default Complaints
