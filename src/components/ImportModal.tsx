import { useState, useRef, useCallback } from "react";
import Papa from "papaparse";
import type { Customer } from "../types";
import { batchImportCustomers } from "../api";

const KNOWN_FIELDS: { key: keyof Customer; label: string; required?: boolean }[] = [
  { key: "name", label: "公司名称", required: true },
  { key: "website", label: "网站" },
  { key: "country", label: "国家" },
  { key: "industry", label: "行业" },
  { key: "customer_type", label: "客户类型" },
  { key: "scale", label: "规模" },
  { key: "source", label: "来源" },
  { key: "notes", label: "备注" },
];

type ColumnMap = { csvColumn: string; targetField: string }[];

// Auto-detect column mapping based on fuzzy name matching
function autoDetectMap(headers: string[]): ColumnMap {
  const synonyms: Record<string, string[]> = {
    name: ["name", "company", "公司", "企业", "客户", "customer", "客户名称", "公司名称", "企业名称"],
    website: ["website", "web", "url", "site", "网址", "网站", "公司网址"],
    country: ["country", "nation", "国家", "地区", "region", "所在地"],
    industry: ["industry", "sector", "field", "行业", "产业", "领域"],
    customer_type: ["type", "customer_type", "客户类型", "类型", "category", "类别"],
    scale: ["scale", "size", "规模", "公司规模", "人数", "员工", "employees"],
    source: ["source", "lead_source", "来源", "渠道", "渠道来源"],
    notes: ["notes", "remark", "备注", "说明", "description", "描述", "note"],
  };

  return headers.map(h => {
    const lower = h.toLowerCase().trim();
    for (const [field, aliases] of Object.entries(synonyms)) {
      if (aliases.some(a => lower === a || lower.includes(a) || a.includes(lower))) {
        return { csvColumn: h, targetField: field };
      }
    }
    return { csvColumn: h, targetField: "" }; // unmatched
  });
}

