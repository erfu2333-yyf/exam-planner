import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  calendarKey,
  columnTrack,
  formatMD,
  monthBands,
  spanWeeks,
  type Span,
  type TimelineColumn,
  type TimelineScale,
  timelineColumns,
  weekEndKey,
  weekStartKey,
} from "../dateUtils";
import { progressCaption, taskProgress, taskRisk } from "../progress";
import { averageHoursInRange, overlapsRange, sortSubjectTasks, subjectsOnScreen } from "../schedule";
import { colorOf } from "../theme";
import type { PlannerData, Subject, Task } from "../types";
import { GanttBar, PhaseLines, TodayCaption, TodayLine } from "./GanttBar";
import { ImportPanel } from "./ImportPanel";
import { LoadChart } from "./LoadChart";
import { Button, Callout, NumberField, Pill } from "./ui";
import type { ImportSubject } from "../planImport";
import { DragHandle } from "./DragHandle";

const GRID = "210px 74px minmax(0, 1fr)";
const SCALES: Array<{ id: TimelineScale; label: string }> = [
  { id: "day", label: "按天" },
  { id: "week", label: "按周" },
  { id: "month", label: "按月" },
];

export function OverviewView({
  data,
  span,
  selectedId,
  methodId,
  filterFrom,
  filterTo,
  onSelect,
  onMethodToggle,
  onEditTask,
  onManageSubject,
  onAddSubject,
  onFilterChange,
  onTaskChange,
  onCapacityChange,
  onDragStart,
  onReorder,
  onReorderSubject,
  onImport,
}: {
  data: PlannerData;
  span: Span;
  selectedId: string | null;
  methodId: string | null;
  filterFrom: string;
  filterTo: string;
  onSelect: (taskId: string) => void;
  onMethodToggle: (taskId: string) => void;
  onEditTask: (task: Task) => void;
  onManageSubject: (subject: Subject) => void;
  onAddSubject: () => void;
  onFilterChange: (from: string, to: string) => void;
  onTaskChange: (taskId: string, patch: Partial<Task>, undoable?: boolean) => void;
  onCapacityChange: (value: number) => void;
  onDragStart: () => void;
  onReorder: (dragId: string, hoverId: string) => void;
  onReorderSubject: (dragId: string, hoverId: string) => void;
  onImport: (subjects: ImportSubject[]) => void;
}) {
  const [scale, setScale] = useState<TimelineScale>("week");
  const [drag, setDrag] = useState<{ kind: "task" | "subject"; id: string } | null>(null);
  const captionClipRef = useRef<HTMLDivElement | null>(null);
  const headClipRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const syncHScroll = (left: number, source: HTMLDivElement) => {
    for (const node of [captionClipRef.current, headClipRef.current, bodyRef.current]) {
      if (node && node !== source && node.scrollLeft !== left) node.scrollLeft = left;
    }
  };
  useEffect(() => {
    if (!drag) return;
    const onMove = (event: PointerEvent) => {
      const node = document.elementFromPoint(event.clientX, event.clientY);
      if (!(node instanceof Element)) return;
      if (drag.kind === "subject") {
        const hoverId = node.closest("[data-subject-id]")?.getAttribute("data-subject-id");
        if (hoverId && hoverId !== drag.id) onReorderSubject(drag.id, hoverId);
        return;
      }
      const hoverId = node.closest("[data-task-id]")?.getAttribute("data-task-id");
      if (hoverId && hoverId !== drag.id) onReorder(drag.id, hoverId);
    };
    const stop = () => setDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [drag, onReorder, onReorderSubject]);
  const totalWeeks = spanWeeks(span);
  const from = Math.max(1, Math.min(totalWeeks, Number(filterFrom) || 1));
  const to = Math.max(from, Math.min(totalWeeks, Number(filterTo) || totalWeeks));
  const weekFrom = from - 1;
  const weekTo = to - 1;
  const rangeFrom = weekStartKey(weekFrom, span.origin);
  const rangeTo = weekEndKey(weekTo, span);
  const columns = timelineColumns(span, weekFrom, weekTo, scale);
  const track = columnTrack(columns, scale === "day" ? 22 : 0);
  const timelineMinWidth = scale === "day" ? Math.max(720, columns.length * 22) : undefined;
  const rowMinWidth = timelineMinWidth != null ? 210 + 74 + timelineMinWidth : undefined;
  const visibleTasks = data.tasks.filter((task) => overlapsRange(task, rangeFrom, rangeTo));
  const visibleSubjects = subjectsOnScreen(data.subjects, data.tasks, visibleTasks);
  useEffect(() => {
    for (const node of [captionClipRef.current, headClipRef.current, bodyRef.current]) {
      if (node) node.scrollLeft = 0;
    }
  }, [scale, weekFrom, weekTo]);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <Callout>
        新能力已经接上：双击左侧任务名可填大概数量、拆章节；点顶上第三个标签进当天，右侧清单有开始/暂停计时。没填数量时甘特条看起来会和以前差不多。
      </Callout>
      <section className="panel">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
          <strong style={{ fontSize: 16 }}>每周平均每天任务量</strong>
          <div className="row small">
            <span className="muted">每日可用</span>
            <NumberField
              value={data.capacity}
              onChange={(value) => onCapacityChange(Number(value) || 0)}
              width={58}
            />
            <span className="muted">小时</span>
          </div>
        </div>
        <LoadChart data={data} span={span} weekFrom={weekFrom} weekTo={weekTo} />
      </section>

      <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
        <Button onClick={onAddSubject}>＋ 添加一级任务</Button>
        <span style={{ fontWeight: 600, marginLeft: 6 }}>显示</span>
        {SCALES.map((item) => (
          <Pill key={item.id} active={scale === item.id} onClick={() => setScale(item.id)}>
            {item.label}
          </Pill>
        ))}
        <span style={{ fontWeight: 600, marginLeft: 6 }}>筛选</span>
        <span className="muted small">第</span>
        <NumberField
          value={filterFrom}
          step={1}
          min={1}
          width={50}
          onChange={(value) => onFilterChange(value, filterTo)}
        />
        <span className="muted small">周到第</span>
        <NumberField
          value={filterTo}
          step={1}
          min={1}
          width={50}
          onChange={(value) => onFilterChange(filterFrom, value)}
        />
        <span className="muted small">周</span>
        <Button small onClick={() => onFilterChange("1", String(totalWeeks))}>
          重置
        </Button>
        <span className="muted-3 small">
          只显示第{from}–{to}周（{formatMD(rangeFrom)}–{formatMD(rangeTo)}）
        </span>
      </div>

      <div className="card planner-table">
        <div className="planner-table-head">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: GRID,
            background: "var(--surface-3)",
            borderBottom: "1px solid var(--stroke)",
          }}
        >
          <div className="planner-stick-name" />
          <div className="planner-stick-hours" />
          <div
            ref={captionClipRef}
            className="planner-head-clip planner-head-clip-barless"
            onScroll={(event) => syncHScroll(event.currentTarget.scrollLeft, event.currentTarget)}
          >
            <div style={{ minWidth: timelineMinWidth }}>
              <TodayCaption span={span} weekFrom={weekFrom} weekTo={weekTo} />
            </div>
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: GRID,
            background: "var(--surface-3)",
          }}
        >
          <div className="planner-stick-name" style={{ padding: "9px 10px", fontWeight: 600 }}>任务清单</div>
          <div className="planner-stick-hours small" style={{ padding: "9px 4px", fontWeight: 600, textAlign: "center" }}>
            日均用时
          </div>
          <div
            ref={headClipRef}
            className="planner-head-clip"
            onScroll={(event) => syncHScroll(event.currentTarget.scrollLeft, event.currentTarget)}
          >
            <div style={{ minWidth: timelineMinWidth }}>
              <TimelineHeader
                columns={columns}
                track={track}
                span={span}
                weekFrom={weekFrom}
                weekTo={weekTo}
                scale={scale}
              />
            </div>
          </div>
        </div>
        </div>

        <div
          ref={bodyRef}
          className={scale === "day" ? "planner-table-body" : undefined}
          onScroll={(event) => syncHScroll(event.currentTarget.scrollLeft, event.currentTarget)}
        >

        {visibleSubjects.map((subject) => {
          const subjectTasks = sortSubjectTasks(
            visibleTasks.filter((task) => task.subjectId === subject.id),
          );
          return (
            <div key={subject.id} data-subject-id={subject.id}>
              <SubjectRow
                subject={subject}
                tasks={subjectTasks}
                columns={columns}
                track={track}
                span={span}
                weekFrom={weekFrom}
                weekTo={weekTo}
                minWidth={rowMinWidth}
                dragging={drag?.kind === "subject" && drag.id === subject.id}
                onManage={() => onManageSubject(subject)}
                onDragPointerDown={(event) => {
                  event.preventDefault();
                  onDragStart();
                  setDrag({ kind: "subject", id: subject.id });
                }}
              />
              {subjectTasks.map((task) => {
                const methodOpen = methodId === task.id;
                const progress = taskProgress(data, task);
                const risk = taskRisk(data, task, calendarKey());
                const caption = progressCaption(data, task);
                return (
                  <div
                    key={task.id}
                    data-task-id={task.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: GRID,
                      borderTop: "1px solid var(--stroke)",
                      background:
                        task.id === selectedId || (drag?.kind === "task" && drag.id === task.id)
                          ? "var(--surface-2)"
                          : "var(--surface)",
                      minWidth: rowMinWidth,
                    }}
                    className={
                      task.id === selectedId || (drag?.kind === "task" && drag.id === task.id)
                        ? "planner-row-active"
                        : undefined
                    }
                  >
                    <div
                      className="planner-stick-name"
                      style={{
                        padding: "0 9px",
                        minHeight: 42,
                        display: "flex",
                        gap: 5,
                        alignItems: "center",
                        flexWrap: "nowrap",
                        overflow: "hidden",
                      }}
                    >
                      <DragHandle
                        onPointerDown={(event) => {
                          event.preventDefault();
                          onDragStart();
                          setDrag({ kind: "task", id: task.id });
                        }}
                      />
                      <button
                        type="button"
                        title="双击编辑名称、起止日期和颜色"
                        onClick={() => onSelect(task.id)}
                        onDoubleClick={() => onEditTask(task)}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          height: 28,
                          textAlign: "left",
                          border: "1px solid var(--stroke)",
                          borderRadius: 6,
                          background: "var(--surface)",
                          padding: "0 8px",
                          cursor: "pointer",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {task.name}
                      </button>
                      <button
                        type="button"
                        className={methodOpen ? "btn btn-small btn-primary" : "btn btn-small"}
                        style={{ flexShrink: 0, height: 28 }}
                        onClick={() => onMethodToggle(task.id)}
                      >
                        学法
                      </button>
                    </div>
                    <div
                      className="planner-stick-hours"
                      style={{
                        padding: "0 5px",
                        minHeight: 52,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <div className="stack" style={{ gap: 2, alignItems: "center" }}>
                        <NumberField
                          value={task.dailyHours}
                          width={58}
                          onChange={(value) =>
                            onTaskChange(task.id, { dailyHours: Number(value) || 0 }, false)
                          }
                        />
                        {caption ? (
                          <div
                            className="small"
                            style={{
                              textAlign: "center",
                              lineHeight: 1.2,
                              color: risk === "late" ? "var(--danger)" : "var(--text-3)",
                            }}
                          >
                            {progress.target != null
                              ? `${progress.done}/${progress.target}${progress.unit}`
                              : progress.done > 0
                                ? `${progress.done}${progress.unit}`
                                : ""}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div
                      style={{
                        gridColumn: 3,
                        gridRow: methodOpen ? "1 / 3" : "1",
                        minHeight: 36,
                      }}
                    >
                      <GanttBar
                        task={task}
                        span={span}
                        weekFrom={weekFrom}
                        weekTo={weekTo}
                        scale={scale}
                        selected={task.id === selectedId}
                        progress={
                          progress.target != null && progress.target > 0
                            ? progress.done / progress.target
                            : undefined
                        }
                        risk={risk}
                        caption={caption}
                        onSelect={() => onSelect(task.id)}
                        onDragStart={onDragStart}
                        onDragMove={(startDate, endDate) =>
                          onTaskChange(task.id, { startDate, endDate }, false)
                        }
                      />
                    </div>
                    {methodOpen ? (
                      <div style={{ gridColumn: "1 / 3", gridRow: 2, padding: "0 9px 8px" }}>
                        <textarea
                          className="field"
                          rows={3}
                          value={task.method}
                          placeholder="用一两句话记录学法…"
                          onChange={(event) =>
                            onTaskChange(task.id, { method: event.target.value }, false)
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {subjectTasks.length === 0 ? (
                <div
                  className="small muted"
                  style={{ padding: "8px 12px", borderTop: "1px solid var(--stroke)", minWidth: rowMinWidth }}
                >
                  还没有二级任务，点左侧科目名称添加
                </div>
              ) : null}
            </div>
          );
        })}

        {visibleSubjects.length === 0 ? (
          <div className="muted" style={{ padding: 20, textAlign: "center" }}>
            这个周次范围内没有任务
          </div>
        ) : null}
        </div>
      </div>

      <div className="muted small">
        左侧六点可上下拖动换二级任务顺序；双击名称改起止、大概数量和章节拆解。甘特条可整条拖动，拖两端改起止日期。有进度才会在条上浅色填充，没填数量不报警。
      </div>

      <ImportPanel data={data} span={span} onImport={onImport} />
    </div>
  );
}

function TimelineHeader({
  columns,
  track,
  span,
  weekFrom,
  weekTo,
  scale,
}: {
  columns: TimelineColumn[];
  track: string;
  span: Span;
  weekFrom: number;
  weekTo: number;
  scale: TimelineScale;
}) {
  const compact = columns.length > 20;
  const bands = scale === "day" ? monthBands(columns) : [];
  return (
    <div style={{ position: "relative" }}>
      {bands.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: track }}>
          {bands.map((band) => (
            <div
              key={band.key}
              className="small"
              style={{
                gridColumn: `${band.start + 1} / span ${band.count}`,
                padding: "4px 0 2px",
                textAlign: "center",
                fontWeight: 700,
                borderLeft: "1px solid var(--stroke-strong)",
                borderBottom: "1px solid var(--stroke)",
              }}
            >
              {band.label}
            </div>
          ))}
        </div>
      ) : null}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: track,
          position: "relative",
        }}
      >
        {columns.map((column) => {
          const monthStart = scale === "day" && column.start.endsWith("-01");
          return (
            <div
              key={column.key}
              style={{
                padding: compact ? "4px 0" : "5px 2px",
                textAlign: "center",
                borderLeft: monthStart ? "1px solid var(--stroke-strong)" : "1px solid var(--stroke)",
              }}
            >
              <div className="small" style={{ fontWeight: 600 }}>
                {column.label}
              </div>
              {compact ? null : <div className="small muted-3">{column.sublabel}</div>}
            </div>
          );
        })}
        <PhaseLines span={span} weekFrom={weekFrom} weekTo={weekTo} />
        <TodayLine span={span} weekFrom={weekFrom} weekTo={weekTo} />
      </div>
    </div>
  );
}

function SubjectRow({
  subject,
  tasks,
  columns,
  track,
  span,
  weekFrom,
  weekTo,
  minWidth,
  dragging,
  onManage,
  onDragPointerDown,
}: {
  subject: Subject;
  tasks: Task[];
  columns: TimelineColumn[];
  track: string;
  span: Span;
  weekFrom: number;
  weekTo: number;
  minWidth?: number;
  dragging: boolean;
  onManage: () => void;
  onDragPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  const values = columns.map((column) =>
    tasks.reduce((sum, task) => sum + averageHoursInRange(task, column.start, column.end), 0),
  );

  return (
    <div
      className="planner-row-subject"
      style={{
        display: "grid",
        gridTemplateColumns: GRID,
        background: dragging ? "var(--surface-3)" : "var(--surface-2)",
        borderTop: "2px solid var(--stroke-strong)",
        minWidth,
      }}
    >
      <div
        className="planner-stick-name"
        style={{ padding: "6px 10px", display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}
      >
        <DragHandle
          title="按住上下拖动，调整一级任务的显示顺序"
          onPointerDown={onDragPointerDown}
        />
        <button
          type="button"
          title="点击管理一级任务（改名、添加二级任务、删除）"
          onClick={onManage}
          style={{
            border: "none",
            borderRadius: 6,
            background: colorOf(subject.colorId),
            color: "#fff",
            padding: "5px 11px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {subject.name}
        </button>
      </div>
      <div className="planner-stick-hours" />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: track,
          position: "relative",
        }}
      >
        {values.map((value, index) => (
          <div
            key={columns[index].key}
            className="small"
            style={{
              padding: "7px 2px",
              textAlign: "center",
              borderLeft: "1px solid var(--stroke)",
              fontWeight: 600,
              color: value > 0 ? "var(--text)" : "var(--text-3)",
            }}
          >
            {columns.length > 20 ? "" : value > 0 ? `${value.toFixed(1)}h` : "–"}
          </div>
        ))}
        <TodayLine span={span} weekFrom={weekFrom} weekTo={weekTo} />
      </div>
      <div style={{ gridColumn: "1 / -1", borderBottom: `3px solid ${colorOf(subject.colorId)}` }} />
    </div>
  );
}
