import { useEffect, useState } from "react";
import { cloudAuth, getCloudPlan, probeCloud, putCloudPlan, type CloudProfile } from "./cloud";
import { INITIAL_DATA } from "./data";
import type { PlannerData } from "./types";

export type Profile = {
  id: string;
  name: string;
  salt?: string;
  passHash?: string;
  cloud?: boolean;
};

const PROFILES_KEY = "exam-planner-profiles-v1";
const LEGACY_DATA_KEY = "exam-planner-data-v1";
const SESSION_PREFIX = "exam-planner-unlocked:";

export function dataKey(id: string): string {
  return `${LEGACY_DATA_KEY}:${id}`;
}

export function newProfileId(): string {
  return `p${Math.random().toString(36).slice(2, 8)}`;
}

export function readProfiles(): Profile[] {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Profile[];
    return parsed.filter((item) => item?.id && item?.name);
  } catch {
    return [];
  }
}

export function writeProfiles(profiles: Profile[]) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

export function readUrlProfileId(): string | null {
  const value = new URLSearchParams(window.location.search).get("u");
  if (!value || !/^[a-zA-Z0-9_-]{2,24}$/.test(value)) return null;
  return value;
}

export function setUrlProfileId(id: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("u", id);
  window.history.replaceState({}, "", url);
}

