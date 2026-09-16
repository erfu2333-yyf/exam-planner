import type { PlannerData } from "./types";

export type CloudProfile = {
  id: string;
  name: string;
};

export type CloudProbe =
  | { status: "off" }
  | { status: "missing"; message: string }
  | { status: "guest" }
  | { status: "user"; profile: CloudProfile };

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) return null;
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function errorMessage(payload: Record<string, unknown> | null, fallback: string): string {
  const error = payload?.error;
  return typeof error === "string" && error.trim() ? error : fallback;
}

export async function probeCloud(): Promise<CloudProbe> {
  try {
    const response = await fetch("/api/auth", { credentials: "include" });
    const payload = await readJson(response);
    if (!payload) return { status: "off" };
    if (response.status === 503) {
      return { status: "missing", message: errorMessage(payload, "云存储还没配好。") };
    }
    if (response.status === 401) return { status: "guest" };
    if (!response.ok) return { status: "off" };
    const id = String(payload.id ?? "");
    const name = String(payload.name ?? "");
    if (!id || !name) return { status: "guest" };
    return { status: "user", profile: { id, name } };
  } catch {
    return { status: "off" };
  }
}

export async function cloudAuth(
  action: "login" | "register" | "logout" | "setPass",
  fields: { name?: string; passphrase?: string } = {},
): Promise<CloudProfile | null> {
  const response = await fetch("/api/auth", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...fields }),
  });
  const payload = await readJson(response);
  if (!payload || !response.ok) throw new Error(errorMessage(payload, "没打开"));
  if (action === "logout") return null;
  const id = String(payload.id ?? "");
  const name = String(payload.name ?? "");
  if (!id || !name) throw new Error("登录结果不完整");
  return { id, name };
}

export async function getCloudPlan(): Promise<PlannerData | null> {
  const response = await fetch("/api/plan", { credentials: "include" });
  if (response.status === 404) return null;
  const payload = await readJson(response);
  if (!payload || !response.ok) throw new Error(errorMessage(payload, "没能读取云端计划"));
  return payload as PlannerData;
}

export async function putCloudPlan(data: PlannerData): Promise<boolean> {
  try {
    const response = await fetch("/api/plan", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return response.ok;
  } catch {
    return false;
  }
}
