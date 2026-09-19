import { addDays, calendarKey } from "./dateUtils";
import { coversDay, dayPlanOf, hoursOnDay, plannedHoursOf, subjectOf } from "./schedule";
import type { BreakdownItem, PlannerData, Task } from "./types";

export type TaskRisk = "ok" | "tight" | "late";

export type TaskProgress = {
  target: number | null;
  done: number;
  remaining: number | null;
  unit: string;
  source: "breakdown" | "rough" | "none";
};

export const SUGGESTED_UNITS: Record<string, string> = {
  vocab: "词",
  sentence: "句",
  "en-course": "课",
  "en-test": "篇",
  "en-essay": "篇",
  "intro-note": "章",
  "intro-recite": "章",
  "topic-note": "章",
  "topic-recite": "章",
  "method-focus": "节",
  "method-recite": "章",
  "stat-course": "课",
  "stat-test": "题",
  "pol-video": "课",
  "pol-test": "题",
  xiao4: "题",
};

export function suggestedUnitForName(name: string): string {
  if (/单词/.test(name)) return "词";
  if (/长难句/.test(name)) return "句";
  if (/刷题|做题/.test(name)) return /英语|阅读/.test(name) ? "篇" : "题";
  if (/肖四/.test(name)) return "题";
  if (/背诵|笔记/.test(name)) return "章";
  if (/课程|视频|看课/.test(name)) return "课";
  if (/作文/.test(name)) return "篇";
  return "项";
}

export function taskUnit(task: Task): string {
  return task.unit?.trim() || SUGGESTED_UNITS[task.id] || suggestedUnitForName(task.name);
}

export function hasBreakdown(task: Task): boolean {
  return (task.breakdown?.length ?? 0) > 0;
}

export function normalizeBreakdown(raw: unknown): BreakdownItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const record = item as { id?: unknown; name?: unknown; done?: unknown };
      const name = String(record.name ?? "").trim();
      if (!name) return null;
      return {
        id: String(record.id ?? `bd-${index}`),
        name,
        done: Boolean(record.done),
      };
    })
    .filter((item): item is BreakdownItem => item != null);
}

export function parseBreakdownText(text: string, now = Date.now()): BreakdownItem[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((name, index) => ({
      id: `bd-${now}-${index}`,
      name,
      done: false,
    }));
}

export function volumeTarget(task: Task): number | null {
  if (hasBreakdown(task)) return task.breakdown!.length;
  if (typeof task.targetAmount === "number" && task.targetAmount > 0) return task.targetAmount;
  return null;
}

function hasDayDeltas(data: PlannerData, taskId: string): boolean {
  return Object.values(data.dayPlans).some((plan) => {
    const delta = plan[taskId]?.doneDelta;
    return typeof delta === "number" && !Number.isNaN(delta) && delta > 0;
  });
}

export function volumeDoneFromDays(data: PlannerData, taskId: string): number {
  let sum = 0;
  for (const plan of Object.values(data.dayPlans)) {
    const delta = plan[taskId]?.doneDelta;
    if (typeof delta === "number" && !Number.isNaN(delta)) sum += Math.max(0, delta);
  }
  return sum;
}

export function volumeDone(data: PlannerData, task: Task): number {
  if (hasBreakdown(task)) return task.breakdown!.filter((item) => item.done).length;
  if (hasDayDeltas(data, task.id)) return volumeDoneFromDays(data, task.id);
  return Math.max(0, task.doneAmount ?? 0);
}

export function taskProgress(data: PlannerData, task: Task): TaskProgress {
  const unit = taskUnit(task);
  const target = volumeTarget(task);
  const done = volumeDone(data, task);
  if (hasBreakdown(task)) {
    return {
      target: task.breakdown!.length,
      done,
      remaining: Math.max(0, task.breakdown!.length - done),
      unit,
      source: "breakdown",
    };
  }
  if (target != null) {
    return {
      target,
      done,
      remaining: Math.max(0, target - done),
      unit,
      source: "rough",
    };
  }
  return { target: null, done, remaining: null, unit, source: "none" };
}

export function remainingCoveredDays(task: Task, today: string): number {
  let count = 0;
  let key = today < task.startDate ? task.startDate : today;
  while (key <= task.endDate) {
    if (coversDay(task, key)) count += 1;
    key = addDays(key, 1);
  }
  return count;
}

export function suggestedPace(data: PlannerData, task: Task, today: string): number | null {
  const progress = taskProgress(data, task);
  if (progress.remaining == null) return null;
  const days = Math.max(1, remainingCoveredDays(task, today));
  return Math.round((progress.remaining / days) * 10) / 10;
}

