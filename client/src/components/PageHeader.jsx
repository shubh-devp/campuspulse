import { Link } from 'react-router-dom'

// Shared page heading. The breadcrumb trail is also the back navigation: every
// crumb except the last one links to its parent page.
//
// crumbs = [{ label: 'My Complaints', to: '/student/complaints' }, { label: '#12' }]
function PageHeader({ title, description, crumbs = [], actions }) {
  return (
    <div className="space-y-2">
      {crumbs.length > 0 && (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-500">
            {crumbs.map((crumb, index) => (
              <li key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
                {index > 0 && (
                  <span className="text-slate-300" aria-hidden="true">
                    /
                  </span>
                )}
                {crumb.to ? (
                  <Link to={crumb.to} className="rounded hover:text-slate-900 hover:underline">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="font-medium text-slate-700">{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="break-words text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}

export default PageHeader
