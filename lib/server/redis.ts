import { Redis } from "@upstash/redis";

const URL_KEYS = [
  "UPSTASH_REDIS_REST_URL",
  "KV_REST_API_URL",
  "STORAGE_KV_REST_API_URL",
  "STORAGE_UPSTASH_REDIS_REST_URL",
  "STORAGE_REST_URL",
  "STORAGE_URL",
];

const TOKEN_KEYS = [
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_TOKEN",
  "STORAGE_KV_REST_API_TOKEN",
  "STORAGE_UPSTASH_REDIS_REST_TOKEN",
  "STORAGE_TOKEN",
  "STORAGE_REST_TOKEN",
];

let cached: Redis | null | undefined;

function firstHttps(keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value?.startsWith("https://")) return value;
  }
  return undefined;
}

function firstValue(keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function getRedis(): Redis | null {
  if (cached !== undefined) return cached;
  const url = firstHttps(URL_KEYS);
  const token = firstValue(TOKEN_KEYS);
  cached = url && token ? new Redis({ url, token }) : null;
  return cached;
}

export function redisMissing(): Response {
  return new Response(
    JSON.stringify({ error: "云存储还没配好。请在 Vercel 给这个项目接上 Redis。" }),
    {
      status: 503,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    },
  );
}
