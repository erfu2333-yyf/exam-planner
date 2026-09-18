import { generateText } from "ai";

const MODEL = "alibaba/qwen3.7-plus";
const FALLBACK_MODEL = "alibaba/qwen3.7-flash";

export const maxDuration = 60;

type RequestBody = {
  text?: string;
  context?: {
    date?: string;
  };
};

const SYSTEM_PROMPT = `你把用户随口写的「今天要做的事」整理成当天执行清单。只输出 JSON，不要 Markdown。

规则：
- 只要任务名和时长。不要科目、日期、学法长文。
- 用户没提到的事不要发明。
- hours 必须是 0.5 的倍数；没说时长时默认 1。
- slot 仅当用户明确说上午/下午/晚上时填写：morning / afternoon / evening。没说就省略。
- gray 仅当用户明确要求这项用灰色时为 true。不要主动用灰色，也不要把「灰色」写进任务名（除非那就是事项名）。
- 不要输出总览任务、跨天计划或其他颜色。

结构：
{
  "note": "给用户看的一两句说明，可空",
  "items": [
    { "name": "单词", "hours": 1, "slot": "morning", "gray": false }
  ]
}`;

export async function POST(request: Request): Promise<Response> {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return json({ error: "请求格式不对。" }, 400);
  }

  const text = String(body.text ?? "").trim().slice(0, 2000);
  if (!text) return json({ error: "请先写今天要做的事。" }, 400);

  const prompt = [
    `当天日期 ${body.context?.date ?? ""}`,
    "",
    "请整理下面这段话，变成今天的执行清单：",
    text,
  ].join("\n");

  try {
    const { text: output } = await runWithFallback(prompt);
    const parsed = parseModelJson(output);
    if (!parsed) {
      return json({ error: "模型返回格式异常，请再试一次。" }, 502);
    }
    return json(parsed);
  } catch (error) {
    console.error("当日清单整理", error);
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
      return json({ error: "思考超时，请把内容再写短一些。" }, 504);
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

async function runWithFallback(prompt: string) {
  try {
    const result = await generateText({
      model: MODEL,
      system: SYSTEM_PROMPT,
      prompt,
      temperature: 0.2,
      maxOutputTokens: 1200,
      maxRetries: 1,
    });
    return { text: result.text };
  } catch (error) {
    if (!isQuotaError(error)) throw error;
    const result = await generateText({
      model: FALLBACK_MODEL,
      system: SYSTEM_PROMPT,
      prompt,
      temperature: 0.2,
      maxOutputTokens: 1200,
      maxRetries: 1,
    });
    return { text: result.text };
  }
}

function parseModelJson(content: string): { items: unknown; note?: string } | null {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = fenced?.[1] ?? trimmed;
  try {
    const data = JSON.parse(text) as { items?: unknown; note?: unknown };
    return {
      items: Array.isArray(data.items) ? data.items : [],
      note: String(data.note ?? "").trim() || undefined,
    };
  } catch {
    return null;
  }
}
