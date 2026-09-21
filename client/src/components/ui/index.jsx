import { createPortal } from 'react-dom'
import { useEffect } from 'react'
export { Spinner } from './Spinner'
export { Button } from './Button'
export { Card } from './Card'
export { Input } from './Input'
export { Select } from './Select'
export { Textarea } from './Textarea'
export { Badge } from './Badge'
export { StatCard } from './StatCard'
export { Table, Tr, Th, Td } from './Table'
export { LoadingBlock, EmptyState, ErrorState } from './States'

export function Alert({ type = 'info', title, children, onDismiss }) {
  const typeStyles = {
    info: 'bg-sky-50 border-sky-200 text-sky-800',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
  }

  return (
    <div className={`rounded-lg border px-4 py-3 ${typeStyles[type] || typeStyles.info}`} role="alert">
    <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
          {title && <p className="text-sm font-medium">{title}</p>}
          {children && <div className="mt-0.5 text-sm">{children}</div>}
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="-mr-1 -mt-1 shrink-0 rounded p-1 text-current opacity-60 hover:opacity-100"
            aria-label="Dismiss"
          >
            ✕
          </button>
      )}
    </div>
    </div>
  )
}

export function Modal({ isOpen, onClose, title, children, footer }) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
    <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
          onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}
