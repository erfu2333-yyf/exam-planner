import { useEffect, useState } from "react";
import type { Subject } from "../types";
import { Button, ColorPicker, Field, Modal, NumberField, TextField } from "./ui";

export type TaskDraft = {
  id: string | null;
  subjectId: string;
  name: string;
  dailyHours: string;
  startDate: string;
  endDate: string;
  colorId: string;
};

export function TaskEditor({
  draft,
  subjects,
  origin,
  examDate,
  onClose,
  onSave,
  onDelete,
}: {
  draft: TaskDraft;
  subjects: Subject[];
  origin: string;
  examDate: string;
  onClose: () => void;
  onSave: (draft: TaskDraft) => void;
  onDelete: (taskId: string) => void;
}) {
  const [value, setValue] = useState(draft);
  useEffect(() => setValue(draft), [draft]);

  const patch = (next: Partial<TaskDraft>) => setValue((current) => ({ ...current, ...next }));
  const invalidRange = value.startDate > value.endDate;
  const canSave =
    value.name.trim() !== "" &&
    value.startDate !== "" &&
    value.endDate !== "" &&
    !invalidRange &&
    Number(value.dailyHours) > 0;

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

        <Field label="日均用时（小时）">
          <NumberField
            value={value.dailyHours}
            width={110}
            onChange={(dailyHours) => patch({ dailyHours })}
          />
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
