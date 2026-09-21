import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '../api'
import { getToken } from '../auth'
import ComplaintDetail from '../components/ComplaintDetail'
import StatusUpdateForm from '../components/StatusUpdateForm'
import ClassificationCorrection from '../components/ClassificationCorrection'
import WorkflowSteps, { stepIndexFor } from '../components/WorkflowSteps'
import AiTools from '../components/AiTools'
import PageHeader from '../components/PageHeader'
import { Card, Button, LoadingBlock, EmptyState, ErrorState } from '../components/ui'

const QUEUE_FOR_STEP = ['/staff/assigned', '/staff/in-progress', '/staff/resolved', '/staff/resolved']
const STEP_LABELS = ['Assigned', 'In Progress', 'Resolved', 'Closed']

// The staff workspace: the full complaint, where it sits in the workflow, the
// next step and the reply tools, all on one page so a job can be finished without
// navigating away.
function StaffComplaintDetail({ complaintId }) {
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
    { label: 'Staff', to: '/staff/dashboard' },
    { label: 'My Work Queue', to: '/staff/dashboard' },
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
        <Link to="/staff/dashboard">
          <Button variant="secondary">Back to My Work Queue</Button>
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
            description="It may have been unassigned or removed."
            action={
              <Link to="/staff/dashboard">
                <Button variant="secondary" size="sm">Back to My Work Queue</Button>
              </Link>
            }
          />
        </Card>
      </div>
    )
  }

  const current = complaint.complaint
  const position = stepIndexFor(current.status)
  const queuePath = position >= 0 ? QUEUE_FOR_STEP[position] : '/staff/dashboard'

  const detailCrumbs = position >= 0
    ? [
        { label: 'Staff', to: '/staff/dashboard' },
        { label: 'My Work Queue', to: '/staff/dashboard' },
        { label: STEP_LABELS[position], to: queuePath },
        { label: `#${current.id}` },
      ]
    : crumbs

  return (
    <div className="space-y-5">
      <PageHeader
        title={`#${current.id} ${current.title}`}
        description={`Assigned to ${current.assigned_staff_name || 'you'}`}
        crumbs={detailCrumbs}
        actions={
          <Link to={queuePath}>
            <Button variant="secondary">Back to queue</Button>
          </Link>
        }
      />

      {/* Where this complaint sits in Assigned -> In Progress -> Resolved -> Closed */}
      <Card title="Workflow" description="The step this complaint is on right now.">
        <WorkflowSteps status={current.status} />
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ComplaintDetail
            complaint={current}
            statusHistory={complaint.status_history || []}
            images={complaint.images || []}
            aiPrediction={complaint.ai_prediction}
            entities={complaint.entities}
            duplicateWarning={complaint.duplicate_warning}
            cluster={complaint.cluster}
            feedback={complaint.feedback || []}
            historyTitle="Workflow timeline"
          />
        </div>

        <div className="space-y-5">
          <Card title="Next step" description="Move this complaint along the workflow.">
            <StatusUpdateForm complaint={current} token={token} onUpdated={loadDetail} />
          </Card>

          <Card title="Assignment">
            <p className="text-sm text-slate-600">
              Assigned to{' '}
              <span className="font-medium text-slate-800">{current.assigned_staff_name || 'you'}</span>.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              An admin can reassign this complaint from the admin complaint view.
            </p>
          </Card>

          <Card
            title="Classification"
            description="What the classifier decided, and a place to overrule it."
          >
            <ClassificationCorrection
              complaint={current}
              token={token}
              onCorrected={(updated) =>
                setComplaint((previous) =>
                  previous ? { ...previous, complaint: { ...previous.complaint, ...updated } } : previous
                )
              }
            />
          </Card>

          <Card
            title="Reply tools"
            description="Written from the data already stored on this complaint. Nothing is sent and nothing changes automatically."
          >
            <AiTools complaintId={id} />
          </Card>
        </div>
      </div>
    </div>
  )
}

export default StaffComplaintDetail
