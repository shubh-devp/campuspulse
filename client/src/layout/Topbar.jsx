import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api'
import { FaBell } from 'react-icons/fa'

export default function Topbar({ token, user }) {
  const navigate = useNavigate()
  const [unreadCount, setUnreadCount] = useState(0)
  const signedIn = Boolean(token && user?.role)

  useEffect(() => {
    if (token) {
      api.get('/complaints/notifications', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          const data = res.data
          const count = (data.notifications || []).filter((n) => !n.is_read).length
          setUnreadCount(count)
        })
        .catch(() => {})
    }
  }, [token])

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-3">

            <div className={`flex min-w-0 items-center gap-3 ${signedIn ? 'pl-12 lg:pl-0' : ''}`}>
              <Link to="/" className="truncate text-lg font-semibold text-slate-900">CampusPulse</Link>
            </div>

            <div className="flex items-center gap-2">
              {signedIn ? (
                <>
                  <span className="hidden sm:block text-sm font-medium text-slate-700">{user.name}</span>
                  <button
                    type="button"
                    onClick={() => navigate('/notifications')}
                    className="relative rounded-md border border-slate-300 p-2 text-slate-600 hover:bg-slate-50 transition-colors"
                    aria-label={`Notifications, ${unreadCount} unread`}
                  >
                    <FaBell className="w-5 h-5" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 rounded-full bg-red-500 text-white text-xs w-4 h-4 flex items-center justify-center">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
            
                      localStorage.removeItem('token')
                      localStorage.removeItem('user')
                      window.location.href = '/login'
                    }}
                    className="hidden sm:block rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <div className="hidden sm:flex items-center gap-3">
                  <Link to="/login" className="text-sm text-slate-600 hover:text-slate-900">Login</Link>
                  <Link to="/register" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-700">Register</Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
    </>
  )
}
