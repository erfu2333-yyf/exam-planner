const MODEL = "spacexai/grok-4.6";
const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";

export const maxDuration = 60;

type ChatTurn = { role: "user" | "assistant"; content: string };

type RequestBody = {
  question?: string;
  snapshot?: unknown;
  history?: ChatTurn[];
};

const SYSTEM_PROMPT = `你是「P人大救星」，考研备考排程助手。只根据用户发来的计划快照回答，不要编造不存在的任务 id。

规则：
- 周期按周六到周五，共 14 周，起点 2026-09-12，考试 2026-12-19。
- weeks[].hours 是该周「每天平均任务量」；超过 capacity 就是超负荷。
- 用中文，简洁、具体，先给结论再给理由。
- 只建议改日均用时、起止日期、每日可用时长或学法。不要建议删科目。
- 改动必须可执行：taskId 必须来自快照，dailyHours 取 0.5 的倍数，日期用 yyyy-mm-dd。
- 没有必要时 suggestions 给空数组。用户没要求改计划时不要硬给建议。

只输出 JSON，不要 Markdown，结构如下：
{
  "reply": "给用户看的中文回答",
  "suggestions": [
    {
      "title": "短标题",
      "reason": "为什么改",
      "action": { "type": "setDailyHours", "taskId": "vocab", "dailyHours": 0.8 }
    }
  ]
}
action.type 只能是 setDailyHours | setTaskDates | setCapacity | setMethod。
setTaskDates 可含 startDate、endDate。setCapacity 含 capacity。setMethod 含 method。`;

export async function POST(request: Request): Promise<Response> {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return json({ error: "请求格式不对。" }, 400);
  }

  const question = String(body.question ?? "").trim().slice(0, 2000);
  if (!question) return json({ error: "请先输入问题。" }, 400);
  if (!body.snapshot) return json({ error: "缺少当前计划。" }, 400);

  const token = process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim();
  if (!token) {
    return json(
      {
        error:
          "还没配好模型密钥。请在 Vercel 项目里打开 AI Gateway，或添加环境变量 AI_GATEWAY_API_KEY。",
      },
      503,
    );
  }

  const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `当前计划快照：\n${JSON.stringify(body.snapshot)}`,
    },
    ...history.map((turn) => ({
      role: turn.role,
      content: String(turn.content ?? "").slice(0, 4000),
    })),
    { role: "user", content: question },
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 50_000);

  try {
    const response = await fetch(GATEWAY_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        max_tokens: 1200,
        stream: false,
        reasoning: { effort: "low" },
        response_format: { type: "json_object" },
        messages,
      }),
    });

    const raw = await response.text();
    if (!response.ok) {
      console.error("AI Gateway error", response.status, raw.slice(0, 800));
      return json({ error: gatewayHint(response.status, raw) }, 502);
    }

    const parsed = JSON.parse(raw) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = parsed.choices?.[0]?.message?.content ?? "";
    const result = parseModelJson(content);
    if (!result) {
      return json({ error: "模型返回格式异常，请再试一次。" }, 502);
    }
    return json(result);
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return json({ error: aborted ? "思考超时，请把问题再缩短一些。" : "调用模型失败，请稍后重试。" }, 504);
  } finally {
    clearTimeout(timer);
  }
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function gatewayHint(status: number, raw: string): string {
  const lower = raw.toLowerCase();
  if (status === 401 || status === 403) {
    return "模型鉴权失败。请在 Vercel 的 AI Gateway 开通额度，或配置 AI_GATEWAY_API_KEY。";
  }
  if (status === 402 || lower.includes("credit") || lower.includes("billing")) {
    return "AI Gateway 额度不足。请在 Vercel 团队绑定支付方式以使用免费额度。";
  }
  if (status === 429) return "提问太频繁，请稍等再试。";
  return "模型暂时不可用，请稍后再试。";
}

function parseModelJson(content: string): { reply: string; suggestions: unknown[] } | null {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = fenced?.[1] ?? trimmed;
  try {
    const data = JSON.parse(text) as { reply?: unknown; suggestions?: unknown };
    const reply = String(data.reply ?? "").trim();
    if (!reply) return null;
    return {
      reply,
      suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
    };
  } catch {
    return { reply: trimmed, suggestions: [] };
  }
}
