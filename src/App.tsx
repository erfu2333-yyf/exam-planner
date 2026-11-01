import { upgradeStudyCatalogue } from './studyCatalogue';
import { SubjectBudgetEditor } from './components/SubjectBudgetEditor';
import { AiPanel } from "./components/AiPanel";
import { applySuggestion } from "./ai";
import { StudyBudgetDialog } from './components/StudyBudgetDialog';
import { StudyBudgetWarning } from './studyBudgetWarning';
import { ActualStudyGantt } from './components/ActualStudyGantt';
import { StudyTaskEditor } from './components/StudyTaskListEditor';
import { useEffect, useMemo, useState } from "react";
import { StudyProgress } from './components/StudyProgress';
import { OriginalWeekBoard } from './components/OriginalWeekBoard';
import { createStudyPlan, moveStudy, patchStudy, regenerateStudyDay, rolloverStudy, studyDayData, studyOverviewData, studyTotals, studyDayOverlaps, parentStudyTotals, applyStudyBudgetChoice, withdrawStudy } from './taskPlan';
import './study.css';


import { DayView } from "./components/DayView";
import {
  ConfirmDialog,
  emptyVolume,
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
  applyDoneDeltaToBreakdown,
  snapActualHours,
  suggestedUnitForName,
  tasksNeedingBreakdown,
} from "./progress";
import { useTaskTimer } from "./timer";
import {
  appendDayMiscs,
  applyDailyHoursToDayPlans,
  colorsOnDay,
  dayPlanOf,
  dayPlanCapacityError,
  dropTaskRecords,
  generateDayPlan,
  overflowAfterShift,
  reorderSubjectTasks,
  reorderSubjects,
  pruneUncoveredTaskDays,
  normalizeWeekdays,
  nextTaskOrder,
  subjectOf,
  tasksOfDay,
  writeDayHours,
  applyHoursToStoredEntry,
  coversDay,
} from "./schedule";
import { usePlanner } from "./storage";
import { GRAY_ID, pickUnusedColor } from "./theme";
import type { DayEntry, PlannerData, Subject, Task, ViewKey } from "./types";
import { profileNeedsPass, useWorkspace } from "./workspace";

