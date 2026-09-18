import { snapHour } from "./dateUtils";
import type { DayMiscSlot } from "./schedule";

export type DayImportItem = {
  name: string;
  hours: number;
  slot?: DayMiscSlot;
};

export type DayImportPreview = {
  items: DayImportItem[];
  errors: string[];
  note?: string;
};

const SLOTS: DayMiscSlot[] = ["morning", "afternoon", "evening"];

export function coerceDayImport(raw: unknown): DayImportPreview {
  if (!raw || typeof raw !== "object") {
    return { items: [], errors: ["模型没有返回可识别的任务。"] };
  }
  const record = raw as { items?: unknown; errors?: unknown; note?: unknown };
  const errors = Array.isArray(record.errors)
    ? record.errors.map((item) => String(item).trim()).filter(Boolean)
    : [];
  const list = Array.isArray(record.items) ? record.items : [];
  if (list.length === 0) {
    return { items: [], errors: errors.length > 0 ? errors : ["模型没有返回可识别的任务。"] };
  }

  const items: DayImportItem[] = [];
  list.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;
    const row = entry as { name?: unknown; hours?: unknown; slot?: unknown };
    const name = String(row.name ?? "").trim();
    if (!name) {
      errors.push(`第${index + 1}条缺少任务名`);
      return;
    }
    const hours = snapHour(Number(row.hours));
    if (!(hours > 0)) {
      errors.push(`「${name}」缺少时长`);
      return;
    }
    const slotRaw = String(row.slot ?? "").trim();
    const slot = SLOTS.find((item) => item === slotRaw);
    items.push(slot ? { name, hours, slot } : { name, hours });
  });

  return {
    items,
    errors,
    note: String(record.note ?? "").trim() || undefined,
  };
}

export function slotLabel(slot?: DayMiscSlot): string {
  if (slot === "morning") return "上午";
  if (slot === "afternoon") return "下午";
  if (slot === "evening") return "晚上";
  return "—";
}
