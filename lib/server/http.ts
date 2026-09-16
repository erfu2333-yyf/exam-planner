export function json(payload: unknown, status = 200, extra?: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extra,
    },
  });
}

export function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const trimmed = part.trim();
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    if (trimmed.slice(0, index) === name) {
      return decodeURIComponent(trimmed.slice(index + 1));
    }
  }
  return null;
}

export function sessionCookie(token: string, maxAge: number): string {
  const secure = process.env.VERCEL === "1" ? "; Secure" : "";
  return `ep_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearSessionCookie(): string {
  const secure = process.env.VERCEL === "1" ? "; Secure" : "";
  return `ep_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`;
}
