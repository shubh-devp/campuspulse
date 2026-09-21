import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import AppShell from './layout/AppShell'
import ProtectedRoute from './components/ProtectedRoute'
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import NotFound from './pages/NotFound'
import ComplaintsStudent from './pages/Complaints'
import StudentDashboard from './pages/StudentDashboard'
import AdminDashboard from './pages/AdminDashboard'
import StaffDashboard from './pages/StaffDashboard'
import StaffQueue from './pages/StaffQueue'
import StaffComplaintDetail from './pages/StaffComplaintDetail'
import StudentReport from './pages/StudentReport'
import AdminClusters from './pages/AdminClusters'
import AdminAnalytics from './pages/AdminAnalytics'
import AdminStaff from './pages/AdminStaff'
import AdminComplaints from './pages/AdminComplaints'
import AdminComplaintDetail from './pages/AdminComplaintDetail'
import StudentProfile from './pages/StudentProfile'
import StaffProfile from './pages/StaffProfile'
import AdminProfile from './pages/AdminProfile'
import NotificationsPage from './pages/NotificationsPage'
import StudentComplaintDetail from './pages/StudentComplaintDetail'

// The session itself (who is signed in and what role they have) is owned by
// AppShell, which reads it on every render so a login takes effect straight away.
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<Home />} />
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
          <Route path="*" element={<NotFound />} />

          {/* Student: Report -> auto-triage -> Track -> Resolution -> Feedback */}
          <Route path="student" element={<ProtectedRoute allowedRoles={['student']}><Outlet /></ProtectedRoute>}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<StudentDashboard />} />
            <Route path="complaints" element={<ComplaintsStudent />} />
            <Route path="complaints/:id" element={<StudentComplaintDetail />} />
            <Route path="report" element={<StudentReport />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="profile" element={<StudentProfile />} />
          </Route>

          {/* Staff: Assigned -> Start Work -> In Progress -> Resolve */}
          <Route path="staff" element={<ProtectedRoute allowedRoles={['staff']}><Outlet /></ProtectedRoute>}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<StaffDashboard />} />
            <Route path="assigned" element={<StaffQueue step="assigned" />} />
            <Route path="in-progress" element={<StaffQueue step="in_progress" />} />
            <Route path="resolved" element={<StaffQueue step="resolved" />} />
            <Route path="complaints/:id" element={<StaffComplaintDetail />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="profile" element={<StaffProfile />} />
          </Route>

          {/* Admin: Monitor -> Manage complaints and clusters -> Staff workload -> Analytics */}
          <Route path="admin" element={<ProtectedRoute allowedRoles={['admin']}><Outlet /></ProtectedRoute>}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="complaints" element={<AdminComplaints />} />
            <Route path="complaints/:id" element={<AdminComplaintDetail />} />
            <Route path="clusters" element={<AdminClusters />} />
            <Route path="clusters/:id" element={<AdminClusters />} />
            <Route path="analytics" element={<AdminAnalytics />} />
            <Route path="staff" element={<AdminStaff />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="profile" element={<AdminProfile />} />
          </Route>

          <Route path="notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
