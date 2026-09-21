function Select({ label, value, onChange, options = [], placeholder = 'Select...', error, disabled, className = '', ...props }) {
  return (
    <div className="space-y-1">
      {label && <label className="block text-sm font-medium text-slate-700">{label}</label>}
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={`w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:cursor-not-allowed ${
          error ? 'border-red-500' : ''
        } ${className}`}
        {...props}
      >
        
        {placeholder !== null && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={typeof opt === 'object' ? opt.value : opt} value={typeof opt === 'object' ? opt.value : opt}>
            {typeof opt === 'object' ? opt.label : opt}
          </option>
        ))}
      </select>
    {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}

export { Select }
