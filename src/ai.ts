import {
  calendarKey,
  daysUntilExam,
  examLabel,
  makeSpan,
  snapHour,
  spanWeeks,
  weekEndKey,
  weekStartKey,
} from "./dateUtils";
import { applyDailyHoursToDayPlans, dayPlanOf, findTask, pruneUncoveredTaskDays, weekTotal } from "./schedule";
import type { PlannerData } from "./types";

export type SuggestionAction =
  | { type: "setDailyHours"; taskId: string; dailyHours: number }
  | { type: "setTaskDates"; taskId: string; startDate?: string; endDate?: string }
  | { type: "setCapacity"; capacity: number }
  | { type: "setMethod"; taskId: string; method: string };

export type PlanSuggestion = {
  title: string;
  reason: string;
  action: SuggestionAction;
};

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type PlanSnapshot = {
  today: string;
  examDate: string;
  daysLeft: number;
  capacity: number;
  calendar: string;
  weeks: Array<{
    week: number;
    from: string;
    to: string;
    hours: number;
    overload: boolean;
  }>;
  subjects: Array<{ id: string; name: string }>;
  tasks: Array<{
    id: string;
    subject: string;
    name: string;
    dailyHours: number;
    startDate: string;
    endDate: string;
    method: string;
    weekdays?: number[];
  }>;
  todayTasks: Array<{
    taskId: string;
    name: string;
    start: number;
    end: number;
    status: string;
  }>;
};

export function buildPlanSnapshot(data: PlannerData): PlanSnapshot {
  const span = makeSpan(data.examDate);
  const today = calendarKey();
  const totalWeeks = spanWeeks(span);
  const weeks = Array.from({ length: totalWeeks }, (_, week) => {
    const from = weekStartKey(week, span.origin);
    const hours = Math.round(weekTotal(data, week, span) * 10) / 10;
    return {
      week: week + 1,
      from,
      to: weekEndKey(week, span),
      hours,
      overload: hours > data.capacity + 0.05,
    };
  });
  const todayPlan = dayPlanOf(data, today);
  return {
    today,
    examDate: data.examDate,
    daysLeft: daysUntilExam(today, data.examDate),
    capacity: data.capacity,
    calendar: `周六至周五为一周，起点 ${span.origin}，排到 ${span.examDate}，事项日 ${data.examDate}（${examLabel(data.examDate)}）`,
    weeks,
    subjects: data.subjects.map((subject) => ({ id: subject.id, name: subject.name })),
    tasks: data.tasks.map((task) => ({
      id: task.id,
      subject: data.subjects.find((subject) => subject.id === task.subjectId)?.name ?? task.subjectId,
      name: task.name,
      dailyHours: task.dailyHours,
      startDate: task.startDate,
      endDate: task.endDate,
      method: task.method,
      weekdays: task.weekdays,
    })),
    todayTasks: Object.entries(todayPlan).map(([taskId, entry]) => ({
      taskId,
      name: findTask(data, taskId)?.name ?? taskId,
      start: entry.start,
      end: entry.end,
      status: entry.status,
    })),
  };
}

function clampDate(key: string | undefined, fallback: string, origin: string, lastDay: string): string {
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return fallback;
  if (key < origin) return origin;
  if (key > lastDay) return lastDay;
  return key;
}

export function applySuggestion(data: PlannerData, action: SuggestionAction): PlannerData {
  const span = makeSpan(data.examDate);
  if (action.type === "setCapacity") {
    const capacity = Math.min(18, Math.max(4, snapHour(action.capacity)));
    return { ...data, capacity };
  }
  if (action.type === "setDailyHours") {
    const task = findTask(data, action.taskId);
    if (!task) return data;
    const dailyHours = Math.min(8, Math.max(0.5, snapHour(action.dailyHours)));
    const updated = { ...task, dailyHours };
    return {
      ...data,
      tasks: data.tasks.map((item) => (item.id === task.id ? updated : item)),
      dayPlans: applyDailyHoursToDayPlans(data.dayPlans, updated),
    };
  }
  if (action.type === "setMethod") {
    const task = findTask(data, action.taskId);
    if (!task) return data;
    const method = action.method.trim().slice(0, 400);
    return {
      ...data,
      tasks: data.tasks.map((item) =>
        item.id === task.id ? { ...item, method } : item,
      ),
    };
  }
  const task = findTask(data, action.taskId);
  if (!task) return data;
  let startDate = clampDate(action.startDate, task.startDate, span.origin, span.examDate);
  let endDate = clampDate(action.endDate, task.endDate, span.origin, span.examDate);
  if (endDate < startDate) {
    const swap = startDate;
    startDate = endDate;
    endDate = swap;
  }
  const updated = { ...task, startDate, endDate };
  const next = {
    ...data,
    tasks: data.tasks.map((item) => (item.id === task.id ? updated : item)),
  };
  return { ...next, ...pruneUncoveredTaskDays(next, updated) };
}
