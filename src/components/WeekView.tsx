import {
  TOTAL_WEEKS,
  WEEK_DAY_LABELS,
  addDays,
  formatMD,
  weekRangeLabel,
  weekStartKey,
} from "../dateUtils";
import { arrangedHoursOf, coversDay, overlapsRange, plannedHoursOf } from "../schedule";
import { colorOf, tint } from "../theme";
import type { PlannerData, Subject, Task } from "../types";
import { Button, NumberField } from "./ui";

const GRID = "150px 66px minmax(0, 1fr)";

export function WeekView({
  data,
  week,
  methodId,
  onWeekChange,
  onMethodToggle,
  onEditTask,
  onManageSubject,
  onTaskChange,
  onPlannedChange,
  onCellTextChange,
}: {
  data: PlannerData;
  week: number;
  methodId: string | null;
  onWeekChange: (week: number) => void;
  onMethodToggle: (taskId: string) => void;
  onEditTask: (task: Task) => void;
  onManageSubject: (subject: Subject) => void;
  onTaskChange: (taskId: string, patch: Partial<Task>, undoable?: boolean) => void;
  onPlannedChange: (dateKey: string, hours: number) => void;
  onCellTextChange: (key: string, text: string) => void;
}) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStartKey(week), index));
  const weekFrom = days[0];
  const weekTo = days[6];
  const weekTasks = data.tasks.filter((task) => overlapsRange(task, weekFrom, weekTo));
  const visibleSubjects = data.subjects.filter((subject) =>
    weekTasks.some((task) => task.subjectId === subject.id),
  );

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <Button disabled={week === 0} onClick={() => onWeekChange(week - 1)}>
          ← 上一周
        </Button>
        <strong style={{ fontSize: 17 }}>
          第{week + 1}周 · {weekRangeLabel(week)}
        </strong>
        <Button disabled={week === TOTAL_WEEKS - 1} onClick={() => onWeekChange(week + 1)}>
          下一周 →
        </Button>
      </div>

      <div className="card">
        <div style={{ display: "grid", gridTemplateColumns: GRID, background: "var(--surface-3)" }}>
          <div style={{ padding: "8px 10px", fontWeight: 600 }}>任务 / 学法</div>
          <div className="small" style={{ padding: "8px 2px", fontWeight: 600, textAlign: "center" }}>
            日均用时
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
            {days.map((dateKey, index) => (
              <div
                key={dateKey}
                style={{
                  padding: "5px 4px",
                  textAlign: "center",
                  borderLeft: "1px solid var(--stroke)",
                }}
              >
                <div style={{ fontWeight: 600 }}>周{WEEK_DAY_LABELS[index]}</div>
                <div className="small muted-3">{formatMD(dateKey)}</div>
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
            <div className="small muted-3">已排由时间轴自动算</div>
          </div>
          <div />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
            {days.map((dateKey) => {
              const planned = plannedHoursOf(data, dateKey);
              const arranged = arrangedHoursOf(data, dateKey);
              const over = arranged > planned;
              return (
                <div
                  key={dateKey}
                  style={{ padding: "6px 5px", borderLeft: "1px solid var(--stroke)" }}
                >
                  <div className="row" style={{ gap: 3 }}>
                    <NumberField
                      value={planned}
                      width={46}
                      onChange={(value) => onPlannedChange(dateKey, Number(value) || 0)}
                      title="当天计划可用时长"
                    />
                    <span className="small muted">计划</span>
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

        {visibleSubjects.map((subject) => {
          const subjectTasks = weekTasks.filter((task) => task.subjectId === subject.id);
          return (
            <div key={subject.id}>
              <WeekSubjectRow
                subject={subject}
                tasks={subjectTasks}
                days={days}
                onManage={() => onManageSubject(subject)}
              />
              {subjectTasks.map((task) => (
                <div
                  key={task.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: GRID,
                    borderTop: "1px solid var(--stroke)",
                  }}
                >
                  <div style={{ padding: "7px 8px", display: "flex", flexDirection: "column", gap: 6 }}>
                    <div className="row" style={{ gap: 5 }}>
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
                        className={methodId === task.id ? "btn btn-small btn-primary" : "btn btn-small"}
                        onClick={() => onMethodToggle(task.id)}
                      >
                        学法
                      </button>
                    </div>
                    {methodId === task.id ? (
                      <textarea
                        className="field"
                        rows={3}
                        value={task.method}
                        placeholder="用一两句话记录学法…"
                        onChange={(event) =>
                          onTaskChange(task.id, { method: event.target.value }, false)
                        }
                      />
                    ) : null}
                  </div>
                  <div style={{ padding: "7px 4px", textAlign: "center" }}>
                    <NumberField
                      value={task.dailyHours}
                      width={54}
                      onChange={(value) =>
                        onTaskChange(task.id, { dailyHours: Number(value) || 0 }, false)
                      }
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
                    {days.map((dateKey) => {
                      const active = coversDay(task, dateKey);
                      const cellKey = `${task.id}|${dateKey}`;
                      return (
                        <div
                          key={cellKey}
                          style={{
                            padding: 4,
                            borderLeft: "1px solid var(--stroke)",
                            background: active ? tint(task.colorId, 0.3) : "var(--surface-2)",
                          }}
                        >
                          {active ? (
                            <textarea
                              className="field-plain small"
                              rows={2}
                              value={data.weekTexts[cellKey] ?? ""}
                              placeholder={task.name}
                              onChange={(event) => onCellTextChange(cellKey, event.target.value)}
                              style={{ minHeight: 44 }}
                            />
                          ) : (
                            <div style={{ minHeight: 44 }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          );
        })}

        {visibleSubjects.length === 0 ? (
          <div className="muted" style={{ padding: 20, textAlign: "center" }}>
            本周没有任务
          </div>
        ) : null}
      </div>
    </div>
  );
}

function WeekSubjectRow({
  subject,
  tasks,
  days,
  onManage,
}: {
  subject: Subject;
  tasks: Task[];
  days: string[];
  onManage: () => void;
}) {
  const perDay = days.map((dateKey) =>
    tasks
      .filter((task) => coversDay(task, dateKey))
      .reduce((sum, task) => sum + task.dailyHours, 0),
  );
  const average = perDay.reduce((sum, value) => sum + value, 0) / 7;

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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
        {perDay.map((value, index) => (
          <div
            key={index}
            className="small"
            style={{
              padding: "9px 2px",
              textAlign: "center",
              borderLeft: "1px solid var(--stroke)",
              fontWeight: 600,
              color: value > 0 ? "var(--text)" : "var(--text-3)",
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