function recentLoggedDays(data: PlannerData, task: Task, today: string, limit = 7): string[] {
  const keys = Object.keys(data.dayPlans)
    .filter((dateKey) => {
      if (dateKey > today || !coversDay(task, dateKey)) return false;
      const entry = data.dayPlans[dateKey][task.id];
      if (!entry) return false;
      return (
        (typeof entry.doneDelta === "number" && entry.doneDelta > 0) ||
        (typeof entry.actualHours === "number" && entry.actualHours > 0)
      );
    })
    .sort();
  return keys.slice(-limit);
}

export function recentVelocity(data: PlannerData, task: Task, today: string): number | null {
  const days = recentLoggedDays(data, task, today);
  if (days.length < 2 && volumeDone(data, task) <= 0) return null;
  const gained = days.reduce((sum, dateKey) => sum + Math.max(0, data.dayPlans[dateKey][task.id]?.doneDelta ?? 0), 0);
  if (gained <= 0) return null;
  return gained / days.length;
}

function hasProgressEvidence(data: PlannerData, task: Task, today: string): boolean {
  if (volumeDone(data, task) > 0) return true;
  return recentLoggedDays(data, task, today, 14).length > 0;
}

export function taskRisk(data: PlannerData, task: Task, today: string): TaskRisk | null {
  const progress = taskProgress(data, task);
  if (progress.target == null || progress.remaining == null) return null;
  if (!hasProgressEvidence(data, task, today)) return null;
  if (progress.remaining <= 0) return "ok";
  const daysLeft = remainingCoveredDays(task, today);
  const velocity = recentVelocity(data, task, today);
  if (velocity != null && velocity > 0) {
    const daysNeeded = progress.remaining / velocity;
    if (daysNeeded > daysLeft + 0.51) return "late";
    if (daysNeeded > daysLeft * 0.8) return "tight";
    return "ok";
  }
  let elapsed = 0;
  let total = 0;
  let key = task.startDate;
  while (key <= task.endDate) {
    if (coversDay(task, key)) {
      total += 1;
      if (key < today) elapsed += 1;
    }
    key = addDays(key, 1);
  }
  if (elapsed < 2 || total <= 0) return null;
  const expected = progress.target * (elapsed / total);
  if (progress.done + 0.05 < expected * 0.7) return "late";
  if (progress.done + 0.05 < expected * 0.9) return "tight";
  return "ok";
}

export function riskLabel(risk: TaskRisk | null): string {
  if (risk === "late") return "按近速可能赶不上";
  if (risk === "tight") return "窗口偏紧";
  if (risk === "ok") return "按近速能赶上";
  return "";
}

export function applyDoneDeltaToBreakdown(task: Task, nextDelta: number, prevDelta: number): Task {
  if (!hasBreakdown(task) || !task.breakdown) return task;
  const change = Math.round(nextDelta) - Math.round(prevDelta);
  if (change === 0) return task;
  const items = task.breakdown.map((item) => ({ ...item }));
  if (change > 0) {
    let left = change;
    for (const item of items) {
      if (left <= 0) break;
      if (!item.done) {
        item.done = true;
        left -= 1;
      }
    }
  } else {
    let left = -change;
    for (let index = items.length - 1; index >= 0; index -= 1) {
      if (left <= 0) break;
      if (items[index].done) {
        items[index].done = false;
        left -= 1;
      }
    }
  }
  return { ...task, breakdown: items };
}

export function tasksNeedingBreakdown(data: PlannerData, today = calendarKey()): Task[] {
  return data.tasks.filter((task) => {
    if (task.skipBreakdown || hasBreakdown(task)) return false;
    if (typeof task.targetAmount !== "number" || task.targetAmount <= 0) return false;
    if (today > task.endDate) return false;
    if (today < addDays(task.startDate, -7)) return false;
    const snooze = data.breakdownSnooze?.[task.id];
    if (snooze && snooze >= today) return false;
    return true;
  });
}

export function actualHoursOf(data: PlannerData, taskId: string, dateKey: string): number {
  const hours = data.dayPlans[dateKey]?.[taskId]?.actualHours;
  return typeof hours === "number" && !Number.isNaN(hours) ? Math.max(0, hours) : 0;
}

export function dayActualHours(data: PlannerData, dateKey: string): number {
  const plan = data.dayPlans[dateKey] ?? {};
  return Object.values(plan).reduce((sum, entry) => {
    const hours = entry.actualHours;
    return sum + (typeof hours === "number" && !Number.isNaN(hours) ? Math.max(0, hours) : 0);
  }, 0);
}

export function dayPlannedTaskHours(data: PlannerData, dateKey: string): number {
  return data.tasks.reduce((sum, task) => sum + hoursOnDay(data, task, dateKey), 0);
}

