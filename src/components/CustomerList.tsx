import type { Customer } from "../types";
import { LoadingSpinner, EmptyState, ErrorMessage } from "./FormElements";

export default function CustomerList({
  customers, onSelect, loading, error, onRetry,
  total, onLoadMore, hasMore,
}: {
  customers: Customer[]; onSelect: (id: number) => void;
  loading?: boolean; error?: string | null; onRetry?: () => void;
  total?: number; onLoadMore?: () => void; hasMore?: boolean;
}) {
  if (error) return <ErrorMessage message={error} onRetry={onRetry} />;
  if (loading && customers.length === 0) return <LoadingSpinner text="加载客户列表..." />;

  if (customers.length === 0) {
    return (
      <EmptyState
        icon="🏢"
        text="暂无客户数据"
        subtext="点击左下角「新建客户」开始，或导入 Excel 批量添加"
      />
    );
  }

  return (
    <div className="space-y-3">
      {total !== undefined && (
        <div className="text-xs text-slate-500 px-1">共 {total} 个客户</div>
      )}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800/80 text-left">
              <th className="p-3 font-medium text-slate-300 text-xs uppercase tracking-wider">公司名称</th>
              <th className="p-3 font-medium text-slate-300 text-xs uppercase tracking-wider">国家</th>
              <th className="p-3 font-medium text-slate-300 text-xs uppercase tracking-wider">类型</th>
              <th className="p-3 font-medium text-slate-300 text-xs uppercase tracking-wider">行业</th>
              <th className="p-3 font-medium text-slate-300 text-xs uppercase tracking-wider">规模</th>
              <th className="p-3 font-medium text-slate-300 text-xs uppercase tracking-wider hidden md:table-cell">备注</th>
              <th className="p-3 font-medium text-slate-300 text-xs uppercase tracking-wider hidden lg:table-cell">更新时间</th>
            </tr>
          </thead>
          <tbody>
            {customers.map(c => (
              <tr
                key={c.id}
                onClick={() => onSelect(c.id!)}
                className="border-b border-slate-700/50 hover:bg-blue-900/10 cursor-pointer transition"
              >
                <td className="p-3 font-medium text-slate-100">{c.name}</td>
                <td className="p-3 text-slate-300">{c.country || "-"}</td>
                <td className="p-3 text-slate-300">{c.customer_type || "-"}</td>
                <td className="p-3 text-slate-300">{c.industry || "-"}</td>
                <td className="p-3 text-slate-300">{c.scale || "-"}</td>
                <td className="p-3 text-xs text-slate-400 max-w-[150px] truncate hidden md:table-cell">
                  {c.notes?.slice(0, 30) || "-"}
                </td>
                <td className="p-3 text-xs text-slate-500 hidden lg:table-cell">
                  {c.updated_at?.slice(0, 10) || "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <button
            onClick={onLoadMore}
            disabled={loading}
            className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "加载中..." : "加载更多 ↓"}
          </button>
        </div>
      )}
    </div>
  );
}
