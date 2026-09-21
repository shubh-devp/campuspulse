import { Link, useLocation } from 'react-router-dom'

function NotFound() {
  const location = useLocation()

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="max-w-2xl mx-auto py-12 text-center">
        <h1 className="text-5xl font-bold text-slate-900 mb-4">
          404 — Page Not Found
        </h1>
        <p className="text-slate-600 mb-8">
          The page you're looking for doesn't exist.
        </p>
        <p className="text-slate-500">
          {location.pathname} is not a valid route in CampusPulse.
        </p>
        <button
          onClick={() => window.history.back()}
          className="mt-6 rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700 transition-colors"
        >
          Go Back
        </button>
        <Link
          to="/"
          className="mt-3 inline-block rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700 transition-colors"
        >
          Return Home
        </Link>
      </div>
    </div>
  )
}

export default NotFound