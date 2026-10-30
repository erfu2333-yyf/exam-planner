import { spanWeeks, type Span, weekRangeLabel } from "../dateUtils";
import { MISC_LOAD_ID, weekLoad, weekTotal } from "../schedule";
import { colorOf, GRAY_ID } from "../theme";
import type { PlannerData } from "../types";
import { TodayLine } from "./GanttBar";

const BAR_AREA = 96;

export function LoadChart({
  data,
  span,
  weekFrom,
  weekTo,
}: {
  data: PlannerData;
  span: Span;
  weekFrom: number;
  weekTo: number;
}) {
  const totalWeeks = spanWeeks(span);
  const from = Math.max(0, Math.min(totalWeeks - 1, weekFrom));
  const to = Math.max(from, Math.min(totalWeeks - 1, weekTo));
  const weeks = Array.from({ length: to - from + 1 }, (_, index) => from + index);
  const totals = weeks.map((week) => weekTotal(data, week, span));
  const max = Math.max(data.studyReference?12:data.capacity, ...totals, 1);
  const ceiling=data.studyReference?12:data.capacity;

  return (
    <div style={{ position: "relative", height: 152, paddingTop: 20 }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 22 + (ceiling / max) * BAR_AREA,
          borderTop: "2px dashed var(--danger)",
          pointerEvents: "none",
          zIndex: 3,
        }}
      >
        <span
          className="small"
          style={{
            position: "absolute",
            right: 0,
            top: -17,
            color: "var(--danger)",
            background: "var(--surface)",
            padding: "0 4px",
          }}
        >
          {data.studyReference ? "12h 红线" : `每日可用 ${data.capacity}h`}
        </span>
      </div>

      {data.studyReference?<div style={{position:'absolute',left:0,right:0,bottom:22+(10/max)*BAR_AREA,borderTop:'1px dashed var(--accent)',pointerEvents:'none',zIndex:3}}><span className="small" style={{position:'absolute',left:0,top:-17,color:'var(--accent)',background:'var(--surface)',padding:'0 4px'}}>10h 理论</span></div>:null}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))`,
          gap: 5,
          height: "100%",
        }}
      >
        {weeks.map((week, index) => {
          const total = totals[index];
          const load = weekLoad(data, week, span);
          const over = total > ceiling;
          return (
            <div
              key={week}
              style={{ position: "relative", height: "100%", textAlign: "center" }}
              title={`第${week + 1}周 ${weekRangeLabel(week, span)} · 日均 ${total.toFixed(1)}h`}
            >
              <span
                className="small"
                style={{ position: "absolute", top: -18, left: 0, right: 0, fontWeight: 600 }}
              >
                第{week + 1}周
              </span>
              <div
                style={{
                  position: "absolute",
                  left: 2,
                  right: 2,
                  bottom: 22,
                  height: `${(total / max) * BAR_AREA}px`,
                  minHeight: 6,
                  display: "flex",
                  flexDirection: "column",
                  borderRadius: "5px 5px 0 0",
                  overflow: "hidden",
                }}
              >
                {data.subjects.map((subject) => {
                  const hours = load.get(subject.id) ?? 0;
                  if (hours <= 0) return null;
                  return (
                    <div
                      key={subject.id}
                      style={{
                        height: `${(hours / total) * 100}%`,
                        background: colorOf(subject.colorId),
                      }}
                    />
                  );
                })}
                {(load.get(MISC_LOAD_ID) ?? 0) > 0 ? (
                  <div
                    title="休息和其他清单事项"
                    style={{
                      height: `${((load.get(MISC_LOAD_ID) ?? 0) / total) * 100}%`,
                      background: colorOf(GRAY_ID),
                    }}
                  />
                ) : null}
                {(load.get('__existing__')??0)>0?<div style={{height:`${(load.get('__existing__')??0)/total*100}%`,background:'var(--text-3)'}} title="已有记录或未关联安排"/>:null}
              </div>
              <span
                className="small"
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  fontWeight: over ? 700 : 400,
                  color: over ? "var(--danger)" : "var(--text-2)",
                }}
              >
                {total.toFixed(1)}h
              </span>
            </div>
          );
        })}
      </div>
      <TodayLine span={span} weekFrom={from} weekTo={to} layout="weeks" />
    </div>
  );
}
