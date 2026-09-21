import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'
import { getToken } from '../auth'
import PageHeader from '../components/PageHeader'
import ComplaintCard from '../components/complaints/ComplaintCard'
import StatusBreakdown from '../components/StatusBreakdown'
import { Card, StatCard, Button, EmptyState, LoadingBlock, ErrorState } from '../components/ui'

// Student home: what is in flight, what happened recently, and one obvious way
// to report something new.
function StudentDashboard() {
  const token = getToken()
  const [complaints, setComplaints] = useState([])
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

  const counts = complaints.reduce((acc, complaint) => {
    acc[complaint.status] = (acc[complaint.status] || 0) + 1
    return acc
  }, {})

  const waiting = (counts.open || 0) + (counts.assigned || 0)
  const inProgress = (counts.in_progress || 0) + (counts.reopened || 0)
  const resolved = (counts.resolved || 0) + (counts.closed || 0)
  const urgent = complaints.filter(
    (c) => c.priority === 'urgent' && c.status !== 'resolved' && c.status !== 'closed'
  ).length

  const recent = complaints.slice(0, 4)

  if (loading) {
    return <LoadingBlock label="Loading your dashboard…" />
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        description="Track what you have reported and where each issue stands."
        crumbs={[{ label: 'Student' }, { label: 'Dashboard' }]}
        actions={
          <Link to="/student/report">
            <Button variant="primary">Report an Issue</Button>
          </Link>
        }
      />

      {error && <ErrorState message={error} onRetry={load} />}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Waiting" value={waiting} tone="info" hint="Not started yet" />
        <StatCard label="In Progress" value={inProgress} tone="warning" hint="Being worked on" />
        <StatCard label="Resolved" value={resolved} tone="success" hint="Fixed or closed" />
        <StatCard label="Urgent" value={urgent} tone="danger" hint="Still open" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Recent complaints"
          description="Your four latest reports."
          actions={
            complaints.length > 0 && (
              <Link to="/student/complaints">
                <Button size="sm" variant="ghost">View all</Button>
              </Link>
            )
          }
        >
          {recent.length === 0 ? (
            <EmptyState
              title="You have not reported anything yet"
              description="Report a campus problem and it will be categorised and prioritised automatically."
              action={
                <Link to="/student/report">
                  <Button variant="primary" size="sm">Report an Issue</Button>
                </Link>
              }
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {recent.map((complaint) => (
                <ComplaintCard key={complaint.id} complaint={complaint} to={`/student/complaints/${complaint.id}`} />
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card title="Status overview" description="All of your complaints.">
            <StatusBreakdown counts={counts} emptyLabel="Nothing reported yet." />
          </Card>

          <Card title="Need something fixed?">
            <p className="text-sm text-slate-600">
              Describe the problem and add a photo if you can — it helps the right team pick it up faster.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/student/report">
                <Button variant="primary" size="sm">Report an Issue</Button>
              </Link>
              <Link to="/student/complaints">
                <Button variant="secondary" size="sm">My Complaints</Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default StudentDashboard
