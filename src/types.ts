export type ViewKey = "overview" | "week" | "day";

export type Subject = {
  id: string;
  name: string;
  colorId: string;
  /** 每日排程的先后顺序，数字越小越靠早晨。政治给大值以排到晚上。 */
  order: number;
};

export type Task = {
  id: string;
  subjectId: string;
  name: string;
  /** 日均计划用时（小时） */
  dailyHours: number;
  /** 含当天，本地 yyyy-mm-dd */
  startDate: string;
  /** 含当天，本地 yyyy-mm-dd */
  endDate: string;
  method: string;
  colorId: string;
  /** 同一科目下二级任务的显示顺序，越小越靠上 */
  order?: number;
};

export type TaskStatus = "pending" | "done" | "unfinished";

/** 只存在某一天的杂事，不进入总览和周历 */
export type DayMisc = {
  id: string;
  name: string;
  start: number;
  end: number;
  status: TaskStatus;
};

export type DayEntry = {
  /** 小时，支持半小时，如 7.5 */
  start: number;
  end: number;
  note: string;
  status: TaskStatus;
};

/** taskId -> 当天安排 */
export type DayPlan = Record<string, DayEntry>;

export type PlannerData = {
  subjects: Subject[];
  tasks: Task[];
  /** dateKey -> DayPlan，只存用户改过或已生成的日期 */
  dayPlans: Record<string, DayPlan>;
  /** dateKey -> 当天计划可用时长 */
  plannedHours: Record<string, number>;
  /** `${taskId}|${dateKey}` -> 周历格子里的文字 */
  weekTexts: Record<string, string>;
  /** `${taskId}|${dateKey}` -> 当前周精细化用时，缺省则用任务日均 */
  dayHours: Record<string, number>;
  /** dateKey -> 当天整段总结 */
  dayNotes: Record<string, string>;
  /** dateKey -> 当天杂事，不影响总览和周历 */
  dayMiscs: Record<string, DayMisc[]>;
  /** 规划事项名称，默认「考研」，用在页顶倒计时 */
  eventName: string;
  /** 规划事项日期，总览从固定起点排到这一天 */
  examDate: string;
  /** 每天可用总时长，超过就算超负荷 */
  capacity: number;
};
