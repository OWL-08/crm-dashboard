import type { AppView } from "../types";
import { useState, useEffect } from "react";
import { getDatabaseInfo, backupDatabase } from "../api";

const NAV_ITEMS: { view: AppView; icon: string; label: string }[] = [
  { view: "pipeline", icon: "📋", label: "Pipeline" },
  { view: "customers", icon: "🏢", label: "客户列表" },
  { view: "analytics", icon: "📊", label: "数据分析" },
  { view: "calendar", icon: "📅", label: "跟进日历" },
  { view: "tags", icon: "🏷️", label: "标签管理" },
];

export default function Sidebar({
  view, onViewChange, onAdd, onImport, customerCount,
}: {
  view: AppView; onViewChange: (v: AppView) => void;
  onAdd: () => void; onImport: () => void;
  customerCount?: number;
}) {
  // Backup state
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [dbInfo, setDbInfo] = useState<{ file_size_bytes: number; total_customers: number } | null>(null);

  useEffect(() => {
    getDatabaseInfo().then(setDbInfo).catch(() => {});
  }, []);

  const handleBackup = async () => {
    setBackingUp(true);
    setBackupMsg(null);
    setBackupError(null);
    try {
      const result = await backupDatabase();
      const sizeStr = result.size_bytes > 1024 * 1024
        ? `${(result.size_bytes / 1024 / 1024).toFixed(1)} MB`
        : `${(result.size_bytes / 1024).toFixed(0)} KB`;
      setBackupMsg(`✅ ${sizeStr}`);
      setTimeout(() => setBackupMsg(null), 8000);
    } catch (e) {
      setBackupError(String(e));
      setTimeout(() => setBackupError(null), 5000);
    } finally {
      setBackingUp(false);
    }
  };

  return (
    <aside className="w-56 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
      {/* Brand */}
      <div className="p-4 border-b border-slate-800">
        <h1 className="text-base font-bold text-slate-100 tracking-tight">
          📊 CRM Dashboard
        </h1>
        <p className="text-xs text-slate-500 mt-1">客户开发看板</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(item => (
          <button
            key={item.view}
            onClick={() => onViewChange(item.view)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition flex items-center gap-2.5 ${
              view === item.view
                ? "bg-blue-600/20 text-blue-300 font-medium border border-blue-600/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
            }`}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Actions */}
      <div className="p-3 border-t border-slate-800 space-y-2">
        <button
          onClick={onAdd}
          className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition"
        >
          + 新建客户
        </button>
        <button
          onClick={onImport}
          className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm border border-slate-700 transition"
        >
          📥 导入Excel
        </button>
      </div>

      {/* Footer */}
      <div className="p-3 text-xs text-slate-600 border-t border-slate-800 space-y-1">
        <div>MCP: localhost:9876</div>
        {customerCount !== undefined && <div>共 {customerCount} 客户</div>}

        {/* Backup button */}
        <div className="pt-2 border-t border-slate-800">
          {backupMsg && <div className="text-green-500 text-xs mb-1">{backupMsg}</div>}
          {backupError && <div className="text-red-400 text-xs mb-1">❌ {backupError}</div>}
          <button
            onClick={handleBackup}
            disabled={backingUp}
            className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded text-xs border border-slate-700 transition disabled:opacity-50"
          >
            {backingUp ? "备份中..." : "💾 备份数据库"}
          </button>
          {dbInfo && (
            <div className="text-slate-600 text-[10px] mt-1">
              数据库: {(dbInfo.file_size_bytes / 1024).toFixed(0)} KB · {dbInfo.total_customers} 客户
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
