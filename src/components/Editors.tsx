import { useEffect, useState } from "react";
import { WEEKDAY_CHIPS, addDays, calendarKey } from "../dateUtils";
import { parseBreakdownText, suggestedPace, suggestedUnitForName } from "../progress";
import { coversDay } from "../schedule";
import type { BreakdownItem, PlannerData, Subject } from "../types";
import { Button, ColorPicker, Field, Modal, NumberField, Pill, TextField } from "./ui";

export type TaskDraft = {
  id: string | null;
  subjectId: string;
  name: string;
  dailyHours: string;
  startDate: string;
  endDate: string;
  colorId: string;
  weekdays: number[];
  unit: string;
  targetAmount: string;
  doneAmount: string;
  breakdown: BreakdownItem[];
  skipBreakdown: boolean;
};

export function emptyVolume(name = ""): Pick<
  TaskDraft,
  "unit" | "targetAmount" | "doneAmount" | "breakdown" | "skipBreakdown"
> {
  return {
    unit: suggestedUnitForName(name),
    targetAmount: "",
    doneAmount: "",
    breakdown: [],
    skipBreakdown: false,
  };
}

export function TaskEditor({
  draft,
  subjects,
  origin,
  examDate,
  data,
  onClose,
  onSave,
  onDelete,
}: {
  draft: TaskDraft;
  subjects: Subject[];
  origin: string;
  examDate: string;
  data?: PlannerData;
  onClose: () => void;
  onSave: (draft: TaskDraft) => void;
  onDelete: (taskId: string) => void;
}) {
  const [value, setValue] = useState(draft);
  useEffect(() => setValue(draft), [draft]);

  const patch = (next: Partial<TaskDraft>) => setValue((current) => ({ ...current, ...next }));
  const invalidRange = value.startDate > value.endDate;
  const hasWeekdays = value.weekdays.length > 0;
  const canSave =
    value.name.trim() !== "" &&
    value.startDate !== "" &&
    value.endDate !== "" &&
    !invalidRange &&
    Number(value.dailyHours) > 0 &&
    hasWeekdays;

  return (
    <Modal title={draft.id ? "编辑二级任务" : "添加二级任务"} onClose={onClose}>
      <div className="stack" style={{ gap: 14 }}>
        <Field label="任务名称">
          <TextField
            value={value.name}
            onChange={(name) => patch({ name })}
            placeholder="例如：单词"
          />
        </Field>

        <Field label="所属一级任务">
          <select
            className="field"
            value={value.subjectId}
            onChange={(event) => patch({ subjectId: event.target.value })}
          >
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="开始日期">
            <TextField
              type="date"
              value={value.startDate}
              onChange={(startDate) => patch({ startDate })}
            />
          </Field>
          <Field label="结束日期">
            <TextField
              type="date"
              value={value.endDate}
              onChange={(endDate) => patch({ endDate })}
            />
          </Field>
        </div>
        {invalidRange ? (
          <div className="small" style={{ color: "var(--danger)" }}>
            结束日期不能早于开始日期
          </div>
        ) : (
          <div className="small muted-3">
            周期范围 {origin} 至 {examDate}
          </div>
        )}

        <Field label="每天预算（小时）">
          <NumberField
            value={value.dailyHours}
            width={110}
            onChange={(dailyHours) => patch({ dailyHours })}
          />
          <div className="small muted-3" style={{ marginTop: 6 }}>
            只占当天位子，不必估准。真正花多久用当天的计时器量。
          </div>
        </Field>

        <VolumeFields value={value} data={data} onPatch={patch} />

        <Field label="每周哪几天">
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <Pill
              active={value.weekdays.length === 7}
              onClick={() => patch({ weekdays: [0, 1, 2, 3, 4, 5, 6] })}
            >
              全选
            </Pill>
            {WEEKDAY_CHIPS.map((item) => {
              const active = value.weekdays.includes(item.day);
              return (
                <Pill
                  key={item.day}
                  active={active}
                  onClick={() => {
                    const next = active
                      ? value.weekdays.filter((day) => day !== item.day)
                      : [...value.weekdays, item.day];
                    patch({ weekdays: next });
                  }}
                >
                  周{item.label}
                </Pill>
              );
            })}
          </div>
          {hasWeekdays ? (
            <div className="small muted-3" style={{ marginTop: 6 }}>
              {value.weekdays.length === 7
                ? "日期范围内每天都做"
                : "只在选中的周几出现，不必连续"}
            </div>
          ) : (
            <div className="small" style={{ color: "var(--danger)", marginTop: 6 }}>
              至少选一天
            </div>
          )}
        </Field>

        <Field label="颜色">
          <ColorPicker value={value.colorId} onChange={(colorId) => patch({ colorId })} />
        </Field>

        <div className="row" style={{ justifyContent: "space-between", marginTop: 4 }}>
          {draft.id ? (
            <Button variant="danger" onClick={() => onDelete(draft.id as string)}>
              删除任务
            </Button>
          ) : (
            <span />
          )}
          <div className="row" style={{ gap: 8 }}>
            <Button onClick={onClose}>取消</Button>
            <Button variant="primary" disabled={!canSave} onClick={() => onSave(value)}>
              {draft.id ? "保存" : "确认添加"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function VolumeFields({
  value,
  data,
  onPatch,
}: {
  value: TaskDraft;
  data?: PlannerData;
  onPatch: (next: Partial<TaskDraft>) => void;
}) {
  const [paste, setPaste] = useState("");
  const unit = value.unit.trim() || suggestedUnitForName(value.name);
  const target = Number(value.targetAmount);
  const previewTask = {
    id: value.id ?? "draft",
    subjectId: value.subjectId,
    name: value.name,
    dailyHours: Number(value.dailyHours) || 0,
    startDate: value.startDate,
    endDate: value.endDate,
    method: "",
    colorId: value.colorId,
    weekdays: value.weekdays,
    unit,
    targetAmount: target > 0 ? target : undefined,
    doneAmount: Number(value.doneAmount) || undefined,
    breakdown: value.breakdown.length > 0 ? value.breakdown : undefined,
    skipBreakdown: value.skipBreakdown,
  };
  const covered =
    value.startDate && value.endDate
      ? (() => {
          let count = 0;
          let key = value.startDate;
          while (key <= value.endDate) {
            if (coversDay(previewTask, key)) count += 1;
            key = addDays(key, 1);
          }
          return count;
        })()
      : 0;
  const remaining = value.breakdown.length
    ? value.breakdown.filter((item) => !item.done).length
    : target > 0
      ? Math.max(0, target - (Number(value.doneAmount) || 0))
      : null;
  const pace =
    remaining != null && covered > 0
      ? Math.round((remaining / Math.max(1, covered)) * 10) / 10
      : null;
  const livePace = data && value.id ? suggestedPace(data, previewTask, calendarKey()) : pace;

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <Field label="单位">
          <TextField
            value={value.unit}
            placeholder={suggestedUnitForName(value.name)}
            onChange={(next) => onPatch({ unit: next })}
          />
        </Field>
        <Field label="大概数量">
          <NumberField
            value={value.targetAmount}
            width="100%"
            step={1}
            min={0}
            title="还没拆章节时先填一个大概的数"
            onChange={(targetAmount) => onPatch({ targetAmount })}
          />
        </Field>
        <Field label="已完成">
          <NumberField
            value={value.doneAmount}
            width="100%"
            step={1}
            min={0}
            title={value.breakdown.length > 0 ? "有拆解时以勾选为准" : "没有按天记推进时，可手改"}
            onChange={(doneAmount) => onPatch({ doneAmount })}
          />
        </Field>
      </div>
      <div className="small muted-3">
        刷题用篇/套/题，背诵和笔记用章，肖四用题。后面才开始的任务可以只填大概数量，开始前一周会提醒来拆。
        {livePace != null && remaining != null ? ` 按剩余窗口大约每天 ${livePace}${unit}。` : null}
      </div>

      <label className="row small" style={{ gap: 8, alignItems: "center" }}>
        <input
          type="checkbox"
          checked={value.skipBreakdown}
          onChange={(event) => onPatch({ skipBreakdown: event.target.checked })}
        />
        这项不用拆章节（单词这类维持任务可勾）
      </label>

      {value.skipBreakdown ? null : (
        <Field label="拆成章节 / 结构">
          <div className="stack" style={{ gap: 8 }}>
            {value.breakdown.map((item, index) => (
              <div key={item.id} className="row" style={{ gap: 6 }}>
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={(event) => {
                    const breakdown = value.breakdown.map((entry, entryIndex) =>
                      entryIndex === index ? { ...entry, done: event.target.checked } : entry,
                    );
                    onPatch({ breakdown });
                  }}
                  style={{ width: 16, height: 16 }}
                />
                <TextField
                  value={item.name}
                  onChange={(name) => {
                    const breakdown = value.breakdown.map((entry, entryIndex) =>
                      entryIndex === index ? { ...entry, name } : entry,
                    );
                    onPatch({ breakdown });
                  }}
                />
                <Button
                  small
                  onClick={() =>
                    onPatch({ breakdown: value.breakdown.filter((entry) => entry.id !== item.id) })
                  }
                >
                  删
                </Button>
              </div>
            ))}
            <textarea
              className="field"
              rows={3}
              value={paste}
              placeholder="一行一项，例如：&#10;第一章 福利国家&#10;第二章 贫困"
              onChange={(event) => setPaste(event.target.value)}
            />
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <Button
                small
                disabled={!paste.trim()}
                onClick={() => {
                  onPatch({ breakdown: [...value.breakdown, ...parseBreakdownText(paste)] });
                  setPaste("");
                }}
              >
                加入拆解
              </Button>
            </div>
          </div>
        </Field>
      )}
    </div>
  );
}

export type SubjectDraft = {
  id: string | null;
  name: string;
  colorId: string;
  order: string;
};

export function SubjectEditor({
  draft,
  taskCount,
  onClose,
  onSave,
  onDelete,
  onAddTask,
}: {
  draft: SubjectDraft;
  taskCount: number;
  onClose: () => void;
  onSave: (draft: SubjectDraft) => void;
  onDelete: (subjectId: string) => void;
  onAddTask: (subjectId: string) => void;
}) {
  const [value, setValue] = useState(draft);
  useEffect(() => setValue(draft), [draft]);

  const patch = (next: Partial<SubjectDraft>) => setValue((current) => ({ ...current, ...next }));

  return (
    <Modal title={draft.id ? "管理一级任务" : "添加一级任务"} onClose={onClose} width={470}>
      <div className="stack" style={{ gap: 14 }}>
        <Field label="名称">
          <TextField value={value.name} onChange={(name) => patch({ name })} />
        </Field>

        <Field label="颜色">
          <ColorPicker value={value.colorId} onChange={(colorId) => patch({ colorId })} />
        </Field>

        <Field label="每日排程顺序">
          <div className="row">
            <NumberField
              value={value.order}
              step={1}
              min={1}
              width={80}
              onChange={(order) => patch({ order })}
            />
            <span className="small muted">数字越小排得越早，9 及以上排到晚上</span>
          </div>
        </Field>

        {draft.id ? (
          <>
            <Button onClick={() => onAddTask(draft.id as string)}>＋ 添加二级任务</Button>
            <div className="row" style={{ justifyContent: "space-between", marginTop: 4 }}>
              <Button variant="danger" onClick={() => onDelete(draft.id as string)}>
                删除（含 {taskCount} 个二级任务）
              </Button>
              <div className="row" style={{ gap: 8 }}>
                <Button onClick={onClose}>取消</Button>
                <Button
                  variant="primary"
                  disabled={value.name.trim() === ""}
                  onClick={() => onSave(value)}
                >
                  保存
                </Button>
              </div>
            </div>
            {value.name.trim() === "" ? (
              <div className="small muted">先填名称才能保存</div>
            ) : null}
          </>
        ) : (
          <>
            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <Button onClick={onClose}>取消</Button>
              <Button
                variant="primary"
                disabled={value.name.trim() === ""}
                onClick={() => onSave(value)}
              >
                确认添加
              </Button>
            </div>
            {value.name.trim() === "" ? (
              <div className="small muted">先填名称才能保存</div>
            ) : null}
          </>
        )}
      </div>
    </Modal>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "确认",
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel} width={430}>
      <div className="stack" style={{ gap: 16 }}>
        <span className="muted">{message}</span>
        <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
          <Button onClick={onCancel}>取消</Button>
          <Button variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
