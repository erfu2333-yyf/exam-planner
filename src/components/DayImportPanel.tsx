import { useEffect, useState } from "react";
import { coerceDayImport, slotLabel, type DayImportItem, type DayImportPreview } from "../dayImport";
import { Button } from "./ui";

const SAMPLE = "上午背单词 1 小时，下午做两套数学题各 1.5 小时，晚上看政治视频 1 小时";

export function DayImportPanel({
  dateKey,
  onImport,
}: {
  dateKey: string;
  onImport: (items: DayImportItem[]) => void;
}) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<DayImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setText("");
    setPreview(null);
    setError("");
  }, [dateKey]);

  const arrange = async () => {
    const source = text.trim();
    if (!source || busy) return;
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      const response = await fetch("/api/import-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: source,
          context: { date: dateKey },
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        items?: unknown;
        note?: string;
        error?: string;
      } | null;
      if (!payload) throw new Error("接口还没就绪，请过一两分钟再试。");
      if (!response.ok) throw new Error(payload.error || "整理失败");
      setPreview(coerceDayImport({ items: payload.items, note: payload.note }));
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : "整理失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <strong>智能追加今日清单</strong>
      <div className="muted small" style={{ marginTop: 6, lineHeight: 1.65 }}>
        用口语写下今天要做的事，点整理后先预览。只要任务名和时长；写了上午、下午、晚上会尽量排进对应时段。只加到当天，不改总体计划。
      </div>

      <textarea
        className="field day-note"
        rows={5}
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
          {preview.items.length === 0 ? (
            <div className="muted small">没有可追加的事项</div>
          ) : (
            <>
              <div className="small" style={{ fontWeight: 600 }}>
                将追加 {preview.items.length} 项到当天执行清单
              </div>
              <div className="card" style={{ overflow: "auto" }}>
                <table className="small" style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left", background: "var(--surface-2)" }}>
                      <th style={{ padding: "6px 8px" }}>任务名</th>
                      <th style={{ padding: "6px 8px" }}>时长</th>
                      <th style={{ padding: "6px 8px" }}>时段</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.items.map((item, index) => (
                      <tr key={`${item.name}-${index}`} style={{ borderTop: "1px solid var(--stroke)" }}>
                        <td style={{ padding: "6px 8px" }}>{item.name}</td>
                        <td style={{ padding: "6px 8px" }}>{item.hours}h</td>
                        <td style={{ padding: "6px 8px" }}>{slotLabel(item.slot)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <Button
                  variant="primary"
                  onClick={() => {
                    onImport(preview.items);
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
