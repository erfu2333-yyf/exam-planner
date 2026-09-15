import { useRef } from "react";
import { PHASE_AFTER_WEEKS, TOTAL_DAYS, TOTAL_WEEKS, dayIndex, keyFromIndex } from "../dateUtils";
import { gradientOf } from "../theme";
import type { Task } from "../types";

type DragMode = "move" | "start" | "end";

export function PhaseLines() {
  return (
    <>
      {PHASE_AFTER_WEEKS.map((week) => (
        <div
          key={week}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${(week / TOTAL_WEEKS) * 100}%`,
            borderLeft: "2px solid var(--stroke-strong)",
            pointerEvents: "none",
            zIndex: 2,
          }}
        />
      ))}
    </>
  );
}

export function WeekGridLines() {
  return (
    <>
      {Array.from({ length: TOTAL_WEEKS }, (_, week) => (
        <div
          key={week}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${(week / TOTAL_WEEKS) * 100}%`,
            borderLeft: "1px solid var(--stroke)",
            pointerEvents: "none",
          }}
        />
      ))}
    </>
  );
}

export function GanttBar({
  task,
  selected,
  onSelect,
  onDragStart,
  onDragMove,
}: {
  task: Task;
  selected: boolean;
  onSelect: () => void;
  /** 拖动开始时记一次快照，便于撤销 */
  onDragStart: () => void;
  onDragMove: (startDate: string, endDate: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ mode: DragMode; grabOffset: number } | null>(null);

  const startIndex = dayIndex(task.startDate);
  const endIndex = dayIndex(task.endDate);
  const left = (startIndex / TOTAL_DAYS) * 100;
  const width = ((endIndex - startIndex + 1) / TOTAL_DAYS) * 100;

  const indexFromClientX = (clientX: number): number => {
    const track = trackRef.current;
    if (!track) return startIndex;
    const rect = track.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    return Math.round(ratio * TOTAL_DAYS);
  };

  const begin = (mode: DragMode) => (event: React.PointerEvent) => {
    event.stopPropagation();
    event.preventDefault();
    onSelect();
    onDragStart();
    dragRef.current = {
      mode,
      grabOffset: indexFromClientX(event.clientX) - startIndex,
    };
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      // 合成指针事件没有真实 pointerId，忽略即可
    }
  };

  const move = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const pointerIndex = indexFromClientX(event.clientX);
    const clamp = (value: number) => Math.max(0, Math.min(TOTAL_DAYS - 1, value));

    if (drag.mode === "move") {
      const span = endIndex - startIndex;
      const nextStart = clamp(Math.min(pointerIndex - drag.grabOffset, TOTAL_DAYS - 1 - span));
      onDragMove(keyFromIndex(nextStart), keyFromIndex(nextStart + span));
      return;
    }
    if (drag.mode === "start") {
      const nextStart = clamp(Math.min(pointerIndex, endIndex));
      onDragMove(keyFromIndex(nextStart), task.endDate);
      return;
    }
    const nextEnd = clamp(Math.max(pointerIndex, startIndex));
    onDragMove(task.startDate, keyFromIndex(nextEnd));
  };

  const end = (event: React.PointerEvent) => {
    dragRef.current = null;
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
  };

  return (
    <div
      ref={trackRef}
      style={{
        position: "relative",
        minHeight: 36,
        background: "var(--surface-2)",
      }}
    >
      <WeekGridLines />
      <div
        onPointerDown={begin("move")}
        onPointerMove={move}
        onPointerUp={end}
        title={`${task.name} ${task.startDate} → ${task.endDate}（拖动整条移动，拖两端改起止）`}
        style={{
          position: "absolute",
          left: `${left}%`,
          width: `${width}%`,
          top: 8,
          height: 20,
          borderRadius: 6,
          background: gradientOf(task.colorId),
          outline: selected ? "2px solid var(--accent)" : "none",
          outlineOffset: 1,
          cursor: "grab",
          touchAction: "none",
          zIndex: 3,
        }}
      >
        <div
          onPointerDown={begin("start")}
          onPointerMove={move}
          onPointerUp={end}
          title="拖动调整开始日期"
          style={{
            position: "absolute",
            left: -3,
            top: 0,
            bottom: 0,
            width: 8,
            cursor: "ew-resize",
            touchAction: "none",
          }}
        />
        <div
          onPointerDown={begin("end")}
          onPointerMove={move}
          onPointerUp={end}
          title="拖动调整结束日期"
          style={{
            position: "absolute",
            right: -3,
            top: 0,
            bottom: 0,
            width: 8,
            cursor: "ew-resize",
            touchAction: "none",
          }}
        />
      </div>
      <PhaseLines />
    </div>
  );
}
