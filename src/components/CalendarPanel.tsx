import { useState, useEffect } from "react";
import type { CalendarEvent } from "../types";
import { STAGE_LABELS } from "../types";
import { getCalendarEvents } from "../api";
import { LoadingSpinner, EmptyState, ErrorMessage } from "./FormElements";

const STAGE_BG: Record<string, string> = {
  lead:        "bg-slate-700 text-slate-200",
  contacted:   "bg-blue-900/60 text-blue-300",
  replied:     "bg-amber-900/60 text-amber-300",
  negotiating: "bg-purple-900/60 text-purple-300",
  won:         "bg-green-900/60 text-green-300",
  lost:        "bg-red-900/60 text-red-300",
};

function groupByDate(events: CalendarEvent[]): { label: string; events: CalendarEvent[] }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const endOfWeek = new Date(today);
  endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));

  const groups: { label: string; events: CalendarEvent[] }[] = [];
  const overdue: CalendarEvent[] = [];
  const todayEvts: CalendarEvent[] = [];
  const tomorrowEvts: CalendarEvent[] = [];
  const thisWeekEvts: CalendarEvent[] = [];
  const laterEvts: CalendarEvent[] = [];

  for (const evt of events) {
    const d = new Date(evt.next_action_date);
    d.setHours(0, 0, 0, 0);
    if (d < today) {
      overdue.push(evt);
    } else if (d.getTime() === today.getTime()) {
      todayEvts.push(evt);
    } else if (d.getTime() === tomorrow.getTime()) {
      tomorrowEvts.push(evt);
    } else if (d <= endOfWeek) {
      thisWeekEvts.push(evt);
    } else {
      laterEvts.push(evt);
    }
  }

  if (overdue.length > 0) groups.push({ label: "⚠️ 已逾期", events: overdue });
  if (todayEvts.length > 0) groups.push({ label: "📌 今天", events: todayEvts });
  if (tomorrowEvts.length > 0) groups.push({ label: "📌 明天", events: tomorrowEvts });
  if (thisWeekEvts.length > 0) groups.push({ label: "📌 本周内", events: thisWeekEvts });
  if (laterEvts.length > 0) groups.push({ label: "📌 之后", events: laterEvts });

  return groups;
}

function EventCard({ event }: { event: CalendarEvent }) {
  const isOverdue = new Date(event.next_action_date) < new Date(new Date().toDateString());
  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border transition ${
      isOverdue
        ? "bg-red-900/10 border-red-800/30"
        : "bg-slate-800/50 border-slate-700/50 hover:bg-slate-800"
    }`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-100 truncate">{event.customer_name}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${STAGE_BG[event.stage] || "bg-slate-700 text-slate-200"}`}>
            {STAGE_LABELS[event.stage]}
          </span>
        </div>
        {event.next_action && (
          <div className="text-xs text-slate-400 mt-1 truncate">{event.next_action}</div>
        )}
      </div>
      <div className={`text-xs shrink-0 ${
        isOverdue ? "text-red-400 font-medium" : "text-slate-500"
      }`}>
        {event.next_action_date}
      </div>
    </div>
  );
}

export default function CalendarPanel() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCalendarEvents();
      setEvents(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadEvents(); }, []);

  if (error) return <ErrorMessage message={error} onRetry={loadEvents} />;
  if (loading) return <LoadingSpinner text="加载日历..." />;
  if (events.length === 0) {
    return (
      <div className="p-6">
        <EmptyState icon="📅" text="没有待跟进事项" subtext="在客户详情中设置「下一步行动」和日期后，将在这里显示" />
      </div>
    );
  }

  const groups = groupByDate(events);

  return (
    <div className="p-6 overflow-auto h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-100">📅 跟进日历</h2>
          <p className="text-sm text-slate-400 mt-1">共 {events.length} 条待跟进事项</p>
        </div>
      </div>

      <div className="space-y-6 max-w-2xl">
        {groups.map(group => (
          <div key={group.label}>
            <h3 className="text-sm font-semibold text-slate-300 mb-3">{group.label}</h3>
            <div className="space-y-2">
              {group.events.map((evt, i) => (
                <EventCard key={`${evt.customer_id}-${evt.next_action_date}-${i}`} event={evt} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