export type WeekReport = {
  plannedHours: number;
  actualHours: number;
  slotCount: number;
  doneCount: number;
  unfinished: Array<{ task: Task; days: number }>;
  outputs: Array<{ task: Task; amount: number; unit: string }>;
  risks: Array<{ task: Task; risk: TaskRisk }>;
  notes: string[];
  suggestions: string[];
  hasLogs: boolean;
};

export function buildWeekReport(data: PlannerData, days: string[], today = calendarKey()): WeekReport {
  let plannedHours = 0;
  let actualHours = 0;
  let slotCount = 0;
  let doneCount = 0;
  const unfinished = new Map<string, number>();
  const outputs = new Map<string, number>();
  const notes: string[] = [];

  for (const dateKey of days) {
    plannedHours += dayPlannedTaskHours(data, dateKey);
    actualHours += dayActualHours(data, dateKey);
    if ((data.dayNotes[dateKey] ?? "").trim()) notes.push(dateKey);
    const plan = dayPlanOf(data, dateKey);
    for (const task of data.tasks) {
      if (!coversDay(task, dateKey)) continue;
      slotCount += 1;
      const entry = plan[task.id];
      if (entry?.status === "done") doneCount += 1;
      else if (dateKey < today) unfinished.set(task.id, (unfinished.get(task.id) ?? 0) + 1);
      const delta = data.dayPlans[dateKey]?.[task.id]?.doneDelta;
      if (typeof delta === "number" && delta > 0) {
        outputs.set(task.id, (outputs.get(task.id) ?? 0) + delta);
      }
    }
  }

  const risks = data.tasks
    .map((task) => ({ task, risk: taskRisk(data, task, today) }))
    .filter((item): item is { task: Task; risk: TaskRisk } => item.risk != null && item.risk !== "ok");

  const hasLogs = actualHours > 0 || outputs.size > 0 || doneCount > 0;
  const suggestions: string[] = [];
  if (!hasLogs) {
    suggestions.push("这周还没有计时或推进记录。先在当天按开始/暂停，能数的再记一篇/一章/一题。");
  } else {
    if (plannedHours > 0 && actualHours + 0.2 < plannedHours * 0.7) {
      suggestions.push(
        `这周预算 ${plannedHours.toFixed(1)}h，计时只有 ${actualHours.toFixed(1)}h。先信计时，再决定要不要改日均。`,
      );
    }
    for (const item of risks) {
      const progress = taskProgress(data, item.task);
      const pace = suggestedPace(data, item.task, today);
      const label = `${subjectOf(data, item.task.subjectId)?.name ?? ""} · ${item.task.name}`;
      if (item.risk === "late") {
        suggestions.push(
          `${label} 按近速可能赶不上${progress.unit}窗口。可加天数、隔天做，或先把后面还没拆的量减实。`,
        );
      } else if (pace != null) {
        suggestions.push(`${label} 窗口偏紧，按剩余量大约每天 ${pace}${progress.unit}。`);
      }
    }
    const busyDay = days.find((dateKey) => dayPlannedTaskHours(data, dateKey) > plannedHoursOf(data, dateKey) + 0.05);
    if (busyDay) suggestions.push(`${busyDay} 预算已经超当天计划时长，优先减并行，而不是再加条。`);
  }

  return {
    plannedHours,
    actualHours,
    slotCount,
    doneCount,
    unfinished: [...unfinished.entries()]
      .filter(([, count]) => count >= 2)
      .map(([taskId, daysMissed]) => ({
        task: data.tasks.find((task) => task.id === taskId)!,
        days: daysMissed,
      }))
      .filter((item) => item.task),
    outputs: [...outputs.entries()].map(([taskId, amount]) => {
      const task = data.tasks.find((item) => item.id === taskId)!;
      return { task, amount, unit: taskUnit(task) };
    }),
    risks,
    notes,
    suggestions,
    hasLogs,
  };
}

export function progressCaption(data: PlannerData, task: Task, today = calendarKey()): string {
  const progress = taskProgress(data, task);
  const pace = suggestedPace(data, task, today);
  const risk = taskRisk(data, task, today);
  const parts: string[] = [];
  if (progress.target != null) {
    parts.push(`${progress.done}/${progress.target}${progress.unit}`);
    if (pace != null && progress.remaining != null && progress.remaining > 0) {
      parts.push(`约 ${pace}${progress.unit}/天`);
    }
  } else if (progress.done > 0) {
    parts.push(`已记 ${progress.done}${progress.unit}`);
  }
  const riskText = riskLabel(risk);
  if (riskText) parts.push(riskText);
  return parts.join(" · ");
}

export function snapActualHours(value: number): number {
  return Math.round(Math.max(0, value) * 10) / 10;
}
