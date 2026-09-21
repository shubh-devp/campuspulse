// Small helpers shared by the navbar, protected routes and the login page

export function getToken() {
  return localStorage.getItem('token')
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('user'))
  } catch {
    return null
  }
}

// Where each role lands after logging in
export function dashboardPathFor(role) {
  if (role === 'admin') {
    return '/admin/dashboard'
  }
  if (role === 'staff') {
    return '/staff/dashboard'
  }
  return '/student/dashboard'
}

// First breadcrumb for the pages every role shares (notifications, profile)
export function roleCrumb(role) {
  const labels = { student: 'Student', staff: 'Staff', admin: 'Admin' }
  return { label: labels[role] || 'Student', to: dashboardPathFor(role) }
}
