import {
  HOUR_END,
  HOUR_START,
  addDays,
  dayIndex,
  diffDays,
  snapHour,
  type Span,
  weekCellKey,
  weekEndKey,
  weekStartKey,
} from "./dateUtils";
import type { DayEntry, DayMisc, DayPlan, PlannerData, Subject, Task } from "./types";

/** 任务是否覆盖某一天 */
export function coversDay(task: Task, dateKey: string): boolean {
  return task.startDate <= dateKey && dateKey <= task.endDate;
}

/** 某一天这条任务的用时：当前周精细化覆盖，否则用总览日均 */
export function hoursOnDay(data: PlannerData, task: Task, dateKey: string): number {
  const override = data.dayHours?.[weekCellKey(task.id, dateKey)];
  if (typeof override === "number" && !Number.isNaN(override)) return Math.max(0, override);
  return Math.max(0, task.dailyHours);
}

export function weekCoveredDays(task: Task, days: string[]): string[] {
  return days.filter((dateKey) => coversDay(task, dateKey));
}

/** 当前周日均：本周该任务总用时 / 有任务的天数 */
export function weekTaskAverage(data: PlannerData, task: Task, days: string[]): number {
  const covered = weekCoveredDays(task, days);
  if (covered.length === 0) return 0;
  const total = covered.reduce((sum, dateKey) => sum + hoursOnDay(data, task, dateKey), 0);
  return Math.round((total / covered.length) * 10) / 10;
}

export function writeDayHours(
  map: Record<string, number> | undefined,
  task: Task,
  dateKey: string,
  hours: number,
): Record<string, number> {
  const next = { ...(map ?? {}) };
  const key = weekCellKey(task.id, dateKey);
  const value = Math.max(0, snapHour(hours));
  if (value === snapHour(Math.max(0, task.dailyHours))) delete next[key];
  else next[key] = value;
  return next;
}

/** 任务是否与某个日期区间有交集（两端含） */
export function overlapsRange(task: Task, fromKey: string, toKey: string): boolean {
  return task.startDate <= toKey && task.endDate >= fromKey;
}

export function subjectsOnScreen(
  subjects: Subject[],
  allTasks: Task[],
  visibleTasks: Task[],
): Subject[] {
  return subjects.filter((subject) => {
    const mine = allTasks.filter((task) => task.subjectId === subject.id);
    if (mine.length === 0) return true;
    return visibleTasks.some((task) => task.subjectId === subject.id);
  });
}

export function subjectOf(data: PlannerData, subjectId: string): Subject | undefined {
  return data.subjects.find((subject) => subject.id === subjectId);
}

/** 某天所有生效的任务：先按上午/下午/晚上偏好，再按科目顺序 */
export function tasksOfDay(data: PlannerData, dateKey: string): Task[] {
  const orderOf = (task: Task) => subjectOf(data, task.subjectId)?.order ?? 50;
  const slotOf = (task: Task) => timeSlot(task, subjectOf(data, task.subjectId));
  return data.tasks
    .filter((task) => coversDay(task, dateKey))
    .sort((left, right) => {
      const slotDelta = slotOf(left) - slotOf(right);
      if (slotDelta !== 0) return slotDelta;
      const delta = orderOf(left) - orderOf(right);
      if (delta !== 0) return delta;
      const taskDelta = (left.order ?? 0) - (right.order ?? 0);
      if (taskDelta !== 0) return taskDelta;
      return data.tasks.indexOf(left) - data.tasks.indexOf(right);
    });
}

function timeSlot(task: Task, subject: Subject | undefined): number {
  const blob = `${task.method} ${task.name} ${subject?.name ?? ""}`;
  if ((subject && subject.order >= 9) || /晚上|夜里|夜间/.test(blob)) return 2;
  if (/下午/.test(blob)) return 1;
  return 0;
}

