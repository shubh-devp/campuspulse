import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'
import { getToken } from '../auth'
import PageHeader from '../components/PageHeader'
import { StatusBadge, PriorityBadge } from '../components/Badges'
import {
  Card,
  Alert,
  Input,
  Select,
  Button,
  Table,
  Tr,
  Th,
  Td,
  LoadingBlock,
  EmptyState,
} from '../components/ui'

const PAGE_SIZE = 20

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


function AdminComplaints() {
  const token = getToken()
  const [complaints, setComplaints] = useState([])
  const [totalComplaints, setTotalComplaints] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [page, setPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const authConfig = { headers: { Authorization: `Bearer ${token}` } }

  async function loadComplaints() {
    setLoading(true)
    setError('')
    try {
      const params = { limit: PAGE_SIZE, page }
      if (searchQuery.trim()) params.search = searchQuery.trim()
      if (statusFilter !== 'all') params.status = statusFilter
      if (priorityFilter !== 'all') params.priority = priorityFilter

      const response = await api.get('/complaints', { ...authConfig, params })
      setComplaints(response.data.complaints || [])
      setTotalComplaints(response.data.totalComplaints ?? 0)
      setTotalPages(response.data.totalPages || 1)
      setCurrentPage(response.data.currentPage || page)
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load complaints')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadComplaints()
  }, [page, searchQuery, statusFilter, priorityFilter])

  const hasFilters = searchQuery.trim() !== '' || statusFilter !== 'all' || priorityFilter !== 'all'

  function clearFilters() {
    setSearchQuery('')
    setStatusFilter('all')
    setPriorityFilter('all')
    setPage(1)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Complaints"
        description={`Every complaint reported on campus${totalComplaints ? ` — ${totalComplaints} in total` : ''}.`}
        crumbs={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Complaints' }]}
      />

      {error && (
        <Alert type="error" title="Could not load complaints" onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}

      <Card title="Filters" description="Search and narrow the list to the complaints you need.">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="text"
            placeholder="Search title, description or location..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setPage(1)
            }}
            wrapperClassName="min-w-[200px] flex-1"
            aria-label="Search complaints"
          />
          <Select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setPage(1)
            }}
            options={STATUS_OPTIONS}
            placeholder={null}
            aria-label="Filter by status"
          />
          <Select
            value={priorityFilter}
            onChange={(e) => {
              setPriorityFilter(e.target.value)
              setPage(1)
            }}
            options={PRIORITY_OPTIONS}
            placeholder={null}
            aria-label="Filter by priority"
          />
          {hasFilters && (
            <Button variant="ghost" onClick={clearFilters}>
              Clear
            </Button>
          )}
        </div>
      </Card>

      {loading ? (
        <LoadingBlock label="Loading complaints…" />
      ) : complaints.length === 0 ? (
        <Card>
          <EmptyState
            title={hasFilters ? 'No complaints match your filters' : 'No complaints yet'}
            description={
              hasFilters
                ? 'Try a different search term or clear the filters.'
                : 'Complaints reported by students will show up here.'
            }
            action={
              hasFilters ? (
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : null
            }
          />
        </Card>
      ) : (
        <Card padding="p-0" className="overflow-hidden">
          <Table>
            <Tr header>
              <Th>Complaint</Th>
              <Th>Reporter</Th>
              <Th>Priority</Th>
              <Th>Status</Th>
              <Th>Assignee</Th>
              <Th align="right">Manage</Th>
            </Tr>
            {complaints.map((complaint) => (
              <Tr key={complaint.id}>
                <Td>
                  <Link
                    to={`/admin/complaints/${complaint.id}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    #{complaint.id} {complaint.title}
                  </Link>
                  <span className="mt-1 block text-xs text-slate-500">
                    {complaint.category || 'Uncategorised'} · {complaint.location || 'No location'} ·{' '}
                    {new Date(complaint.created_at).toLocaleDateString()}
                  </span>
                </Td>
                <Td>{complaint.reporter_name}</Td>
                <Td>
                  <PriorityBadge priority={complaint.priority} />
                </Td>
                <Td>
                  <StatusBadge status={complaint.status} size="sm" />
                  {complaint.duplicate_of && (
                    <span className="mt-1 block text-xs text-amber-700">
                      Possible duplicate of #{complaint.duplicate_of}
                    </span>
                  )}
                </Td>
                <Td>{complaint.assigned_staff_name || 'Unassigned'}</Td>
                <Td align="right">
                  <Link
                    to={`/admin/complaints/${complaint.id}`}
                    className="text-sm font-medium text-indigo-600 hover:underline"
                  >
                    Open
                  </Link>
                </Td>
              </Tr>
            ))}
          </Table>
        </Card>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button variant="secondary" size="sm" disabled={currentPage <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-slate-600">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}

export default AdminComplaints
