function Input({ type = 'text', placeholder, value, onChange, required, disabled, error, label, className = '', wrapperClassName = '', ...props }) {
  return (
    <div className={`space-y-1 ${wrapperClassName}`}>
      {label && <label className="block text-sm font-medium text-slate-700">{label}</label>}
      <input
        type={type}
      placeholder={placeholder}
      value={value}
        onChange={onChange}
        required={required}
        disabled={disabled}
        className={`w-full rounded-md border px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-100 ${
          error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-slate-300'
        } ${className}`}
        {...props}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}

export { Input }
