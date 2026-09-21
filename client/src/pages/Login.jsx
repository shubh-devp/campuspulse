import { useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'
import { dashboardPathFor } from '../auth'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { Alert } from '../components/ui'

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (!email.trim() || !password) {
      setError('Email and password are required')
      return
    }

    setLoading(true)

    try {
      const response = await api.post('/auth/login', { email, password })
      localStorage.setItem('token', response.data.token)
      localStorage.setItem('user', JSON.stringify(response.data.user))
      // Reload rather than a router navigation. The shell reads the session when
      // it mounts, so a fresh load is what puts the sidebar and the signed-in top
      // bar on screen straight away. Logging out does the same thing in reverse.
      window.location.href = dashboardPathFor(response.data.user.role)
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed, please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-900">Login</h2>

      {error && (
        <div className="mt-4">
          <Alert type="error" title="Login failed" onDismiss={() => setError('')}>
            {error}
          </Alert>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <Input
          type="email"
          label="Email"
          id="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          disabled={loading}
          autoComplete="email"
        />

        <Input
          type="password"
          label="Password"
          id="password"
          placeholder="Enter your password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          disabled={loading}
          autoComplete="current-password"
        />

        <Button type="submit" loading={loading} disabled={loading} className="w-full">
          {loading ? 'Logging in...' : 'Login'}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-slate-600">
        No account yet?{' '}
        <Link to="/register" className="font-medium text-indigo-600 hover:underline">
          Register
        </Link>
      </p>
      <p className="mt-2 text-center text-xs text-slate-500">
        Registration is for students. Staff and admin accounts are created by an administrator.
      </p>
    </div>
  )
}

export default Login
