import { snapHour } from "./dateUtils";
import type { DayMiscSlot } from "./schedule";

export type DayImportItem = {
  name: string;
  hours: number;
  slot?: DayMiscSlot;
  gray?: boolean;
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
    const row = entry as { name?: unknown; hours?: unknown; slot?: unknown; gray?: unknown };
    const parsed = parseMiscName(String(row.name ?? ""));
    const name = parsed.name;
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
    const gray = parsed.gray || isGrayFlag(row.gray);
    items.push({ name, hours, ...(slot ? { slot } : {}), ...(gray ? { gray: true } : {}) });
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

/** 只有主动写成灰色标签时才走灰色，避免默认灰。 */
export function parseMiscName(raw: string): { name: string; gray: boolean } {
  const trimmed = raw.trim();
  const tagged = trimmed.match(/^(?:灰色|gray)\s*[:：,，-]?\s+(.+)$/i);
  if (tagged?.[1]) return { name: tagged[1].trim(), gray: true };
  const colon = trimmed.match(/^(?:灰色|gray)\s*[:：]\s*(.+)$/i);
  if (colon?.[1]) return { name: colon[1].trim(), gray: true };
  if (/^(?:灰色|gray)$/i.test(trimmed)) return { name: trimmed, gray: true };
  return { name: trimmed, gray: false };
}

function isGrayFlag(value: unknown): boolean {
  if (value === true) return true;
  const text = String(value ?? "").trim().toLowerCase();
  return text === "gray" || text === "grey" || text === "灰色";
}
