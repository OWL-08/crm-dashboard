import { useState, useEffect, useMemo } from "react";
import type { CustomerDetail, Tag, Activity } from "../types";
import { STAGES, STAGE_LABELS, ROLE_LABELS } from "../types";
import { upsertCustomer, updatePipeline, addContact, logActivity, deleteCustomer, getCustomerTags, setCustomerTags, getTags } from "../api";
import { Section, Info, Field } from "./FormElements";

const STAGE_COLORS: Record<string, string> = {
  lead:        "bg-slate-700 text-slate-200",
  contacted:   "bg-blue-900/60 text-blue-300",
  replied:     "bg-amber-900/60 text-amber-300",
  negotiating: "bg-purple-900/60 text-purple-300",
  won:         "bg-green-900/60 text-green-300",
  lost:        "bg-red-900/60 text-red-300",
};

export default function DetailModal({
  detail, onClose, onUpdate,
}: {
  detail: CustomerDetail; onClose: () => void;
  onUpdate: () => void;
}) {
  const { customer, contacts, pipeline, activities } = detail;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ ...customer });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New contact form
  const [showContactForm, setShowContactForm] = useState(false);
  const [newContact, setNewContact] = useState({
    name: "", title: "", email: "", phone: "", role_category: "", notes: "",
  });

  // Pipeline form
  const [pipeForm, setPipeForm] = useState({
    stage: pipeline?.stage || "lead",
    product_interest: pipeline?.product_interest || "",
    estimated_value: pipeline?.estimated_value?.toString() || "",
    notes: pipeline?.notes || "",
    next_action: pipeline?.next_action || "",
    next_action_date: pipeline?.next_action_date || "",
    activity_note: "",
  });

  // Tags
  const [customerTags, setCustomerTagsState] = useState<Tag[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [showTagPicker, setShowTagPicker] = useState(false);

  useEffect(() => {
    getTags().then(setAllTags).catch(() => {});
    getCustomerTags(customer.id!).then(setCustomerTagsState).catch(() => {});
  }, [customer.id]);

  const availableTags = allTags.filter(at => !customerTags.some(ct => ct.id === at.id));

  const handleToggleTag = async (tag: Tag) => {
    const already = customerTags.some(ct => ct.id === tag.id);
    const newIds = already
      ? customerTags.filter(ct => ct.id !== tag.id).map(ct => ct.id)
      : [...customerTags.map(ct => ct.id), tag.id];
    try {
      await setCustomerTags(customer.id!, newIds);
      if (already) {
        setCustomerTagsState(customerTags.filter(ct => ct.id !== tag.id));
      } else {
        setCustomerTagsState([...customerTags, tag]);
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await upsertCustomer({
        id: customer.id,
        name: form.name,
        website: form.website || null,
        country: form.country || null,
        industry: form.industry || null,
        customer_type: form.customer_type || null,
        scale: form.scale || null,
        source: form.source || null,
        notes: form.notes || null,
      });
      await updatePipeline({
        customer_id: customer.id!,
        stage: pipeForm.stage,
        product_interest: pipeForm.product_interest || null,
        estimated_value: pipeForm.estimated_value ? Number(pipeForm.estimated_value) : null,
        notes: pipeForm.notes || null,
        next_action: pipeForm.next_action || null,
        next_action_date: pipeForm.next_action_date || null,
      });
      if (pipeForm.activity_note) {
        await logActivity({
          customer_id: customer.id!,
          pipeline_id: pipeline?.id || null,
          activity_type: "note",
          summary: pipeForm.activity_note,
        });
      }
      setEditing(false);
      onUpdate();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleAddContact = async () => {
    if (!newContact.name) return;
    setError(null);
    try {
      await addContact({
        customer_id: customer.id!,
        ...newContact,
        role_category: newContact.role_category || null,
        notes: newContact.notes || null,
      });
      setNewContact({ name: "", title: "", email: "", phone: "", role_category: "", notes: "" });
      setShowContactForm(false);
      onUpdate();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleDelete = async () => {
    if (!confirm(`确认删除客户"${customer.name}"及其所有相关数据？此操作不可撤销。`)) return;
    setError(null);
    try {
      await deleteCustomer(customer.id!);
      onClose();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start justify-center pt-12 z-50" onClick={onClose}>
      <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-[760px] max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-5 border-b border-slate-700 flex items-center justify-between sticky top-0 bg-slate-800 z-10 rounded-t-xl">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-slate-100 truncate">{customer.name}</h2>
              {/* Tags */}
              {customerTags.length > 0 && (
                <div className="flex gap-1 flex-wrap shrink-0">
                  {customerTags.map(tag => (
                    <span
                      key={tag.id}
                      className="text-xs px-2 py-0.5 rounded-full border"
                      style={{ backgroundColor: tag.color + "20", borderColor: tag.color + "50", color: tag.color }}
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {customer.website && (
              <a href={customer.website} target="_blank" className="text-blue-400 text-sm hover:underline">
                {customer.website}
              </a>
            )}
            {pipeline?.stage && (
              <span className={`inline-block mt-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${STAGE_COLORS[pipeline.stage] || ""}`}>
                {STAGE_LABELS[pipeline.stage]}
              </span>
            )}
          </div>
          <div className="flex gap-2 ml-4 shrink-0">
            <button
              onClick={() => setEditing(!editing)}
              className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg border border-slate-600 transition"
            >
              {editing ? "取消" : "✏️ 编辑"}
            </button>
            <button
              onClick={handleDelete}
              className="px-3 py-1.5 text-sm bg-red-900/30 hover:bg-red-900/50 text-red-300 rounded-lg border border-red-800/50 transition"
            >
              🗑️ 删除
            </button>
            <button onClick={onClose} className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg border border-slate-600 transition">
              ✕
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-5 mt-4 p-3 bg-red-900/30 border border-red-800/50 rounded-lg text-sm text-red-300">
            ❌ {error}
          </div>
        )}

        <div className="p-5 space-y-6">
          {/* Tag bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500">🏷️ 标签:</span>
            {customerTags.map(tag => (
              <span
                key={tag.id}
                className="text-xs px-2 py-0.5 rounded-full border inline-flex items-center gap-1"
                style={{ backgroundColor: tag.color + "20", borderColor: tag.color + "50", color: tag.color }}
              >
                {tag.name}
                {editing && (
                  <button onClick={() => handleToggleTag(tag)} className="hover:opacity-70 ml-0.5">×</button>
                )}
              </span>
            ))}
            {editing && availableTags.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowTagPicker(!showTagPicker)}
                  className="text-xs px-2 py-0.5 rounded-full border border-dashed border-slate-600 text-slate-400 hover:text-slate-300 hover:border-slate-500"
                >
                  + 添加
                </button>
                {showTagPicker && (
                  <div className="absolute top-6 left-0 bg-slate-700 border border-slate-600 rounded-lg p-2 shadow-xl z-20 min-w-[140px]">
                    {availableTags.map(tag => (
                      <button
                        key={tag.id}
                        onClick={() => { handleToggleTag(tag); }}
                        className="block w-full text-left text-xs px-2 py-1.5 text-slate-300 hover:bg-slate-600 rounded transition"
                      >
                        <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: tag.color }} />
                        {tag.name}
                      </button>
                    ))}
                    {availableTags.length === 0 && (
                      <span className="text-xs text-slate-500 px-2 py-1 block">没有更多标签</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Customer Info */}
          {editing ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="公司名称" value={form.name} onChange={v => setForm({...form, name: v})} required />
              <Field label="网站" value={form.website || ""} onChange={v => setForm({...form, website: v})} />
              <Field label="国家" value={form.country || ""} onChange={v => setForm({...form, country: v})} />
              <Field label="行业" value={form.industry || ""} onChange={v => setForm({...form, industry: v})} />
              <Field label="类型" value={form.customer_type || ""} onChange={v => setForm({...form, customer_type: v})} />
              <Field label="规模" value={form.scale || ""} onChange={v => setForm({...form, scale: v})} />
              <Field label="来源" value={form.source || ""} onChange={v => setForm({...form, source: v})} />
              <div className="col-span-2">
                <label className="text-xs text-slate-400 block mb-1">备注</label>
                <textarea
                  value={form.notes || ""}
                  onChange={e => setForm({...form, notes: e.target.value})}
                  className="w-full px-3 py-1.5 bg-slate-700/50 border border-slate-600 rounded text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  rows={3}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <Info label="国家" value={customer.country} />
                <Info label="行业" value={customer.industry} />
                <Info label="类型" value={customer.customer_type} />
                <Info label="规模" value={customer.scale} />
                <Info label="来源" value={customer.source} />
                <Info label="创建时间" value={customer.created_at?.slice(0, 10)} />
              </div>
              {customer.notes && (
                <div className="border-t border-slate-700 pt-2 mt-1">
                  <Info label="备注" value={customer.notes} />
                </div>
              )}
            </div>
          )}

          {/* Pipeline */}
          <Section title="📊 开发进度">
            {editing ? (
              <div className="space-y-3">
                <div className="flex gap-3">
                  <select
                    value={pipeForm.stage}
                    onChange={e => setPipeForm({...pipeForm, stage: e.target.value})}
                    className="px-3 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    {STAGES.map(s => (
                      <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                    ))}
                  </select>
                  <input
                    type="text" placeholder="感兴趣的产品"
                    value={pipeForm.product_interest}
                    onChange={e => setPipeForm({...pipeForm, product_interest: e.target.value})}
                    className="flex-1 px-3 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                  <input
                    type="number" placeholder="预估金额 (€)"
                    value={pipeForm.estimated_value}
                    onChange={e => setPipeForm({...pipeForm, estimated_value: e.target.value})}
                    className="w-36 px-3 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <div className="flex gap-3">
                  <input
                    type="text" placeholder="下一步行动"
                    value={pipeForm.next_action}
                    onChange={e => setPipeForm({...pipeForm, next_action: e.target.value})}
                    className="flex-1 px-3 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                  <input
                    type="date"
                    value={pipeForm.next_action_date}
                    onChange={e => setPipeForm({...pipeForm, next_action_date: e.target.value})}
                    className="px-3 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <textarea
                  placeholder="本次活动记录..."
                  value={pipeForm.activity_note}
                  onChange={e => setPipeForm({...pipeForm, activity_note: e.target.value})}
                  className="w-full px-3 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  rows={2}
                />
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition disabled:opacity-50"
                >
                  {saving ? "保存中..." : "保存"}
                </button>
              </div>
            ) : pipeline ? (
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${STAGE_COLORS[pipeline.stage] || ""}`}>
                    {STAGE_LABELS[pipeline.stage]}
                  </span>
                  {pipeline.product_interest && <span className="text-slate-300">🎯 {pipeline.product_interest}</span>}
                  {pipeline.estimated_value && <span className="text-green-400">💰 €{pipeline.estimated_value}</span>}
                </div>
                {pipeline.next_action && (
                  <div className="text-amber-400">
                    ⏰ 下一步: {pipeline.next_action}
                    {pipeline.next_action_date && <span className="ml-2 text-amber-500">({pipeline.next_action_date})</span>}
                  </div>
                )}
                {pipeline.notes && (
                  <div className="text-slate-300 text-sm mt-1 p-2 bg-slate-700/20 rounded">
                    📝 {pipeline.notes}
                  </div>
                )}
              </div>
            ) : (
              <span className="text-sm text-slate-500">暂无进度，点击编辑添加</span>
            )}
          </Section>

          {/* Contacts */}
          <Section title="👥 联系人">
            <div className="space-y-2">
              {contacts.map(c => (
                <div key={c.id} className="flex items-center gap-3 p-2.5 bg-slate-700/30 rounded-lg text-sm">
                  <span className="font-medium text-slate-100">{c.name}</span>
                  {c.title && <span className="text-slate-400">{c.title}</span>}
                  {c.role_category && (
                    <span className="text-xs bg-blue-900/30 text-blue-300 px-1.5 py-0.5 rounded">
                      {ROLE_LABELS[c.role_category] || c.role_category}
                    </span>
                  )}
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="text-blue-400 ml-auto hover:underline">{c.email}</a>
                  )}
                </div>
              ))}
              {contacts.length === 0 && <span className="text-sm text-slate-500">暂无联系人</span>}
            </div>

            {showContactForm ? (
              <div className="mt-3 p-4 bg-slate-700/20 border border-slate-700 rounded-lg space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="姓名" value={newContact.name} onChange={v => setNewContact({...newContact, name: v})} />
                  <Field label="职位" value={newContact.title} onChange={v => setNewContact({...newContact, title: v})} />
                  <Field label="邮箱" value={newContact.email} onChange={v => setNewContact({...newContact, email: v})} />
                  <Field label="电话" value={newContact.phone} onChange={v => setNewContact({...newContact, phone: v})} />
                  <Field label="角色分类" value={newContact.role_category} onChange={v => setNewContact({...newContact, role_category: v})} />
                </div>
                <div className="flex gap-2">
                  <button onClick={handleAddContact} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm">
                    添加
                  </button>
                  <button onClick={() => setShowContactForm(false)} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm border border-slate-600">
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowContactForm(true)}
                className="mt-2 text-sm text-blue-400 hover:text-blue-300 hover:underline"
              >
                + 添加联系人
              </button>
            )}
          </Section>

          {/* Activities — Upgraded Timeline */}
          <Section title="📝 活动记录">
            <ActivityTimeline activities={activities} />
          </Section>
        </div>
      </div>
    </div>
  );
}

// ─── Activity Timeline Component ───

const ACTIVITY_ICONS: Record<string, string> = {
  note: "📝", email_sent: "📤", email_received: "📥",
  call: "📞", meeting: "🤝", stage_change: "🔄",
  system: "⚙️",
};

const ACTIVITY_COLORS: Record<string, string> = {
  note: "border-slate-600",
  email_sent: "border-blue-500",
  email_received: "border-green-500",
  call: "border-amber-500",
  meeting: "border-purple-500",
  stage_change: "border-cyan-500",
};

function ActivityTimeline({ activities }: { activities: Activity[] }) {
  const [filter, setFilter] = useState<string>("all");

  // Group activities by date
  const groups = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const filtered = filter === "all"
      ? activities
      : activities.filter(a => a.activity_type === filter);

    const groups: { label: string; items: Activity[] }[] = [];
    const map = new Map<string, Activity[]>();

    for (const a of filtered) {
      const dateStr = a.created_at?.slice(0, 10) || "unknown";
      if (!map.has(dateStr)) map.set(dateStr, []);
      map.get(dateStr)!.push(a);
    }

    // Sort dates descending
    const sortedDates = Array.from(map.keys()).sort((a, b) => b.localeCompare(a));

    for (const dateStr of sortedDates) {
      const d = new Date(dateStr + "T00:00:00");
      let label: string;
      if (d.getTime() === today.getTime()) label = "📌 今天";
      else if (d.getTime() === yesterday.getTime()) label = "📌 昨天";
      else label = dateStr;

      groups.push({ label, items: map.get(dateStr)! });
    }
    return groups;
  }, [activities, filter]);

  // Available filter types
  const types = useMemo(() => {
    const set = new Set(activities.map(a => a.activity_type));
    return Array.from(set);
  }, [activities]);

  if (activities.length === 0) {
    return <span className="text-sm text-slate-500">暂无活动记录</span>;
  }

  return (
    <div>
      {/* Filter bar */}
      {types.length > 1 && (
        <div className="flex gap-1.5 mb-3 flex-wrap">
          <button
            onClick={() => setFilter("all")}
            className={`text-[10px] px-2 py-0.5 rounded-full transition ${
              filter === "all" ? "bg-blue-600/20 text-blue-300" : "bg-slate-700/50 text-slate-500 hover:text-slate-300"
            }`}
          >
            全部
          </button>
          {types.map(t => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`text-[10px] px-2 py-0.5 rounded-full transition flex items-center gap-1 ${
                filter === t ? "bg-blue-600/20 text-blue-300" : "bg-slate-700/50 text-slate-500 hover:text-slate-300"
              }`}
            >
              {ACTIVITY_ICONS[t] || "📌"} {t}
            </button>
          ))}
        </div>
      )}

      {/* Timeline */}
      <div className="space-y-4 max-h-48 overflow-y-auto pr-1">
        {groups.map(group => (
          <div key={group.label}>
            {/* Date header */}
            <div className="text-[10px] text-slate-500 font-medium mb-2 sticky top-0 bg-slate-800 py-1 z-10">
              {group.label}
              <span className="text-slate-600 ml-1">({group.items.length})</span>
            </div>

            {/* Timeline items */}
            <div className="space-y-0">
              {group.items.map((a, idx) => {
                const isLast = idx === group.items.length - 1;
                const icon = ACTIVITY_ICONS[a.activity_type] || "📌";
                const borderColor = ACTIVITY_COLORS[a.activity_type] || "border-slate-600";
                return (
                  <div key={a.id} className="flex gap-3">
                    {/* Timeline line + dot */}
                    <div className="flex flex-col items-center shrink-0 w-5">
                      <div className={`w-2 h-2 rounded-full border-2 ${borderColor} bg-slate-800 mt-1.5`} />
                      {!isLast && <div className="w-px flex-1 bg-slate-700/50 mt-0.5" />}
                    </div>
                    {/* Content */}
                    <div className={`pb-3 flex-1 min-w-0 ${isLast ? "" : ""}`}>
                      <div className="flex items-start gap-1.5">
                        <span className="text-[10px] leading-5 shrink-0">{icon}</span>
                        <span className="text-[10px] text-slate-500 shrink-0 w-14 mt-0.5">
                          {a.created_at?.slice(11, 16) || ""}
                        </span>
                        <span className="text-xs text-slate-300 break-words">{a.summary}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
