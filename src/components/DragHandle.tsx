import type { PointerEvent } from "react";

export function DragHandle({
  onPointerDown,
  title = "按住上下拖动，调整这条二级任务的顺序",
}: {
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onPointerDown={onPointerDown}
      style={{
        flexShrink: 0,
        width: 18,
        height: 28,
        border: "none",
        borderRadius: 5,
        background: "transparent",
        color: "var(--text-3)",
        cursor: "grab",
        letterSpacing: -2,
        fontSize: 13,
        lineHeight: "28px",
        padding: 0,
      }}
    >
      ⋮⋮
    </button>
  );
}
