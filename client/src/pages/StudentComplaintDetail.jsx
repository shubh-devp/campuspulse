import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '../api'
import { getToken } from '../auth'
import ComplaintDetail from '../components/ComplaintDetail'
import PageHeader from '../components/PageHeader'
import { Card, Button, LoadingBlock, ErrorState, EmptyState } from '../components/ui'

// Feedback can only be left once, by the complaint owner, after it is resolved.
function FeedbackForm({ complaintId, token, onSubmitted }) {
  const [rating, setRating] = useState('5')
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSaving(true)

    try {
      await api.post(
        `/complaints/${complaintId}/feedback`,
        { rating: Number(rating), comment },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      onSubmitted()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not submit your feedback')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-slate-600">
        This complaint was resolved. Tell us how it went — feedback can only be submitted once.
      </p>

      <div className="flex flex-wrap gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="feedback-rating">
            Rating
          </label>
          <select
            id="feedback-rating"
            value={rating}
            onChange={(event) => setRating(event.target.value)}
            className="mt-1 rounded-md border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {[5, 4, 3, 2, 1].map((value) => (
              <option key={value} value={value}>
                {'★'.repeat(value)} {value}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-[16rem] flex-1">
          <label className="block text-sm font-medium text-slate-700" htmlFor="feedback-comment">
            Comment <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <textarea
            id="feedback-comment"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={2}
            placeholder="The leak was fixed the same day."
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" variant="primary" loading={saving}>
        Submit feedback
      </Button>
    </form>
  )
}

// The student's tracking page: the full record of one complaint plus the
// feedback step once it has been resolved.
function StudentComplaintDetail({ complaintId }) {
  const token = getToken()
  const { id: routeId } = useParams()
  const id = complaintId ?? routeId
  const [complaint, setComplaint] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const authConfig = { headers: { Authorization: `Bearer ${token}` } }

  async function loadDetail() {
    setLoading(true)
    setError('')
    try {
      const response = await api.get(`/complaints/${id}`, authConfig)
      setComplaint(response.data)
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load this complaint')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDetail()
  }, [id, token])

  const crumbs = [
    { label: 'Student', to: '/student/dashboard' },
    { label: 'My Complaints', to: '/student/complaints' },
    { label: `#${id}` },
  ]

  if (loading) {
    return <LoadingBlock label="Loading complaint…" />
  }

  if (error) {
    return (
      <div className="space-y-5">
        <PageHeader title="Complaint" crumbs={crumbs} />
        <ErrorState message={error} onRetry={loadDetail} />
        <Link to="/student/complaints">
          <Button variant="secondary">Back to My Complaints</Button>
        </Link>
      </div>
    )
  }

  if (!complaint || !complaint.complaint) {
    return (
      <div className="space-y-5">
        <PageHeader title="Complaint" crumbs={crumbs} />
        <Card>
          <EmptyState
            title="Complaint not found"
            description="It may have been removed, or the link may be wrong."
            action={
              <Link to="/student/complaints">
                <Button variant="secondary" size="sm">Back to My Complaints</Button>
              </Link>
            }
          />
        </Card>
      </div>
    )
  }

  const current = complaint.complaint
  const feedback = complaint.feedback || []
  const isResolved = current.status === 'resolved' || current.status === 'closed'

  return (
    <div className="space-y-5">
      <PageHeader
        title={`#${current.id} ${current.title}`}
        description={`Reported ${new Date(current.created_at).toLocaleString()}`}
        crumbs={crumbs}
        actions={
          <Link to="/student/complaints">
            <Button variant="secondary">Back to My Complaints</Button>
          </Link>
        }
      />

      <ComplaintDetail
        complaint={current}
        statusHistory={complaint.status_history || []}
        images={complaint.images || []}
        aiPrediction={complaint.ai_prediction}
        entities={complaint.entities}
        duplicateWarning={complaint.duplicate_warning}
        cluster={complaint.cluster}
        feedback={feedback}
      >
        {isResolved && feedback.length === 0 && (
          <Card title="Rate the resolution">
            <FeedbackForm complaintId={current.id} token={token} onSubmitted={loadDetail} />
          </Card>
        )}

        {isResolved && feedback.length > 0 && (
          <Card title="Feedback">
            <p className="text-sm text-slate-600">
              Thanks — your feedback for this complaint has been recorded.
            </p>
          </Card>
        )}
      </ComplaintDetail>
    </div>
  )
}

export default StudentComplaintDetail
