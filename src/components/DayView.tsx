import { useEffect, useRef, useState } from "react";
import {
  BOLD_HOURS,
  HOUR_END,
  HOUR_START,
  formatCN,
  formatHour,
  snapHour,
} from "../dateUtils";
import { dayPlanOf, entryHours, plannedHoursOf, subjectOf, tasksOfDay } from "../schedule";
import { gradientOf, tint } from "../theme";
import type { DayEntry, PlannerData, TaskStatus } from "../types";
import { Button, NumberField } from "./ui";

const PX_PER_HOUR = 36;

type Drag = { taskId: string; mode: "move" | "resize"; grabOffset: number };

export function DayView({
  data,
  dateKey,
  selectedId,
  onDateShift,
  onSelect,
  onEntryChange,
  onPlannedChange,
  onRegenerate,
  onDragStart,
  onNoteChange,
  onMoveTomorrow,
  onShiftPlan,
}: {
  data: PlannerData;
  dateKey: string;
  selectedId: string | null;
  onDateShift: (days: number) => void;
  onSelect: (taskId: string) => void;
  onEntryChange: (taskId: string, patch: Partial<DayEntry>) => void;
  onPlannedChange: (dateKey: string, hours: number) => void;
  onRegenerate: () => void;
  onDragStart: () => void;
  onNoteChange: (text: string) => void;
  onMoveTomorrow: (taskId: string) => void;
  onShiftPlan: () => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [menu, setMenu] = useState<{ taskId: string; x: number; y: number } | null>(null);

  const plan = dayPlanOf(data, dateKey);
  const tasks = tasksOfDay(data, dateKey);
  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
  const arranged = tasks.reduce(
    (sum, task) => sum + (plan[task.id] ? entryHours(plan[task.id]) : 0),
    0,
  );
  const planned = plannedHoursOf(data, dateKey);
  const doneCount = tasks.filter((task) => plan[task.id]?.status === "done").length;

  const hourFromClientY = (clientY: number): number => {
    const track = trackRef.current;
    if (!track) return HOUR_START;
    const rect = track.getBoundingClientRect();
    return snapHour(HOUR_START + (clientY - rect.top) / PX_PER_HOUR);
  };

  useEffect(() => {
    if (!drag) return;
    const entry = plan[drag.taskId];
    if (!entry) return;

    const onMove = (event: PointerEvent) => {
      const hour = Math.min(HOUR_END, Math.max(HOUR_START, hourFromClientY(event.clientY)));
      if (drag.mode === "move") {
        const duration = Math.max(0.5, entry.end - entry.start);
        const start = Math.min(
          HOUR_END - duration,
          Math.max(HOUR_START, snapHour(hour - drag.grabOffset)),
        );
        onEntryChange(drag.taskId, { start, end: start + duration });
      } else {
        onEntryChange(drag.taskId, { end: Math.max(entry.start + 0.5, hour) });
      }
    };
    const onUp = () => setDrag(null);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, plan, onEntryChange]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menu]);

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div className="row" style={{ gap: 8 }}>
          <Button onClick={() => onDateShift(-1)}>← 前一天</Button>
          <strong style={{ fontSize: 17 }}>{formatCN(dateKey)}</strong>
          <Button onClick={() => onDateShift(1)}>后一天 →</Button>
        </div>
        <Button onClick={onRegenerate} title="按当前日均用时重新铺排今天的时间轴">
          重新自动排程
        </Button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2.4fr) minmax(250px, 1fr)", gap: 12 }}>
        <div className="card">
          <div style={{ display: "grid", gridTemplateColumns: "56px minmax(0, 1fr)" }}>
            <div style={{ background: "var(--surface-2)" }}>
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="small"
                  style={{
                    height: PX_PER_HOUR,
                    padding: "2px 6px",
                    fontWeight: BOLD_HOURS.includes(hour) ? 700 : 400,
                    color: BOLD_HOURS.includes(hour) ? "var(--text)" : "var(--text-3)",
                    borderBottom: BOLD_HOURS.includes(hour)
                      ? "2px solid var(--stroke-strong)"
                      : "1px solid var(--stroke)",
                  }}
                >
                  {hour}:00
                </div>
              ))}
            </div>

            <div
              ref={trackRef}
              style={{
                position: "relative",
                height: (HOUR_END - HOUR_START) * PX_PER_HOUR,
                background: "var(--surface)",
              }}
            >
              {hours.map((hour) => (
                <div
                  key={hour}
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: (hour - HOUR_START) * PX_PER_HOUR,
                    height: PX_PER_HOUR,
                    borderBottom: BOLD_HOURS.includes(hour)
                      ? "2px solid var(--stroke-strong)"
                      : "1px solid var(--stroke)",
                  }}
                />
              ))}

              {tasks.map((task) => {
                const entry = plan[task.id];
                if (!entry) return null;
                const subject = subjectOf(data, task.subjectId);
                const top = (entry.start - HOUR_START) * PX_PER_HOUR + 2;
                const height = Math.max(46, (entry.end - entry.start) * PX_PER_HOUR - 4);
                return (
                  <div
                    key={task.id}
                    style={{
                      position: "absolute",
                      left: 8,
                      right: 10,
                      top,
                      height,
                      borderRadius: 8,
                      background: tint(task.colorId, 0.42),
                      borderLeft: `4px solid ${gradientOf(task.colorId)}`,
                      outline: task.id === selectedId ? "2px solid var(--accent)" : "none",
                      overflow: "hidden",
                      opacity: entry.status === "done" ? 0.62 : 1,
                      zIndex: 3,
                    }}
                  >
                    <div
                      onPointerDown={(event) => {
                        event.preventDefault();
                        onSelect(task.id);
                        onDragStart();
                        setDrag({
                          taskId: task.id,
                          mode: "move",
                          grabOffset: hourFromClientY(event.clientY) - entry.start,
                        });
                      }}
                      style={{
                        height: height - 8,
                        padding: "4px 8px",
                        cursor: "grab",
                        touchAction: "none",
                      }}
                    >
                      <div
                        className="small"
                        style={{
                          fontWeight: 700,
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 6,
                        }}
                      >
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            textDecoration: entry.status === "done" ? "line-through" : "none",
                          }}
                        >
                          {subject?.name} · {task.name}
                        </span>
                        <span className="muted-3" style={{ flexShrink: 0 }}>
                          {formatHour(entry.start)}–{formatHour(entry.end)}
                        </span>
                      </div>
                      <textarea
                        className="field-plain small"
                        rows={1}
                        value={entry.note}
                        placeholder="填写今天的具体内容"
                        onPointerDown={(event) => event.stopPropagation()}
                        onChange={(event) =>
                          onEntryChange(task.id, { note: event.target.value })
                        }
                        style={{ minHeight: 22 }}
                      />
                    </div>
                    <div
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onSelect(task.id);
                        onDragStart();
                        setDrag({ taskId: task.id, mode: "resize", grabOffset: 0 });
                      }}
                      title="拖动底边调整时长"
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        bottom: 0,
                        height: 8,
                        cursor: "ns-resize",
                        touchAction: "none",
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="stack">
          <div className="panel">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="small muted">计划时长</span>
                <NumberField
                  value={planned}
                  width={76}
                  onChange={(value) => onPlannedChange(dateKey, Number(value) || 0)}
                />
              </label>
              <div style={{ textAlign: "right" }}>
                <div className="small muted">已排（自动）</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{arranged.toFixed(1)}h</div>
              </div>
            </div>
            <div
              className="small"
              style={{
                marginTop: 8,
                color: arranged > planned ? "var(--danger)" : "var(--text-3)",
              }}
            >
              {arranged > planned
                ? `超出计划 ${(arranged - planned).toFixed(1)}h`
                : `还可安排 ${(planned - arranged).toFixed(1)}h`}
            </div>
          </div>

          <div className="panel">
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
              <strong>今日执行清单</strong>
              <span className="small muted">
                {doneCount}/{tasks.length} · 未完成可右键
              </span>
            </div>
            <div className="stack" style={{ gap: 4 }}>
              {tasks.map((task) => {
                const entry = plan[task.id];
                if (!entry) return null;
                const subject = subjectOf(data, task.subjectId);
                return (
                  <div
                    key={task.id}
                    className="row"
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setMenu({ taskId: task.id, x: event.clientX, y: event.clientY });
                    }}
                    style={{
                      gap: 7,
                      padding: "4px 6px",
                      borderRadius: 6,
                      background: tint(task.colorId, 0.16),
                      cursor: "context-menu",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={entry.status === "done"}
                      onChange={(event) =>
                        onEntryChange(task.id, {
                          status: (event.target.checked ? "done" : "pending") as TaskStatus,
                        })
                      }
                      style={{ width: 16, height: 16, flexShrink: 0, cursor: "pointer" }}
                    />
                    <span
                      className="small"
                      style={{
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        textDecoration: entry.status === "done" ? "line-through" : "none",
                        color: entry.status === "done" ? "var(--text-3)" : "var(--text)",
                      }}
                    >
                      {subject?.name} · {task.name}
                    </span>
                    <span className="small muted-3" style={{ flexShrink: 0 }}>
                      {entryHours(entry).toFixed(1)}h
                    </span>
                  </div>
                );
              })}
              {tasks.length === 0 ? <span className="muted small">今天没有任务</span> : null}
            </div>
          </div>
        </div>
      </div>

      {menu ? (
        <div
          className="context-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              onEntryChange(menu.taskId, { status: "done" });
              setMenu(null);
            }}
          >
            已完成
          </button>
          <button
            type="button"
            onClick={() => {
              onMoveTomorrow(menu.taskId);
              setMenu(null);
            }}
          >
            挪到明天
          </button>
          <button
            type="button"
            onClick={() => {
              onShiftPlan();
              setMenu(null);
            }}
          >
            整体计划后移一天
          </button>
        </div>
      ) : null}

      <div className="panel">
        <strong>今日总结</strong>
        <textarea
          className="field day-note"
          rows={6}
          value={data.dayNotes[dateKey] ?? ""}
          placeholder="今天学得怎么样、卡在哪里、明天要改什么…"
          onChange={(event) => onNoteChange(event.target.value)}
          style={{ marginTop: 8 }}
        />
      </div>
    </div>
  );
}