export default function ImportModal({ onClose }: { onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);

  // State machine: select → preview → importing → done
  const [step, setStep] = useState<"select" | "preview" | "importing" | "done">("select");

  const [rawData, setRawData] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMap, setColumnMap] = useState<ColumnMap>([]);
  const [totalRows, setTotalRows] = useState(0);

  const [importResult, setImportResult] = useState<{ imported: number; errors: { index: number; name: string; error: string }[] } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");

  // Handle file selection
  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);

    // Read as text first, then parse (avoids Papa.Parse Node vs browser overload issue)
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      // @ts-expect-error - @types/papaparse 5.5.2 的浏览器重载签名不匹配
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        preview: 50,
        complete: (results: Papa.ParseResult<Record<string, string>>) => {
          if (results.errors.length > 0 && results.data.length === 0) {
            setImportError(`CSV 解析错误: ${results.errors[0].message}`);
            return;
          }
          const data = results.data as Record<string, string>[];
          if (data.length === 0) {
            setImportError("CSV 文件为空");
            return;
          }
          setHeaders(results.meta.fields || []);
          setRawData(data);
          setColumnMap(autoDetectMap(results.meta.fields || []));
          setTotalRows(data.length);
          setStep("preview");
        },
        error: (err: Papa.ParseError) => {
          setImportError(`文件读取失败: ${err.message}`);
        },
      });
    };
    reader.onerror = () => setImportError("文件读取失败");
    reader.readAsText(file);
  }, []);

  // Handle column remapping
  const updateMapping = (csvCol: string, targetField: string) => {
    setColumnMap(prev => prev.map(m => m.csvColumn === csvCol ? { ...m, targetField } : m));
  };

  // Execute import
  const handleImport = async () => {
    setStep("importing");
    setImportError(null);
    setProgress("正在导入数据...");

    try {
      // Build Customer objects from mapped columns
      const validMappings = columnMap.filter(m => m.targetField);
      if (!validMappings.some(m => m.targetField === "name")) {
        setImportError("请将至少一列映射到「公司名称」（必填）");
        setStep("preview");
        return;
      }

      const customers: Partial<Customer>[] = rawData.map(row => {
        const cust: Partial<Customer> = {};
        for (const m of validMappings) {
          if (m.targetField === "name") {
            cust.name = row[m.csvColumn] || "未命名";
          } else if (m.targetField === "website") cust.website = row[m.csvColumn] || null;
          else if (m.targetField === "country") cust.country = row[m.csvColumn] || null;
          else if (m.targetField === "industry") cust.industry = row[m.csvColumn] || null;
          else if (m.targetField === "customer_type") cust.customer_type = row[m.csvColumn] || null;
          else if (m.targetField === "scale") cust.scale = row[m.csvColumn] || null;
          else if (m.targetField === "source") cust.source = row[m.csvColumn] || null;
          else if (m.targetField === "notes") cust.notes = row[m.csvColumn] || null;
        }
        return cust;
      });

      // Filter out completely empty rows
      const valid = customers.filter(c => c.name && c.name !== "未命名" && c.name.trim());

      setProgress(`正在导入 ${valid.length} 条客户记录...`);
      const result = await batchImportCustomers(valid as Customer[]);
      setImportResult(result);
      setStep("done");
    } catch (e) {
      setImportError(String(e));
      setStep("preview");
    }
  };

  // Re-select file
  const handleReset = () => {
    setStep("select");
    setRawData([]);
    setHeaders([]);
    setColumnMap([]);
    setImportResult(null);
    setImportError(null);
    setProgress("");
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start justify-center pt-12 z-50" onClick={onClose}>
      <div
        className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-[640px] max-h-[85vh] overflow-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b border-slate-700 flex items-center justify-between sticky top-0 bg-slate-800 z-10 rounded-t-xl">
          <h2 className="text-lg font-bold text-slate-100">📥 导入客户数据</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg">✕</button>
        </div>

        <div className="p-5">
          {importError && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-800/50 rounded-lg text-sm text-red-300">
              ❌ {importError}
            </div>
          )}

          {/* ── Step 1: File Selection ── */}
          {step === "select" && (
            <div className="space-y-4">
              <div className="bg-slate-900 rounded-lg p-6 text-center">
                <div className="text-4xl mb-3">📄</div>
                <p className="text-sm text-slate-400 mb-4">选择 CSV 文件导入客户数据</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFile}
                  className="block w-full text-sm text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer"
                />
              </div>

              <div className="text-xs text-slate-500 space-y-1 p-4 bg-slate-900/50 rounded-lg">
                <p className="font-medium text-slate-400 mb-1">📌 CSV 格式要求：</p>
                <p>• 第一行为列名（如 name, website, country, industry...）</p>
                <p>• 支持 UTF-8 编码</p>
                <p>• 系统会自动识别列名映射，你可以在下一步调整</p>
                <p className="mt-2 text-slate-600">💡 也可从 Excel 另存为 CSV 后导入</p>
              </div>
            </div>
          )}

          {/* ── Step 2: Preview & Column Mapping ── */}
          {step === "preview" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-400">
                  已解析 <span className="text-slate-200 font-medium">{totalRows}</span> 行数据
                </p>
                <button onClick={handleReset} className="text-xs text-blue-400 hover:underline">重新选择文件</button>
              </div>

              {/* Column mapping */}
              <div>
                <p className="text-xs text-slate-500 mb-2">🔗 列名映射（点击下拉选择对应字段）：</p>
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_auto_1fr] gap-2 text-xs text-slate-500 px-2 mb-1">
                    <span>CSV 列名</span>
                    <span />
                    <span>系统字段</span>
                  </div>
                  {columnMap.map(m => (
                    <div key={m.csvColumn} className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
                      <span className="text-xs text-slate-300 bg-slate-700/50 px-2 py-1.5 rounded truncate">
                        {m.csvColumn}
                      </span>
                      <span className="text-slate-600">→</span>
                      <select
                        value={m.targetField}
                        onChange={e => updateMapping(m.csvColumn, e.target.value)}
                        className="px-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      >
                        <option value="">— 不导入 —</option>
                        {KNOWN_FIELDS.map(f => (
                          <option key={f.key} value={f.key}>
                            {f.label}{f.required ? " *" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview table (first 5 rows) */}
              <div>
                <p className="text-xs text-slate-500 mb-2">👁️ 数据预览（前 {Math.min(5, rawData.length)} 行）：</p>
                <div className="overflow-x-auto bg-slate-900/50 rounded-lg">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-700">
                        {headers.map(h => (
                          <th key={h} className="px-2 py-1.5 text-left text-slate-400 font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rawData.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-b border-slate-800">
                          {headers.map(h => (
                            <td key={h} className="px-2 py-1.5 text-slate-300 truncate max-w-[120px]">{row[h]}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={handleReset}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm border border-slate-600 transition"
                >
                  取消
                </button>
                <button
                  onClick={handleImport}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition"
                >
                  导入 {totalRows} 条数据
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Importing ── */}
          {step === "importing" && (
            <div className="text-center py-8">
              <svg className="animate-spin mx-auto h-8 w-8 text-blue-400 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-sm text-slate-400">{progress}</p>
            </div>
          )}

          {/* ── Step 4: Done ── */}
          {step === "done" && importResult && (
            <div className="space-y-4">
              <div className="bg-green-900/20 border border-green-800/40 rounded-lg p-6 text-center">
                <div className="text-3xl mb-2">✅</div>
                <p className="text-lg font-bold text-green-300">导入完成</p>
                <p className="text-sm text-green-400/80 mt-1">
                  成功导入 <strong>{importResult.imported}</strong> 条客户记录
                </p>
                {importResult.errors.length > 0 && (
                  <p className="text-xs text-amber-400 mt-2">
                    ⚠️ {importResult.errors.length} 条导入失败
                  </p>
                )}
              </div>

              {importResult.errors.length > 0 && (
                <div className="bg-amber-900/20 border border-amber-800/40 rounded-lg p-3 max-h-32 overflow-auto">
                  <p className="text-xs text-amber-300 font-medium mb-1">导入失败的记录：</p>
                  {importResult.errors.map((err, i) => (
                    <p key={i} className="text-xs text-amber-400/70">#{err.index}: {err.name} — {err.error}</p>
                  ))}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  onClick={handleReset}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm border border-slate-600 transition"
                >
                  继续导入
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition"
                >
                  完成
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
