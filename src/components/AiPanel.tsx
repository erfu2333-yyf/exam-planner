import { useState } from "react";
import { Button } from "./ui";

/**
 * AI 计划助手。用 position: fixed 贴在右侧，随页面滚动始终可见。
 * 现在只有界面框架，发送按钮不接模型；接后端时替换 send 的实现即可。
 */
export function AiPanel() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="打开 AI 计划助手"
        style={{
          position: "fixed",
          right: 0,
          top: "38%",
          zIndex: 60,
          width: 36,
          padding: "14px 0",
          border: "1px solid var(--accent)",
          borderRight: "none",
          borderRadius: "10px 0 0 10px",
          background: "var(--surface)",
          color: "var(--accent)",
          fontWeight: 700,
          lineHeight: 1.4,
          cursor: "pointer",
        }}
      >
        A<br />I
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
          <div style={{ fontWeight: 600 }}>AI 计划助手</div>
          <div className="small muted-3">模型锁定 Grok 4.6</div>
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

      <div className="stack" style={{ padding: 14, overflowY: "auto" }}>
        <div
          className="small muted"
          style={{
            border: "1px dashed var(--stroke-strong)",
            borderRadius: 8,
            padding: 10,
          }}
        >
          还没接入模型。接好之后这里可以问「第7—10周是否超负荷」这类问题，
          助手会读取当前计划给出调整建议，确认后才写入。
        </div>
        <textarea
          className="field"
          rows={5}
          value={question}
          placeholder="询问当前计划的问题…"
          onChange={(event) => setQuestion(event.target.value)}
        />
        <Button variant="primary" disabled>
          发送（待接入）
        </Button>
      </div>
    </div>
  );
}
