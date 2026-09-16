import { useState } from "react";
import { calendarKey, type Span } from "../dateUtils";
import {
  applyImport,
  coerceImportPreview,
  type ImportPreview,
  type ImportSubject,
} from "../planImport";
import { colorOf } from "../theme";
import type { PlannerData } from "../types";
import { Button } from "./ui";

const SAMPLE =
  "英语单词从现在一直到考前每天 1 小时，长难句到 11 月中每天半小时，手写拆主干。政治 11 月下旬开始刷题，每天 1 小时。";

export function ImportPanel({
  data,
  span,
  onImport,
}: {
  data: PlannerData;
  span: Span;
  onImport: (subjects: ImportSubject[]) => void;
}) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const arrange = async () => {
    const source = text.trim();
    if (!source || busy) return;
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      const response = await fetch("/api/import-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: source,
          context: {
            today: calendarKey(),
            origin: span.origin,
            lastDate: span.examDate,
            examDate: data.examDate,
            subjects: data.subjects.map((subject) => ({ name: subject.name })),
          },
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        subjects?: unknown;
        note?: string;
        error?: string;
      } | null;
      if (!payload) throw new Error("接口还没就绪，请过一两分钟再试。");
      if (!response.ok) throw new Error(payload.error || "整理失败");
      setPreview(
        coerceImportPreview(
          { subjects: payload.subjects, note: payload.note },
          span.origin,
          span.examDate,
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : "整理失败");
    } finally {
      setBusy(false);
    }
  };

  const colored = preview ? applyImport(data, preview.subjects) : null;
  const addedTasks = colored ? colored.tasks.slice(data.tasks.length) : [];
  const addedSubjects = colored
    ? colored.subjects.filter((subject) => !data.subjects.some((item) => item.id === subject.id))
    : [];

  return (
    <section className="panel">
      <strong>批量追加任务</strong>
      <div className="muted small" style={{ marginTop: 6, lineHeight: 1.65 }}>
        用口语把计划写下来，点整理后先预览，确认才会写入总览。颜色自动分配；学法可空，写了上午/下午/晚上会按这个偏好排到当天时间轴。
      </div>

      <textarea
        className="field day-note"
        rows={8}
        value={text}
        placeholder={SAMPLE}
        onChange={(event) => {
          setText(event.target.value);
          setPreview(null);
          setError("");
        }}
        style={{ marginTop: 10, fontSize: 13 }}
      />
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 8, gap: 8 }}>
        <Button onClick={() => void arrange()} disabled={!text.trim() || busy}>
          {busy ? "正在整理…" : "整理"}
        </Button>
      </div>

      {error ? (
        <div className="small" style={{ color: "var(--danger)", marginTop: 8 }}>
          {error}
        </div>
      ) : null}

      {preview ? (
        <div className="stack" style={{ gap: 10, marginTop: 12 }}>
          {preview.note ? <div className="small muted">{preview.note}</div> : null}
          {preview.errors.length > 0 ? (
            <div className="small" style={{ color: "var(--danger)" }}>
              {preview.errors.map((item) => (
                <div key={item}>{item}</div>
              ))}
            </div>
          ) : null}
          {preview.subjects.length === 0 ? (
            <div className="muted small">没有可追加的任务</div>
          ) : (
            <>
              <div className="small" style={{ fontWeight: 600 }}>
                将追加 {addedSubjects.length} 个一级、{addedTasks.length} 个二级任务
              </div>
              <div className="card" style={{ overflow: "auto" }}>
                <table className="small" style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left", background: "var(--surface-2)" }}>
                      <th style={{ padding: "6px 8px" }}>一级</th>
                      <th style={{ padding: "6px 8px" }}>二级</th>
                      <th style={{ padding: "6px 8px" }}>日均用时</th>
                      <th style={{ padding: "6px 8px" }}>起止日期</th>
                      <th style={{ padding: "6px 8px" }}>学法</th>
                      <th style={{ padding: "6px 8px" }}>颜色</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.subjects.flatMap((subject) =>
                      subject.tasks.map((task, index) => {
                        const matched = addedTasks.find(
                          (item) =>
                            item.name === task.name &&
                            item.startDate === task.startDate &&
                            item.endDate === task.endDate,
                        );
                        const subjectName =
                          data.subjects.find((item) => item.name === subject.name)?.name ??
                          addedSubjects.find((item) => item.name === subject.name)?.name ??
                          subject.name;
                        return (
                          <tr key={`${subject.name}-${index}`} style={{ borderTop: "1px solid var(--stroke)" }}>
                            <td style={{ padding: "6px 8px" }}>
                              {subjectName}
                              {subject.evening ? "（晚）" : ""}
                            </td>
                            <td style={{ padding: "6px 8px" }}>{task.name}</td>
                            <td style={{ padding: "6px 8px" }}>{task.dailyHours}h</td>
                            <td style={{ padding: "6px 8px" }}>
                              {task.startDate}–{task.endDate}
                            </td>
                            <td style={{ padding: "6px 8px" }}>{task.method || "—"}</td>
                            <td style={{ padding: "6px 8px" }}>
                              <span
                                style={{
                                  display: "inline-block",
                                  width: 16,
                                  height: 16,
                                  borderRadius: 4,
                                  background: colorOf(matched?.colorId ?? "blue"),
                                  verticalAlign: "middle",
                                }}
                              />
                            </td>
                          </tr>
                        );
                      }),
                    )}
                  </tbody>
                </table>
              </div>
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <Button
                  variant="primary"
                  onClick={() => {
                    onImport(preview.subjects);
                    setText("");
                    setPreview(null);
                  }}
                >
                  确认追加
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
