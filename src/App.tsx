import { useEffect, useState } from "react";
import { applySuggestion } from "./ai";
import { AiPanel } from "./components/AiPanel";
import { DayView } from "./components/DayView";
import {
  ConfirmDialog,
  SubjectEditor,
  TaskEditor,
  type SubjectDraft,
  type TaskDraft,
} from "./components/Editors";
import { OverviewView } from "./components/OverviewView";
import { WeekView } from "./components/WeekView";
import { Button, Callout, Modal, Pill } from "./components/ui";
import {
  DEADLINE_LABEL,
  EXAM_DATE,
  TOTAL_DAYS,
  TOTAL_WEEKS,
  addDays,
  calendarKey,
  dayIndex,
  daysUntilExam,
  formatCN,
  keyFromIndex,
  todayKey,
  weekOfIndex,
  weeksAndDays,
} from "./dateUtils";
import {
  applyDailyHoursToDayPlans,
  dayPlanOf,
  generateDayPlan,
  overflowAfterShift,
  subjectOf,
  tasksOfDay,
} from "./schedule";
import { usePlanner } from "./storage";
import type { DayEntry, PlannerData, Subject, Task, ViewKey } from "./types";

const LAST_DAY = keyFromIndex(TOTAL_DAYS - 1);

export default function App() {
  const { data, commit, update, undo, canUndo } = usePlanner();
  const [, setNow] = useState(() => Date.now());

  const [view, setView] = useState<ViewKey>("overview");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [methodId, setMethodId] = useState<string | null>(null);
  const [week, setWeek] = useState(() => weekOfIndex(dayIndex(todayKey())));
  const [dayKey, setDayKey] = useState(() => todayKey());
  const [filterFrom, setFilterFrom] = useState("1");
  const [filterTo, setFilterTo] = useState(String(TOTAL_WEEKS));

  const [taskDraft, setTaskDraft] = useState<TaskDraft | null>(null);
  const [subjectDraft, setSubjectDraft] = useState<SubjectDraft | null>(null);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [deleteSubjectId, setDeleteSubjectId] = useState<string | null>(null);
  const [shiftWarning, setShiftWarning] = useState<Task[] | null>(null);
  const [carryoverDate, setCarryoverDate] = useState<string | null>(null);
  const [carryoverDismissed, setCarryoverDismissed] = useState(false);

  const today = todayKey();
  const daysLeft = daysUntilExam(calendarKey());

  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo]);

  // 昨天有没打勾的任务时弹窗询问怎么处理
  useEffect(() => {
    if (carryoverDismissed) return;
    const yesterday = addDays(today, -1);
    if (dayIndex(yesterday) < 0) return;
    const stored = data.dayPlans[yesterday];
    if (!stored) return;
    const pending = Object.entries(stored).filter(([, entry]) => entry.status === "pending");
    if (pending.length > 0) setCarryoverDate(yesterday);
  }, [data.dayPlans, today, carryoverDismissed]);

  const patchTask = (taskId: string, patch: Partial<Task>, undoable = true) => {
    const apply = (current: PlannerData): PlannerData => {
      const tasks = current.tasks.map((task) =>
        task.id === taskId ? { ...task, ...patch } : task,
      );
      const updated = tasks.find((task) => task.id === taskId);
      return {
        ...current,
        tasks,
        dayPlans:
          patch.dailyHours != null && updated
            ? applyDailyHoursToDayPlans(current.dayPlans, updated)
            : current.dayPlans,
      };
    };
    (undoable ? commit : update)(apply);
  };

  const patchEntry = (dateKey: string, taskId: string, patch: Partial<DayEntry>) => {
    update((current) => {
      const plan = dayPlanOf(current, dateKey);
      const entry = plan[taskId];
      if (!entry) return current;
      return {
        ...current,
        dayPlans: {
          ...current.dayPlans,
          [dateKey]: { ...plan, [taskId]: { ...entry, ...patch } },
        },
      };
    });
  };

  const setPlanned = (dateKey: string, hours: number) => {
    update((current) => ({
      ...current,
      plannedHours: { ...current.plannedHours, [dateKey]: hours },
    }));
  };

  const saveTask = (draft: TaskDraft) => {
    commit((current) => {
      const fields = {
        subjectId: draft.subjectId,
        name: draft.name.trim(),
        dailyHours: Number(draft.dailyHours) || 0,
        startDate: draft.startDate,
        endDate: draft.endDate,
        colorId: draft.colorId,
      };
      if (draft.id) {
        const tasks = current.tasks.map((task) =>
          task.id === draft.id ? { ...task, ...fields } : task,
        );
        const updated = tasks.find((task) => task.id === draft.id);
        return {
          ...current,
          tasks,
          dayPlans: updated
            ? applyDailyHoursToDayPlans(current.dayPlans, updated)
            : current.dayPlans,
        };
      }
      return {
        ...current,
        tasks: [...current.tasks, { id: `task-${Date.now()}`, method: "", ...fields }],
      };
    });
    setTaskDraft(null);
  };

  const saveSubject = (draft: SubjectDraft) => {
    commit((current) => {
      const fields = {
        name: draft.name.trim(),
        colorId: draft.colorId,
        order: Number(draft.order) || 5,
      };
      if (draft.id) {
        return {
          ...current,
          subjects: current.subjects.map((subject) =>
            subject.id === draft.id ? { ...subject, ...fields } : subject,
          ),
        };
      }
      return {
        ...current,
        subjects: [...current.subjects, { id: `subject-${Date.now()}`, ...fields }],
      };
    });
    setSubjectDraft(null);
  };

  const openNewTask = (subjectId: string) => {
    const subject = data.subjects.find((item) => item.id === subjectId);
    setSubjectDraft(null);
    setTaskDraft({
      id: null,
      subjectId,
      name: "",
      dailyHours: "1",
      startDate: today,
      endDate: LAST_DAY,
      colorId: subject?.colorId ?? "blue",
    });
  };

  const openEditTask = (task: Task) => {
    setTaskDraft({
      id: task.id,
      subjectId: task.subjectId,
      name: task.name,
      dailyHours: String(task.dailyHours),
      startDate: task.startDate,
      endDate: task.endDate,
      colorId: task.colorId,
    });
  };

  const openSubject = (subject?: Subject) => {
    setSubjectDraft(
      subject
        ? {
            id: subject.id,
            name: subject.name,
            colorId: subject.colorId,
            order: String(subject.order),
          }
        : { id: null, name: "", colorId: "blue", order: "5" },
    );
  };

  /** 把某个任务的结束日期整体往后推，用于「挪到明天」 */
  const pushTaskLater = (taskId: string, days: number) => {
    commit((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === taskId
          ? { ...task, endDate: minKey(addDays(task.endDate, days), LAST_DAY) }
          : task,
      ),
    }));
  };

  const moveTaskToTomorrow = (fromKey: string, taskId: string) => {
    const tomorrow = addDays(fromKey, 1);
    commit((current) => {
      const todayPlan = dayPlanOf(current, fromKey);
      const todayEntry = todayPlan[taskId];
      const tasks = current.tasks.map((task) =>
        task.id === taskId
          ? { ...task, endDate: minKey(addDays(task.endDate, 1), LAST_DAY) }
          : task,
      );
      const shifted = { ...current, tasks };
      const dayPlans: PlannerData["dayPlans"] = {
        ...current.dayPlans,
        [fromKey]: todayEntry
          ? { ...todayPlan, [taskId]: { ...todayEntry, status: "unfinished" } }
          : todayPlan,
      };
      if (dayIndex(tomorrow) >= 0 && dayIndex(tomorrow) < TOTAL_DAYS) {
        const tomorrowPlan = dayPlanOf(shifted, tomorrow);
        const tomorrowEntry = tomorrowPlan[taskId];
        if (tomorrowEntry) {
          dayPlans[tomorrow] = {
            ...tomorrowPlan,
            [taskId]: {
              ...tomorrowEntry,
              note: todayEntry?.note || tomorrowEntry.note,
              status: "pending",
            },
          };
        }
      }
      return { ...shifted, dayPlans };
    });
  };

  /** 整体计划后移，越界的任务先警告 */
  const shiftWholePlan = (days: number) => {
    const overflow = overflowAfterShift(data.tasks, days, LAST_DAY);
    if (overflow.length > 0) {
      setShiftWarning(overflow);
      return;
    }
    applyShift(days);
  };

  const applyShift = (days: number) => {
    commit((current) => ({
      ...current,
      tasks: current.tasks.map((task) => ({
        ...task,
        startDate: minKey(addDays(task.startDate, days), LAST_DAY),
        endDate: minKey(addDays(task.endDate, days), LAST_DAY),
      })),
    }));
    setShiftWarning(null);
  };

  const carryoverTasks = carryoverDate
    ? Object.entries(data.dayPlans[carryoverDate] ?? {})
        .filter(([, entry]) => entry.status === "pending")
        .map(([taskId]) => data.tasks.find((task) => task.id === taskId))
        .filter((task): task is Task => Boolean(task))
    : [];

  const closeCarryover = () => {
    setCarryoverDate(null);
    setCarryoverDismissed(true);
  };

  return (
    <div style={{ maxWidth: 1480, margin: "0 auto", padding: "14px 16px 60px" }}>
      <header style={{ textAlign: "center", position: "relative", padding: "6px 0 14px" }}>
        <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.2 }}>
          距离考研 {daysLeft} 天（{weeksAndDays(daysLeft)}）
        </div>
        <div className="muted">
          考试 {EXAM_DATE.slice(5).replace("-", "月")}日 · 周期按周六至周五 · 截止 {DEADLINE_LABEL}
        </div>
        <div
          className="row small"
          style={{ position: "absolute", right: 0, top: 8, gap: 6 }}
        >
          <Button small disabled={!canUndo} onClick={undo} title="Ctrl+Z">
            撤销
          </Button>
        </div>
      </header>

      <div className="row" style={{ gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <Pill active={view === "overview"} onClick={() => setView("overview")}>
          总体计划
        </Pill>
        <Pill
          active={view === "week"}
          onClick={() => {
            setWeek(weekOfIndex(dayIndex(today)));
            setView("week");
          }}
        >
          当前周
        </Pill>
        <Pill
          active={view === "day"}
          onClick={() => {
            setDayKey(today);
            setView("day");
          }}
        >
          {formatCN(today)}
        </Pill>
      </div>

      {view === "overview" ? (
        <OverviewView
          data={data}
          selectedId={selectedId}
          methodId={methodId}
          filterFrom={filterFrom}
          filterTo={filterTo}
          onSelect={setSelectedId}
          onMethodToggle={(taskId) =>
            setMethodId((current) => (current === taskId ? null : taskId))
          }
          onEditTask={openEditTask}
          onManageSubject={openSubject}
          onAddSubject={() => openSubject()}
          onFilterChange={(from, to) => {
            setFilterFrom(from);
            setFilterTo(to);
          }}
          onTaskChange={patchTask}
          onCapacityChange={(capacity) => update((current) => ({ ...current, capacity }))}
          onDragStart={() => commit((current) => current)}
        />
      ) : null}

      {view === "week" ? (
        <WeekView
          data={data}
          week={week}
          methodId={methodId}
          onWeekChange={setWeek}
          onMethodToggle={(taskId) =>
            setMethodId((current) => (current === taskId ? null : taskId))
          }
          onEditTask={openEditTask}
          onManageSubject={openSubject}
          onTaskChange={patchTask}
          onPlannedChange={setPlanned}
          onCellTextChange={(key, text) =>
            update((current) => ({
              ...current,
              weekTexts: { ...current.weekTexts, [key]: text },
            }))
          }
        />
      ) : null}

      {view === "day" ? (
        <DayView
          data={data}
          dateKey={dayKey}
          selectedId={selectedId}
          onDateShift={(days) => {
            const next = addDays(dayKey, days);
            const index = dayIndex(next);
            if (index >= 0 && index < TOTAL_DAYS) setDayKey(next);
          }}
          onSelect={setSelectedId}
          onEntryChange={(taskId, patch) => patchEntry(dayKey, taskId, patch)}
          onPlannedChange={setPlanned}
          onNoteChange={(text) =>
            update((current) => ({
              ...current,
              dayNotes: { ...current.dayNotes, [dayKey]: text },
            }))
          }
          onMoveTomorrow={(taskId) => moveTaskToTomorrow(dayKey, taskId)}
          onShiftPlan={() => shiftWholePlan(1)}
          onRegenerate={() =>
            commit((current) => ({
              ...current,
              dayPlans: { ...current.dayPlans, [dayKey]: generateDayPlan(current, dayKey) },
            }))
          }
          onDragStart={() => commit((current) => current)}
        />
      ) : null}

      <AiPanel
        data={data}
        onApply={(action) => commit((current) => applySuggestion(current, action))}
      />

      {taskDraft ? (
        <TaskEditor
          draft={taskDraft}
          subjects={data.subjects}
          onClose={() => setTaskDraft(null)}
          onSave={saveTask}
          onDelete={(taskId) => {
            setTaskDraft(null);
            setDeleteTaskId(taskId);
          }}
        />
      ) : null}

      {subjectDraft ? (
        <SubjectEditor
          draft={subjectDraft}
          taskCount={data.tasks.filter((task) => task.subjectId === subjectDraft.id).length}
          onClose={() => setSubjectDraft(null)}
          onSave={saveSubject}
          onDelete={(subjectId) => {
            setSubjectDraft(null);
            setDeleteSubjectId(subjectId);
          }}
          onAddTask={openNewTask}
        />
      ) : null}

      {deleteTaskId ? (
        <ConfirmDialog
          title="确认删除这个二级任务？"
          message="删除后可以按 Ctrl+Z 或右上角撤销按钮恢复。"
          confirmLabel="确认删除"
          onCancel={() => setDeleteTaskId(null)}
          onConfirm={() => {
            commit((current) => ({
              ...current,
              tasks: current.tasks.filter((task) => task.id !== deleteTaskId),
            }));
            setDeleteTaskId(null);
          }}
        />
      ) : null}

      {deleteSubjectId ? (
        <ConfirmDialog
          title={`确认删除「${data.subjects.find((s) => s.id === deleteSubjectId)?.name}」？`}
          message={`其下 ${
            data.tasks.filter((task) => task.subjectId === deleteSubjectId).length
          } 个二级任务会一并移除，可以按 Ctrl+Z 恢复。`}
          confirmLabel="确认删除"
          onCancel={() => setDeleteSubjectId(null)}
          onConfirm={() => {
            commit((current) => ({
              ...current,
              subjects: current.subjects.filter((subject) => subject.id !== deleteSubjectId),
              tasks: current.tasks.filter((task) => task.subjectId !== deleteSubjectId),
            }));
            setDeleteSubjectId(null);
          }}
        />
      ) : null}

      {shiftWarning ? (
        <Modal title="后移会超出可用时间" onClose={() => setShiftWarning(null)} width={470}>
          <div className="stack" style={{ gap: 14 }}>
            <Callout tone="warning">
              以下 {shiftWarning.length} 个任务后移后会超过 {LAST_DAY}，
              结束日期会被压到最后一天，实际复习天数减少。
            </Callout>
            <ul className="small muted" style={{ margin: 0, paddingLeft: 20 }}>
              {shiftWarning.map((task) => (
                <li key={task.id}>
                  {subjectOf(data, task.subjectId)?.name} · {task.name}（现结束 {task.endDate}）
                </li>
              ))}
            </ul>
            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <Button onClick={() => setShiftWarning(null)}>取消</Button>
              <Button variant="danger" onClick={() => applyShift(1)}>
                仍然后移
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {carryoverDate && carryoverTasks.length > 0 ? (
        <Modal title={`${formatCN(carryoverDate)} 有未完成的任务`} onClose={closeCarryover} width={520}>
          <div className="stack" style={{ gap: 12 }}>
            <span className="muted small">
              勾选补记已完成，或把单个任务挪到后面，也可以把整个计划后移一天。
            </span>
            <div className="stack" style={{ gap: 6 }}>
              {carryoverTasks.map((task) => (
                <div
                  key={task.id}
                  className="row"
                  style={{
                    justifyContent: "space-between",
                    border: "1px solid var(--stroke)",
                    borderRadius: 8,
                    padding: "7px 10px",
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {subjectOf(data, task.subjectId)?.name} · {task.name}
                  </span>
                  <div className="row" style={{ gap: 6 }}>
                    <Button
                      small
                      onClick={() => patchEntry(carryoverDate, task.id, { status: "done" })}
                    >
                      已完成
                    </Button>
                    <Button
                      small
                      onClick={() => {
                        patchEntry(carryoverDate, task.id, { status: "unfinished" });
                        pushTaskLater(task.id, 1);
                      }}
                    >
                      挪到明天
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="row" style={{ justifyContent: "space-between", marginTop: 4 }}>
              <Button onClick={() => shiftWholePlan(1)}>整体计划后移一天</Button>
              <Button variant="primary" onClick={closeCarryover}>
                处理完了
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      <footer className="small muted-3" style={{ marginTop: 26, textAlign: "center" }}>
        数据存在这台浏览器本地，换设备不会同步。
        今天共 {tasksOfDay(data, today).length} 个任务。
      </footer>
    </div>
  );
}

function minKey(a: string, b: string): string {
  return a < b ? a : b;
}
