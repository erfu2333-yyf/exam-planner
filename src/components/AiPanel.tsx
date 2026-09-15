import { useState } from "react";
import {
  applySuggestion,
  buildPlanSnapshot,
  type ChatTurn,
  type PlanSuggestion,
  type SuggestionAction,
} from "../ai";
import type { PlannerData } from "../types";
import { Button } from "./ui";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  suggestions?: Array<PlanSuggestion & { applied?: boolean }>;
};

function isAction(value: unknown): value is SuggestionAction {
  if (!value || typeof value !== "object") return false;
  const action = value as SuggestionAction;
  if (action.type === "setDailyHours") {
    return typeof action.taskId === "string" && typeof action.dailyHours === "number";
  }
  if (action.type === "setTaskDates") {
    return typeof action.taskId === "string";
  }
  if (action.type === "setCapacity") {
    return typeof action.capacity === "number";
  }
  if (action.type === "setMethod") {
    return typeof action.taskId === "string" && typeof action.method === "string";
  }
  return false;
}

function parseSuggestions(raw: unknown, data: PlannerData): PlanSuggestion[] {
  if (!Array.isArray(raw)) return [];
  const out: PlanSuggestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as { title?: unknown; reason?: unknown; action?: unknown };
    if (!isAction(record.action)) continue;
    const next = applySuggestion(data, record.action);
    if (next === data) continue;
    out.push({
      title: String(record.title ?? "调整建议").slice(0, 80),
      reason: String(record.reason ?? "").slice(0, 200),
      action: record.action,
    });
  }
  return out.slice(0, 4);
}

export function AiPanel({
  data,
  onApply,
}: {
  data: PlannerData;
  onApply: (action: SuggestionAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const send = async () => {
    const text = question.trim();
    if (!text || sending) return;
    const userMessage: Message = { id: `u-${Date.now()}`, role: "user", text };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setQuestion("");
    setError("");
    setSending(true);

    const history: ChatTurn[] = nextMessages.slice(-8).map((item) => ({
      role: item.role,
      content: item.text,
    }));

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text,
          snapshot: buildPlanSnapshot(data),
          history: history.slice(0, -1),
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        reply?: string;
        suggestions?: unknown;
        error?: string;
        model?: string;
      } | null;
      if (!payload) {
        throw new Error("接口还没就绪，请过一两分钟再试。");
      }
      if (!response.ok) {
        throw new Error(payload.error || "发送失败");
      }
      const fallbackNote =
        payload.model && payload.model !== "alibaba/qwen3.7-plus"
          ? "\n\n（Qwen 3.7 Plus 这次没调用成功，用了备用模型。额度到账后会自动切回。）"
          : "";
      setMessages((current) => [
        ...current,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: (payload.reply || "我看过了，暂时没有额外建议。") + fallbackNote,
          suggestions: parseSuggestions(payload.suggestions, data),
        },
      ]);
    } catch (caught) {
      const message =
        caught instanceof Error && caught.message
          ? caught.message
          : "发送失败，请稍后重试。";
      setError(message);
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="打开 P人大救星"
        style={{
          position: "fixed",
          right: 0,
          top: "34%",
          zIndex: 60,
          width: 40,
          padding: "12px 0",
          border: "1px solid var(--accent)",
          borderRight: "none",
          borderRadius: "10px 0 0 10px",
          background: "var(--surface)",
          color: "var(--accent)",
          fontWeight: 700,
          fontSize: 13,
          lineHeight: 1.35,
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          letterSpacing: 0,
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 800, lineHeight: 1 }}>P</span>
        <span>人</span>
        <span>大</span>
        <span>救</span>
        <span>星</span>
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        right: 14,
        top: 70,
        zIndex: 60,
        width: 360,
        maxHeight: "calc(100vh - 100px)",
        display: "flex",
        flexDirection: "column",
        border: "1px solid var(--accent)",
        borderRadius: 12,
        background: "var(--surface)",
        boxShadow: "0 16px 44px rgba(23, 26, 33, 0.22)",
        overflow: "hidden",
      }}
    >
      <div
        className="row"
        style={{
          justifyContent: "space-between",
          padding: "10px 14px",
          background: "var(--surface-2)",
          borderBottom: "1px solid var(--stroke)",
        }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>P人大救星</div>
          <div className="small muted-3">Qwen 3.7 Plus · 建议需确认后才写入</div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{
            border: "none",
            background: "transparent",
            fontSize: 22,
            lineHeight: 1,
            cursor: "pointer",
            color: "var(--text-2)",
          }}
        >
          ×
        </button>
      </div>

      <div className="stack ai-thread">
        {messages.length === 0 ? (
          <div
            className="small muted"
            style={{
              border: "1px dashed var(--stroke-strong)",
              borderRadius: 8,
              padding: 10,
            }}
          >
            可以问「第7—10周是否超负荷」「英语后半段怎么压时长」。建议出现后点「应用到计划」，不满意用撤销。
          </div>
        ) : null}
        {messages.map((message) => (
          <div key={message.id} className={`ai-bubble ai-${message.role}`}>
            <div style={{ whiteSpace: "pre-wrap" }}>{message.text}</div>
            {message.suggestions?.map((suggestion, index) => (
              <div key={`${message.id}-${index}`} className="ai-suggest">
                <div style={{ fontWeight: 700 }}>{suggestion.title}</div>
                {suggestion.reason ? <div className="small muted">{suggestion.reason}</div> : null}
                <div className="row" style={{ justifyContent: "flex-end", marginTop: 6 }}>
                  <Button
                    small
                    variant="primary"
                    disabled={suggestion.applied}
                    onClick={() => {
                      onApply(suggestion.action);
                      setMessages((current) =>
                        current.map((item) =>
                          item.id === message.id
                            ? {
                                ...item,
                                suggestions: item.suggestions?.map((entry, entryIndex) =>
                                  entryIndex === index ? { ...entry, applied: true } : entry,
                                ),
                              }
                            : item,
                        ),
                      );
                    }}
                  >
                    {suggestion.applied ? "已应用" : "应用到计划"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ))}
        {sending ? <div className="small muted">正在看你的计划…</div> : null}
        {error ? <div className="small" style={{ color: "var(--danger)" }}>{error}</div> : null}
      </div>

      <div className="stack" style={{ padding: 12, borderTop: "1px solid var(--stroke)" }}>
        <textarea
          className="field"
          rows={4}
          value={question}
          placeholder="询问当前计划的问题…"
          disabled={sending}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <Button variant="primary" disabled={sending || !question.trim()} onClick={() => void send()}>
          {sending ? "发送中…" : "发送"}
        </Button>
      </div>
    </div>
  );
}
