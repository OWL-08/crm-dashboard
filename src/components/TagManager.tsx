import { useState, useEffect } from "react";
import type { Tag } from "../types";
import { getAllTagsWithCount, createTag, deleteTag } from "../api";
import { LoadingSpinner, EmptyState, ErrorMessage } from "./FormElements";

const PRESET_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#6366f1",
];

export default function TagManager() {
  const [tags, setTags] = useState<(Tag & { customer_count: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadTags = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAllTagsWithCount();
      setTags(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTags(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createTag(newName.trim(), newColor);
      setNewName("");
      setNewColor(PRESET_COLORS[0]);
      setShowForm(false);
      await loadTags();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`确认删除标签"${name}"？将从所有客户移除该标签。`)) return;
    setError(null);
    try {
      await deleteTag(id);
      await loadTags();
    } catch (e) {
      setError(String(e));
    }
  };

  if (error && tags.length === 0) return <ErrorMessage message={error} onRetry={loadTags} />;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-100">🏷️ 标签管理</h2>
          <p className="text-sm text-slate-400 mt-1">管理客户标签分类</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition"
        >
          + 新建标签
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-800/50 rounded-lg text-sm text-red-300">
          ❌ {error}
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div className="mb-6 p-4 bg-slate-800 border border-slate-700 rounded-xl space-y-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1">标签名称</label>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="输入标签名称..."
              className="w-full px-3 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-2">颜色</label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => setNewColor(color)}
                  className={`w-7 h-7 rounded-full transition border-2 ${
                    newColor === color ? "border-white scale-110" : "border-transparent"
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleCreate}
              disabled={saving || !newName.trim()}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition disabled:opacity-50"
            >
              {saving ? "创建中..." : "创建"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm border border-slate-600 transition"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* Tag list */}
      {loading ? (
        <LoadingSpinner text="加载标签..." />
      ) : tags.length === 0 ? (
        <EmptyState icon="🏷️" text="暂无标签" subtext="创建标签后可从客户详情中为客户打标签" />
      ) : (
        <div className="space-y-2">
          {tags.map(tag => (
            <div
              key={tag.id}
              className="flex items-center justify-between p-3 bg-slate-800/50 border border-slate-700/50 rounded-lg hover:bg-slate-800 transition"
            >
              <div className="flex items-center gap-3">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="text-sm font-medium text-slate-200">{tag.name}</span>
                <span className="text-xs text-slate-500 bg-slate-700/50 px-2 py-0.5 rounded-full">
                  {tag.customer_count} 客户
                </span>
              </div>
              <button
                onClick={() => handleDelete(tag.id, tag.name)}
                className="text-xs text-slate-500 hover:text-red-400 transition px-2 py-1"
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
