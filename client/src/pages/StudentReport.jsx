import { useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'
import { getToken } from '../auth'
import PageHeader from '../components/PageHeader'
import { PriorityBadge } from '../components/Badges'
import { Card, Button, Input, Textarea, Badge, Alert } from '../components/ui'

const MAX_FILES = 5

const STEPS = [
  'Your complaint is saved immediately.',
  'The text is read to predict a category and priority.',
  'Places and facilities are pulled out of the description.',
  'Open complaints are checked so duplicates can be flagged.',
  'The first photo is classified, and the issue is grouped into a cluster.',
]

// Report flow: a short structured form, then a clear reading of what the AI
// triage decided about the new complaint.
function StudentReport() {
  const token = getToken()
  const [form, setForm] = useState({ title: '', description: '', location: '' })
  const [files, setFiles] = useState([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [fileError, setFileError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)

  function handleFileChange(event) {
    const selected = Array.from(event.target.files || []).slice(0, MAX_FILES)
    setFiles(selected)
    setFileError('')
  }

  function removeFile(index) {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  async function submitComplaint(event) {
    event.preventDefault()
    setMessage('')
    setError('')
    setFileError('')

    if (!form.title.trim() || !form.description.trim() || !form.location.trim()) {
      setError('Title, description and location are required.')
      return
    }

    setSubmitting(true)

    try {
      const formData = new FormData()
      formData.append('title', form.title)
      formData.append('description', form.description)
      formData.append('location', form.location)
      files.forEach((file) => formData.append('images', file))

      const response = await api.post('/complaints', formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
      })

      setResult(response.data)
      setMessage(`Complaint #${response.data.complaint.id} was submitted.`)
      setForm({ title: '', description: '', location: '' })
      setFiles([])
    } catch (err) {
      setError(err.response?.data?.message || 'Could not submit the complaint.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Report an Issue"
        description="Describe the problem and it will be categorised and prioritised automatically."
        crumbs={[{ label: 'Student', to: '/student/dashboard' }, { label: 'Report Issue' }]}
      />

      {message && (
        <Alert type="success" title="Submitted">
          {message}
        </Alert>
      )}
      {error && (
        <Alert type="error" title="Could not submit" onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <form onSubmit={submitComplaint} className="space-y-5 lg:col-span-2">
          <Card title="Complaint details" description="All three fields are required.">
            <div className="space-y-4">
              <Input
                label="Title"
                name="title"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="Lights not working in the library corridor"
                required
                disabled={submitting}
              />

              <Textarea
                label="Description"
                name="description"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="Describe what is wrong, how long it has been like this, and anything else that helps."
                rows={5}
                required
                disabled={submitting}
              />

              <Input
                label="Location"
                name="location"
                value={form.location}
                onChange={(event) => setForm({ ...form, location: event.target.value })}
                placeholder="Library, first floor corridor"
                required
                disabled={submitting}
              />
            </div>
          </Card>

          <Card title="Photos" description={`Optional, up to ${MAX_FILES} images (JPEG or PNG, 5 MB each).`}>
            <label
              htmlFor="complaint-images"
              className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition-colors hover:border-slate-400 hover:bg-slate-100"
            >
              <span className="text-sm font-medium text-slate-700">Choose photos</span>
              <span className="mt-1 text-xs text-slate-500">A photo of the problem helps a lot</span>
              <input
                id="complaint-images"
                type="file"
                name="images"
                multiple
                accept="image/jpeg,image/png"
                onChange={handleFileChange}
                disabled={submitting}
                className="sr-only"
              />
            </label>

            {fileError && <p className="mt-2 text-sm text-red-600">{fileError}</p>}

            {files.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {files.map((file, index) => (
                  <li
                    key={`${file.name}-${index}`}
                    className="flex items-center gap-2 rounded-md bg-slate-100 px-2.5 py-1 text-xs text-slate-700"
                  >
                    <span className="max-w-[14rem] truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="text-slate-400 hover:text-red-600"
                      aria-label={`Remove ${file.name}`}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="flex justify-end">
            <Button type="submit" variant="primary" loading={submitting}>
              Submit complaint
            </Button>
          </div>
        </form>

        <div className="space-y-5">
          {result ? (
            <Card title="Triage result" description="Read from the complaint you just submitted.">
              <dl className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Category</dt>
                  <dd>
                    <Badge tone="neutral">{result.category || 'Not determined'}</Badge>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Priority</dt>
                  <dd>
                    <PriorityBadge priority={result.priority} />
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Detected place</dt>
                  <dd className="text-sm text-slate-800">{result.detected_location || 'None detected'}</dd>
                </div>
                {result.cluster && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Cluster</dt>
                    <dd className="text-sm text-slate-800">
                      #{result.cluster.id} {result.cluster.title}
                    </dd>
                  </div>
                )}
              </dl>

              {result.possible_duplicate && (
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                  <p className="text-sm text-amber-900">
                    Looks similar to complaint #{result.possible_duplicate.complaint_id}
                    {result.possible_duplicate.similarity != null
                      ? ` (${Math.round(result.possible_duplicate.similarity * 100)}% similar)`
                      : ''}
                    .
                  </p>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <Link to={`/student/complaints/${result.complaint.id}`}>
                  <Button variant="primary" size="sm">Track this complaint</Button>
                </Link>
                <Button variant="ghost" size="sm" onClick={() => setResult(null)}>
                  Report another
                </Button>
              </div>
            </Card>
          ) : (
            <Card title="What happens next">
              <ol className="space-y-3">
                {STEPS.map((step, index) => (
                  <li key={step} className="flex gap-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-600">
                      {index + 1}
                    </span>
                    <span className="text-sm text-slate-600">{step}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-4 text-xs text-slate-500">
                Predictions can be wrong. Staff can correct the category and priority while working on it.
              </p>
            </Card>
          )}

          <Card title="Already reported?">
            <p className="text-sm text-slate-600">
              Check your existing complaints first — if someone already reported the same problem,
              you can follow that one instead.
            </p>
            <Link to="/student/complaints" className="mt-3 inline-block">
              <Button variant="secondary" size="sm">View my complaints</Button>
            </Link>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default StudentReport
