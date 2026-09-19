export type ViewKey = "overview" | "week" | "day";

export type Subject = {
  id: string;
  name: string;
  colorId: string;
  /** 每日排程的先后顺序，数字越小越靠早晨。政治给大值以排到晚上。 */
  order: number;
};

export type BreakdownItem = {
  id: string;
  name: string;
  done: boolean;
};

export type Task = {
  id: string;
  subjectId: string;
  name: string;
  /** 每天预算用时（小时），先占位子，不必估准 */
  dailyHours: number;
  /** 含当天，本地 yyyy-mm-dd */
  startDate: string;
  /** 含当天，本地 yyyy-mm-dd */
  endDate: string;
  method: string;
  colorId: string;
  /** 同一科目下二级任务的显示顺序，越小越靠上 */
  order?: number;
  /**
   * 每周哪几天做。用 Date.getDay()：0 周日 … 6 周六。
   * 缺省或空表示日期范围内每天都做。
   */
  weekdays?: number[];
  /** 推进单位：章 / 篇 / 题 / 课 … */
  unit?: string;
  /** 还没拆章节时的大概数量 */
  targetAmount?: number;
  /** 没有拆解时的已完成量；有拆解时以勾选为准 */
  doneAmount?: number;
  /** 章节或结构拆解，有则优先用来算进度 */
  breakdown?: BreakdownItem[];
  /** 明确这项不用拆章节，开始前一周也不提醒 */
  skipBreakdown?: boolean;
};

export type TaskStatus = "pending" | "done" | "unfinished";

/** 只存在某一天的杂事，不进入总览和周历 */
export type DayMisc = {
  id: string;
  name: string;
  start: number;
  end: number;
  status: TaskStatus;
  /** 当天这块的具体内容，和科目任务色块同一栏 */
  note?: string;
  /** 缺省按灰处理，兼容旧数据；新加的事项会分配调色板颜色 */
  colorId?: string;
};

export type DayEntry = {
  /** 小时，支持半小时，如 7.5 */
  start: number;
  end: number;
  note: string;
  status: TaskStatus;
  /** 当天实际用时，由计时器写入，不默认等于预算 */
  actualHours?: number;
  /** 当天推进量，单位跟任务上的 unit 一致 */
  doneDelta?: number;
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
  /** taskId -> 拆解提醒推迟到哪一天之后再弹 */
  breakdownSnooze?: Record<string, string>;
};
