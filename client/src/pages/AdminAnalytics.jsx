import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'
import { getToken } from '../auth'
import PageHeader from '../components/PageHeader'
import StatusBreakdown from '../components/StatusBreakdown'
import AiInsights, { AiLearningLoop } from '../components/AiInsights'
import { StatusBadge, PriorityBadge } from '../components/Badges'
import {
  Card,
  StatCard,
  Input,
  Select,
  Button,
  Table,
  Tr,
  Th,
  Td,
  Alert,
  LoadingBlock,
  EmptyState,
  ErrorState,
} from '../components/ui'

const STATUS_FILTER_OPTIONS = ['open', 'assigned', 'in_progress', 'resolved', 'closed', 'reopened'].map(
  (status) => ({ value: status, label: status.replace('_', ' ').replace(/\b\w/g, (w) => w.toUpperCase()) })
)

const PRIORITY_FILTER_OPTIONS = ['low', 'medium', 'high', 'urgent'].map((priority) => ({
  value: priority,
  label: priority.charAt(0).toUpperCase() + priority.slice(1),
}))

const maxOf = (rows, key) => rows.reduce((max, row) => Math.max(max, Number(row[key]) || 0), 0)

function CountBar({ value, max }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="relative ml-auto h-6 w-40 overflow-hidden rounded bg-slate-100">
      <span className="absolute inset-y-0 left-0 bg-slate-200" style={{ width: `${pct}%` }} aria-hidden="true" />
      <span className="relative flex h-full items-center justify-end pr-2 text-sm font-medium text-slate-800">
        {value}
      </span>
    </div>
  )
}

