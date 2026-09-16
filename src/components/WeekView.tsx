import { useEffect, useState } from "react";
import {
  calendarKey,
  formatMD,
  plannerWeekDays,
  spanWeeks,
  type Span,
  weekCellKey,
  weekEndKey,
  weekRangeLabel,
  weekStartKey,
  weekdayShort,
} from "../dateUtils";
import { coversDay, hoursOnDay, overlapsRange, plannedHoursOf, scheduledHoursOf, sortSubjectTasks, subjectsOnScreen, weekTaskAverage } from "../schedule";
import { colorOf, tint } from "../theme";
import type { PlannerData, Subject, Task } from "../types";
import { Button, Callout, NumberField } from "./ui";
import { DragHandle } from "./DragHandle";

const GRID = "210px 74px minmax(784px, 1fr)";

function dayClass(dateKey: string, today: string, header = false) {
  if (dateKey !== today) return undefined;
  return header ? "week-today-head" : "week-today";
}

export function WeekView({
  data,
  span,
  week,
  methodId,
  onWeekChange,
  onMethodToggle,
  onEditTask,
  onManageSubject,
  onTaskChange,
  onPlannedChange,
  onWeekAverageChange,
  onDayHoursChange,
  onCellTextChange,
  onDragStart,
  onReorder,
}: {
  data: PlannerData;
  span: Span;
  week: number;
  methodId: string | null;
  onWeekChange: (week: number) => void;
  onMethodToggle: (taskId: string) => void;
  onEditTask: (task: Task) => void;
  onManageSubject: (subject: Subject) => void;
  onTaskChange: (taskId: string, patch: Partial<Task>, undoable?: boolean) => void;
  onPlannedChange: (dateKey: string, hours: number) => void;
  onWeekAverageChange: (taskId: string, hours: number) => void;
  onDayHoursChange: (taskId: string, dateKey: string, hours: number) => void;
  onCellTextChange: (key: string, text: string) => void;
  onDragStart: () => void;
  onReorder: (dragId: string, hoverId: string) => void;
}) {
  const [reportOpen, setReportOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  useEffect(() => {
    if (!dragId) return;
    const onMove = (event: PointerEvent) => {
      const node = document.elementFromPoint(event.clientX, event.clientY);
      const hoverId = node instanceof Element ? node.closest("[data-task-id]")?.getAttribute("data-task-id") : null;
      if (hoverId && hoverId !== dragId) onReorder(dragId, hoverId);
    };
    const stop = () => setDragId(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [dragId, onReorder]);
  const today = calendarKey();
  const totalWeeks = spanWeeks(span);
  const days = plannerWeekDays(week, span);
  const fade = (dateKey: string) => (dateKey < today ? 0.55 : 1);
  const weekFrom = weekStartKey(week, span.origin);
  const weekTo = weekEndKey(week, span);
  const weekTasks = data.tasks.filter((task) => overlapsRange(task, weekFrom, weekTo));
  const visibleSubjects = subjectsOnScreen(data.subjects, data.tasks, weekTasks);

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <Button disabled={week === 0} onClick={() => onWeekChange(week - 1)}>
          ← 上一周
        </Button>
        <strong style={{ fontSize: 17 }}>
          第{week + 1}周 · {weekRangeLabel(week, span)}
        </strong>
        <Button disabled={week === totalWeeks - 1} onClick={() => onWeekChange(week + 1)}>
          下一周 →
        </Button>
      </div>

      <div className="card planner-table planner-table-week">
        <div className="planner-table-head">
        <div style={{ display: "grid", gridTemplateColumns: GRID, background: "var(--surface-3)" }}>
          <div style={{ padding: "8px 10px", fontWeight: 600 }}>任务清单</div>
          <div className="small" style={{ padding: "8px 2px", fontWeight: 600, textAlign: "center" }}>
            本周日均
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(112px, 1fr))" }}>
            {days.map((dateKey) => (
              <div
                key={dateKey}
                className={dayClass(dateKey, today, true)}
                style={{
                  padding: "5px 4px",
                  textAlign: "center",
                  borderLeft: "1px solid var(--stroke)",
                  opacity: fade(dateKey),
                }}
              >
                <div style={{ fontWeight: 700, color: dateKey === today ? "var(--accent)" : undefined }}>
                  {dateKey === today ? "今天" : `周${weekdayShort(dateKey)}`}
                </div>
                <div
                  className={dateKey === today ? "small" : "small muted-3"}
                  style={{ color: dateKey === today ? "var(--accent)" : undefined, fontWeight: dateKey === today ? 600 : undefined }}
                >
                  {formatMD(dateKey)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: GRID,
            borderTop: "1px solid var(--stroke)",
            background: "var(--surface-2)",
          }}
        >
          <div style={{ padding: "8px 10px" }}>
            <div style={{ fontWeight: 600 }}>计划 / 已排</div>
            <div className="small muted-3">已排按日均用时累计</div>
          </div>
          <div />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(112px, 1fr))" }}>
            {days.map((dateKey) => {
              const planned = plannedHoursOf(data, dateKey);
              const arranged = scheduledHoursOf(data, dateKey);
              const over = arranged > planned;
              return (
                <div
                  key={dateKey}
                  className={dayClass(dateKey, today)}
                  style={{
                    padding: "6px 5px",
                    borderLeft: "1px solid var(--stroke)",
                    opacity: fade(dateKey),
                  }}
                >
                  <div className="row" style={{ gap: 3 }}>
                    <span className="small muted">计划</span>
                    <NumberField
                      value={planned}
                      width={46}
                      onChange={(value) => onPlannedChange(dateKey, Number(value) || 0)}
                      title="当天计划可用时长"
                    />
                  </div>
                  <div
                    className="small"
                    style={{ fontWeight: 600, color: over ? "var(--danger)" : "var(--text)" }}
                  >
                    已排 {arranged.toFixed(1)}h
                  </div>
                  <div
                    style={{
                      height: 5,
                      borderRadius: 4,
                      background: "var(--surface-3)",
                      overflow: "hidden",
                      marginTop: 3,
                    }}
                  >
                    <div
                      style={{
                        width: `${planned > 0 ? Math.min(100, (arranged / planned) * 100) : 0}%`,
                        height: "100%",
                        background: over ? "var(--danger)" : "var(--accent)",
                      }}
                    />
                  </div>
                  <div className="small muted-3">
                    {over
                      ? `超 ${(arranged - planned).toFixed(1)}h`
                      : `待排 ${(planned - arranged).toFixed(1)}h`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        </div>

        {visibleSubjects.map((subject) => {
          const subjectTasks = weekTasks.filter((task) => task.subjectId === subject.id);
          return (
            <div key={subject.id}>
              <WeekSubjectRow
                data={data}
                subject={subject}
                tasks={subjectTasks}
                days={days}
                today={today}
                onManage={() => onManageSubject(subject)}
              />
              {sortSubjectTasks(subjectTasks).map((task) => {
                const methodOpen = methodId === task.id;
                return (
                <div
                  key={task.id}
                  data-task-id={task.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: GRID,
                    borderTop: "1px solid var(--stroke)",
                    background: dragId === task.id ? "var(--surface-2)" : undefined,
                  }}
                >
                  <div
                    style={{
                      padding: "0 8px",
                      minHeight: 42,
                      display: "flex",
                      gap: 5,
                      alignItems: "center",
                      flexWrap: "nowrap",
                      minWidth: 0,
                    }}
                  >
                      <DragHandle
                        onPointerDown={(event) => {
                          event.preventDefault();
                          onDragStart();
                          setDragId(task.id);
                        }}
                      />
                      <button
                        type="button"
                        title="双击编辑任务"
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
                    style={{
                      padding: "0 4px",
                      minHeight: 78,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <NumberField
                      value={weekTaskAverage(data, task, days)}
                      width={58}
                      onChange={(value) => onWeekAverageChange(task.id, Number(value) || 0)}
                      title="本周日均：本周总用时÷有任务的天数，只改当前周"
                    />
                  </div>
                  <div
                    style={{
                      gridColumn: 3,
                      gridRow: methodOpen ? "1 / 3" : "1",
                    display: "grid",
                    gridTemplateColumns: "repeat(7, minmax(112px, 1fr))",
                    }}
                  >
                    {days.map((dateKey) => {
                      const active = coversDay(task, dateKey);
                      const cellKey = weekCellKey(task.id, dateKey);
                      return (
                        <div
                          key={cellKey}
                          className={dayClass(dateKey, today)}
                          style={{
                            padding: 5,
                            borderLeft: "1px solid var(--stroke)",
                            background: active
                              ? dateKey === today
                                ? tint(task.colorId, 0.28)
                                : tint(task.colorId, 0.18)
                              : dateKey === today
                                ? undefined
                                : "var(--surface-2)",
                            opacity: fade(dateKey),
                          }}
                        >
                          {active ? (
                            <div className="stack week-day-hours" style={{ gap: 3 }}>
                              <NumberField
                                value={hoursOnDay(data, task, dateKey)}
                                width="100%"
                                onChange={(value) =>
                                  onDayHoursChange(task.id, dateKey, Number(value) || 0)
                                }
                                title="这一天这条任务的用时，只改当前周"
                              />
                              <textarea
                                className="week-cell-input"
                                rows={2}
                                value={data.weekTexts[cellKey] ?? ""}
                                placeholder={task.name}
                                onFocus={onDragStart}
                                onChange={(event) => onCellTextChange(cellKey, event.target.value)}
                              />
                            </div>
                          ) : (
                            <div style={{ minHeight: 44 }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {methodOpen ? (
                    <div style={{ gridColumn: "1 / 3", gridRow: 2, padding: "0 8px 8px" }}>
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
                <div className="small muted" style={{ padding: "8px 10px", borderTop: "1px solid var(--stroke)" }}>
                  还没有二级任务，点左侧科目名称添加
                </div>
              ) : null}
            </div>
          );
        })}

        {visibleSubjects.length === 0 ? (
          <div className="muted" style={{ padding: 20, textAlign: "center" }}>
            本周没有任务
          </div>
        ) : null}
      </div>

      <div className="row" style={{ justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
        <span className="small muted">正式版每周五 23:59 自动生成；当前不记录数据</span>
        <Button small onClick={() => setReportOpen((value) => !value)}>
          {reportOpen ? "收起框架" : "查看周报框架"}
        </Button>
      </div>
      {reportOpen ? (
        <div className="panel" style={{ background: "var(--surface-2)" }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <strong>每周自动周报 · 空框架</strong>
            <span className="small muted">暂不记录</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Callout>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>完成情况</div>
              <div className="small muted">完成率、完成时长、各科推进情况。</div>
            </Callout>
            <Callout tone="warning">
              <div style={{ fontWeight: 600, marginBottom: 4 }}>主要阻塞</div>
              <div className="small muted">未完成原因、连续延期任务、容量冲突。</div>
            </Callout>
            <Callout>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>下周调整</div>
              <div className="small muted">负荷调整、优先级变化和具体排期建议。</div>
            </Callout>
          </div>
          <div className="small muted" style={{ marginTop: 12 }}>
            当前不读取完成记录和当日总结，也不保留周报上下文。
          </div>
        </div>
      ) : null}
    </div>
  );
}

function WeekSubjectRow({
  data,
  subject,
  tasks,
  days,
  today,
  onManage,
}: {
  data: PlannerData;
  subject: Subject;
  tasks: Task[];
  days: string[];
  today: string;
  onManage: () => void;
}) {
  const perDay = days.map((dateKey) =>
    tasks
      .filter((task) => coversDay(task, dateKey))
      .reduce((sum, task) => sum + hoursOnDay(data, task, dateKey), 0),
  );
  const activeDays = perDay.filter((value) => value > 0);
  const average =
    activeDays.length === 0
      ? 0
      : activeDays.reduce((sum, value) => sum + value, 0) / activeDays.length;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: GRID,
        background: "var(--surface-2)",
        borderTop: "2px solid var(--stroke-strong)",
      }}
    >
      <div style={{ padding: "6px 10px" }}>
        <button
          type="button"
          title="点击管理一级任务"
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
      <div className="small" style={{ padding: "9px 2px", textAlign: "center", fontWeight: 600 }}>
        均 {average.toFixed(1)}h
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(112px, 1fr))" }}>
        {perDay.map((value, index) => (
          <div
            key={index}
            className={`small ${dayClass(days[index], today) ?? ""}`.trim()}
            style={{
              padding: "9px 2px",
              textAlign: "center",
              borderLeft: "1px solid var(--stroke)",
              fontWeight: 600,
              color: value > 0 ? "var(--text)" : "var(--text-3)",
              opacity: days[index] < today ? 0.55 : 1,
            }}
          >
            {value > 0 ? `${value.toFixed(1)}h` : "–"}
          </div>
        ))}
      </div>
      <div style={{ gridColumn: "1 / -1", borderBottom: `3px solid ${colorOf(subject.colorId)}` }} />
    </div>
  );
}
