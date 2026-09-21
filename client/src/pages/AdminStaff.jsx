import { useEffect, useState } from 'react'
import api from '../api'
import { getToken } from '../auth'
import PageHeader from '../components/PageHeader'
import {
  Card,
  Button,
  Input,
  Modal,
  Alert,
  Table,
  Tr,
  Th,
  Td,
  LoadingBlock,
  EmptyState,
  ErrorState,
} from '../components/ui'

const EMPTY_STAFF = { name: '', email: '', password: '', department: '', phone: '' }

// Step 4 of the admin flow
function AdminStaff() {
  const token = getToken()
  const [staff, setStaff] = useState([])
  const [newStaff, setNewStaff] = useState(EMPTY_STAFF)
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const authConfig = { headers: { Authorization: `Bearer ${token}` } }

  async function loadStaff() {
    setFetching(true)
    setError('')
    try {
      const response = await api.get('/users/staff', authConfig)
      setStaff(response.data.staff || [])
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load staff list')
    } finally {
      setFetching(false)
    }
  }

  async function handleCreate() {
    setFormError('')
    setLoading(true)
    try {
      await api.post('/users/staff', newStaff, authConfig)
      setNewStaff(EMPTY_STAFF)
      setShowCreate(false)
      loadStaff()
    } catch (err) {
      setFormError(err.response?.data?.message || 'Could not create staff account')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStaff()
  }, [])

  function openCreate() {
    setFormError('')
    setShowCreate(true)
  }

  if (fetching) {
    return <LoadingBlock label="Loading staff…" />
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Staff"
        description="Register staff accounts and follow their current workload. Staff cannot sign themselves up — only an admin can create the account, and the staff member then logs in with the email and password set here."
        crumbs={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Staff' }]}
        actions={
          <Button variant="primary" onClick={openCreate}>
            Register Staff
          </Button>
        }
      />

      {error &&
        (staff.length === 0 ? (
          <ErrorState title="Could not load the staff list" message={error} onRetry={loadStaff} />
        ) : (
          <Alert type="error" title="Could not refresh the staff list" onDismiss={() => setError('')}>
            {error}
          </Alert>
        ))}

      {staff.length === 0 ? (
        <Card>
          <EmptyState
            title="No staff accounts yet"
            description="Register a staff account to start assigning complaints to people."
            action={
              <Button variant="primary" size="sm" onClick={openCreate}>
                Register Staff
              </Button>
            }
          />
        </Card>
      ) : (
        <Card padding="p-0">
          <Table>
            <Tr header>
              <Th>Name</Th>
              <Th>Email / Department</Th>
              <Th align="right">Total</Th>
              <Th align="right">Active</Th>
              <Th align="right">Resolved</Th>
            </Tr>
            {staff.map((member) => (
              <Tr key={member.id}>
                <Td className="font-medium text-slate-900">{member.name}</Td>
                <Td>
                  <span className="block text-slate-700">{member.email}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{member.department || 'No department'}</span>
                </Td>
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
        </Card>
      )}

      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="Register a staff account"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreate} loading={loading}>
              Create
            </Button>
          </>
        }
      >
        {formError && (
          <div className="mb-4">
            <Alert type="error" title="Could not create the account">
              {formError}
            </Alert>
          </div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Name"
              type="text"
              placeholder="Full name"
              value={newStaff.name}
              onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })}
              required
            />
            <Input
              label="Email"
              type="email"
              placeholder="name@campus.edu"
              value={newStaff.email}
              onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Password"
              type="password"
              placeholder="Temporary password"
              value={newStaff.password}
              onChange={(e) => setNewStaff({ ...newStaff, password: e.target.value })}
              required
            />
            <Input
              label="Department"
              type="text"
              placeholder="e.g. Facilities"
              value={newStaff.department}
              onChange={(e) => setNewStaff({ ...newStaff, department: e.target.value })}
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default AdminStaff
