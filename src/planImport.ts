import { PALETTE } from "./theme";
import type { PlannerData } from "./types";
import { snapHour } from "./dateUtils";
import { nextTaskOrder } from "./schedule";

export type ImportTask = {
  name: string;
  dailyHours: number;
  startDate: string;
  endDate: string;
  method: string;
};

export type ImportSubject = {
  name: string;
  evening: boolean;
  tasks: ImportTask[];
};

export type ImportPreview = {
  subjects: ImportSubject[];
  errors: string[];
  note?: string;
};

export function coerceImportPreview(
  raw: unknown,
  origin: string,
  last: string,
): ImportPreview {
  if (!raw || typeof raw !== "object") {
    return { subjects: [], errors: ["模型没有返回可识别的任务。"] };
  }
  const record = raw as { subjects?: unknown; errors?: unknown; note?: unknown };
  const errors = Array.isArray(record.errors)
    ? record.errors.map((item) => String(item).trim()).filter(Boolean)
    : [];
  if (!Array.isArray(record.subjects)) {
    return { subjects: [], errors: errors.length > 0 ? errors : ["模型没有返回可识别的任务。"] };
  }

  const subjects: ImportSubject[] = [];
  record.subjects.forEach((item, subjectIndex) => {
    if (!item || typeof item !== "object") return;
    const entry = item as {
      name?: unknown;
      evening?: unknown;
      tasks?: unknown;
    };
    const name = String(entry.name ?? "").trim();
    if (!name) {
      errors.push(`第${subjectIndex + 1}个科目缺少名称`);
      return;
    }
    if (!Array.isArray(entry.tasks) || entry.tasks.length === 0) {
      errors.push(`「${name}」下面没有二级任务`);
      return;
    }
    const tasks: ImportTask[] = [];
    entry.tasks.forEach((taskRaw, taskIndex) => {
      if (!taskRaw || typeof taskRaw !== "object") return;
      const task = taskRaw as {
        name?: unknown;
        dailyHours?: unknown;
        startDate?: unknown;
        endDate?: unknown;
        method?: unknown;
      };
      const taskName = String(task.name ?? "").trim();
      if (!taskName) {
        errors.push(`「${name}」第${taskIndex + 1}条缺少任务名`);
        return;
      }
      const startDate = clampDate(parseLooseDate(String(task.startDate ?? ""), origin), origin, last);
      const endDate = clampDate(parseLooseDate(String(task.endDate ?? ""), origin), origin, last);
      if (!startDate || !endDate) {
        errors.push(`「${name} / ${taskName}」日期看不懂`);
        return;
      }
      const hours = snapHour(Number(task.dailyHours));
      tasks.push({
        name: taskName,
        dailyHours: hours > 0 ? hours : 1,
        startDate,
        endDate: endDate < startDate ? startDate : endDate,
        method: String(task.method ?? "").trim(),
      });
    });
    if (tasks.length > 0) {
      subjects.push({ name, evening: Boolean(entry.evening), tasks });
    }
  });

  if (subjects.length === 0 && errors.length === 0) {
    errors.push("没有从这段话里整理出任务。");
  }
  const note = String(record.note ?? "").trim();
  return { subjects, errors, note: note || undefined };
}

function parseLooseDate(raw: string, fallbackYearSource: string): string | null {
  const year = Number(fallbackYearSource.slice(0, 4)) || new Date().getFullYear();
  const value = raw.trim().replace(/[./]/g, "-");
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${pad(iso[2])}-${pad(iso[3])}`;
  const short = value.match(/^(\d{1,2})-(\d{1,2})$/);
  if (short) return `${year}-${pad(short[1])}-${pad(short[2])}`;
  return null;
}

function clampDate(value: string | null, origin: string, last: string): string | null {
  if (!value) return null;
  if (value < origin) return origin;
  if (value > last) return last;
  return value;
}

function pad(value: string): string {
  return value.padStart(2, "0");
}

export function applyImport(data: PlannerData, preview: ImportSubject[]): PlannerData {
  const used = new Set(data.subjects.map((subject) => subject.colorId));
  const subjects = [...data.subjects];
  const tasks = [...data.tasks];
  const stamp = Date.now();
  let nextOrder = Math.max(0, ...subjects.filter((item) => item.order < 9).map((item) => item.order));

  preview.forEach((item, subjectIndex) => {
    let subject = subjects.find((entry) => entry.name === item.name);
    if (!subject) {
      nextOrder += 1;
      subject = {
        id: `subject-${stamp}-${subjectIndex}`,
        name: item.name,
        colorId: nextColor(used),
        order: item.evening ? 9 : nextOrder,
      };
      used.add(subject.colorId);
      subjects.push(subject);
    } else if (item.evening) {
      subjects.splice(
        subjects.findIndex((entry) => entry.id === subject!.id),
        1,
        { ...subject, order: 9 },
      );
      subject = subjects.find((entry) => entry.id === subject!.id)!;
    }
    item.tasks.forEach((task, taskIndex) => {
      tasks.push({
        id: `task-${stamp}-${subjectIndex}-${taskIndex}`,
        subjectId: subject!.id,
        name: task.name,
        dailyHours: task.dailyHours,
        startDate: task.startDate,
        endDate: task.endDate,
        method: task.method,
        colorId: nextColor(used, subject!.colorId),
        order: nextTaskOrder(tasks, subject!.id),
      });
      used.add(tasks[tasks.length - 1].colorId);
    });
  });

  return { ...data, subjects, tasks };
}

function nextColor(used: Set<string>, prefer?: string): string {
  if (prefer && !used.has(prefer)) return prefer;
  const found = PALETTE.find((item) => !used.has(item.id));
  return found?.id ?? PALETTE[used.size % PALETTE.length].id;
}
