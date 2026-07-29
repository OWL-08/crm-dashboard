import { useState, useCallback } from "react";
import type { PipelineItem } from "../types";
import { STAGES, STAGE_LABELS } from "../types";
import { updatePipeline } from "../api";
import {
  DndContext, DragOverlay, closestCorners,
  PointerSensor, useSensor, useSensors,
  useDroppable, useDraggable,
  type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { LoadingSpinner, EmptyState, ErrorMessage } from "./FormElements";

const COLUMN_STYLES: Record<string, string> = {
  lead: "bg-slate-900/80", contacted: "bg-slate-900/80", replied: "bg-slate-900/80",
  negotiating: "bg-slate-900/80", won: "bg-slate-900/80", lost: "bg-slate-900/80",
};
const HEADER_STYLES: Record<string, string> = {
  lead: "text-slate-300", contacted: "text-blue-300", replied: "text-amber-300",
  negotiating: "text-purple-300", won: "text-green-300", lost: "text-red-300",
};
const CARD_BORDERS: Record<string, string> = {
  lead: "border-l-slate-500", contacted: "border-l-blue-400", replied: "border-l-amber-400",
  negotiating: "border-l-purple-400", won: "border-l-green-400", lost: "border-l-red-400",
};

function DraggableCard({ item, isDragging }: { item: PipelineItem; isDragging?: boolean }) {
  const stage = item.pipeline.stage;
  return (
    <div
      className={`bg-slate-800 rounded-lg p-3 border border-slate-700/50 border-l-2 ${CARD_BORDERS[stage] || "border-l-slate-500"} ${
        isDragging ? "opacity-50 shadow-xl" : ""
      }`}
    >
      <div className="text-sm font-medium text-slate-100 truncate">{item.customer.name}</div>
      {item.customer.country && (
        <div className="text-xs text-slate-500 mt-1">📍 {item.customer.country}</div>
      )}
      {item.contacts.length > 0 && (
        <div className="text-xs text-slate-400 mt-1">
          👤 {item.contacts[0].name}
          {item.contacts[0].title ? ` · ${item.contacts[0].title}` : ""}
        </div>
      )}
      {item.pipeline.estimated_value && (
        <div className="text-xs text-green-400 mt-1">💰 €{item.pipeline.estimated_value}</div>
      )}
      {item.pipeline.next_action_date && (
        <div className="text-xs text-amber-400 mt-2">⏰ {item.pipeline.next_action_date}</div>
      )}
    </div>
  );
}

function Card({ item, onSelect }: { item: PipelineItem; onSelect: (id: number) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `card-${item.pipeline.id}`,
    data: { stage: item.pipeline.stage, customerId: item.customer.id, pipelineId: item.pipeline.id },
  });
  const style = transform ? { transform: CSS.Translate.toString(transform), zIndex: isDragging ? 50 : undefined } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => onSelect(item.customer.id!)}
      className={`cursor-grab active:cursor-grabbing ${isDragging ? "opacity-40" : ""}`}
    >
      <DraggableCard item={item} isDragging={isDragging} />
    </div>
  );
}

function Column({ stage, items, onSelect, isOver }: {
  stage: string; items: PipelineItem[]; onSelect: (id: number) => void; isOver?: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: `column-${stage}`, data: { stage } });
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-w-[200px] rounded-xl p-3 flex flex-col ${COLUMN_STYLES[stage]} ${
        isOver ? "ring-2 ring-blue-500/40" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-3 px-1">
        <span className={`text-sm font-semibold ${HEADER_STYLES[stage]}`}>{STAGE_LABELS[stage]}</span>
        <span className="text-xs bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded-full">{items.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2 min-h-[80px] transition-colors">
        {items.map(item => (
          <Card key={item.pipeline.id} item={item} onSelect={onSelect} />
        ))}
        {items.length === 0 && (
          <div className="text-xs text-slate-600 text-center py-6">—</div>
        )}
      </div>
    </div>
  );
}

export default function PipelineBoard({
  items, onSelect, loading, error, onRetry,
}: {
  items: PipelineItem[]; onSelect: (id: number) => void;
  loading?: boolean; error?: string | null; onRetry?: () => void;
}) {
  const [localItems, setLocalItems] = useState<PipelineItem[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragError, setDragError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Use local items if available (optimistic updates), otherwise props
  const displayItems = localItems ?? items;
  // Sync when props change but not during drag
  const onDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    // Only handle cross-column drops
    if (activeData?.stage === overData?.stage) {
      // Same column: no change needed
      return;
    }

    const newStage = overData?.stage;
    if (!newStage || newStage === activeData?.stage) return;

    const customerId = activeData?.customerId;
    const pipelineId = activeData?.pipelineId;
    if (!customerId || !pipelineId) return;

    // Optimistic update: move the item to the new stage
    const movedItem = displayItems.find(
      (item: PipelineItem) => item.pipeline.id === pipelineId
    );
    if (!movedItem) return;

    const updatedItem = {
      ...movedItem,
      pipeline: { ...movedItem.pipeline, stage: newStage },
    };

    setLocalItems((prev: PipelineItem[] | null) => {
      const current = prev ?? items;
      return current
        .filter((item: PipelineItem) => item.pipeline.id !== pipelineId)
        .concat(updatedItem);
    });

    setDragError(null);

    // API call
    updatePipeline({ customer_id: customerId, stage: newStage }).catch((e: unknown) => {
      setDragError(String(e));
      // Revert on failure: reset to props
      setLocalItems(null);
      setTimeout(() => setDragError(null), 4000);
    });
  }, [displayItems, items]);

  // Active drag item for overlay
  const activeItem = activeId
    ? displayItems.find((item: PipelineItem) => `card-${item.pipeline.id}` === activeId)
    : null;

  const byStage: Record<string, PipelineItem[]> = {};
  STAGES.forEach(s => byStage[s] = []);
  displayItems.forEach(item => byStage[item.pipeline.stage]?.push(item));

  const allEmpty = STAGES.every(s => byStage[s].length === 0);

  if (error) return <ErrorMessage message={error} onRetry={onRetry} />;
  if (loading) return <LoadingSpinner text="加载看板..." />;
  if (allEmpty) {
    return <EmptyState icon="📋" text="暂无商机" subtext="新建客户后将自动出现在看板中" />;
  }

  return (
    <div>
      {dragError && (
        <div className="mb-3 p-2 bg-red-900/30 border border-red-800/50 rounded text-xs text-red-300 text-center">
          ❌ 更新失败: {dragError}
        </div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={(event: DragStartEvent) => setActiveId(String(event.active.id))}
        onDragEnd={onDragEnd}
      >
        <div className="flex gap-3 h-full min-h-0 overflow-x-auto pb-2">
          {STAGES.map(stage => (
            <Column
              key={stage}
              stage={stage}
              items={byStage[stage]}
              onSelect={onSelect}
            />
          ))}
        </div>

        <DragOverlay>
          {activeItem ? <div className="w-[200px]"><DraggableCard item={activeItem} isDragging /></div> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
