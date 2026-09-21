import { useEffect, useState } from 'react'
import api from '../api'
import { getToken, getStoredUser, roleCrumb } from '../auth'
import PageHeader from '../components/PageHeader'
import { Card, Button, Badge, EmptyState, LoadingBlock, ErrorState } from '../components/ui'

// The same page is used by every role, so the breadcrumb follows the signed-in role.
function NotificationsPage() {
  const token = getToken()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const authConfig = { headers: { Authorization: `Bearer ${token}` } }

  async function load() {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const response = await api.get('/complaints/notifications', authConfig)
      setNotifications(response.data.notifications || [])
    } catch {
      setError('Could not load your notifications')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [token])

  async function markRead(id) {
    try {
      await api.patch(`/complaints/notifications/${id}/read`, {}, authConfig)
      setNotifications((prev) => prev.map((item) => (item.id === id ? { ...item, is_read: true } : item)))
    } catch {
      setError('Could not mark that notification as read')
    }
  }

  async function markAllRead() {
    try {
      await api.patch('/complaints/notifications/read-all', {}, authConfig)
      setNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })))
    } catch {
      setError('Could not mark all notifications as read')
    }
  }

  const unreadCount = notifications.filter((item) => !item.is_read).length

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notifications"
        description={
          unreadCount > 0
            ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}.`
            : 'You are all caught up.'
        }
        crumbs={[roleCrumb(getStoredUser()?.role), { label: 'Notifications' }]}
        actions={
          unreadCount > 0 && (
            <Button variant="secondary" onClick={markAllRead}>
              Mark all as read
            </Button>
          )
        }
      />

      {error && <ErrorState message={error} onRetry={load} />}

      <Card padding="p-0">
        {loading ? (
          <LoadingBlock label="Loading notifications…" />
        ) : notifications.length === 0 ? (
          <EmptyState
            title="No notifications yet"
            description="Updates on your complaints will appear here."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {notifications.map((item) => (
              <li
                key={item.id}
                className={`flex flex-wrap items-start justify-between gap-3 px-5 py-4 ${
                  item.is_read ? '' : 'bg-sky-50/40'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-slate-900">{item.title}</p>
                    {!item.is_read && <Badge tone="info" size="sm">New</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{item.message}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {new Date(item.created_at).toLocaleString()}
                  </p>
                </div>

                {!item.is_read && (
                  <Button size="sm" variant="secondary" onClick={() => markRead(item.id)}>
                    Mark read
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

export default NotificationsPage
