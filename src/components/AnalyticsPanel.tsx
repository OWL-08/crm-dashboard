import { useState, useEffect } from "react";
import type { AnalyticsData } from "../types";
import { STAGE_LABELS } from "../types";
import { getAnalytics } from "../api";
import { LoadingSpinner, ErrorMessage } from "./FormElements";

// Simple SVG horizontal bar
function BarChart({
  data, labelKey, valueKey, color = "#3b82f6", maxItems = 10, unit = "",
}: {
  data: Record<string, any>[];
  labelKey: string; valueKey: string;
  color?: string; maxItems?: number; unit?: string;
}) {
  const items = data.slice(0, maxItems);
  const maxVal = Math.max(...items.map(d => d[valueKey]), 1);
  if (items.length === 0) return <div className="text-sm text-slate-500 py-4 text-center">暂无数据</div>;

  return (
    <div className="space-y-2">
      {items.map((d, i) => {
        const pct = (d[valueKey] / maxVal) * 100;
        return (
          <div key={d[labelKey] || i}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-300 truncate">{d[labelKey] || "(空)"}</span>
              <span className="text-slate-500">{d[valueKey]}{unit}</span>
            </div>
            <div className="w-full bg-slate-700/50 rounded-full h-2 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.max(pct, 3)}%`, backgroundColor: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FunnelChart({ stages }: { stages: { stage: string; count: number }[] }) {
  const maxVal = Math.max(...stages.map(s => s.count), 1);
  const stageOrder = ["lead", "contacted", "replied", "negotiating", "won"];
  const colors = ["#64748b", "#3b82f6", "#f59e0b", "#8b5cf6", "#22c55e"];
  const items = stageOrder.map(s => stages.find(d => d.stage === s) || { stage: s, count: 0 });

  return (
    <div className="flex flex-col items-center gap-2 py-2">
      {items.map((item, i) => {
        const pct = (item.count / maxVal) * 100;
        return (
          <div key={item.stage} className="w-full flex items-center gap-3">
            <span className="text-xs text-slate-400 w-16 text-right shrink-0">
              {STAGE_LABELS[item.stage]}
            </span>
            <div className="flex-1 flex justify-center">
              <div
                className="h-7 rounded flex items-center justify-center text-xs font-medium text-white/90 transition-all duration-500"
                style={{
                  width: `${Math.max(pct, 5)}%`,
                  backgroundColor: colors[i],
                }}
              >
                {item.count}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MetricCard({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon: string }) {
  return (
    <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{icon}</span>
        <span className="text-xs text-slate-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-bold text-slate-100">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

export default function AnalyticsPanel() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getAnalytics();
      setData(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  if (error) return <ErrorMessage message={error} onRetry={loadData} />;
  if (loading || !data) return <LoadingSpinner text="加载分析数据..." />;

  return (
    <div className="p-6 overflow-auto h-full">
      <h2 className="text-lg font-bold text-slate-100 mb-6">📊 数据分析</h2>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <MetricCard icon="🏢" label="总客户" value={data.total_customers} />
        <MetricCard icon="👤" label="总联系人" value={data.total_contacts} />
        <MetricCard icon="✅" label="成交率" value={`${(data.won_rate * 100).toFixed(1)}%`} sub={`${Math.round(data.won_rate * data.total_customers)} 成交`} />
        <MetricCard icon="📝" label="近期活动" value={data.recent_activity_count} sub="近30天" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline Funnel */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">开发漏斗</h3>
          <FunnelChart stages={data.pipeline_distribution} />
        </div>

        {/* Country distribution */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">🌍 国家分布 (Top 10)</h3>
          <BarChart
            data={data.country_distribution}
            labelKey="country"
            valueKey="count"
            color="#3b82f6"
            maxItems={10}
          />
        </div>

        {/* Type distribution */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">🏷️ 客户类型分布</h3>
          <BarChart
            data={data.type_distribution}
            labelKey="type"
            valueKey="count"
            color="#8b5cf6"
            unit=""
          />
        </div>

        {/* Stage summary */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">📋 阶段汇总</h3>
          <div className="space-y-3">
            {data.pipeline_distribution.map(d => (
              <div key={d.stage} className="flex items-center justify-between text-sm">
                <span className="text-slate-300">{STAGE_LABELS[d.stage]}</span>
                <div className="flex items-center gap-3">
                  <div className="w-32 bg-slate-700/50 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(d.count / Math.max(...data.pipeline_distribution.map(x => x.count), 1)) * 100}%`,
                        backgroundColor:
                          d.stage === "lead" ? "#64748b" :
                          d.stage === "contacted" ? "#3b82f6" :
                          d.stage === "replied" ? "#f59e0b" :
                          d.stage === "negotiating" ? "#8b5cf6" :
                          d.stage === "won" ? "#22c55e" : "#ef4444"
                      }}
                    />
                  </div>
                  <span className="text-slate-400 w-8 text-right">{d.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Contacted rate info */}
      <div className="mt-6 p-4 bg-slate-800/30 border border-slate-700/50 rounded-xl">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-400">📬 已联系率</span>
          <span className="text-lg font-bold text-slate-100">{(data.contacted_rate * 100).toFixed(1)}%</span>
          <span className="text-slate-500">|
            {data.pipeline_distribution.filter(d => d.stage === "won" || d.stage === "negotiating" || d.stage === "contacted" || d.stage === "replied").reduce((a, b) => a + b.count, 0)}
            / {data.pipeline_distribution.reduce((a, b) => a + b.count, 0)} 客户已进入开发流程
          </span>
        </div>
      </div>
    </div>
  );
}
