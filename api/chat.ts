import { generateText } from "ai";

const MODEL = "alibaba/qwen3.7-plus";
const FALLBACK_MODEL = "alibaba/qwen3.7-flash";

export const maxDuration = 60;

type ChatTurn = { role: "user" | "assistant"; content: string };

type RequestBody = {
  question?: string;
  snapshot?: unknown;
  history?: ChatTurn[];
};

const SYSTEM_PROMPT = `你是「P人大救星」，考研备考排程助手。只根据用户发来的计划快照回答，不要编造不存在的任务 id。

规则：
- 周期按周六到周五，起点以快照 calendar / origin 为准（默认 2026-09-12），事项日以 examDate 为准。
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

  const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
  const messages = [
    {
      role: "user" as const,
      content: `当前计划快照：\n${JSON.stringify(body.snapshot)}`,
    },
    ...history.map((turn) => ({
      role: turn.role,
      content: String(turn.content ?? "").slice(0, 4000),
    })),
    { role: "user" as const, content: question },
  ];

  try {
    const { text, model } = await runWithFallback(messages);
    const result = parseModelJson(text);
    if (!result) {
      return json({ error: "模型返回格式异常，请再试一次。" }, 502);
    }
    return json({ ...result, model });
  } catch (error) {
    console.error("P人大救星", error);
    const name = error instanceof Error ? error.name : "";
    const message = error instanceof Error ? error.message : "";
    if (name === "GatewayAuthenticationError" || /auth/i.test(message)) {
      return json(
        {
          error:
            "模型鉴权失败。请打开 Vercel 的 AI Gateway 并绑定支付方式以使用额度，或添加环境变量 AI_GATEWAY_API_KEY。",
        },
        502,
      );
    }
    if (/credit|billing|payment|402/i.test(message)) {
      return json(
        { error: "AI Gateway 额度不足。请在 Vercel 团队绑定支付方式以使用免费额度。" },
        402,
      );
    }
    if (/abort|timeout/i.test(message)) {
      return json({ error: "思考超时，请把问题再缩短一些。" }, 504);
    }
    return json({ error: "调用模型失败，请稍后重试。" }, 502);
  }
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function isQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /credit|billing|payment|402|403|quota|free tier|not have access/i.test(message);
}

async function runWithFallback(messages: Array<{ role: "user" | "assistant"; content: string }>) {
  try {
    const result = await generateText({
      model: MODEL,
      system: SYSTEM_PROMPT,
      messages,
      temperature: 0.3,
      maxOutputTokens: 1200,
      maxRetries: 1,
    });
    return { text: result.text, model: MODEL };
  } catch (error) {
    if (!isQuotaError(error)) throw error;
    const result = await generateText({
      model: FALLBACK_MODEL,
      system: SYSTEM_PROMPT,
      messages,
      temperature: 0.3,
      maxOutputTokens: 1200,
      maxRetries: 1,
    });
    return { text: result.text, model: FALLBACK_MODEL };
  }
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
