import { useRef } from "react";
import {
  dayIndex,
  keyFromIndex,
  phaseWeeks,
  type Span,
  todayLinePercent,
  weekEndKey,
  weekStartKey,
} from "../dateUtils";
import { gradientOf } from "../theme";
import type { Task } from "../types";

type DragMode = "move" | "start" | "end";

export function PhaseLines({
  weekFrom,
  weekTo,
}: {
  span?: Span;
  weekFrom: number;
  weekTo: number;
}) {
  const visible = weekTo - weekFrom + 1;
  return (
    <>
      {phaseWeeks(weekTo + 1)
        .filter((week) => week > weekFrom && week <= weekTo)
        .map((week) => (
          <div
            key={week}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${((week - weekFrom) / visible) * 100}%`,
              borderLeft: "2px solid var(--stroke-strong)",
              pointerEvents: "none",
              zIndex: 2,
            }}
          />
        ))}
    </>
  );
}

export function WeekGridLines({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, week) => (
        <div
          key={week}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${(week / count) * 100}%`,
            borderLeft: "1px solid var(--stroke)",
            pointerEvents: "none",
          }}
        />
      ))}
    </>
  );
}

export function TodayLine({
  span,
  weekFrom,
  weekTo,
}: {
  span: Span;
  weekFrom: number;
  weekTo: number;
}) {
  const percent = todayLinePercent(span, weekFrom, weekTo);
  if (percent == null) return null;
  return (
    <div
      title="今天"
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: `${percent}%`,
        borderLeft: "2px dashed var(--accent)",
        pointerEvents: "none",
        zIndex: 5,
      }}
    />
  );
}

/** 甘特表头上方单独一行，把「今天」标在竖线位置，避免和周次数字叠在一起 */
export function TodayCaption({
  span,
  weekFrom,
  weekTo,
}: {
  span: Span;
  weekFrom: number;
  weekTo: number;
}) {
  const percent = todayLinePercent(span, weekFrom, weekTo);
  if (percent == null) return <div style={{ height: 28 }} />;
  return (
    <div style={{ position: "relative", height: 28 }}>
      <div
        style={{
          position: "absolute",
          top: 22,
          bottom: 0,
          left: `${percent}%`,
          borderLeft: "2px dashed var(--accent)",
          pointerEvents: "none",
        }}
      />
      <span
        className="small"
        style={{
          position: "absolute",
          top: 4,
          left: `${percent}%`,
          transform: "translateX(-50%)",
          fontWeight: 700,
          color: "#fff",
          background: "var(--accent)",
          padding: "0 8px",
          borderRadius: 10,
          lineHeight: "20px",
          whiteSpace: "nowrap",
          zIndex: 6,
        }}
      >
        今天
      </span>
    </div>
  );
}

export function GanttBar({
  task,
  span,
  weekFrom,
  weekTo,
  selected,
  onSelect,
  onDragStart,
  onDragMove,
}: {
  task: Task;
  span: Span;
  weekFrom: number;
  weekTo: number;
  selected: boolean;
  onSelect: () => void;
  onDragStart: () => void;
  onDragMove: (startDate: string, endDate: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ mode: DragMode; grabOffset: number } | null>(null);
  const rangeStart = weekStartKey(weekFrom, span.origin);
  const rangeLast = weekEndKey(weekTo, span);
  const rangeDays = Math.max(1, dayIndex(rangeLast, rangeStart) + 1);
  const startIndex = dayIndex(task.startDate, span.origin);
  const endIndex = dayIndex(task.endDate, span.origin);
  const visStart = dayIndex(rangeStart, span.origin);
  const left = (dayIndex(task.startDate, rangeStart) / rangeDays) * 100;
  const width = ((endIndex - startIndex + 1) / rangeDays) * 100;
  const weekCount = weekTo - weekFrom + 1;
  const totalDays = dayIndex(span.examDate, span.origin) + 1;

  const indexFromClientX = (clientX: number): number => {
    const track = trackRef.current;
    if (!track) return startIndex;
    const rect = track.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    return visStart + Math.round(ratio * rangeDays);
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
    const clamp = (value: number) => Math.max(0, Math.min(totalDays - 1, value));

    if (drag.mode === "move") {
      const taskSpan = endIndex - startIndex;
      const nextStart = clamp(Math.min(pointerIndex - drag.grabOffset, totalDays - 1 - taskSpan));
      onDragMove(keyFromIndex(nextStart, span.origin), keyFromIndex(nextStart + taskSpan, span.origin));
      return;
    }
    if (drag.mode === "start") {
      const nextStart = clamp(Math.min(pointerIndex, endIndex));
      onDragMove(keyFromIndex(nextStart, span.origin), task.endDate);
      return;
    }
    const nextEnd = clamp(Math.max(pointerIndex, startIndex));
    onDragMove(task.startDate, keyFromIndex(nextEnd, span.origin));
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
        height: "100%",
        background: "var(--surface-2)",
        overflow: "hidden",
      }}
    >
      <WeekGridLines count={weekCount} />
      <div
        onPointerDown={begin("move")}
        onPointerMove={move}
        onPointerUp={end}
        title={`${task.name} ${task.startDate} → ${task.endDate}（拖动整条移动，拖两端改起止）`}
        style={{
          position: "absolute",
          left: `${left}%`,
          width: `${Math.max(width, 0.8)}%`,
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
      <PhaseLines weekFrom={weekFrom} weekTo={weekTo} />
      <TodayLine span={span} weekFrom={weekFrom} weekTo={weekTo} />
    </div>
  );
}
