import {
  addDays,
  formatMD,
  formatWeekSpan,
  spanWeeks,
  type Span,
  weekEndKey,
  weekStartKey,
} from "../dateUtils";
import { overlapsRange } from "../schedule";
import { colorOf } from "../theme";
import type { PlannerData, Subject, Task } from "../types";
import { GanttBar, PhaseLines, TodayCaption, TodayLine } from "./GanttBar";
import { ImportPanel } from "./ImportPanel";
import { LoadChart } from "./LoadChart";
import { Button, NumberField } from "./ui";
import type { ImportSubject } from "../planImport";

const GRID = "170px 74px minmax(0, 1fr)";

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
  onImport: (subjects: ImportSubject[]) => void;
}) {
  const totalWeeks = spanWeeks(span);
  const from = Math.max(1, Math.min(totalWeeks, Number(filterFrom) || 1));
  const to = Math.max(from, Math.min(totalWeeks, Number(filterTo) || totalWeeks));
  const weekFrom = from - 1;
  const weekTo = to - 1;
  const rangeFrom = weekStartKey(weekFrom, span.origin);
  const rangeTo = weekEndKey(weekTo, span);
  const visibleTasks = data.tasks.filter((task) => overlapsRange(task, rangeFrom, rangeTo));
  const visibleSubjects = data.subjects.filter((subject) =>
    visibleTasks.some((task) => task.subjectId === subject.id),
  );

  return (
    <div className="stack" style={{ gap: 16 }}>
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

      <div className="card">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: GRID,
            background: "var(--surface-3)",
            borderBottom: "1px solid var(--stroke)",
          }}
        >
          <div />
          <div />
          <TodayCaption span={span} weekFrom={weekFrom} weekTo={weekTo} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: GRID, background: "var(--surface-3)" }}>
          <div style={{ padding: "9px 10px", fontWeight: 600 }}>二级任务</div>
          <div style={{ padding: "9px 4px", fontWeight: 600, textAlign: "center" }} className="small">
            日均用时
          </div>
          <TimelineHeader span={span} weekFrom={weekFrom} weekTo={weekTo} />
        </div>

        {visibleSubjects.map((subject) => {
          const subjectTasks = visibleTasks.filter((task) => task.subjectId === subject.id);
          return (
            <div key={subject.id}>
              <SubjectRow
                subject={subject}
                tasks={subjectTasks}
                span={span}
                weekFrom={weekFrom}
                weekTo={weekTo}
                onManage={() => onManageSubject(subject)}
              />
              {subjectTasks.map((task) => {
                const methodOpen = methodId === task.id;
                return (
                  <div
                    key={task.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: GRID,
                      borderTop: "1px solid var(--stroke)",
                      background:
                        task.id === selectedId ? "var(--surface-2)" : "var(--surface)",
                    }}
                  >
                    <div style={{ padding: "7px 9px", display: "flex", gap: 5, alignItems: "center" }}>
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
                        onClick={() => onMethodToggle(task.id)}
                      >
                        学法
                      </button>
                    </div>
                    <div style={{ padding: "7px 5px", textAlign: "center" }}>
                      <NumberField
                        value={task.dailyHours}
                        width={58}
                        onChange={(value) =>
                          onTaskChange(task.id, { dailyHours: Number(value) || 0 }, false)
                        }
                      />
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
                        selected={task.id === selectedId}
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
            </div>
          );
        })}

        {visibleSubjects.length === 0 ? (
          <div className="muted" style={{ padding: 20, textAlign: "center" }}>
            这个周次范围内没有任务
          </div>
        ) : null}
      </div>

      <div className="muted small">
        双击任务名称改名称、起止日期和颜色；甘特条可整条拖动，拖两端改起止日期。
      </div>

      <ImportPanel data={data} span={span} onImport={onImport} />
    </div>
  );
}

function TimelineHeader({
  span,
  weekFrom,
  weekTo,
}: {
  span: Span;
  weekFrom: number;
  weekTo: number;
}) {
  const weeks = Array.from({ length: weekTo - weekFrom + 1 }, (_, index) => weekFrom + index);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))`,
        position: "relative",
      }}
    >
      {weeks.map((week) => (
        <div
          key={week}
          style={{
            padding: "5px 2px",
            textAlign: "center",
            borderLeft: "1px solid var(--stroke)",
          }}
        >
          <div className="small" style={{ fontWeight: 600 }}>
            {week + 1}
          </div>
          <div className="small muted-3">{formatWeekSpan(week, span)}</div>
        </div>
      ))}
      <PhaseLines weekFrom={weekFrom} weekTo={weekTo} />
      <TodayLine span={span} weekFrom={weekFrom} weekTo={weekTo} />
    </div>
  );
}

function SubjectRow({
  subject,
  tasks,
  span,
  weekFrom,
  weekTo,
  onManage,
}: {
  subject: Subject;
  tasks: Task[];
  span: Span;
  weekFrom: number;
  weekTo: number;
  onManage: () => void;
}) {
  const weeks = Array.from({ length: weekTo - weekFrom + 1 }, (_, index) => weekFrom + index);
  const weeklyValues = weeks.map((week) => {
    const from = weekStartKey(week, span.origin);
    const to = addDays(from, 6);
    return tasks
      .filter((task) => overlapsRange(task, from, to))
      .reduce((sum, task) => sum + task.dailyHours, 0);
  });

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
      <div />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))`,
          position: "relative",
        }}
      >
        {weeklyValues.map((value, index) => (
          <div
            key={weeks[index]}
            className="small"
            style={{
              padding: "7px 2px",
              textAlign: "center",
              borderLeft: "1px solid var(--stroke)",
              fontWeight: 600,
              color: value > 0 ? "var(--text)" : "var(--text-3)",
            }}
          >
            {value > 0 ? `${value.toFixed(1)}h` : "–"}
          </div>
        ))}
        <TodayLine span={span} weekFrom={weekFrom} weekTo={weekTo} />
      </div>
      <div style={{ gridColumn: "1 / -1", borderBottom: `3px solid ${colorOf(subject.colorId)}` }} />
    </div>
  );
}
