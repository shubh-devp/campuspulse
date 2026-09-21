import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../api'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { Alert } from '../components/ui'

function Register() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    department: '',
    phone: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [registeredUser, setRegisteredUser] = useState(null)
  const [validationErrors, setValidationErrors] = useState({})

  function handleChange(event) {
    setForm({ ...form, [event.target.name]: event.target.value })
    if (validationErrors[event.target.name]) {
      setValidationErrors((prev) => {
        const next = { ...prev }
        delete next[event.target.name]
        return next
      })
    }
  }

  function validate() {
    const errors = {}
    if (!form.name.trim()) errors.name = 'Name is required'
    if (!form.email.trim()) errors.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Please enter a valid email'
    if (!form.password) errors.password = 'Password is required'
    else if (form.password.length < 6) errors.password = 'Password must be at least 6 characters'
    return errors
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setValidationErrors({})

    const errors = validate()
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      return
    }

    setLoading(true)

    try {
      const response = await api.post('/auth/register-student', form)
      setRegisteredUser(response.data.user)
      navigate('/login')
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed, please try again')
    } finally {
      setLoading(false)
    }
  }

  if (registeredUser) {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-green-200 bg-green-50 p-4">
        <Alert type="success" title="Registration successful">
          You are registered as a {registeredUser.role}.
        </Alert>
        <Link to="/login" className="mt-2 inline-block text-sm text-green-700 underline">
          Go to login
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-900">Student Registration</h2>
      <p className="mt-2 text-sm text-slate-500">
        Create your student account to report campus issues.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <Input
          name="name"
          label="Name"
          id="name"
          placeholder="Your full name"
          value={form.name}
          onChange={handleChange}
          required
          disabled={loading}
          error={validationErrors.name}
          autoComplete="name"
        />

        <Input
          name="email"
          type="email"
          label="Email"
          id="email"
          placeholder="you@example.com"
          value={form.email}
          onChange={handleChange}
          required
          disabled={loading}
          error={validationErrors.email}
          autoComplete="email"
        />

        <Input
          name="password"
          type="password"
          label="Password"
          id="password"
          placeholder="At least 6 characters"
          value={form.password}
          onChange={handleChange}
          required
          disabled={loading}
          error={validationErrors.password}
          autoComplete="new-password"
        />

        <Input
          name="department"
          label="Department (optional)"
          id="department"
          placeholder="Your department"
          value={form.department}
          onChange={handleChange}
          disabled={loading}
          autoComplete="organization"
        />

        <Input
          name="phone"
          type="tel"
          label="Phone (optional)"
          id="phone"
          placeholder="Your phone number"
          value={form.phone}
          onChange={handleChange}
          disabled={loading}
          autoComplete="tel"
        />

        {error && (
          <Alert type="error" title="Registration failed" onDismiss={() => setError('')}>
            {error}
          </Alert>
        )}

        <Button type="submit" loading={loading} disabled={loading} className="w-full">
          {loading ? 'Registering...' : 'Register'}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-slate-600">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-indigo-600 hover:underline">
          Login
        </Link>
      </p>
    </div>
  )
}

export default Register
