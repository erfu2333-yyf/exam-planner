import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { INITIAL_DATA } from "./data";
import { DEFAULT_EXAM_DATE } from "./dateUtils";
import type { DayMisc, PlannerData } from "./types";
import { dataKey } from "./workspace";

/**
 * 读写计划数据的接口。现在是按用户分 key 的 localStorage，
 * 之后接云端只需要换一个实现，界面代码不用动。
 */
export type Repository = {
  load: () => PlannerData;
  save: (data: PlannerData) => void;
};

function parsePlanner(raw: string | null): PlannerData {
  if (!raw) return INITIAL_DATA;
  try {
    const parsed = JSON.parse(raw) as Partial<PlannerData>;
    return {
      subjects: parsed.subjects ?? INITIAL_DATA.subjects,
      tasks: parsed.tasks ?? INITIAL_DATA.tasks,
      dayPlans: parsed.dayPlans ?? {},
      plannedHours: parsed.plannedHours ?? {},
      weekTexts: parsed.weekTexts ?? {},
      dayNotes: parsed.dayNotes ?? {},
      dayMiscs: normalizeMiscs(parsed.dayMiscs),
      eventName: parsed.eventName?.trim() || "考研",
      examDate: parsed.examDate ?? DEFAULT_EXAM_DATE,
      capacity: parsed.capacity ?? INITIAL_DATA.capacity,
    };
  } catch {
    return INITIAL_DATA;
  }
}

function normalizeMiscs(raw: PlannerData["dayMiscs"] | undefined): Record<string, DayMisc[]> {
  if (!raw) return {};
  const leftover = new Set(["取快递", "寄材料"]);
  const result: Record<string, DayMisc[]> = {};
  for (const [dateKey, items] of Object.entries(raw)) {
    const kept = items.filter((item) => {
      const name = item.name?.trim() ?? "";
      if (!name || leftover.has(name)) return false;
      return typeof item.start === "number" && typeof item.end === "number";
    });
    if (kept.length > 0) result[dateKey] = kept;
  }
  return result;
}

export function createRepository(spaceId: string): Repository {
  const key = dataKey(spaceId);
  return {
    load() {
      return parsePlanner(localStorage.getItem(key));
    },
    save(data) {
      try {
        localStorage.setItem(key, JSON.stringify(data));
      } catch {
        // 配额写满时静默失败，不阻断交互
      }
    },
  };
}

const HISTORY_LIMIT = 30;

export function usePlanner(spaceId: string | null) {
  const repository = useMemo(
    () => (spaceId ? createRepository(spaceId) : null),
    [spaceId],
  );
  const [data, setData] = useState<PlannerData>(() =>
    repository ? repository.load() : INITIAL_DATA,
  );
  const [history, setHistory] = useState<PlannerData[]>([]);
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    setData(repository ? repository.load() : INITIAL_DATA);
    setHistory([]);
  }, [repository]);

  useEffect(() => {
    if (!repository) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => repository.save(data), 250);
    return () => window.clearTimeout(saveTimer.current);
  }, [data, repository]);

  const commit = useCallback((next: (current: PlannerData) => PlannerData) => {
    setData((current) => {
      setHistory((stack) => [...stack.slice(-(HISTORY_LIMIT - 1)), current]);
      return next(current);
    });
  }, []);

  const update = useCallback((next: (current: PlannerData) => PlannerData) => {
    setData(next);
  }, []);

  const undo = useCallback(() => {
    setHistory((stack) => {
      if (stack.length === 0) return stack;
      setData(stack[stack.length - 1]);
      return stack.slice(0, -1);
    });
  }, []);

  return { data, commit, update, undo, canUndo: history.length > 0 };
}
