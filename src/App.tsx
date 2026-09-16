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
import { WorkspaceGate } from "./components/WorkspaceGate";
import { Button, Callout, Modal, Pill, TextField } from "./components/ui";
import {
  addDays,
  calendarKey,
  dayIndex,
  daysUntilExam,
  formatCN,
  makeSpan,
  plannerWeekDays,
  PLAN_ORIGIN,
  spanDays,
  spanWeeks,
  todayKey,
  weekOfIndex,
  weeksAndDays,
  weekCellKey,
} from "./dateUtils";
import { planToMarkdown } from "./exportPlan";
import { applyImport } from "./planImport";
import {
  applyDailyHoursToDayPlans,
  dayPlanOf,
  dayPlanCapacityError,
  dropTaskRecords,
  generateDayPlan,
  overflowAfterShift,
  reorderSubjectTasks,
  nextTaskOrder,
  subjectOf,
  tasksOfDay,
  writeDayHours,
  applyHoursToStoredEntry,
  coversDay,
} from "./schedule";
import { usePlanner } from "./storage";
import type { DayEntry, PlannerData, Subject, Task, ViewKey } from "./types";
import { profileNeedsPass, useWorkspace } from "./workspace";

export default function App() {
  const workspace = useWorkspace();
  const { data, commit, update, undo, canUndo, saveError } = usePlanner(
    workspace.profile?.id ?? null,
    Boolean(workspace.profile?.cloud),
  );
  const [, setNow] = useState(() => Date.now());
  const [exportText, setExportText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const span = makeSpan(data.examDate);
  const lastDay = span.examDate;
  const totalDays = spanDays(span);
  const totalWeeks = spanWeeks(span);

  const [view, setView] = useState<ViewKey>("overview");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [methodId, setMethodId] = useState<string | null>(null);
  const [week, setWeek] = useState(() =>
    Math.max(0, weekOfIndex(dayIndex(calendarKey(), PLAN_ORIGIN))),
  );
  const [dayKey, setDayKey] = useState(() => calendarKey());
  const [filterFrom, setFilterFrom] = useState("1");
  const [filterTo, setFilterTo] = useState("");

  const [taskDraft, setTaskDraft] = useState<TaskDraft | null>(null);
  const [subjectDraft, setSubjectDraft] = useState<SubjectDraft | null>(null);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [deleteSubjectId, setDeleteSubjectId] = useState<string | null>(null);
  const [shiftWarning, setShiftWarning] = useState<Task[] | null>(null);
  const [carryoverDate, setCarryoverDate] = useState<string | null>(null);
  const [carryoverDismissed, setCarryoverDismissed] = useState(false);
  const [passA, setPassA] = useState("");
  const [passB, setPassB] = useState("");
  const [passMsg, setPassMsg] = useState("");

  const today = todayKey(span);
  const eventName = data.eventName?.trim() || "考研";
  const daysLeft = daysUntilExam(calendarKey(), data.examDate);

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
    setWeek((current) => Math.min(current, Math.max(0, totalWeeks - 1)));
    setDayKey((key) => {
      if (key < span.origin) return span.origin;
      if (key > span.examDate) return span.examDate;
      return key;
    });
  }, [span.origin, span.examDate, totalWeeks]);

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

  useEffect(() => {
    if (carryoverDismissed) return;
    const yesterday = addDays(today, -1);
    if (dayIndex(yesterday, span.origin) < 0) return;
    const pending = Object.entries(dayPlanOf(data, yesterday)).filter(
      ([, entry]) => entry.status === "pending",
    );
    if (pending.length > 0) setCarryoverDate(yesterday);
  }, [data, today, carryoverDismissed, span.origin]);

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
      const next = { ...entry, ...patch };
      return {
        ...current,
        dayPlans: {
          ...current.dayPlans,
          [dateKey]: { ...plan, [taskId]: next },
        },
        weekTexts:
          patch.note != null
            ? { ...current.weekTexts, [weekCellKey(taskId, dateKey)]: patch.note }
            : current.weekTexts,
      };
    });
  };

  const setPlanned = (dateKey: string, hours: number) => {
    update((current) => ({
      ...current,
      plannedHours: { ...current.plannedHours, [dateKey]: hours },
    }));
  };

  const setDayHours = (taskId: string, dateKey: string, hours: number) => {
    update((current) => {
      const task = current.tasks.find((item) => item.id === taskId);
      if (!task) return current;
      return {
        ...current,
        dayHours: writeDayHours(current.dayHours, task, dateKey, hours),
        dayPlans: applyHoursToStoredEntry(current.dayPlans, taskId, dateKey, hours),
      };
    });
  };

  const setWeekAverage = (taskId: string, hours: number) => {
    update((current) => {
      const task = current.tasks.find((item) => item.id === taskId);
      if (!task) return current;
      const days = plannerWeekDays(week, span);
      let dayHours = current.dayHours ?? {};
      let dayPlans = current.dayPlans;
      for (const dateKey of days) {
        if (!coversDay(task, dateKey)) continue;
        dayHours = writeDayHours(dayHours, task, dateKey, hours);
        dayPlans = applyHoursToStoredEntry(dayPlans, taskId, dateKey, hours);
      }
      return { ...current, dayHours, dayPlans };
    });
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
        tasks: [...current.tasks, { id: `task-${Date.now()}`, method: "", order: nextTaskOrder(current.tasks, draft.subjectId), ...fields }],
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
      endDate: lastDay,
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

  const pushTaskLater = (taskId: string, days: number) => {
    commit((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === taskId
          ? { ...task, endDate: minKey(addDays(task.endDate, days), lastDay) }
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
          ? { ...task, endDate: minKey(addDays(task.endDate, 1), lastDay) }
          : task,
      );
      const shifted = { ...current, tasks };
      const dayPlans: PlannerData["dayPlans"] = {
        ...current.dayPlans,
        [fromKey]: todayEntry
          ? { ...todayPlan, [taskId]: { ...todayEntry, status: "unfinished" } }
          : todayPlan,
      };
      if (dayIndex(tomorrow, span.origin) >= 0 && dayIndex(tomorrow, span.origin) < totalDays) {
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

  const shiftWholePlan = (days: number) => {
    const overflow = overflowAfterShift(data.tasks, days, lastDay);
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
        startDate: minKey(addDays(task.startDate, days), lastDay),
        endDate: minKey(addDays(task.endDate, days), lastDay),
      })),
    }));
    setShiftWarning(null);
  };

  const carryoverTasks = carryoverDate
    ? Object.entries(dayPlanOf(data, carryoverDate))
        .filter(([, entry]) => entry.status === "pending")
        .map(([taskId]) => data.tasks.find((task) => task.id === taskId))
        .filter((task): task is Task => Boolean(task))
    : [];

  const closeCarryover = () => {
    setCarryoverDate(null);
    setCarryoverDismissed(true);
  };

  if (!workspace.ready) {
    return (
      <div className="muted" style={{ maxWidth: 520, margin: "20vh auto", textAlign: "center" }}>
        打开中…
      </div>
    );
  }

  if (!workspace.profile) {
    return (
      <WorkspaceGate
        profiles={workspace.profiles}
        cloudAvailable={workspace.cloudAvailable}
        cloudMessage={workspace.cloudMessage}
        onCreate={workspace.create}
        onUnlock={workspace.unlock}
      />
    );
  }

  const ownerName = workspace.profile.name;

  return (
    <div style={{ maxWidth: 1480, margin: "0 auto", padding: "14px 16px 60px" }}>
      <header style={{ textAlign: "center", position: "relative", padding: "6px 0 14px" }}>
        <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.2 }}>
          距离{eventName} {daysLeft} 天（{weeksAndDays(daysLeft)}）
        </div>
        <div
          className="row small muted"
          style={{ justifyContent: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}
        >
          <span>规划事项</span>
          <TextField
            value={data.eventName ?? "考研"}
            placeholder="考研"
            width={108}
            onChange={(value) => update((current) => ({ ...current, eventName: value }))}
          />
          <span>事项时间</span>
          <TextField
            type="date"
            value={data.examDate}
            width={148}
            onChange={(value) => {
              if (!value) return;
              update((current) => ({ ...current, examDate: value }));
            }}
          />
        </div>
        <div
          className="row small"
          style={{ position: "absolute", right: 0, top: 8, gap: 6 }}
        >
          <Button
            small
            onClick={() => {
              setCopied(false);
              setExportText(planToMarkdown(data, ownerName));
            }}
          >
            导出给 AI
          </Button>
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
            setWeek(weekOfIndex(dayIndex(today, span.origin)));
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

      {saveError ? <Callout tone="warning">{saveError}</Callout> : null}

      {view === "overview" ? (
        <OverviewView
          data={data}
          span={span}
          selectedId={selectedId}
          methodId={methodId}
          filterFrom={filterFrom}
          filterTo={filterTo || String(totalWeeks)}
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
          onReorder={(dragId, hoverId) =>
            update((current) => {
              const drag = current.tasks.find((task) => task.id === dragId);
              if (!drag) return current;
              return {
                ...current,
                tasks: reorderSubjectTasks(current.tasks, drag.subjectId, dragId, hoverId),
              };
            })
          }
          onImport={(subjects) => commit((current) => applyImport(current, subjects))}
        />
      ) : null}

      {view === "week" ? (
        <WeekView
          data={data}
          span={span}
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
          onWeekAverageChange={setWeekAverage}
          onDayHoursChange={setDayHours}
          onCellTextChange={(key, text) =>
            update((current) => {
              const sep = key.indexOf("|");
              const taskId = key.slice(0, sep);
              const dateKey = key.slice(sep + 1);
              const stored = current.dayPlans[dateKey];
              return {
                ...current,
                weekTexts: { ...current.weekTexts, [key]: text },
                dayPlans: stored?.[taskId]
                  ? {
                      ...current.dayPlans,
                      [dateKey]: {
                        ...stored,
                        [taskId]: { ...stored[taskId], note: text },
                      },
                    }
                  : current.dayPlans,
              };
            })
          }
          onDragStart={() => commit((current) => current)}
          onReorder={(dragId, hoverId) =>
            update((current) => {
              const drag = current.tasks.find((task) => task.id === dragId);
              if (!drag) return current;
              return {
                ...current,
                tasks: reorderSubjectTasks(current.tasks, drag.subjectId, dragId, hoverId),
              };
            })
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
            const index = dayIndex(next, span.origin);
            if (index >= 0 && index < totalDays) setDayKey(next);
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
          onAddMisc={(name, start, end) =>
            update((current) => ({
              ...current,
              dayMiscs: {
                ...current.dayMiscs,
                [dayKey]: [
                  ...(current.dayMiscs[dayKey] ?? []),
                  { id: `misc-${Date.now()}`, name, start, end, status: "pending" },
                ],
              },
            }))
          }
          onPatchMisc={(miscId, patch) =>
            update((current) => ({
              ...current,
              dayMiscs: {
                ...current.dayMiscs,
                [dayKey]: (current.dayMiscs[dayKey] ?? []).map((item) =>
                  item.id === miscId ? { ...item, ...patch } : item,
                ),
              },
            }))
          }
          onRemoveMisc={(miscId) =>
            update((current) => ({
              ...current,
              dayMiscs: {
                ...current.dayMiscs,
                [dayKey]: (current.dayMiscs[dayKey] ?? []).filter((item) => item.id !== miscId),
              },
            }))
          }
          onRegenerate={() => {
            const error = dayPlanCapacityError(data, dayKey);
            if (error) return error;
            commit((current) => ({
              ...current,
              dayPlans: { ...current.dayPlans, [dayKey]: generateDayPlan(current, dayKey) },
            }));
            return null;
          }}
          onDragStart={() => commit((current) => current)}
        />
      ) : null}

      <AiPanel
        data={data}
        onApply={(action) => commit((current) => applySuggestion(current, action))}
      />

      {exportText ? (
        <Modal title="导出给 Cursor / Codex" onClose={() => setExportText(null)} width={640}>
          <div className="stack" style={{ gap: 12 }}>
            <div className="muted small">
              复制下面全文，贴进 Cursor、Codex、Claude Code 都可以。这是纯文本计划快照，任何 IDE 都能读。网站上的 P人大救星改不了 Cursor 额度；用导出是把数据交给你正在用的 IDE。
            </div>
            <textarea
              className="field day-note"
              readOnly
              value={exportText}
              style={{ minHeight: 240, fontFamily: "Consolas, monospace", fontSize: 12 }}
            />
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <Button
                variant="primary"
                onClick={() => {
                  void navigator.clipboard.writeText(exportText).then(() => setCopied(true));
                }}
              >
                {copied ? "已复制" : "复制全文"}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {taskDraft ? (
        <TaskEditor
          draft={taskDraft}
          subjects={data.subjects}
          origin={span.origin}
          examDate={span.examDate}
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
            commit((current) => {
              const cleaned = dropTaskRecords(current, [deleteTaskId]);
              return {
                ...cleaned,
                tasks: cleaned.tasks.filter((task) => task.id !== deleteTaskId),
              };
            });
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
            commit((current) => {
              const ids = current.tasks
                .filter((task) => task.subjectId === deleteSubjectId)
                .map((task) => task.id);
              const cleaned = dropTaskRecords(current, ids);
              return {
                ...cleaned,
                subjects: cleaned.subjects.filter((subject) => subject.id !== deleteSubjectId),
                tasks: cleaned.tasks.filter((task) => task.subjectId !== deleteSubjectId),
              };
            });
            setDeleteSubjectId(null);
          }}
        />
      ) : null}

      {shiftWarning ? (
        <Modal title="后移会超出可用时间" onClose={() => setShiftWarning(null)} width={470}>
          <div className="stack" style={{ gap: 14 }}>
            <Callout tone="warning">
              以下 {shiftWarning.length} 个任务后移后会超过 {lastDay}，
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
        今天 {tasksOfDay(data, today).length} 个任务 · 当前用户 {ownerName}
        {workspace.profile.cloud ? " · 已同步到云端" : ""}
        {workspace.profile && !profileNeedsPass(workspace.profile) ? (
          <div className="stack" style={{ gap: 8, maxWidth: 320, margin: "12px auto 0" }}>
            <div>这个用户名还没有口令，补上以后换浏览器会话要输入才能进。</div>
            <TextField type="password" value={passA} placeholder="新口令，至少 4 个字符" onChange={setPassA} />
            <TextField type="password" value={passB} placeholder="再输一次" onChange={setPassB} />
            <Button
              small
              onClick={() => {
                setPassMsg("");
                if (passA !== passB) {
                  setPassMsg("两次口令不一致");
                  return;
                }
                workspace
                  .setPassphrase(workspace.profile!.id, passA)
                  .then(() => {
                    setPassA("");
                    setPassB("");
                    setPassMsg("口令已保存");
                  })
                  .catch((caught: unknown) => {
                    setPassMsg(caught instanceof Error ? caught.message : "没保存成");
                  });
              }}
            >
              设置口令
            </Button>
            {passMsg ? <div>{passMsg}</div> : null}
          </div>
        ) : null}
        <div className="row" style={{ justifyContent: "center", marginTop: 8 }}>
          <Button small onClick={workspace.leave}>
            退出 / 换人
          </Button>
        </div>
      </footer>
    </div>
  );
}

function minKey(a: string, b: string): string {
  return a < b ? a : b;
}
