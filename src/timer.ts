import { useCallback, useEffect, useRef, useState } from "react";
import { snapActualHours } from "./progress";

export type ActiveTimer = {
  taskId: string;
  dateKey: string;
  running: boolean;
  elapsedMs: number;
  startedAt: number | null;
};

function storageKey(spaceId: string): string {
  return `exam-planner-timer:${spaceId}`;
}

function readTimer(spaceId: string | null): ActiveTimer | null {
  if (!spaceId) return null;
  try {
    const raw = localStorage.getItem(storageKey(spaceId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveTimer>;
    if (!parsed.taskId || !parsed.dateKey) return null;
    return {
      taskId: parsed.taskId,
      dateKey: parsed.dateKey,
      running: Boolean(parsed.running),
      elapsedMs: Math.max(0, Number(parsed.elapsedMs) || 0),
      startedAt: typeof parsed.startedAt === "number" ? parsed.startedAt : null,
    };
  } catch {
    return null;
  }
}

function writeTimer(spaceId: string | null, timer: ActiveTimer | null) {
  if (!spaceId) return;
  try {
    if (!timer) localStorage.removeItem(storageKey(spaceId));
    else localStorage.setItem(storageKey(spaceId), JSON.stringify(timer));
  } catch {
    // 存不下就只留在内存里
  }
}

export function timerElapsedMs(timer: ActiveTimer, now = Date.now()): number {
  const live = timer.running && timer.startedAt ? Math.max(0, now - timer.startedAt) : 0;
  return timer.elapsedMs + live;
}

export function timerHours(timer: ActiveTimer, now = Date.now()): number {
  return snapActualHours(timerElapsedMs(timer, now) / 3600000);
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hour = Math.floor(total / 3600);
  const minute = Math.floor((total % 3600) / 60);
  const second = total % 60;
  if (hour <= 0 && minute <= 0) return `${second}秒`;
  if (hour <= 0) return `${minute}分钟`;
  if (minute === 0) return `${hour}小时`;
  return `${hour}小时${minute}分钟`;
}

function pauseTimer(timer: ActiveTimer, now = Date.now()): ActiveTimer {
  return {
    taskId: timer.taskId,
    dateKey: timer.dateKey,
    running: false,
    elapsedMs: timerElapsedMs(timer, now),
    startedAt: null,
  };
}

export function correctTaskTimer(current:ActiveTimer, hours:number):ActiveTimer {
  return {...current,running:false,elapsedMs:Math.round(Math.max(0,hours)*3600000),startedAt:null};
}

export function useTaskTimer(spaceId: string | null) {
  const [timer, setTimer] = useState<ActiveTimer | null>(() => readTimer(spaceId));
  const [now, setNow] = useState(() => Date.now());
  const timerRef = useRef(timer);
  timerRef.current = timer;

  useEffect(() => {
    const next = readTimer(spaceId);
    setTimer(next);
    timerRef.current = next;
  }, [spaceId]);

  useEffect(() => {
    writeTimer(spaceId, timer);
  }, [spaceId, timer]);

  useEffect(() => {
    if (!timer?.running) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [timer?.running]);

  const snapshot = useCallback((at = Date.now()): ActiveTimer | null => {
    const current = timerRef.current;
    if (!current) return null;
    return {
      ...current,
      elapsedMs: timerElapsedMs(current, at),
      startedAt: current.running ? at : null,
    };
  }, []);

  const toggle = useCallback((taskId: string, dateKey: string, existingHours: number): ActiveTimer | null => {
    const at = Date.now();
    setNow(at);
    const current = timerRef.current;
    let paused: ActiveTimer | null = null;
    let next: ActiveTimer;

    if (current?.running) {
      paused = pauseTimer(current, at);
      if (current.taskId === taskId && current.dateKey === dateKey) {
        timerRef.current = paused;
        setTimer(paused);
        return paused;
      }
    }

    if (current && !current.running && current.taskId === taskId && current.dateKey === dateKey) {
      next = { ...current, running: true, startedAt: at };
    } else {
      const baseHours =
        paused && paused.taskId === taskId && paused.dateKey === dateKey
          ? paused.elapsedMs / 3600000
          : existingHours;
      next = {
        taskId,
        dateKey,
        running: true,
        elapsedMs: Math.round(Math.max(0, baseHours) * 3600000),
        startedAt: at,
      };
    }
    timerRef.current = next;
    setTimer(next);
    return paused;
  }, []);

  const syncHours = useCallback((taskId: string, dateKey: string, hours: number) => {
    const current = timerRef.current;
    if (!current || current.taskId !== taskId || current.dateKey !== dateKey) return;
    const next = correctTaskTimer(current,hours);
    timerRef.current = next;
    setTimer(next);
    writeTimer(spaceId,next);
  }, [spaceId]);

  const pause = useCallback(() => {
    const current=timerRef.current;
    if(!current)return null;
    const next=pauseTimer(current);
    timerRef.current=next;setTimer(next);writeTimer(spaceId,next);
    return next;
  },[spaceId]);

  const hoursOf = useCallback(
    (taskId: string, dateKey: string, fallback = 0) => {
      if (timer?.taskId === taskId && timer.dateKey === dateKey) return timerHours(timer, now);
      return fallback;
    },
    [timer, now],
  );

  return { timer, now, toggle, snapshot, syncHours, hoursOf, pause };
}
