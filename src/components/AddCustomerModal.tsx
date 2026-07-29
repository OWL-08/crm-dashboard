import { useState } from "react";
import { upsertCustomer, updatePipeline, addContact } from "../api";
import { Field } from "./FormElements";

export default function AddCustomerModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({
    name: "", website: "", country: "", industry: "",
    customer_type: "", scale: "", source: "", notes: "",
  });
  const [contact, setContact] = useState({ name: "", title: "", email: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!form.name) return;
    setSaving(true);
    setError(null);
    try {
      const id = await upsertCustomer({
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
        customer_id: id,
        stage: "lead",
        product_interest: null,
        estimated_value: null,
        notes: null,
        next_action: null,
        next_action_date: null,
      });
      if (contact.name) {
        await addContact({
          customer_id: id,
          name: contact.name,
          title: contact.title || null,
          email: contact.email || null,
          phone: contact.phone || null,
          role_category: null,
          notes: null,
        });
      }
      onClose();
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-[520px] max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-100">新建客户</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-900/30 border border-red-800/50 rounded-lg text-sm text-red-300">
              ❌ {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="公司名称" value={form.name} onChange={v => setForm({...form, name: v})} required />
            </div>
            <Field label="网站" value={form.website} onChange={v => setForm({...form, website: v})} />
            <Field label="国家" value={form.country} onChange={v => setForm({...form, country: v})} />
            <Field label="行业" value={form.industry} onChange={v => setForm({...form, industry: v})} />
            <Field label="类型" value={form.customer_type} onChange={v => setForm({...form, customer_type: v})} />
            <Field label="规模" value={form.scale} onChange={v => setForm({...form, scale: v})} />
            <Field label="来源" value={form.source} onChange={v => setForm({...form, source: v})} />
            <div className="col-span-2">
              <label className="text-xs text-slate-400 block mb-1">备注</label>
              <textarea
                value={form.notes}
                onChange={e => setForm({...form, notes: e.target.value})}
                className="w-full px-3 py-1.5 bg-slate-700/50 border border-slate-600 rounded text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                rows={3}
                placeholder="公司背景、关键信息、注意事项..."
              />
            </div>
          </div>

          {/* Contact section */}
          <div className="pt-4 border-t border-slate-700">
            <h3 className="text-sm font-semibold text-slate-400 mb-3">👤 主要联系人（选填）</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="联系人姓名" value={contact.name} onChange={v => setContact({...contact, name: v})} />
              <Field label="职位" value={contact.title} onChange={v => setContact({...contact, title: v})} />
              <Field label="邮箱" value={contact.email} onChange={v => setContact({...contact, email: v})} />
              <Field label="电话" value={contact.phone} onChange={v => setContact({...contact, phone: v})} />
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-slate-700 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm border border-slate-600 transition"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !form.name}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition disabled:opacity-50"
          >
            {saving ? "保存中..." : "创建"}
          </button>
        </div>
      </div>
    </div>
  );
}
