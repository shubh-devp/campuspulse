import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import api from '../api'
import { getToken } from '../auth'
import PageHeader from '../components/PageHeader'
import { StatusBadge, PriorityBadge } from '../components/Badges'
import {
  Card,
  Button,
  Badge,
  Table,
  Tr,
  Th,
  Td,
  LoadingBlock,
  EmptyState,
  ErrorState,
} from '../components/ui'

// Step 3 of the admin flow: recurring problems, grouped, with the complaints
// that make up each group.
function AdminClusters() {
  const token = getToken()
  const { id: clusterIdFromUrl } = useParams()
  const navigate = useNavigate()
  const [clusters, setClusters] = useState([])
  const [selectedCluster, setSelectedCluster] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const authConfig = { headers: { Authorization: `Bearer ${token}` } }

  async function loadClusters() {
    setLoading(true)
    setError('')
    try {
      const response = await api.get('/complaints/clusters', authConfig)
      setClusters(response.data.clusters || [])
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load clusters')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadClusters()
  }, [])

  // Opening /admin/clusters/:id loads that cluster straight away
  useEffect(() => {
    if (clusterIdFromUrl) {
      openCluster(clusterIdFromUrl)
    }
  }, [clusterIdFromUrl])

  async function openCluster(id) {
    setError('')
    try {
      const response = await api.get(`/complaints/clusters/${id}`, authConfig)
      setSelectedCluster(response.data)
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load cluster detail')
    }
  }

  function closeCluster() {
    setSelectedCluster(null)
    if (clusterIdFromUrl) navigate('/admin/clusters')
  }

  if (loading) {
    return <LoadingBlock label="Loading issue clusters…" />
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Issue Clusters"
        description="Groups of complaints about the same recurring problem."
        crumbs={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Issue Clusters' }]}
      />

      {error && <ErrorState title="Could not load clusters" message={error} onRetry={loadClusters} />}

      {selectedCluster && (
        <Card
          padding="p-0"
          title={selectedCluster.cluster.title}
          description={`${selectedCluster.cluster.category || 'Uncategorised'} · ${
            selectedCluster.cluster.location || 'No location'
          } · ${selectedCluster.cluster.complaint_count} complaints`}
          actions={
            <div className="flex items-center gap-2">
              <StatusBadge status={selectedCluster.cluster.status} size="sm" />
              <Button size="sm" variant="ghost" onClick={closeCluster}>
                Close
              </Button>
            </div>
          }
        >
          {selectedCluster.complaints.length === 0 ? (
            <EmptyState
              title="No complaints in this cluster"
              description="This cluster has no member complaints yet."
            />
          ) : (
            <Table>
              <Tr header>
                <Th>Complaint</Th>
                <Th>Status</Th>
                <Th>Priority</Th>
                <Th>Reporter</Th>
                <Th align="right">Reported</Th>
                <Th align="right">Open</Th>
              </Tr>
              {selectedCluster.complaints.map((complaint) => (
                <Tr key={complaint.id}>
                  <Td>
                    <Link
                      to={`/admin/complaints/${complaint.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      #{complaint.id} {complaint.title}
                    </Link>
                  </Td>
                  <Td>
                    <StatusBadge status={complaint.status} size="sm" />
                  </Td>
                  <Td>
                    <PriorityBadge priority={complaint.priority} />
                  </Td>
                  <Td>{complaint.reporter_name}</Td>
                  <Td align="right">{new Date(complaint.created_at).toLocaleDateString()}</Td>
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
          )}
        </Card>
      )}

      {clusters.length === 0 ? (
        <Card>
          <EmptyState
            title="No issue clusters yet"
            description="Clusters appear automatically when several complaints describe the same problem."
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clusters.map((cluster) => (
            <button
              key={cluster.id}
              type="button"
              onClick={() => openCluster(cluster.id)}
              className="rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
              aria-label={`View cluster: ${cluster.title}`}
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900">{cluster.title}</h3>
                <Badge tone="neutral" size="sm">
                  {cluster.complaint_count} complaints
                </Badge>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {cluster.category || 'Uncategorised'} · {cluster.location || 'No location'}
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <StatusBadge status={cluster.status} size="sm" />
                {cluster.updated_at && (
                  <span className="text-xs text-slate-500">
                    Updated {new Date(cluster.updated_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default AdminClusters
