import { useState, useEffect, useRef } from "react";
import type { AppView } from "../types";
import { STAGES, STAGE_LABELS } from "../types";
import { getDistinctCountries } from "../api";

const TYPE_OPTIONS = [
  { value: "reseller", label: "经销商" },
  { value: "distributor", label: "分销商" },
  { value: "SI", label: "系统集成商" },
  { value: "MSP", label: "托管服务商" },
];

const SCALE_OPTIONS = [
  { value: "51-200", label: "51-200人" },
  { value: "201-500", label: "201-500人" },
  { value: "11-50", label: "11-50人" },
  { value: "2-10", label: "2-10人" },
  { value: "501-1000", label: "500+人" },
];

function SearchIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={`${className} shrink-0`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function ModeToggle({ mode, onChange }: { mode: "live" | "precise"; onChange: (m: "live" | "precise") => void }) {
  return (
    <button
      onClick={() => onChange(mode === "live" ? "precise" : "live")}
      className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs border transition shrink-0 ${
        mode === "live"
          ? "bg-blue-900/30 border-blue-700/40 text-blue-300 hover:bg-blue-900/50"
          : "bg-amber-900/30 border-amber-700/40 text-amber-300 hover:bg-amber-900/50"
      }`}
      title={mode === "live" ? "当前：实时搜索 — 每输入一个字符自动搜索。点击切换为精确搜索" : "当前：精确搜索 — 输入后回车或点按钮搜索。点击切换为实时搜索"}
    >
      {mode === "live" ? (
        <>
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span>实时</span>
        </>
      ) : (
        <>
          <SearchIcon className="w-3 h-3" />
          <span>精确</span>
        </>
      )}
    </button>
  );
}

export default function Toolbar({
  view, search, onSearchChange, onSearchSubmit,
  searchMode, onSearchModeChange,
  filterStage, onFilterStageChange,
  filterCountry, onFilterCountryChange,
  filterType, onFilterTypeChange,
  filterScale, onFilterScaleChange,
  resultCount,
}: {
  view: AppView;
  search: string; onSearchChange: (v: string) => void;
  onSearchSubmit?: () => void;
  searchMode: "live" | "precise"; onSearchModeChange: (m: "live" | "precise") => void;
  filterStage: string; onFilterStageChange: (v: string) => void;
  filterCountry: string; onFilterCountryChange: (v: string) => void;
  filterType: string; onFilterTypeChange: (v: string) => void;
  filterScale: string; onFilterScaleChange: (v: string) => void;
  resultCount?: number;
}) {
  const [countries, setCountries] = useState<string[]>([]);
  const [countryLoading, setCountryLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // In precise mode: local input buffer, only submit on Enter/button click
  const [localSearch, setLocalSearch] = useState(search);

  // Sync parent search changes into local (e.g. on view switch clear)
  useEffect(() => {
    setLocalSearch(search);
  }, [search]);

  useEffect(() => {
    setCountryLoading(true);
    getDistinctCountries()
      .then(setCountries)
      .catch(() => {})
      .finally(() => setCountryLoading(false));
  }, []);

  // Keyboard shortcut: Ctrl/Cmd+K to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const handleSubmit = () => {
    const value = searchMode === "precise" ? localSearch : search;
    onSearchChange(value);
    onSearchSubmit?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSubmit();
    }
  };

  const handleClear = () => {
    if (searchMode === "precise") {
      setLocalSearch("");
    }
    onSearchChange("");
    onSearchSubmit?.();
  };

  const handleChange = (value: string) => {
    if (searchMode === "live") {
      onSearchChange(value);
    } else {
      setLocalSearch(value);
    }
  };

  // Only show search/filters for pipeline and customers views
  if (view !== "pipeline" && view !== "customers") return null;

  return (
    <div className="px-4 py-3 bg-slate-900/80 backdrop-blur border-b border-slate-800 flex items-center gap-3 shrink-0 flex-wrap">
      {/* Mode toggle */}
      <ModeToggle mode={searchMode} onChange={onSearchModeChange} />

      {/* Search */}
      <div className="relative flex items-center w-72">
        <div className="absolute left-3 pointer-events-none">
          <SearchIcon />
        </div>
        <input
          ref={inputRef}
          type="text"
          placeholder="搜索名称、网址或备注..."
          value={searchMode === "precise" ? localSearch : search}
          onChange={e => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full pl-9 pr-8 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition"
        />
        {(searchMode === "precise" ? localSearch : search) ? (
          <div className="absolute right-2">
            <button
              onClick={handleClear}
              className="p-0.5 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition shrink-0"
              aria-label="清除搜索"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <kbd className="absolute right-2.5 pointer-events-none hidden sm:inline-flex items-center gap-0.5 text-[10px] text-slate-600">
            <span className="border border-slate-700 rounded px-1 py-0.5 leading-none">⌘</span>
            <span className="border border-slate-700 rounded px-1 py-0.5 leading-none">K</span>
          </kbd>
        )}
      </div>

      {/* Search button (precise mode only) */}
      {searchMode === "precise" && (
        <button
          onClick={handleSubmit}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition shrink-0"
        >
          <span className="flex items-center gap-1">
            <SearchIcon className="w-3.5 h-3.5" />
            <span>搜索</span>
          </span>
        </button>
      )}

      {/* Stage filter — only in pipeline view */}
      {view === "pipeline" && (
        <select
          value={filterStage}
          onChange={e => onFilterStageChange(e.target.value)}
          className="px-3 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition"
        >
          <option value="">全部阶段</option>
          {STAGES.map(s => (
            <option key={s} value={s}>{STAGE_LABELS[s]}</option>
          ))}
        </select>
      )}

      {/* Country */}
      <select
        value={filterCountry}
        onChange={e => onFilterCountryChange(e.target.value)}
        className="px-3 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition"
      >
        <option value="">全部国家</option>
        {countryLoading && <option disabled>加载中...</option>}
        {countries.map(c => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>

      {/* Type */}
      <select
        value={filterType}
        onChange={e => onFilterTypeChange(e.target.value)}
        className="px-3 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition"
      >
        <option value="">全部类型</option>
        {TYPE_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Scale */}
      <select
        value={filterScale}
        onChange={e => onFilterScaleChange(e.target.value)}
        className="px-3 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition"
      >
        <option value="">全部规模</option>
        {SCALE_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Result count */}
      {resultCount !== undefined && (
        <span className="text-xs text-slate-500 ml-auto">{resultCount} 条结果</span>
      )}
    </div>
  );
}
