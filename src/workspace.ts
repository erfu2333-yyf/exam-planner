import { useEffect, useState } from "react";

export type Profile = {
  id: string;
  name: string;
};

const PROFILES_KEY = "exam-planner-profiles-v1";
const LEGACY_DATA_KEY = "exam-planner-data-v1";

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

export function useWorkspace() {
  const [profiles, setProfiles] = useState<Profile[]>(() => {
    migrateLegacyProfile();
    return readProfiles();
  });
  const [profile, setProfile] = useState<Profile | null>(() => {
    migrateLegacyProfile();
    const list = readProfiles();
    const fromUrl = readUrlProfileId();
    if (fromUrl) return list.find((item) => item.id === fromUrl) ?? null;
    return list[0] ?? null;
  });

  useEffect(() => {
    if (profile) setUrlProfileId(profile.id);
  }, [profile]);

  const create = (name: string) => {
    const next: Profile = { id: newProfileId(), name: name.slice(0, 12) };
    const list = [...readProfiles(), next];
    writeProfiles(list);
    setProfiles(list);
    setProfile(next);
  };

  const open = (id: string) => {
    const found = readProfiles().find((item) => item.id === id) ?? null;
    if (found) setProfile(found);
  };

  const leave = () => {
    setProfile(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("u");
    window.history.replaceState({}, "", url);
  };

  return { profile, profiles, create, open, leave };
}
