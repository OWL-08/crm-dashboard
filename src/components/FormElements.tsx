import type { ReactNode } from "react";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold mb-2 text-slate-400 uppercase tracking-wider">{title}</h3>
      {children}
    </div>
  );
}

export function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <span className="text-xs text-slate-500 block">{label}</span>
      <span className="text-slate-200">{value || "-"}</span>
    </div>
  );
}

export function Field({
  label, value, onChange, placeholder, type = "text", required,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="text-xs text-slate-400 block mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-1.5 bg-slate-700/50 border border-slate-600 rounded text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition"
      />
    </div>
  );
}

export function Select({
  label, value, onChange, options, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; placeholder?: string;
}) {
  return (
    <div>
      <label className="text-xs text-slate-400 block mb-1">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-1.5 bg-slate-700/50 border border-slate-600 rounded text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition"
      >
        <option value="">{placeholder || "全部"}</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export function LoadingSpinner({ text = "加载中..." }: { text?: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-slate-400">
      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <span className="text-sm">{text}</span>
    </div>
  );
}

export function EmptyState({ icon = "📭", text, subtext }: { icon?: string; text: string; subtext?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-500">
      <div className="text-4xl mb-3">{icon}</div>
      <p className="text-sm font-medium text-slate-400">{text}</p>
      {subtext && <p className="text-xs text-slate-500 mt-1">{subtext}</p>}
    </div>
  );
}

export function ErrorMessage({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="bg-red-900/20 border border-red-800/40 rounded-lg px-6 py-4 max-w-md text-center">
        <div className="text-red-400 text-sm mb-2">❌ {message}</div>
        {onRetry && (
          <button onClick={onRetry} className="text-xs text-blue-400 hover:text-blue-300 underline">
            重试
          </button>
        )}
      </div>
    </div>
  );
}