function preferredStart(task: Task, subject: Subject | undefined): number {
  const slot = timeSlot(task, subject);
  if (slot === 2) return 19;
  if (slot === 1) return 13;
  return HOUR_START;
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
 * 学法/科目里写了上午、下午、晚上的，会尽量排进对应时段；政治默认晚上。
 */
export function generateDayPlan(data: PlannerData, dateKey: string): DayPlan {
  const plan: DayPlan = {};
  let cursor = HOUR_START;
  for (const task of tasksOfDay(data, dateKey)) {
    const duration = snapHour(hoursOnDay(data, task, dateKey));
    if (duration <= 0) continue;
    const subject = subjectOf(data, task.subjectId);
    cursor = Math.max(cursor, preferredStart(task, subject));
    cursor = skipMeals(cursor, duration);
    if (cursor >= HOUR_END) break;
    const end = Math.min(HOUR_END, cursor + duration);
    plan[task.id] = {
      start: cursor,
      end,
      note: data.weekTexts[weekCellKey(task.id, dateKey)] ?? "",
      status: "pending",
    };
    cursor = end;
  }
  return plan;
}

export function dayHoursNeeded(data: PlannerData, dateKey: string): number {
  return tasksOfDay(data, dateKey).reduce(
    (sum, task) => sum + snapHour(hoursOnDay(data, task, dateKey)),
    0,
  );
}

export function dayPlanCapacityError(data: PlannerData, dateKey: string): string | null {
  const planned = plannedHoursOf(data, dateKey);
  const needed = dayHoursNeeded(data, dateKey);
  if (needed > planned + 0.05) {
    return `当天任务共 ${needed.toFixed(1)}h，超过计划 ${planned.toFixed(1)}h。请先在当前周调整各天用时，或提高当天计划时长后再重新铺排。`;
  }
  const wanted = tasksOfDay(data, dateKey).filter((task) => hoursOnDay(data, task, dateKey) > 0).length;
  const placed = Object.keys(generateDayPlan(data, dateKey)).length;
  if (placed < wanted) {
    return "有任务排不进 7:00–24:00，请减少当天用时后再重新铺排。";
  }
  return null;
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
      const text = data.weekTexts[weekCellKey(taskId, dateKey)] ?? "";
      merged[taskId] = {
        ...entry,
        note: entry.note !== "" ? entry.note : text,
      };
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

/** 某天时间轴上实际铺开的时长 */
export function arrangedHoursOf(data: PlannerData, dateKey: string): number {
  return Object.values(dayPlanOf(data, dateKey)).reduce(
    (sum, entry) => sum + entryHours(entry),
    0,
  );
}

/** 周历顶部的「已排」：按覆盖当天的任务日均用时累计，跟总览同一套数 */
export function scheduledHoursOf(data: PlannerData, dateKey: string): number {
  return tasksOfDay(data, dateKey).reduce((sum, task) => sum + hoursOnDay(data, task, dateKey), 0);
}

/**
 * 总览改了日均用时后，把已经存下来的当天色块时长跟着改。
 * 起点不动，只拉长或缩短，避免把用户拖过的位置整段打乱。
 */
export function applyDailyHoursToDayPlans(
  dayPlans: Record<string, DayPlan>,
  task: Task,
): Record<string, DayPlan> {
  const duration = Math.max(0, snapHour(task.dailyHours));
  let changed = false;
  const next: Record<string, DayPlan> = {};
  for (const [dateKey, plan] of Object.entries(dayPlans)) {
    const entry = plan[task.id];
    if (!entry || !coversDay(task, dateKey)) {
      next[dateKey] = plan;
      continue;
    }
    if (duration <= 0) {
      const { [task.id]: _removed, ...rest } = plan;
      next[dateKey] = rest;
      changed = true;
      continue;
    }
    const end = Math.min(HOUR_END, Math.max(entry.start + 0.5, snapHour(entry.start + duration)));
    if (entry.end === end) {
      next[dateKey] = plan;
      continue;
    }
    changed = true;
    next[dateKey] = { ...plan, [task.id]: { ...entry, end } };
  }
  return changed ? next : dayPlans;
}

export function applyHoursToStoredEntry(
  dayPlans: Record<string, DayPlan>,
  taskId: string,
  dateKey: string,
  duration: number,
): Record<string, DayPlan> {
  const plan = dayPlans[dateKey];
  const entry = plan?.[taskId];
  if (!entry) return dayPlans;
  const hours = Math.max(0, snapHour(duration));
  if (hours <= 0) {
    const { [taskId]: _removed, ...rest } = plan;
    return { ...dayPlans, [dateKey]: rest };
  }
  const end = Math.min(HOUR_END, Math.max(entry.start + 0.5, snapHour(entry.start + hours)));
  if (entry.end === end) return dayPlans;
  return { ...dayPlans, [dateKey]: { ...plan, [taskId]: { ...entry, end } } };
}

export function plannedHoursOf(data: PlannerData, dateKey: string): number {
  return data.plannedHours[dateKey] ?? data.capacity;
}

/** 某周每天的日均负荷（按覆盖当天的总览日均累加后再平均） */
export function weekLoad(data: PlannerData, week: number, span: Span): Map<string, number> {
  const result = new Map<string, number>();
  const from = weekStartKey(week, span.origin);
  const to = weekEndKey(week, span);
  const days = Math.max(1, diffDays(from, to) + 1);
  for (const subject of data.subjects) {
    let total = 0;
    for (let index = 0; index < days; index++) {
      const dateKey = addDays(from, index);
      total += data.tasks
        .filter((task) => task.subjectId === subject.id && coversDay(task, dateKey))
        .reduce((sum, task) => sum + task.dailyHours, 0);
    }
    const average = total / days;
    if (average > 0) result.set(subject.id, average);
  }
  return result;
}

export function weekTotal(data: PlannerData, week: number, span: Span): number {
  let total = 0;
  for (const hours of weekLoad(data, week, span).values()) total += hours;
  return total;
}

/** 杂事从时间轴底部往上叠，互不影响总览和周历 */
export function placeMiscAtBottom(existing: DayMisc[], hours: number): { start: number; end: number } {
  const duration = Math.max(0.5, snapHour(hours));
  let end = HOUR_END;
  const sorted = [...existing].sort((left, right) => right.end - left.end);
  for (const item of sorted) {
    if (item.end > end - duration && item.start < end) end = Math.min(end, item.start);
  }
  const start = Math.min(HOUR_END - duration, Math.max(HOUR_START, snapHour(end - duration)));
  return { start, end: start + duration };
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

export function clampToPeriod(key: string, origin: string, totalDays: number): string {
  const index = dayIndex(key, origin);
  if (index < 0) return addDays(key, -index);
  if (index > totalDays - 1) return addDays(key, totalDays - 1 - index);
  return key;
}

export function assignTaskOrder(tasks: Task[]): Task[] {
  const counters = new Map<string, number>();
  return tasks.map((task) => {
    if (typeof task.order === "number") return task;
    const next = counters.get(task.subjectId) ?? 0;
    counters.set(task.subjectId, next + 1);
    return { ...task, order: next };
  });
}

export function sortSubjectTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
}

export function nextTaskOrder(tasks: Task[], subjectId: string): number {
  const values = tasks.filter((task) => task.subjectId === subjectId).map((task) => task.order ?? 0);
  return values.length === 0 ? 0 : Math.max(...values) + 1;
}

export function reorderSubjectTasks(
  tasks: Task[],
  subjectId: string,
  dragId: string,
  hoverId: string,
): Task[] {
  const ids = sortSubjectTasks(tasks.filter((task) => task.subjectId === subjectId)).map(
    (task) => task.id,
  );
  const from = ids.indexOf(dragId);
  const to = ids.indexOf(hoverId);
  if (from < 0 || to < 0 || from === to) return tasks;
  ids.splice(from, 1);
  ids.splice(to, 0, dragId);
  const rank = new Map(ids.map((id, index) => [id, index]));
  return tasks.map((task) =>
    task.subjectId === subjectId && rank.has(task.id)
      ? { ...task, order: rank.get(task.id) }
      : task,
  );
}

export function dropTaskRecords(data: PlannerData, taskIds: string[]): PlannerData {
  const drop = new Set(taskIds);
  const strip = (record: Record<string, unknown>) => {
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      const taskId = key.includes("|") ? key.slice(0, key.indexOf("|")) : "";
      if (drop.has(taskId) || drop.has(key)) continue;
      next[key] = value;
    }
    return next;
  };
  const dayPlans: PlannerData["dayPlans"] = {};
  for (const [dateKey, plan] of Object.entries(data.dayPlans)) {
    const kept: typeof plan = {};
    for (const [taskId, entry] of Object.entries(plan)) {
      if (!drop.has(taskId)) kept[taskId] = entry;
    }
    if (Object.keys(kept).length > 0) dayPlans[dateKey] = kept;
  }
  return {
    ...data,
    dayPlans,
    weekTexts: strip(data.weekTexts) as PlannerData["weekTexts"],
    dayHours: strip(data.dayHours ?? {}) as PlannerData["dayHours"],
  };
}
