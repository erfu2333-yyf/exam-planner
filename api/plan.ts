import { json } from "../lib/server/http";
import { getRedis, redisMissing } from "../lib/server/redis";
import { planKey, requireUser } from "../lib/server/session";

export async function GET(request: Request): Promise<Response> {
  const redis = getRedis();
  if (!redis) return redisMissing();
  const session = await requireUser(request);
  if (session instanceof Response) return session;
  const data = await redis.get(planKey(session.id));
  if (data == null) return json({ error: "还没有云端计划。" }, 404);
  return json(data);
}

export async function PUT(request: Request): Promise<Response> {
  const redis = getRedis();
  if (!redis) return redisMissing();
  const session = await requireUser(request);
  if (session instanceof Response) return session;
  let data: unknown;
  try {
    data = await request.json();
  } catch {
    return json({ error: "请求格式不对。" }, 400);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return json({ error: "计划格式不对。" }, 400);
  }
  const encoded = JSON.stringify(data);
  if (encoded.length > 1_500_000) return json({ error: "计划太大，没能上传。" }, 413);
  await redis.set(planKey(session.id), data);
  return json({ ok: true });
}
