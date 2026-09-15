import { DEFAULT_PLANNED_HOURS } from "./data";
import { HOUR_END, HOUR_START, addDays, dayIndex, diffDays } from "./dateUtils";
import type { DayEntry, DayPlan, PlannerData, Subject, Task } from "./types";

/** 任务是否覆盖某一天 */
export function coversDay(task: Task, dateKey: string): boolean {
  return task.startDate <= dateKey && dateKey <= task.endDate;
}

/** 任务是否与某个日期区间有交集（两端含） */
export function overlapsRange(task: Task, fromKey: string, toKey: string): boolean {
  return task.startDate <= toKey && task.endDate >= fromKey;
}

export function subjectOf(data: PlannerData, subjectId: string): Subject | undefined {
  return data.subjects.find((subject) => subject.id === subjectId);
}

/** 某天所有生效的任务，按「英语最早、政治最晚」排序 */
export function tasksOfDay(data: PlannerData, dateKey: string): Task[] {
  const orderOf = (task: Task) => subjectOf(data, task.subjectId)?.order ?? 50;
  return data.tasks
    .filter((task) => coversDay(task, dateKey))
    .sort((left, right) => {
      const delta = orderOf(left) - orderOf(right);
      if (delta !== 0) return delta;
      return data.tasks.indexOf(left) - data.tasks.indexOf(right);
    });
}

const LUNCH: [number, number] = [12, 13];
const DINNER: [number, number] = [18, 19];

/** 把光标推过饭点，避免任务跨越 12-13 和 18-19 */
function skipMeals(cursor: number, duration: number): number {
  let value = cursor;
  for (const [from, to] of [LUNCH, DINNER]) {
    if (value >= from && value < to) value = to;
    else if (value < from && value + duration > from) value = to;
  }
  return value;
}

/**
 * 按任务顺序自动铺排一天的时间轴。
 * 政治不早于 19:00，其余从 7:00 起依次往后。
 */
export function generateDayPlan(data: PlannerData, dateKey: string): DayPlan {
  const plan: DayPlan = {};
  let cursor = HOUR_START;
  for (const task of tasksOfDay(data, dateKey)) {
    const duration = Math.max(0.5, task.dailyHours);
    const subject = subjectOf(data, task.subjectId);
    if (subject && subject.order >= 9 && cursor < 19) cursor = 19;
    cursor = skipMeals(cursor, duration);
    if (cursor >= HOUR_END) break;
    const end = Math.min(HOUR_END, cursor + duration);
    plan[task.id] = { start: cursor, end, note: "", status: "pending" };
    cursor = end;
  }
  return plan;
}

/** 读取某天安排，没存过就现场生成（不写入存储） */
export function dayPlanOf(data: PlannerData, dateKey: string): DayPlan {
  const stored = data.dayPlans[dateKey];
  const generated = generateDayPlan(data, dateKey);
  if (!stored) return generated;
  // 已存过的保留用户改动，新增的任务用生成值补上
  const merged: DayPlan = { ...generated };
  for (const [taskId, entry] of Object.entries(stored)) {
    if (generated[taskId] || coversDay(findTask(data, taskId) ?? emptyTask, dateKey)) {
      merged[taskId] = entry;
    }
  }
  return merged;
}

const emptyTask: Task = {
  id: "",
  subjectId: "",
  name: "",
  dailyHours: 0,
  startDate: "9999-12-31",
  endDate: "0000-01-01",
  method: "",
  colorId: "blue",
};

export function findTask(data: PlannerData, taskId: string): Task | undefined {
  return data.tasks.find((task) => task.id === taskId);
}

export function entryHours(entry: DayEntry): number {
  return Math.max(0, entry.end - entry.start);
}

/** 某天已排总时长 */
export function arrangedHoursOf(data: PlannerData, dateKey: string): number {
  return Object.values(dayPlanOf(data, dateKey)).reduce(
    (sum, entry) => sum + entryHours(entry),
    0,
  );
}

export function plannedHoursOf(data: PlannerData, dateKey: string): number {
  return data.plannedHours[dateKey] ?? DEFAULT_PLANNED_HOURS;
}

/** 某周每天的日均负荷（按任务 dailyHours 累加，用于总览柱状图） */
export function weekLoad(data: PlannerData, week: number): Map<string, number> {
  const result = new Map<string, number>();
  const from = addDays("2026-09-12", week * 7);
  const to = addDays(from, 6);
  for (const subject of data.subjects) {
    const hours = data.tasks
      .filter((task) => task.subjectId === subject.id && overlapsRange(task, from, to))
      .reduce((sum, task) => sum + task.dailyHours, 0);
    if (hours > 0) result.set(subject.id, hours);
  }
  return result;
}

export function weekTotal(data: PlannerData, week: number): number {
  let total = 0;
  for (const hours of weekLoad(data, week).values()) total += hours;
  return total;
}

/** 把任务整体后移若干天，不越过周期末尾 */
export function shiftTask(task: Task, days: number, maxEndKey: string): Task {
  const room = diffDays(task.endDate, maxEndKey);
  const actual = Math.max(0, Math.min(days, room));
  if (actual === 0) return task;
  return {
    ...task,
    startDate: addDays(task.startDate, actual),
    endDate: addDays(task.endDate, actual),
  };
}

/** 后移整体计划时，检查是否有任务会被挤出周期 */
export function overflowAfterShift(
  tasks: Task[],
  days: number,
  maxEndKey: string,
): Task[] {
  return tasks.filter((task) => diffDays(task.endDate, maxEndKey) < days);
}

export function clampToPeriod(key: string, totalDays: number): string {
  const index = dayIndex(key);
  if (index < 0) return addDays(key, -index);
  if (index > totalDays - 1) return addDays(key, totalDays - 1 - index);
  return key;
}
