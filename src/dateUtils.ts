/**
 * 全部日期运算都走本地时间。注意不要用 toISOString() 生成日期键，
 * 它会按 UTC 转换，在东八区会把日期倒退一天。
 */

/** 默认考试日，可被计划里的 examDate 覆盖 */
export const DEFAULT_EXAM_DATE = "2026-12-19";
/** 总览固定起点：2026-09-12 周六，按周六至周五倒推，第 1 周收到 9/18 */
export const PLAN_ORIGIN = "2026-09-12";

export const HOUR_START = 7;
export const HOUR_END = 24;
export const BOLD_HOURS = [12, 18, 24];

export type Span = {
  origin: string;
  examDate: string;
};

export type TimelineScale = "day" | "week" | "month";
export type WeekStart = "sat" | "mon";

export type TimelineColumn = {
  key: string;
  label: string;
  sublabel: string;
  start: string;
  end: string;
};

export function toKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(key: string, amount: number): string {
  const date = parseKey(key);
  date.setDate(date.getDate() + amount);
  return toKey(date);
}

export function diffDays(from: string, to: string): number {
  const a = parseKey(from);
  const b = parseKey(to);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/** 本机日历上的今天 */
export function calendarKey(): string {
  return toKey(new Date());
}

/** 周期从固定周六起点排到事项日前一天（含） */
export function makeSpan(eventDate: string): Span {
  const event = eventDate >= PLAN_ORIGIN ? eventDate : PLAN_ORIGIN;
  const last = addDays(event, -1);
  return { origin: PLAN_ORIGIN, examDate: last >= PLAN_ORIGIN ? last : PLAN_ORIGIN };
}

export function spanDays(span: Span): number {
  return Math.max(1, diffDays(span.origin, span.examDate) + 1);
}

export function spanWeeks(span: Span): number {
  return Math.ceil(spanDays(span) / 7);
}

export function lastKey(span: Span): string {
  return span.examDate;
}

export function dayIndex(key: string, origin: string): number {
  return diffDays(origin, key);
}

export function keyFromIndex(index: number, origin: string): string {
  return addDays(origin, index);
}

export function weekOfIndex(index: number): number {
  return Math.floor(index / 7);
}

export function weekStartKey(week: number, origin: string): string {
  return keyFromIndex(week * 7, origin);
}

export function weekEndKey(week: number, span: Span): string {
  const end = addDays(weekStartKey(week, span.origin), 6);
  return end < span.examDate ? end : span.examDate;
}

export function formatMD(key: string): string {
  const date = parseKey(key);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function formatCN(key: string): string {
  const date = parseKey(key);
  const names = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${names[date.getDay()]}`;
}

export function weekdayShort(key: string): string {
  return ["日", "一", "二", "三", "四", "五", "六"][parseKey(key).getDay()];
}

export function weekRangeLabel(week: number, span: Span): string {
  return `${formatMD(weekStartKey(week, span.origin))}–${formatMD(weekEndKey(week, span))}`;
}

/** 总览表头用的简写，同月写成 10/1–7，跨月写成 9/26–10/2 */
export function formatWeekSpan(week: number, span: Span): string {
  const from = parseKey(weekStartKey(week, span.origin));
  const to = parseKey(weekEndKey(week, span));
  const start = `${from.getMonth() + 1}/${from.getDate()}`;
  if (from.getMonth() === to.getMonth()) return `${start}–${to.getDate()}`;
  return `${start}–${to.getMonth() + 1}/${to.getDate()}`;
}

export function daysUntilExam(today: string, examDate: string): number {
  return Math.max(0, diffDays(today, examDate));
}

export function weeksAndDays(days: number): string {
  const weeks = Math.floor(days / 7);
  const rest = days % 7;
  return rest === 0 ? `${weeks}周` : `${weeks}周余${rest}天`;
}

export function snapHour(value: number): number {
  return Math.round(value * 2) / 2;
}

export function formatHour(value: number): string {
  const hour = Math.floor(value);
  const minute = Math.round((value - hour) * 60);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function todayKey(span: Span): string {
  const now = calendarKey();
  if (now < span.origin) return span.origin;
  if (now > span.examDate) return span.examDate;
  return now;
}

/** 从规划终点往前每 4 周画一条间隔线（落在第 N 周的起点） */
export function phaseWeeks(totalWeeks: number): number[] {
  const marks: number[] = [];
  for (let week = totalWeeks - 4; week > 0; week -= 4) marks.push(week);
  return marks.sort((left, right) => left - right);
}

/** 当前周表头的 7 天：周六起按规划周，周一起按含该规划周周四的自然周 */
export function plannerWeekDays(week: number, span: Span, start: WeekStart): string[] {
  const saturday = weekStartKey(week, span.origin);
  if (start === "sat") {
    return Array.from({ length: 7 }, (_, index) => addDays(saturday, index));
  }
  const thursday = addDays(saturday, 5);
  const monday = addDays(thursday, -(parseKey(thursday).getDay() - 1));
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

export function timelineColumns(
  span: Span,
  weekFrom: number,
  weekTo: number,
  scale: TimelineScale,
): TimelineColumn[] {
  const start = weekStartKey(weekFrom, span.origin);
  const end = weekEndKey(weekTo, span);
  if (scale === "week") {
    return Array.from({ length: weekTo - weekFrom + 1 }, (_, index) => {
      const week = weekFrom + index;
      return {
        key: `w${week}`,
        label: String(week + 1),
        sublabel: formatWeekSpan(week, span),
        start: weekStartKey(week, span.origin),
        end: weekEndKey(week, span),
      };
    });
  }
  if (scale === "day") {
    const count = Math.max(1, diffDays(start, end) + 1);
    return Array.from({ length: count }, (_, index) => {
      const key = addDays(start, index);
      return {
        key,
        label: String(parseKey(key).getDate()),
        sublabel: `周${weekdayShort(key)}`,
        start: key,
        end: key,
      };
    });
  }
  const columns: TimelineColumn[] = [];
  let cursor = start;
  while (cursor <= end) {
    const date = parseKey(cursor);
    const monthLast = toKey(new Date(date.getFullYear(), date.getMonth() + 1, 0));
    const colEnd = monthLast < end ? monthLast : end;
    columns.push({
      key: `${date.getFullYear()}-${date.getMonth() + 1}`,
      label: `${date.getMonth() + 1}月`,
      sublabel: `${formatMD(cursor)}–${formatMD(colEnd)}`,
      start: cursor,
      end: colEnd,
    });
    cursor = addDays(colEnd, 1);
  }
  return columns;
}

export function columnTrack(columns: TimelineColumn[], minPx = 0): string {
  return columns
    .map((column) => {
      const days = diffDays(column.start, column.end) + 1;
      return minPx > 0 ? `minmax(${minPx}px, ${days}fr)` : `${days}fr`;
    })
    .join(" ");
}

export function weekCellKey(taskId: string, dateKey: string): string {
  return `${taskId}|${dateKey}`;
}

export function examLabel(examDate: string): string {
  const date = parseKey(examDate);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/** 总览可见周范围内，「今天」竖线的位置（百分比）。今天不在范围内则返回 null */
export function todayLinePercent(span: Span, weekFrom: number, weekTo: number): number | null {
  const today = calendarKey();
  const rangeStart = weekStartKey(weekFrom, span.origin);
  const rangeLast = weekEndKey(weekTo, span);
  if (today < rangeStart || today > rangeLast) return null;
  const rangeDays = Math.max(1, dayIndex(rangeLast, rangeStart) + 1);
  return (dayIndex(today, rangeStart) / rangeDays) * 100;
}
