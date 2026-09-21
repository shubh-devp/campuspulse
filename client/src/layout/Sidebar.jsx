import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { FaBars, FaTimes } from 'react-icons/fa'

const sidebarLinks = {
  student: [
    { path: '/student/dashboard', label: 'Dashboard' },
    { path: '/student/complaints', label: 'My Complaints' },
    { path: '/student/report', label: 'Report Issue' },
    { path: '/student/notifications', label: 'Notifications' },
    { path: '/student/profile', label: 'Profile' },
  ],
  staff: [
    { path: '/staff/dashboard', label: 'Dashboard' },
    { path: '/staff/assigned', label: 'Assigned' },
    { path: '/staff/in-progress', label: 'In Progress' },
    { path: '/staff/resolved', label: 'Resolved' },
    { path: '/staff/notifications', label: 'Notifications' },
    { path: '/staff/profile', label: 'Profile' },
  ],
  admin: [
    { path: '/admin/dashboard', label: 'Dashboard' },
    { path: '/admin/complaints', label: 'Complaints' },
    { path: '/admin/clusters', label: 'Issue Clusters' },
    { path: '/admin/analytics', label: 'Analytics' },
    { path: '/admin/staff', label: 'Staff' },
    { path: '/admin/notifications', label: 'Notifications' },
    { path: '/admin/profile', label: 'Profile' },
  ],
}

export default function Sidebar({ role = 'student' }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const links = sidebarLinks[role] || sidebarLinks.student


  function openDrawer() {
    document.body.style.overflow = 'hidden'
    setMobileOpen(true)
  }

  function closeDrawer() {
    document.body.style.overflow = ''
    setMobileOpen(false)
  }


  function isActive(path) {
    return location.pathname === path || location.pathname.startsWith(`${path}/`)
  }

  const linkClasses = (path) =>
    `block rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
      isActive(path)
        ? 'border-l-2 border-indigo-600 bg-indigo-50 text-indigo-700'
        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
    }`

  return (
    <>
      <button
        type="button"
        onClick={openDrawer}
        className="fixed left-3 top-3 z-50 rounded bg-slate-900 p-2 text-white shadow-lg lg:hidden"
        aria-label="Open navigation menu"
      >
        <FaBars className="w-5 h-5" />
      </button>


      <aside className="fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 -translate-x-full flex-col border-r border-slate-200 bg-white transition-transform duration-200 ease-in-out lg:sticky lg:top-16 lg:bottom-auto lg:z-auto lg:h-[calc(100vh-4rem)] lg:translate-x-0">
        <div className="border-b border-slate-200 p-5">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-lg font-bold text-slate-900">CampusPulse</span>
          </Link>
          <p className="mt-1 text-xs text-slate-500">Campus Issue Management</p>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {links.map((link) => (
            <Link key={link.path} to={link.path} onClick={closeDrawer} className={linkClasses(link.path)}>
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-slate-200 p-4">
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem('token')
              localStorage.removeItem('user')
              window.location.href = '/login'
            }}
            className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700"
          >
            Logout
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={closeDrawer} />
          <div className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-white shadow-xl lg:hidden">
            <div className="flex items-center justify-between border-b border-slate-200 p-4">
              <span className="text-base font-semibold text-slate-900">Menu</span>
              <button
                type="button"
                onClick={closeDrawer}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close menu"
              >
                <FaTimes className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-4">
              {links.map((link) => (
                <Link key={link.path} to={link.path} onClick={closeDrawer} className={linkClasses(link.path)}>
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="border-t border-slate-200 p-4">
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem('token')
                  localStorage.removeItem('user')
                  window.location.href = '/login'
                }}
                className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700"
              >
                Logout
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
