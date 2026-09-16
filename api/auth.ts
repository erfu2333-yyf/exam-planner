import { hashPass, newProfileId, passMatches, randomSalt, randomToken } from "../lib/server/crypto";
import { clearSessionCookie, json, readCookie, sessionCookie } from "../lib/server/http";
import { getRedis, redisMissing } from "../lib/server/redis";
import {
  SESSION_TTL,
  publicUser,
  readSession,
  readUserByName,
  sessKey,
  userKey,
  type CloudUser,
} from "../lib/server/session";

type Body = {
  action?: string;
  name?: string;
  passphrase?: string;
};

export async function GET(request: Request): Promise<Response> {
  if (!getRedis()) return redisMissing();
  const session = await readSession(request);
  if (!session) return json({ error: "请先登录。" }, 401);
  return json(session);
}

export async function POST(request: Request): Promise<Response> {
  const redis = getRedis();
  if (!redis) return redisMissing();

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return json({ error: "请求格式不对。" }, 400);
  }

  const action = String(body.action ?? "").trim();
  if (action === "logout") {
    const token = readCookie(request, "ep_session");
    if (token) await redis.del(sessKey(token));
    return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
  }

  if (action === "login") {
    const name = String(body.name ?? "").trim();
    const passphrase = String(body.passphrase ?? "");
    if (!name || !passphrase) return json({ error: "请填写用户名和口令。" }, 400);
    const user = await readUserByName(name);
    if (!user || !passMatches(passphrase, user.salt, user.passHash)) {
      return json({ error: "用户名或口令不对。" }, 401);
    }
    return issueSession(user);
  }

  if (action === "register") {
    const name = String(body.name ?? "").trim().slice(0, 16);
    const passphrase = String(body.passphrase ?? "");
    if (!name) return json({ error: "请填写用户名" }, 400);
    if (passphrase.length < 4) return json({ error: "口令至少 4 个字符" }, 400);
    if (passphrase.length > 128) return json({ error: "口令太长" }, 400);
    const existing = await readUserByName(name);
    if (existing) return json({ error: "这个用户名已经有了" }, 409);
    const salt = randomSalt();
    const user: CloudUser = {
      id: newProfileId(),
      name,
      salt,
      passHash: hashPass(passphrase, salt),
    };
    const created = await redis.set(userKey(name), user, { nx: true });
    if (created === null) return json({ error: "这个用户名已经有了" }, 409);
    return issueSession(user);
  }

  if (action === "setPass") {
    const session = await readSession(request);
    if (!session) return json({ error: "请先登录。" }, 401);
    const passphrase = String(body.passphrase ?? "");
    if (passphrase.length < 4) return json({ error: "口令至少 4 个字符" }, 400);
    if (passphrase.length > 128) return json({ error: "口令太长" }, 400);
    const user = await readUserByName(session.name);
    if (!user) return json({ error: "找不到这个用户" }, 404);
    const salt = randomSalt();
    const next: CloudUser = { ...user, salt, passHash: hashPass(passphrase, salt) };
    await redis.set(userKey(user.name), next);
    return json(publicUser(next));
  }

  return json({ error: "未知操作。" }, 400);
}

async function issueSession(user: CloudUser): Promise<Response> {
  const redis = getRedis();
  if (!redis) return redisMissing();
  const token = randomToken();
  await redis.set(sessKey(token), publicUser(user), { ex: SESSION_TTL });
  return json(publicUser(user), 200, { "Set-Cookie": sessionCookie(token, SESSION_TTL) });
}
