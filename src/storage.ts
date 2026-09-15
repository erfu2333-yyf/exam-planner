import { useCallback, useEffect, useRef, useState } from "react";
import { INITIAL_DATA } from "./data";
import type { PlannerData } from "./types";

const STORAGE_KEY = "exam-planner-data-v1";

/**
 * 读写计划数据的接口。现在是 localStorage 实现，
 * 之后接 Supabase 只需要换一个实现，界面代码不用动。
 */
export type Repository = {
  load: () => PlannerData;
  save: (data: PlannerData) => void;
};

export const localRepository: Repository = {
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return INITIAL_DATA;
      const parsed = JSON.parse(raw) as Partial<PlannerData>;
      // 逐字段兜底，避免旧数据缺字段时整个界面崩掉
      return {
        subjects: parsed.subjects ?? INITIAL_DATA.subjects,
        tasks: parsed.tasks ?? INITIAL_DATA.tasks,
        dayPlans: parsed.dayPlans ?? {},
        plannedHours: parsed.plannedHours ?? {},
        weekTexts: parsed.weekTexts ?? {},
        capacity: parsed.capacity ?? INITIAL_DATA.capacity,
      };
    } catch {
      return INITIAL_DATA;
    }
  },
  save(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // 配额写满时静默失败，不阻断交互
    }
  },
};

const HISTORY_LIMIT = 30;

export function usePlanner(repository: Repository = localRepository) {
  const [data, setData] = useState<PlannerData>(() => repository.load());
  const [history, setHistory] = useState<PlannerData[]>([]);
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => repository.save(data), 250);
    return () => window.clearTimeout(saveTimer.current);
  }, [data, repository]);

  /** 会改变结构的操作走这里，可撤销 */
  const commit = useCallback((next: (current: PlannerData) => PlannerData) => {
    setData((current) => {
      setHistory((stack) => [...stack.slice(-(HISTORY_LIMIT - 1)), current]);
      return next(current);
    });
  }, []);

  /** 输入框这类高频改动走这里，不进撤销栈 */
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

  const reset = useCallback(() => {
    commit(() => INITIAL_DATA);
  }, [commit]);

  return { data, commit, update, undo, reset, canUndo: history.length > 0 };
}
