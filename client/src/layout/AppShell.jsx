import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import api from '../api'
import { getStoredUser, getToken } from '../auth'


export default function AppShell() {
  const token = getToken()


   const [serverUser, setServerUser] = useState(null)
  const user = serverUser || getStoredUser()


    useEffect(() => {
    if (!token) {
      setServerUser(null)
      return
    }

    api.get('/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => {
         if (!response.data?.user) {
          return
        }
        localStorage.setItem('user', JSON.stringify(response.data.user))
        setServerUser(response.data.user)
      })
      .catch(() => {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
         setServerUser(null)
        window.location.href = '/login'
      })
  }, [token])

  const signedIn = Boolean(token && user?.role)

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <Topbar token={token} user={user} />
      <div className="flex">
            {/* Navigation only makes sense once we know who the user is, so the
            signed-out pages (home, login, register) get the full width */}
        {signedIn && <Sidebar role={user.role} />}
        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
      </div> 
  )
}
