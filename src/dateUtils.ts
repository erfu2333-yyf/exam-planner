/**
 * 全部日期运算都走本地时间。注意不要用 toISOString() 生成日期键，
 * 它会按 UTC 转换，在东八区会把日期倒退一天。
 */

/** 周期起点，周六 */
export const ORIGIN = "2026-09-12";
/** 考试日，周六 */
export const EXAM_DATE = "2026-12-19";
/** 最后复习截止时刻 */
export const DEADLINE_LABEL = "12/18 22:00";
export const TOTAL_WEEKS = 14;
export const TOTAL_DAYS = TOTAL_WEEKS * 7;
/** 周六起、周五止 */
export const WEEK_DAY_LABELS = ["六", "日", "一", "二", "三", "四", "五"];
/** 在第 2、6、10 周之后画阶段分界线（每四周一段） */
export const PHASE_AFTER_WEEKS = [4, 8, 12];

export const HOUR_START = 7;
export const HOUR_END = 24;
export const BOLD_HOURS = [12, 18, 24];

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

/** 距周期起点的天数，可能为负或超过 97 */
export function dayIndex(key: string): number {
  return diffDays(ORIGIN, key);
}

export function keyFromIndex(index: number): string {
  return addDays(ORIGIN, index);
}

/** 天序号所属周序号，0 起 */
export function weekOfIndex(index: number): number {
  return Math.floor(index / 7);
}

export function weekStartKey(week: number): string {
  return keyFromIndex(week * 7);
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

export function weekRangeLabel(week: number): string {
  return `${formatMD(weekStartKey(week))}–${formatMD(addDays(weekStartKey(week), 6))}`;
}

export function daysUntilExam(todayKey: string): number {
  return Math.max(0, diffDays(todayKey, EXAM_DATE));
}

/** 「95天（13周余4天）」里的括号部分 */
export function weeksAndDays(days: number): string {
  const weeks = Math.floor(days / 7);
  const rest = days % 7;
  return rest === 0 ? `${weeks}周` : `${weeks}周余${rest}天`;
}

/** 本机日历上的今天，不夹到备考周期里，给倒计时用 */
export function calendarKey(): string {
  return toKey(new Date());
}

/** 把小时数取整到半小时 */
export function snapHour(value: number): number {
  return Math.round(value * 2) / 2;
}

export function formatHour(value: number): string {
  const hour = Math.floor(value);
  const minute = Math.round((value - hour) * 60);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** 今天；超出周期范围时夹到周期内，保证界面始终有内容 */
export function todayKey(): string {
  const now = toKey(new Date());
  const index = dayIndex(now);
  if (index < 0) return ORIGIN;
  if (index > TOTAL_DAYS - 1) return keyFromIndex(TOTAL_DAYS - 1);
  return now;
}