export default function App() {
  const workspace = useWorkspace();
  const { data, commit, update, undo, canUndo, saveError, hydrated } = usePlanner(
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
  const [subjectBudget,setSubjectBudget]=useState<string|null>(null);
  const [budgetEditor,setBudgetEditor] = useState<string|null>(null);
  const [budgetRequest,setBudgetRequest] = useState<{action:(data:PlannerData)=>PlannerData;warning:StudyBudgetWarning}|null>(null);
  const [studyError, setStudyError] = useState<string | null>(null);
  const [methodId, setMethodId] = useState<string | null>(null);
  const [week, setWeek] = useState(() =>
    Math.max(0, weekOfIndex(dayIndex(calendarKey(), PLAN_ORIGIN))),
  );
  const [dayKey, setDayKey] = useState(() => calendarKey());
  const [filterFrom, setFilterFrom] = useState(() => data.taskPlan ? String(Math.max(1,weekOfIndex(dayIndex(calendarKey(),PLAN_ORIGIN))+1)) : '1');
  const [filterTo, setFilterTo] = useState("");

  const [taskDraft, setTaskDraft] = useState<TaskDraft | null>(null);
  const [subjectDraft, setSubjectDraft] = useState<SubjectDraft | null>(null);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [deleteSubjectId, setDeleteSubjectId] = useState<string | null>(null);
  const [shiftWarning, setShiftWarning] = useState<Task[] | null>(null);
  const [carryoverDate, setCarryoverDate] = useState<string | null>(null);
  const [carryoverDismissed, setCarryoverDismissed] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(true);
  const timerApi = useTaskTimer(workspace.profile?.id ?? null);
  const [passA, setPassA] = useState("");
  const [passB, setPassB] = useState("");
  const [passMsg, setPassMsg] = useState("");

  const today = todayKey(span);
  const eventName = data.eventName?.trim() || "考研";
  const daysLeft = daysUntilExam(calendarKey(), data.examDate);
  const dayData = studyDayData(data,dayKey);
  const overviewData = useMemo(()=>studyOverviewData(data),[data]);
  const dayOverlaps = data.taskPlan ? studyDayOverlaps(data,dayKey) : [];
  const activeId = timerApi.timer?.running ? timerApi.timer.taskId : undefined;
  const studyAction = (action:(current:PlannerData)=>PlannerData) => {
    try { action(data);commit(current=>{try{return action(current);}catch(error){queueMicrotask(()=>{if(error instanceof StudyBudgetWarning)setBudgetRequest({action,warning:error});else setStudyError(error instanceof Error?error.message:String(error));});return current;}});setStudyError(null); }
    catch(error){if(error instanceof StudyBudgetWarning){setBudgetRequest({action,warning:error});setStudyError(null);}else setStudyError(error instanceof Error?error.message:String(error));}
  };
  useEffect(()=>{
    if(!hydrated || !data.taskPlan)return;
    if(upgradeStudyCatalogue(data)!==data){update(current=>upgradeStudyCatalogue(current));return;}
    if(rolloverStudy(data,calendarKey(),activeId)===data)return;
    update(current=>rolloverStudy(current,calendarKey(),activeId));
  },[data, today, activeId, update, hydrated]);

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
    const running = timerApi.timer;
    if (!hydrated || !running?.running) return;
    const flush = () => {
      const live = timerApi.snapshot();
      if (!live) return;
      writeActualHours(live.dateKey, live.taskId, snapActualHours(live.elapsedMs / 3600000));
    };
    const id = window.setInterval(flush, 15_000);
    const onHide = () => {
      if (document.hidden) flush();
    };
    document.addEventListener("visibilitychange", onHide);
    const onPageHide=()=>{const paused=timerApi.pause();if(paused)writeActualHours(paused.dateKey,paused.taskId,snapActualHours(paused.elapsedMs/3600000));};
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [timerApi.timer?.running, timerApi.timer?.taskId, timerApi.timer?.dateKey, hydrated]);

  useEffect(() => {
    if (data.taskPlan) return;
    if (carryoverDismissed) return;
    const yesterday = addDays(today, -1);
    if (dayIndex(yesterday, span.origin) < 0) return;
    const pending = Object.entries(dayPlanOf(data, yesterday)).filter(
      ([, entry]) => entry.status === "pending",
    );
    if (pending.length > 0) setCarryoverDate(yesterday);
  }, [data, today, carryoverDismissed, span.origin]);

  const patchTask = (taskId: string, patch: Partial<Task>, undoable = true) => {
    if(data.taskPlan?.parentBudgets[taskId]!=null){
      const children=data.taskPlan.children.filter(c=>c.parentId===taskId);
      const earliest=children.map(c=>c.notBefore).filter((d):d is string=>!!d).sort().at(-1);
      const latest=children.map(c=>c.notAfter).filter((d):d is string=>!!d).sort()[0];
      if((patch.startDate&&earliest&&patch.startDate<earliest)||(patch.endDate&&latest&&patch.endDate>latest)|| (patch.startDate&&patch.startDate<'2026-10-20') || (patch.endDate&&patch.endDate>=data.examDate)){
        setStudyError('此任务窗口超出了可排程日期或阶段日期限制。');return;
      }
      (undoable?commit:update)(current=>{const before=current.tasks.find(t=>t.id===taskId)!;if(Object.keys(patch).every(key=>before[key as keyof Task]===patch[key as keyof Task]))return current;const next={...current,tasks:current.tasks.map(t=>t.id===taskId?{...t,...patch}:t)};const task=next.tasks.find(t=>t.id===taskId)!;const start=task.startDate>calendarKey()?task.startDate:calendarKey();const days=Math.max(0,dayIndex(task.endDate,start)+1);return {...next,tasks:next.tasks.map(t=>t.id===taskId?{...t,dailyHours:days?parentStudyTotals(next,taskId).remaining/days:0}:t)};});return;
    }
    const apply = (current: PlannerData): PlannerData => {
      const tasks = current.tasks.map((task) =>
        task.id === taskId ? { ...task, ...patch } : task,
      );
      const updated = tasks.find((task) => task.id === taskId);
      if (!updated) return current;
      const rangeChanged =
        patch.startDate != null || patch.endDate != null || patch.weekdays != null;
      const pruned = rangeChanged
        ? pruneUncoveredTaskDays({ ...current, tasks }, updated)
        : { dayPlans: current.dayPlans, dayHours: current.dayHours, weekTexts: current.weekTexts };
      return {
        ...current,
        tasks,
        ...pruned,
        dayPlans:
          patch.dailyHours != null
            ? applyDailyHoursToDayPlans(pruned.dayPlans, updated, pruned.dayHours)
            : pruned.dayPlans,
      };
    };
    (undoable ? commit : update)(apply);
  };

  const writeActualHours = (dateKey: string, taskId: string, hours: number) => {
    update((current) => {
      if(current.taskPlan?.sessions.some(s=>s.id===taskId))return patchStudy(current,taskId,{actualHours:snapActualHours(hours)});
      if(current.dayMiscs[dateKey]?.some(m=>m.id===taskId))return {...current,dayMiscs:{...current.dayMiscs,[dateKey]:current.dayMiscs[dateKey].map(m=>m.id===taskId?{...m,actualHours:snapActualHours(hours)}:m)}};
      const plan = dayPlanOf(current, dateKey);
      const entry = plan[taskId];
      if (!entry) return current;
      const actualHours = snapActualHours(hours);
      if ((entry.actualHours ?? 0) === actualHours) return current;
      return {
        ...current,
        dayPlans: {
          ...current.dayPlans,
          [dateKey]: { ...plan, [taskId]: { ...entry, actualHours } },
        },
      };
    });
  };

  const patchEntry = (dateKey: string, taskId: string, patch: Partial<DayEntry>) => {
    if(data.taskPlan?.sessions.some(s=>s.id===taskId)){
      try{const next=patchStudy(data,taskId,patch);update(()=>next);setStudyError(null);if(patch.actualHours!=null)timerApi.syncHours(taskId,dateKey,patch.actualHours);}
      catch(error){if(error instanceof StudyBudgetWarning)setBudgetRequest({action:current=>patchStudy(current,taskId,patch),warning:error});else setStudyError(error instanceof Error?error.message:String(error));}return;
    }
    update((current) => {
      const plan = dayPlanOf(current, dateKey);
      const entry = plan[taskId];
      if (!entry) return current;
      const next = { ...entry, ...patch };
      if (patch.actualHours != null) next.actualHours = snapActualHours(patch.actualHours);
      if (patch.doneDelta != null) {
        const delta = Number(patch.doneDelta);
        if (!Number.isFinite(delta) || delta <= 0) delete next.doneDelta;
        else next.doneDelta = delta;
      }
      const prevDelta = entry.doneDelta ?? 0;
      const nextDelta = next.doneDelta ?? 0;
      const tasks =
        patch.doneDelta != null
          ? current.tasks.map((task) =>
              task.id === taskId ? applyDoneDeltaToBreakdown(task, nextDelta, prevDelta) : task,
            )
          : current.tasks;
      const task = current.tasks.find((item) => item.id === taskId);
      const durationChanged = patch.start != null || patch.end != null;
      return {
        ...current,
        tasks,
        dayPlans: {
          ...current.dayPlans,
          [dateKey]: { ...plan, [taskId]: next },
        },
        dayHours:
          durationChanged && task
            ? writeDayHours(current.dayHours, task, dateKey, Math.max(0, next.end - next.start))
            : current.dayHours,
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
      if (!task || !coversDay(task, dateKey)) return current;
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
      const weekdays = normalizeWeekdays(draft.weekdays);
      const fields = {
        subjectId: draft.subjectId,
        name: draft.name.trim(),
        dailyHours: Number(draft.dailyHours) || 0,
        startDate: draft.startDate,
        endDate: draft.endDate,
        colorId: draft.colorId,
      };
      const stampWeekdays = (task: Task): Task => {
        const next: Task = { ...task, ...fields };
        if (weekdays) next.weekdays = weekdays;
        else delete next.weekdays;
        const unit = draft.unit.trim();
        if (unit) next.unit = unit;
        else delete next.unit;
        const target = Number(draft.targetAmount);
        if (Number.isFinite(target) && target > 0) next.targetAmount = target;
        else delete next.targetAmount;
        const done = Number(draft.doneAmount);
        if (Number.isFinite(done) && done > 0) next.doneAmount = done;
        else delete next.doneAmount;
        if (draft.breakdown.length > 0) next.breakdown = draft.breakdown.filter((item) => item.name.trim());
        else delete next.breakdown;
        if (draft.skipBreakdown) next.skipBreakdown = true;
        else delete next.skipBreakdown;
        return next;
      };
      if (draft.id) {
        const tasks = current.tasks.map((task) => (task.id === draft.id ? stampWeekdays(task) : task));
        const updated = tasks.find((task) => task.id === draft.id);
        if (!updated) return current;
        const pruned = pruneUncoveredTaskDays({ ...current, tasks }, updated);
        return {
          ...current,
          tasks,
          ...pruned,
          dayPlans: applyDailyHoursToDayPlans(pruned.dayPlans, updated, pruned.dayHours),
        };
      }
      return {
        ...current,
        tasks: [
          ...current.tasks,
          stampWeekdays({
            id: `task-${Date.now()}`,
            method: "",
            order: nextTaskOrder(current.tasks, draft.subjectId),
            subjectId: fields.subjectId,
            name: fields.name,
            dailyHours: fields.dailyHours,
            startDate: fields.startDate,
            endDate: fields.endDate,
            colorId: fields.colorId,
          }),
        ],
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
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      ...emptyVolume(),
    });
  };

  const openEditTask = (task: Task) => {
    if(data.taskPlan?.parentBudgets[task.id]!=null){setBudgetEditor(task.id);return;}

    setTaskDraft({
      id: task.id,
      subjectId: task.subjectId,
      name: task.name,
      dailyHours: String(task.dailyHours),
      startDate: task.startDate,
      endDate: task.endDate,
      colorId: task.colorId,
      weekdays: task.weekdays ?? [0, 1, 2, 3, 4, 5, 6],
      unit: task.unit ?? suggestedUnitForName(task.name),
      targetAmount: task.targetAmount != null ? String(task.targetAmount) : "",
      doneAmount: task.doneAmount != null ? String(task.doneAmount) : "",
      breakdown: task.breakdown ? task.breakdown.map((item) => ({ ...item })) : [],
      skipBreakdown: Boolean(task.skipBreakdown),
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
    if(data.taskPlan?.sessions.some(s=>s.id===taskId)){
      studyAction(current=>moveStudy(current,taskId,addDays(fromKey,1)));return;
    }
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
      {studyError ? <Callout tone="warning">{studyError}<Button small onClick={()=>setStudyError(null)}>关闭</Button></Callout> : null}
      {!data.taskPlan ? <div className="card study-progress"><strong>按任务预算安排剩余备考</strong><p className="small muted">采用六科 500h、新英语任务和政治五阶段。保留本周已有安排、未来已保存安排及所有历史记录；旧记录不擅自归入新任务。政治阶段一的读练预算需要你明确分配。</p><Button disabled={!hydrated || Boolean(activeId)} onClick={()=>{studyAction(current=>createStudyPlan(current));setFilterFrom(String(Math.max(1,weekOfIndex(dayIndex(calendarKey(),PLAN_ORIGIN))+1)));}}>启用任务预算与周历安排</Button></div> : view === "overview" ? <StudyProgress data={data} onEditBudget={setSubjectBudget}/> : null}

      {view === "overview" ? (
        <div>
        <OverviewView
          data={overviewData}
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
          onReorderSubject={(dragId, hoverId) =>
            update((current) => ({
              ...current,
              subjects: reorderSubjects(current.subjects, dragId, hoverId),
            }))
          }
          onImport={(subjects) => commit((current) => applyImport(current, subjects))}
        />
        {data.taskPlan?<ActualStudyGantt data={data} onDay={date=>{setDayKey(date);setView('day');}}/>:null}
        </div>
      ) : null}

      {view === 'week' && data.taskPlan ? <OriginalWeekBoard data={data} span={span} week={week} parentId={selectedId} activeId={activeId}
        onParent={setSelectedId} onWeek={delta=>setWeek(w=>Math.max(0,Math.min(totalWeeks-1,w+delta)))}
        onDay={(date,taskId)=>{setDayKey(date);if(taskId)setSelectedId(taskId);setView('day');}}
        onMutate={studyAction} onEditTask={openEditTask} onManageSubject={openSubject}
      /> : null}
      {view === "week" && !data.taskPlan ? (
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
          onReorderSubject={(dragId, hoverId) =>
            update((current) => ({
              ...current,
              subjects: reorderSubjects(current.subjects, dragId, hoverId),
            }))
          }
        />
      ) : null}

      {view === "day" ? (
        <>
        {data.taskPlan?<div className="card study-day-controls"><div className="row"><Button onClick={()=>{setWeek(Math.max(0,Math.min(totalWeeks-1,weekOfIndex(dayIndex(dayKey,span.origin)))));setView('week');}}>添加到这一天</Button><span className="small muted">当天实学和完成数量会回写任务进度；排入日历不算完成</span></div><div className="row" style={{marginTop:8}}>{data.taskPlan.sessions.filter(s=>s.date===dayKey&&!s.withdrawn).map(s=><div key={s.id} className="row"><span className="small"><button className="study-open" onClick={()=>{const child=data.taskPlan!.children.find(c=>c.id===s.childId)!;setSelectedId(child.parentId);setView('overview');}}>{data.tasks.find(t=>t.id===data.taskPlan!.children.find(c=>c.id===s.childId)?.parentId)?.name} › {data.taskPlan!.children.find(c=>c.id===s.childId)?.name}</button><br/>本次实学 {(s.entry.actualHours??0).toFixed(2)}h · 子任务累计 {studyTotals(data.taskPlan!,s.childId).actual.toFixed(2)}h · 剩余 {studyTotals(data.taskPlan!,s.childId).remaining.toFixed(2)}h</span><Button small disabled={activeId===s.id} onClick={()=>studyAction(current=>({...current,taskPlan:{...current.taskPlan!,sessions:current.taskPlan!.sessions.map(x=>x.id===s.id?{...x,locked:!x.locked}:x)}}))}>{s.locked?'解锁':'锁定'}</Button><Button small disabled={s.locked||activeId===s.id} onClick={()=>studyAction(current=>withdrawStudy(current,s.id))}>撤回未执行部分</Button></div>)}</div></div>:null}
        {dayOverlaps.length?<Callout tone="warning">当天有 {dayOverlaps.length} 处时段重叠（{dayOverlaps.slice(0,2).join('；')}）。<Button small onClick={()=>studyAction(current=>regenerateStudyDay(current,dayKey,activeId))}>从 09:00 整理未锁定安排</Button></Callout>:null}
        <DayView
          data={dayData}
          dateKey={dayKey}
          selectedId={selectedId}
          timer={timerApi.timer}
          now={timerApi.now}
          onToggleTimer={(taskId) => {
            const session=data.taskPlan?.sessions.find(s=>s.id===taskId);
            if(session&&(session.withdrawn||data.taskPlan!.children.find(c=>c.id===session.childId)?.archived)){setStudyError('此项已保留为记录，请从待安排重新放入一天后再计时。');return;}
            const existing = dayData.dayPlans[dayKey]?.[taskId]?.actualHours ?? data.dayMiscs[dayKey]?.find(m=>m.id===taskId)?.actualHours ?? 0;
            const paused = timerApi.toggle(taskId, dayKey, existing);
            if (paused) {
              writeActualHours(
                paused.dateKey,
                paused.taskId,
                snapActualHours(paused.elapsedMs / 3600000),
              );
            }
          }}
          onSyncTimerHours={(taskId, hours) => timerApi.syncHours(taskId, dayKey, hours)}
          timerHoursOf={(taskId, fallback) => timerApi.hoursOf(taskId, dayKey, fallback)}
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
          onAddMisc={(name, start, end, gray) =>
            update((current) => {
              const used = colorsOnDay(current, dayKey);
              const colorId = gray ? GRAY_ID : pickUnusedColor(used);
              return {
                ...current,
                dayMiscs: {
                  ...current.dayMiscs,
                  [dayKey]: [
                    ...(current.dayMiscs[dayKey] ?? []),
                    { id: `misc-${Date.now()}`, name, start, end, status: "pending", note: "", colorId },
                  ],
                },
              };
            })
          }
          onAddDayItems={(items) =>
            update((current) => {
              const used = colorsOnDay(current, dayKey);
              const colored = items.map((item) => {
                const colorId = item.gray ? GRAY_ID : pickUnusedColor(used);
                if (colorId !== GRAY_ID) used.add(colorId);
                return { ...item, colorId };
              });
              return {
                ...current,
                dayMiscs: {
                  ...current.dayMiscs,
                  [dayKey]: appendDayMiscs(current.dayMiscs[dayKey] ?? [], colored),
                },
              };
            })
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
            if(data.taskPlan){try{const next=regenerateStudyDay(data,dayKey,activeId);commit(()=>next);return null;}catch(error){return error instanceof Error?error.message:String(error);}}
            const error = dayPlanCapacityError(data, dayKey);
            if (error) return error;
            commit((current) => {
              const generated = generateDayPlan(current, dayKey);
              const stored = current.dayPlans[dayKey] ?? {};
              const merged = { ...generated };
              for (const [taskId, entry] of Object.entries(generated)) {
                const prev = stored[taskId];
                if (!prev) continue;
                merged[taskId] = {
                  ...entry,
                  note: prev.note || entry.note,
                  status: prev.status,
                  actualHours: prev.actualHours,
                  doneDelta: prev.doneDelta,
                };
              }
              return {
                ...current,
                dayPlans: { ...current.dayPlans, [dayKey]: merged },
              };
            });
            return null;
          }}
          onDragStart={() => commit((current) => current)}
        />
        </>
      ) : null}



      {!data.taskPlan ? <AiPanel data={data} onApply={action=>commit(current=>applySuggestion(current,action))}/> : null}
      {budgetRequest?<StudyBudgetDialog data={data} warning={budgetRequest.warning} onClose={()=>setBudgetRequest(null)} onChoose={choice=>{const request=budgetRequest;try{applyStudyBudgetChoice(data,request.action,choice,request.warning.extraHours);studyAction(current=>applyStudyBudgetChoice(current,request.action,choice,request.warning.extraHours));setBudgetRequest(null);}catch(error){if(error instanceof StudyBudgetWarning)setBudgetRequest({...request,warning:error});else setStudyError(error instanceof Error?error.message:String(error));}}}/>:null}
      {subjectBudget&&data.taskPlan?<SubjectBudgetEditor data={data} subjectId={subjectBudget} onClose={()=>setSubjectBudget(null)} onSave={apply=>{apply(data);commit(apply);setSubjectBudget(null);}}/>:null}
      {budgetEditor&&data.taskPlan?<StudyTaskEditor data={data} parentId={budgetEditor} activeId={activeId} onCorrectRecord={(id,hours)=>{const session=data.taskPlan!.sessions.find(s=>s.id===id);if(!session)return;patchStudy(data,id,{actualHours:hours});timerApi.syncHours(id,session.date,hours);update(current=>patchStudy(current,id,{actualHours:hours}));}} onClose={()=>setBudgetEditor(null)} onSave={apply=>{commit(apply);setBudgetEditor(null);}}/>:null}

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
          data={data}
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
          onEditBudget={data.taskPlan?id=>{setSubjectDraft(null);setSubjectBudget(id);}:undefined}
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

      {breakdownOpen && !carryoverDate && tasksNeedingBreakdown(data, calendarKey()).length > 0 ? (
        <Modal
          title="这些任务该拆章节了"
          onClose={() => setBreakdownOpen(false)}
          width={520}
        >
          <div className="stack" style={{ gap: 12 }}>
            <span className="muted small">
              距离开始不到一周，或已经开始，但还只有大概数量。拆成章/篇/题之后，总览才能判断赶不赶得上。暂时拆不了就明天再说。
            </span>
            <div className="stack" style={{ gap: 6 }}>
              {tasksNeedingBreakdown(data, calendarKey()).map((task) => (
                <div
                  key={task.id}
                  className="row"
                  style={{
                    justifyContent: "space-between",
                    border: "1px solid var(--stroke)",
                    borderRadius: 8,
                    padding: "7px 10px",
                    gap: 8,
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {subjectOf(data, task.subjectId)?.name} · {task.name}
                    <span className="small muted">
                      {" "}
                      · {task.startDate} 开始 · 大概 {task.targetAmount}
                      {task.unit ?? suggestedUnitForName(task.name)}
                    </span>
                  </span>
                  <div className="row" style={{ gap: 6 }}>
                    <Button
                      small
                      onClick={() => {
                        openEditTask(task);
                        setBreakdownOpen(false);
                      }}
                    >
                      去拆解
                    </Button>
                    <Button
                      small
                      onClick={() =>
                        update((current) => ({
                          ...current,
                          tasks: current.tasks.map((item) =>
                            item.id === task.id ? { ...item, skipBreakdown: true } : item,
                          ),
                        }))
                      }
                    >
                      不用拆
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <Button
                onClick={() => {
                  const todayKeyValue = calendarKey();
                  update((current) => {
                    const snooze = { ...(current.breakdownSnooze ?? {}) };
                    for (const task of tasksNeedingBreakdown(current, todayKeyValue)) {
                      snooze[task.id] = todayKeyValue;
                    }
                    return { ...current, breakdownSnooze: snooze };
                  });
                  setBreakdownOpen(false);
                }}
              >
                明天再说
              </Button>
              <Button variant="primary" onClick={() => setBreakdownOpen(false)}>
                知道了
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
