import { useEffect, useRef, useState } from "react";
import {
  BOLD_HOURS,
  HOUR_END,
  HOUR_START,
  formatCN,
  formatHour,
  snapHour,
} from "../dateUtils";
import { parseMiscName, type DayImportItem } from "../dayImport";
import { dayPlanCapacityError, dayPlanOf, entryHours, placeMiscAtBottom, plannedHoursOf, subjectOf, tasksOfDay } from "../schedule";
import { GRAY_ID, gradientOf, tint } from "../theme";
import type { DayEntry, DayMisc, PlannerData, TaskStatus } from "../types";
import { DayImportPanel } from "./DayImportPanel";
import { Button, Callout, NumberField } from "./ui";

const PX_PER_HOUR = 36;

type Drag =
  | { kind: "task"; id: string; mode: "move" | "resize"; grabOffset: number }
  | { kind: "misc"; id: string; mode: "move" | "resize"; grabOffset: number };

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
  onAddMisc,
  onAddDayItems,
  onPatchMisc,
  onRemoveMisc,
}: {
  data: PlannerData;
  dateKey: string;
  selectedId: string | null;
  onDateShift: (days: number) => void;
  onSelect: (taskId: string) => void;
  onEntryChange: (taskId: string, patch: Partial<DayEntry>) => void;
  onPlannedChange: (dateKey: string, hours: number) => void;
  onRegenerate: () => string | null;
  onDragStart: () => void;
  onNoteChange: (text: string) => void;
  onMoveTomorrow: (taskId: string) => void;
  onShiftPlan: () => void;
  onAddMisc: (name: string, start: number, end: number, gray?: boolean) => void;
  onAddDayItems: (items: DayImportItem[]) => void;
  onPatchMisc: (miscId: string, patch: Partial<DayMisc>) => void;
  onRemoveMisc: (miscId: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [menu, setMenu] = useState<{ taskId: string; x: number; y: number } | null>(null);
  const [miscMenu, setMiscMenu] = useState<{ miscId: string; x: number; y: number } | null>(null);
  const [miscDraft, setMiscDraft] = useState("");
  const [miscHours, setMiscHours] = useState("1");
  const [planError, setPlanError] = useState<string | null>(null);
  const capacityError = dayPlanCapacityError(data, dateKey);
  useEffect(() => setPlanError(null), [dateKey]);

  const plan = dayPlanOf(data, dateKey);
  const tasks = tasksOfDay(data, dateKey);
  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
  const miscs = data.dayMiscs[dateKey] ?? [];
  const arranged =
    tasks.reduce((sum, task) => sum + (plan[task.id] ? entryHours(plan[task.id]) : 0), 0) +
    miscs.reduce((sum, item) => sum + Math.max(0, item.end - item.start), 0);
  const planned = plannedHoursOf(data, dateKey);
  const doneCount =
    tasks.filter((task) => plan[task.id]?.status === "done").length +
    miscs.filter((item) => item.status === "done").length;
  const listCount = tasks.length + miscs.length;

  const hourFromClientY = (clientY: number): number => {
    const track = trackRef.current;
    if (!track) return HOUR_START;
    const rect = track.getBoundingClientRect();
    return snapHour(HOUR_START + (clientY - rect.top) / PX_PER_HOUR);
  };

  useEffect(() => {
    if (!drag) return;

    const onMove = (event: PointerEvent) => {
      const hour = Math.min(HOUR_END, Math.max(HOUR_START, hourFromClientY(event.clientY)));
      if (drag.kind === "task") {
        const entry = plan[drag.id];
        if (!entry) return;
        if (drag.mode === "move") {
          const duration = Math.max(0.5, entry.end - entry.start);
          const start = Math.min(
            HOUR_END - duration,
            Math.max(HOUR_START, snapHour(hour - drag.grabOffset)),
          );
          onEntryChange(drag.id, { start, end: start + duration });
        } else {
          onEntryChange(drag.id, { end: Math.max(entry.start + 0.5, hour) });
        }
        return;
      }
      const item = miscs.find((entry) => entry.id === drag.id);
      if (!item) return;
      if (drag.mode === "move") {
        const duration = Math.max(0.5, item.end - item.start);
        const start = Math.min(
          HOUR_END - duration,
          Math.max(HOUR_START, snapHour(hour - drag.grabOffset)),
        );
        onPatchMisc(drag.id, { start, end: start + duration });
      } else {
        onPatchMisc(drag.id, { end: Math.max(item.start + 0.5, hour) });
      }
    };
    const onUp = () => setDrag(null);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, plan, miscs, onEntryChange, onPatchMisc]);

  useEffect(() => {
    if (!menu && !miscMenu) return;
    const close = () => {
      setMenu(null);
      setMiscMenu(null);
    };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menu, miscMenu]);

  const addMisc = () => {
    const parsed = parseMiscName(miscDraft);
    const duration = Number(miscHours) || 0;
    if (!parsed.name || duration <= 0) return;
    const slot = placeMiscAtBottom(miscs, duration);
    onAddMisc(parsed.name, slot.start, slot.end, parsed.gray);
    setMiscDraft("");
    setMiscHours("1");
  };

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div className="row" style={{ gap: 8 }}>
          <Button onClick={() => onDateShift(-1)}>← 前一天</Button>
          <strong style={{ fontSize: 17 }}>{formatCN(dateKey)}</strong>
          <Button onClick={() => onDateShift(1)}>后一天 →</Button>
        </div>
        <Button
          onClick={() => setPlanError(onRegenerate())}
          title="按当前各天用时重新铺排今天的时间轴"
        >
          恢复默认排程
        </Button>
      </div>
      {planError || capacityError ? (
        <Callout tone="warning">{planError ?? capacityError}</Callout>
      ) : null}

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
                const top = (entry.start - HOUR_START) * PX_PER_HOUR + 1;
                const height = Math.max(0.5, entry.end - entry.start) * PX_PER_HOUR - 2;
                const compact = height < 40;
                return (
                  <div
                    key={task.id}
                    style={{
                      position: "absolute",
                      left: 8,
                      right: 10,
                      top,
                      height,
                      borderRadius: compact ? 5 : 8,
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
                          kind: "task",
                          id: task.id,
                          mode: "move",
                          grabOffset: hourFromClientY(event.clientY) - entry.start,
                        });
                      }}
                      style={{
                        height: height - (compact ? 4 : 8),
                        padding: compact ? "0 6px" : "4px 8px",
                        cursor: "grab",
                        touchAction: "none",
                        display: "flex",
                        flexDirection: compact ? "row" : "column",
                        alignItems: compact ? "center" : "stretch",
                        gap: compact ? 6 : 0,
                      }}
                    >
                      <div
                        className="small"
                        style={{
                          fontWeight: 700,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 6,
                          flexShrink: compact ? 0 : undefined,
                          maxWidth: compact ? "42%" : undefined,
                          minWidth: 0,
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
                        {compact ? null : (
                          <span className="muted-3" style={{ flexShrink: 0 }}>
                            {formatHour(entry.start)}–{formatHour(entry.end)}
                          </span>
                        )}
                      </div>
                      <textarea
                        className="field-plain small"
                        rows={1}
                        value={entry.note}
                        placeholder={compact ? "内容" : "填写今天的具体内容"}
                        onPointerDown={(event) => event.stopPropagation()}
                        onChange={(event) =>
                          onEntryChange(task.id, { note: event.target.value })
                        }
                        style={{
                          flex: 1,
                          minWidth: 0,
                          minHeight: compact ? 16 : 22,
                          height: compact ? 16 : undefined,
                          padding: compact ? "0 4px" : undefined,
                        }}
                      />
                      {compact ? (
                        <span className="small muted-3" style={{ flexShrink: 0 }}>
                          {formatHour(entry.start)}–{formatHour(entry.end)}
                        </span>
                      ) : null}
                    </div>
                    <div
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onSelect(task.id);
                        onDragStart();
                        setDrag({ kind: "task", id: task.id, mode: "resize", grabOffset: 0 });
                      }}
                      title="拖动底边调整时长"
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        bottom: 0,
                        height: compact ? 4 : 8,
                        cursor: "ns-resize",
                        touchAction: "none",
                      }}
                    />
                  </div>
                );
              })}

              {miscs.map((item) => {
                const top = (item.start - HOUR_START) * PX_PER_HOUR + 1;
                const height = Math.max(0.5, item.end - item.start) * PX_PER_HOUR - 2;
                const compact = height < 40;
                const colorId = item.colorId ?? GRAY_ID;
                return (
                  <div
                    key={item.id}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setMiscMenu({ miscId: item.id, x: event.clientX, y: event.clientY });
                    }}
                    style={{
                      position: "absolute",
                      left: 8,
                      right: 10,
                      top,
                      height,
                      borderRadius: compact ? 5 : 8,
                      background: tint(colorId, 0.42),
                      borderLeft: `4px solid ${gradientOf(colorId)}`,
                      overflow: "hidden",
                      zIndex: 4,
                    }}
                  >
                    <div
                      onPointerDown={(event) => {
                        event.preventDefault();
                        onDragStart();
                        setDrag({
                          kind: "misc",
                          id: item.id,
                          mode: "move",
                          grabOffset: hourFromClientY(event.clientY) - item.start,
                        });
                      }}
                      style={{
                        height: height - (compact ? 4 : 8),
                        padding: compact ? "0 6px" : "4px 8px",
                        cursor: "grab",
                        touchAction: "none",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <div
                        className="small"
                        style={{
                          fontWeight: 700,
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 6,
                          width: "100%",
                          minWidth: 0,
                        }}
                      >
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {item.name}
                        </span>
                        <span className="muted-3" style={{ flexShrink: 0 }}>
                          {formatHour(item.start)}–{formatHour(item.end)}
                        </span>
                      </div>
                    </div>
                    <div
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onDragStart();
                        setDrag({ kind: "misc", id: item.id, mode: "resize", grabOffset: 0 });
                      }}
                      title="拖动底边调整时长"
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        bottom: 0,
                        height: compact ? 4 : 8,
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
                {doneCount}/{listCount} · 科目任务可右键
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
              {miscs.map((item) => (
                <div
                  key={item.id}
                  className="row"
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setMiscMenu({ miscId: item.id, x: event.clientX, y: event.clientY });
                  }}
                  style={{
                    gap: 7,
                    padding: "4px 6px",
                    borderRadius: 6,
                    background: tint(item.colorId ?? GRAY_ID, 0.16),
                    cursor: "context-menu",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={item.status === "done"}
                    onChange={(event) =>
                      onPatchMisc(item.id, {
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
                      textDecoration: item.status === "done" ? "line-through" : "none",
                      color: item.status === "done" ? "var(--text-3)" : "var(--text)",
                    }}
                  >
                    {item.name}
                  </span>
                  <span className="small muted-3" style={{ flexShrink: 0 }}>
                    {Math.max(0, item.end - item.start).toFixed(1)}h
                  </span>
                </div>
              ))}
              {tasks.length === 0 && miscs.length === 0 ? (
                <span className="muted small">今天还没有清单事项</span>
              ) : null}
              <div className="row" style={{ gap: 6, marginTop: 8 }}>
                <input
                  className="field"
                  value={miscDraft}
                  placeholder=""
                  onChange={(event) => setMiscDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addMisc();
                    }
                  }}
                  style={{ flex: 1, minWidth: 0 }}
                />
                <NumberField
                  value={miscHours}
                  width={52}
                  min={0.5}
                  title="用多长时间（小时）"
                  onChange={setMiscHours}
                />
                <span className="small muted">h</span>
                <Button small disabled={!miscDraft.trim() || !(Number(miscHours) > 0)} onClick={addMisc}>
                  添加
                </Button>
              </div>
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

      {miscMenu ? (
        <div
          className="context-menu"
          style={{ left: miscMenu.x, top: miscMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              onRemoveMisc(miscMenu.miscId);
              setMiscMenu(null);
            }}
          >
            删除杂事
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

      <DayImportPanel dateKey={dateKey} onImport={onAddDayItems} />
    </div>
  );
}