export function siteHomeUrl(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

export function profileNeedsPass(profile: Profile): boolean {
  if (profile.cloud) return true;
  return Boolean(profile.salt && profile.passHash);
}

function sessionKey(id: string): string {
  return `${SESSION_PREFIX}${id}`;
}

export function isUnlocked(id: string): boolean {
  try {
    return sessionStorage.getItem(sessionKey(id)) === "1";
  } catch {
    return false;
  }
}

export function markUnlocked(id: string) {
  try {
    sessionStorage.setItem(sessionKey(id), "1");
  } catch {
    // 无痕模式可能写不了 sessionStorage，本次仍可进入
  }
}

export function markLocked(id: string) {
  try {
    sessionStorage.removeItem(sessionKey(id));
  } catch {
    // ignore
  }
}

function randomSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function hashPass(passphrase: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${passphrase}`);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function makePassRecord(passphrase: string): Promise<{ salt: string; passHash: string }> {
  const salt = randomSalt();
  return { salt, passHash: await hashPass(passphrase, salt) };
}

export async function verifyPass(profile: Profile, passphrase: string): Promise<boolean> {
  if (!profile.salt || !profile.passHash) return passphrase === "";
  return (await hashPass(passphrase, profile.salt)) === profile.passHash;
}

/** 把旧版单份数据迁到第一个本地档案，避免更新后计划丢失 */
export function migrateLegacyProfile(): Profile | null {
  const existing = readProfiles();
  if (existing.length > 0) return null;
  const legacy = localStorage.getItem(LEGACY_DATA_KEY);
  if (!legacy) return null;
  const profile: Profile = { id: newProfileId(), name: "我的计划" };
  localStorage.setItem(dataKey(profile.id), legacy);
  writeProfiles([profile]);
  return profile;
}

function initialLocalProfile(): Profile | null {
  migrateLegacyProfile();
  const list = readProfiles();
  const fromUrl = readUrlProfileId();
  const candidate = fromUrl ? (list.find((item) => item.id === fromUrl) ?? null) : (list[0] ?? null);
  if (!candidate) return null;
  if (!profileNeedsPass(candidate) || isUnlocked(candidate.id)) return candidate;
  return null;
}

function rememberCloudProfile(profile: CloudProfile) {
  const current = readProfiles();
  const next = current.some((item) => item.id === profile.id)
    ? current.map((item) => (item.id === profile.id ? { ...item, name: profile.name, cloud: true } : item))
    : [...current, { id: profile.id, name: profile.name, cloud: true }];
  writeProfiles(next);
  return next;
}

function localSeed(name: string): PlannerData | null {
  const profiles = readProfiles();
  const match = profiles.find(
    (item) => item.name.trim().toLowerCase() === name.trim().toLowerCase(),
  );
  const picked = match ?? (profiles.length === 1 ? profiles[0] : null);
  if (!picked) return null;
  const raw = localStorage.getItem(dataKey(picked.id));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PlannerData;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function useWorkspace() {
  const [profiles, setProfiles] = useState<Profile[]>(() => {
    migrateLegacyProfile();
    return readProfiles();
  });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [cloudAvailable, setCloudAvailable] = useState(false);
  const [cloudMessage, setCloudMessage] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const probe = await probeCloud();
      if (cancelled) return;
      if (probe.status === "user") {
        const list = rememberCloudProfile(probe.profile);
        setProfiles(list);
        markUnlocked(probe.profile.id);
        setProfile({ ...probe.profile, cloud: true });
        setCloudAvailable(true);
      } else if (probe.status === "guest") {
        setCloudAvailable(true);
      } else if (probe.status === "missing") {
        setCloudMessage(probe.message);
        setProfile(initialLocalProfile());
      } else {
        setProfile(initialLocalProfile());
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (profile) setUrlProfileId(profile.id);
  }, [profile]);

  const create = async (name: string, passphrase: string) => {
    const trimmed = name.trim().slice(0, 16);
    if (!trimmed) throw new Error("请填写用户名");
    if (passphrase.length < 4) throw new Error("口令至少 4 个字符");
    if (cloudAvailable) {
      const created = await cloudAuth("register", { name: trimmed, passphrase });
      if (!created) throw new Error("没注册成");
      const seed = localSeed(trimmed) ?? INITIAL_DATA;
      const remote = await getCloudPlan();
      if (!remote) await putCloudPlan(seed);
      localStorage.setItem(dataKey(created.id), JSON.stringify(remote ?? seed));
      const list = rememberCloudProfile(created);
      setProfiles(list);
      markUnlocked(created.id);
      setProfile({ ...created, cloud: true });
      return;
    }
    const taken = readProfiles().some(
      (item) => item.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (taken) throw new Error("这个用户名已经有了");
    const pass = await makePassRecord(passphrase);
    const next: Profile = { id: newProfileId(), name: trimmed, ...pass };
    const list = [...readProfiles(), next];
    writeProfiles(list);
    setProfiles(list);
    markUnlocked(next.id);
    setProfile(next);
  };

  const unlock = async (idOrName: string, passphrase: string) => {
    if (cloudAvailable) {
      const found = readProfiles().find((item) => item.id === idOrName);
      const name = found?.name ?? idOrName;
      const opened = await cloudAuth("login", { name, passphrase });
      if (!opened) throw new Error("没打开");
      const list = rememberCloudProfile(opened);
      setProfiles(list);
      markUnlocked(opened.id);
      setProfile({ ...opened, cloud: true });
      return;
    }
    const found = readProfiles().find((item) => item.id === idOrName || item.name === idOrName);
    if (!found) throw new Error("找不到这个用户");
    if (profileNeedsPass(found)) {
      const ok = await verifyPass(found, passphrase);
      if (!ok) throw new Error("口令不对");
    }
    markUnlocked(found.id);
    setProfile(found);
  };

  const setPassphrase = async (id: string, passphrase: string) => {
    if (passphrase.length < 4) throw new Error("口令至少 4 个字符");
    if (profile?.cloud) {
      await cloudAuth("setPass", { passphrase });
      return;
    }
    const pass = await makePassRecord(passphrase);
    const list = readProfiles().map((item) => (item.id === id ? { ...item, ...pass } : item));
    writeProfiles(list);
    setProfiles(list);
    setProfile((current) => (current?.id === id ? { ...current, ...pass } : current));
    markUnlocked(id);
  };

  const leave = async () => {
    if (profile?.cloud) {
      try {
        await cloudAuth("logout");
      } catch {
        // 清本地会话即可
      }
    }
    if (profile) markLocked(profile.id);
    setProfile(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("u");
    window.history.replaceState({}, "", url);
  };

  return {
    profile,
    profiles,
    ready,
    cloudAvailable,
    cloudMessage,
    create,
    unlock,
    setPassphrase,
    leave,
  };
}