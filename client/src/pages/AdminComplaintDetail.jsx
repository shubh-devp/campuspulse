import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '../api'
import { getToken } from '../auth'
import ComplaintDetail from '../components/ComplaintDetail'
import AssignForm from '../components/AssignForm'
import StatusUpdateForm from '../components/StatusUpdateForm'
import ClassificationCorrection from '../components/ClassificationCorrection'
import AiTools from '../components/AiTools'
import PageHeader from '../components/PageHeader'
import { Card, Button, LoadingBlock, EmptyState, ErrorState } from '../components/ui'

// The admin complaint workspace: the full record, who it is assigned to, and the
// two actions an admin takes here (assign, change status)
function AdminComplaintDetail({ complaintId }) {
  const { id: routeId } = useParams()
  const id = complaintId ?? routeId
  const token = getToken()
  const [detail, setDetail] = useState(null)
  const [staff, setStaff] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const authConfig = { headers: { Authorization: `Bearer ${token}` } }

  async function loadDetail() {
    setLoading(true)
    setError('')
    try {
      const [detailResponse, staffResponse] = await Promise.all([
        api.get(`/complaints/${id}`, authConfig),
        api.get('/users/staff', authConfig),
      ])
      setDetail(detailResponse.data)
      setStaff(staffResponse.data.staff || [])
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load complaint')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDetail()
  }, [id])

  const crumbs = [
    { label: 'Admin', to: '/admin/dashboard' },
    { label: 'Complaints', to: '/admin/complaints' },
    { label: `#${id}` },
  ]

  if (loading) {
    return <LoadingBlock label="Loading complaint…" />
  }

  if (error) {
    return (
      <div className="space-y-5">
        <PageHeader title="Complaint" crumbs={crumbs} />
        <ErrorState title="Could not load this complaint" message={error} onRetry={loadDetail} />
        <div>
          <Link to="/admin/complaints">
            <Button variant="secondary">Back to Complaints</Button>
          </Link>
        </div>
      </div>
    )
  }

  if (!detail || !detail.complaint) {
    return (
      <div className="space-y-5">
        <PageHeader title="Complaint" crumbs={crumbs} />
        <Card>
          <EmptyState
            title="Complaint not found"
            description="The requested complaint could not be found."
            action={
              <Link to="/admin/complaints">
                <Button variant="secondary" size="sm">Back to Complaints</Button>
              </Link>
            }
          />
        </Card>
      </div>
    )
  }

  const complaint = detail.complaint

  return (
    <div className="space-y-5">
      <PageHeader
        title={`#${complaint.id} ${complaint.title}`}
        description={`Reported by ${complaint.reporter_name || 'a student'} on ${new Date(complaint.created_at).toLocaleString()}`}
        crumbs={crumbs}
        actions={
          <Link to="/admin/complaints">
            <Button variant="secondary">Back to Complaints</Button>
          </Link>
        }
      />

      {detail.cluster && detail.cluster.complaint_count > 1 && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900">
                Part of issue cluster #{detail.cluster.id}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {detail.cluster.complaint_count} complaints about the same problem.
              </p>
            </div>
            <Link to={`/admin/clusters/${detail.cluster.id}`}>
              <Button size="sm" variant="secondary">Open cluster</Button>
            </Link>
          </div>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ComplaintDetail
            complaint={complaint}
            statusHistory={detail.status_history || []}
            images={detail.images || []}
            aiPrediction={detail.ai_prediction}
            entities={detail.entities || { locations: [], facilities: [] }}
            duplicateWarning={detail.duplicate_warning}
            cluster={detail.cluster}
            feedback={detail.feedback || []}
          />
        </div>

        <div className="space-y-5">
          <Card title="Assignment">
            <AssignForm complaint={complaint} staff={staff} token={token} onAssigned={loadDetail} />
          </Card>

          <Card title="Next step">
            <StatusUpdateForm complaint={complaint} token={token} onUpdated={loadDetail} />
          </Card>

          <Card
            title="Classification"
            description="What the classifier decided, and a place to overrule it."
          >
            <ClassificationCorrection
              complaint={complaint}
              token={token}
              onCorrected={(updated) =>
                setDetail((previous) =>
                  previous ? { ...previous, complaint: { ...previous.complaint, ...updated } } : previous
                )
              }
            />
          </Card>

          <Card
            title="Reply tools"
            description="Generate a summary or a response draft from this complaint."
          >
            <AiTools complaintId={id} />
          </Card>
        </div>
      </div>
    </div>
  )
}

export default AdminComplaintDetail
