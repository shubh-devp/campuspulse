function Table({ children, className = '' }) {
  return (
    <div className={`w-full overflow-x-auto ${className}`}>
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  )
}

function Tr({ header = false, children, className = '' }) {
  return (
    <tr className={`${header ? 'border-b border-slate-200 bg-slate-50' : 'border-b border-slate-100 last:border-0 hover:bg-slate-50/70'} ${className}`}>
      {children}
    </tr>
  )
}

function Th({ children, align = 'left', className = '' }) {
  return (
  <th
      scope="col"
      className={`whitespace-nowrap px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500 ${
      align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
      } ${className}`}
    >
      {children}
    </th>
  )
}

function Td({ children, align = 'left', className = '' }) {
  return (
    <td
      className={`px-4 py-3 align-middle text-slate-700 ${
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
      } ${className}`}
    >
      {children}
    </td>
  )
}




export { Table, Tr, Th, Td }