// Step 5 of the admin flow: the numbers in aggregate
function AdminAnalytics() {
  const token = getToken()
  const [data, setData] = useState(null)
  const [aiFeedback, setAiFeedback] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({ search: '', status: '', priority: '', category: '', location: '' })

  const authConfig = { headers: { Authorization: `Bearer ${token}` } }

  async function loadAnalytics(nextPage = 1) {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value)
      })
      if (nextPage > 1) params.set('page', nextPage)


       const [analyticsResponse, feedbackResponse] = await Promise.all([
        api.get(`/complaints/admin/analytics?${params}`, authConfig),
        aiFeedback
          ? Promise.resolve(null)
          : api.get('/complaints/admin/ai-feedback', authConfig).catch(() => null),
      ])

      setData(analyticsResponse.data)
      if (feedbackResponse?.data) {
        setAiFeedback(feedbackResponse.data)
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load analytics')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { 
    loadAnalytics()
  }, [])

  function handleFilterChange(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  function applyFilters() {
    loadAnalytics(1)
  }

  if (loading && !data) {
    return <LoadingBlock label="Loading analytics…" />
  }

  if (error && !data) {
    return <ErrorState title="Could not load analytics" message={error} onRetry={() => loadAnalytics(1)} />
  }

  if (!data) {
    return null
  }


  const statusCounts = (data.statusBreakdown || []).reduce((acc, row) => {
    acc[row.status] = Number(row.count)
    return acc
  }, {})
  const countStatuses = (statuses) => statuses.reduce((sum, status) => sum + (statusCounts[status] || 0), 0)

  const categoryRows = data.categoryDistribution || []
  const locationRows = data.mostAffectedLocations || []
  const priorityRows = data.priorityDistribution || []
  const staffRows = data.staffWorkload || []
   const complaintRows = data.complaints || []

  const categoryMax = maxOf(categoryRows, 'count')
  const locationMax = maxOf(locationRows, 'count')

  return (
    <div className="space-y-5">
      <PageHeader
        title="Analytics"
        description="Volume, distribution, workload and resolution time."
        crumbs={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Analytics' }]}
      />

      {error && (
        <Alert type="error" title="Could not refresh analytics" onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total complaints" value={data.totalComplaints ?? '—'} tone="neutral" hint="Matching the filters" />
        <StatCard
          label="Open"
          value={countStatuses(['open', 'assigned', 'in_progress', 'reopened'])}
          tone="info"
          hint="Not finished yet"
        />
        <StatCard
          label="Resolved"
          value={countStatuses(['resolved', 'closed'])}
          tone="success"
          hint="Resolved or closed"
        />
        <StatCard
          label="Avg resolution"
          value={typeof data.averageResolutionTime === 'number' ? `${data.averageResolutionTime}d` : '—'}
          tone="violet"
          hint="Days to resolve"
        />
      </div>

      <AiInsights insights={data.insights} />

      <Card title="Filters" description="Narrow every metric below to a set of complaints.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            type="text"
            placeholder="Search..."
            value={filters.search}
            onChange={(e) => handleFilterChange('search', e.target.value)}
            aria-label="Search analytics"
          />
          <Select
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            options={STATUS_FILTER_OPTIONS}
            placeholder="All statuses"
            aria-label="Filter by status"
          />
          <Select
            value={filters.priority}
            onChange={(e) => handleFilterChange('priority', e.target.value)}
            options={PRIORITY_FILTER_OPTIONS}
            placeholder="All priorities"
            aria-label="Filter by priority"
          />
          <Input
            type="text"
            placeholder="Category"
            value={filters.category}
            onChange={(e) => handleFilterChange('category', e.target.value)}
            aria-label="Filter by category"
          />
          <Input
            type="text"
            placeholder="Location"
            value={filters.location}
            onChange={(e) => handleFilterChange('location', e.target.value)}
            aria-label="Filter by location"
          />
        </div>
        <Button className="mt-3" variant="primary" onClick={applyFilters} loading={loading}>
          Apply filters
        </Button>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Complaints by status"
          description="Where the filtered complaints currently sit."
        >
          <StatusBreakdown counts={statusCounts} emptyLabel="No complaints match the current filters." />
        </Card>

        <Card title="Complaints by priority" description="How urgent the filtered set is.">
          {priorityRows.length === 0 ? (
            <EmptyState
              title="No priority data"
              description="Priority totals will appear once complaints are analysed."
            />
          ) : (
            <ul className="space-y-2.5">
              {priorityRows.map((row) => (
                <li key={row.priority} className="flex items-center justify-between gap-3">
                  <PriorityBadge priority={row.priority} />
                  <span className="text-sm font-medium text-slate-800">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card padding="p-0" title="Complaints by category" description="What kinds of problems are reported.">
          {categoryRows.length === 0 ? (
            <EmptyState
              title="No category data"
              description="Category totals will appear once complaints are categorised."
            />
          ) : (
            <Table>
              <Tr header>
                <Th>Category</Th>
                <Th align="right">Complaints</Th>
              </Tr>
              {categoryRows.map((row) => (
                <Tr key={row.category || 'uncategorised'}>
                  <Td>{row.category || 'Uncategorised'}</Td>
                  <Td align="right">
                    <CountBar value={Number(row.count)} max={categoryMax} />
                  </Td>
                </Tr>
              ))}
            </Table>
          )}
        </Card>

        <Card padding="p-0" title="Most affected locations" description="Where complaints are concentrated.">
          {locationRows.length === 0 ? (
            <EmptyState
              title="No location data"
              description="Location totals will appear once complaints include a location."
            />
          ) : (
            <Table>
              <Tr header>
                <Th>Location</Th>
                <Th align="right">Complaints</Th>
              </Tr>
              {locationRows.map((row) => (
                <Tr key={row.location}>
                  <Td>{row.location}</Td>
                  <Td align="right">
                    <CountBar value={Number(row.count)} max={locationMax} />
                  </Td>
                </Tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      <Card padding="p-0" title="Staff workload" description="Complaints assigned to each staff account.">
        {staffRows.length === 0 ? (
          <EmptyState title="No staff data" description="Workload appears once complaints are assigned." />
        ) : (
          <Table>
            <Tr header>
              <Th>Name</Th>
              <Th>Department</Th>
              <Th align="right">Total</Th>
              <Th align="right">Active</Th>
              <Th align="right">Resolved</Th>
            </Tr>
            {staffRows.map((member) => (
              <Tr key={member.id}>
                <Td className="font-medium text-slate-900">{member.name}</Td>
                <Td>{member.department || '—'}</Td>
                <Td align="right">{member.total_assigned ?? 0}</Td>
                <Td align="right" className="text-amber-700">
                  {member.active ?? 0}
                </Td>
                <Td align="right" className="text-emerald-700">
                  {member.resolved ?? 0}
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </Card>

      <AiLearningLoop feedback={aiFeedback} />

      <Card
        padding="p-0"
        title="Complaints"
        description={`${data.totalComplaints ?? 0} matching the current filters.`}
        actions={
          data.totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={data.currentPage <= 1 || loading}
                onClick={() => loadAnalytics(data.currentPage - 1)}
              >
                Previous
              </Button>
              <span className="text-xs text-slate-500">
                Page {data.currentPage} of {data.totalPages}
              </span>
              <Button
                size="sm"
                 variant="secondary"
                disabled={data.currentPage >= data.totalPages || loading}
                onClick={() => loadAnalytics(data.currentPage + 1)}
               >
                Next
              </Button>
            </div>
          )
        }
      >
        {complaintRows.length === 0 ? (
          <EmptyState
            title="No complaints match the filters"
            description="Adjust or clear the filters to see complaints here."
          />
        ) : (
          <Table>
          <Tr header>
              <Th>Complaint</Th>
              <Th>Reporter</Th>
              <Th>Priority</Th>
              <Th>Status</Th>
            <Th align="right">Reported</Th>
            </Tr>
            {complaintRows.map((complaint) => (
              <Tr key={complaint.id}>
                <Td>
                  <Link
                    to={`/admin/complaints/${complaint.id}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    #{complaint.id} {complaint.title}
                  </Link>
                </Td>
                <Td>{complaint.reporter_name}</Td>
                <Td>
                  <PriorityBadge priority={complaint.priority} />
                </Td>
                <Td>
                  <StatusBadge status={complaint.status} size="sm" />
                </Td>
                <Td align="right">{new Date(complaint.created_at).toLocaleDateString()}</Td>
              </Tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  )
}

export default AdminAnalytics
