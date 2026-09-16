import { json, readCookie } from "./http";
import { getRedis, redisMissing } from "./redis";

export const SESSION_TTL = 60 * 60 * 24 * 30;

export type CloudUser = {
  id: string;
  name: string;
  salt: string;
  passHash: string;
};

export type SessionValue = {
  id: string;
  name: string;
};

export function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

export function userKey(name: string): string {
  return `user:${nameKey(name)}`;
}

export function planKey(id: string): string {
  return `plan:${id}`;
}

export function sessKey(token: string): string {
  return `sess:${token}`;
}

export function publicUser(user: CloudUser): SessionValue {
  return { id: user.id, name: user.name };
}

export async function readUserByName(name: string): Promise<CloudUser | null> {
  const redis = getRedis();
  if (!redis) return null;
  const value = await redis.get<CloudUser>(userKey(name));
  if (!value || !value.id || !value.name || !value.salt || !value.passHash) return null;
  return value;
}

export async function readSession(request: Request): Promise<SessionValue | null> {
  const redis = getRedis();
  if (!redis) return null;
  const token = readCookie(request, "ep_session");
  if (!token) return null;
  const value = await redis.get<SessionValue>(sessKey(token));
  if (!value || !value.id || !value.name) return null;
  return value;
}

export async function requireUser(request: Request): Promise<SessionValue | Response> {
  if (!getRedis()) return redisMissing();
  const session = await readSession(request);
  if (!session) return json({ error: "请先登录。" }, 401);
  return session;
}
