import { Navigate } from 'react-router-dom'
import { dashboardPathFor, getStoredUser, getToken } from '../auth'


function ProtectedRoute({ allowedRoles, children }) {
  const token = getToken()
  const user = getStoredUser()

  if (!token || !user?.role) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={dashboardPathFor(user.role)} replace />
  }

  return children
}

export default ProtectedRoute
