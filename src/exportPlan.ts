import { buildPlanSnapshot } from "./ai";
import type { PlannerData } from "./types";

export function planToMarkdown(data: PlannerData, ownerName: string): string {
  const snap = buildPlanSnapshot(data);
  const overload = snap.weeks.filter((week) => week.overload);
  const weekLines = snap.weeks
    .map((week) => {
      const flag = week.overload ? " 超负荷" : "";
      return `- 第${week.week}周 ${week.from}–${week.to}：日均 ${week.hours}h${flag}`;
    })
    .join("\n");
  const taskLines = snap.tasks
    .map(
      (task) => {
        const volume =
          task.breakdownCount != null
            ? `，拆解 ${task.breakdownDone ?? 0}/${task.breakdownCount}`
            : task.targetAmount != null
              ? `，大概 ${task.doneAmount ?? 0}/${task.targetAmount}${task.unit ?? ""}`
              : "";
        return `- ${task.subject} / ${task.name}：预算 ${task.dailyHours}h/天，${task.startDate}–${task.endDate}${volume}${task.method ? `。学法：${task.method}` : ""}`;
      },
    )
    .join("\n");
  const todayLines =
    snap.todayTasks.length > 0
      ? snap.todayTasks
          .map((item) => `- ${item.name} ${item.start}:00–${item.end}:00（${item.status}）`)
          .join("\n")
      : "- 无";

  return `请根据下面这份考研备考计划给出具体建议。周期按周六到周五，起点固定，不要编造计划里没有的任务。建议先说结论，再说明改哪一项、改成多少。

# ${ownerName} 的备考计划
- 今天：${snap.today}
- 考试：${snap.examDate}（还剩 ${snap.daysLeft} 天）
- 每日可用：${snap.capacity} 小时
- 日历：${snap.calendar}
- 超负荷周：${overload.length ? overload.map((week) => `第${week.week}周`).join("、") : "无"}

## 每周日均负荷
${weekLines}

## 任务
${taskLines}

## 今天已排
${todayLines}
`;
}
