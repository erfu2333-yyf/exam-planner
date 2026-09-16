import { generateText } from "ai";

const MODEL = "alibaba/qwen3.7-plus";
const FALLBACK_MODEL = "alibaba/qwen3.7-flash";

export const maxDuration = 60;

type RequestBody = {
  text?: string;
  context?: {
    today?: string;
    origin?: string;
    lastDate?: string;
    examDate?: string;
    subjects?: Array<{ name: string }>;
  };
};

const SYSTEM_PROMPT = `你把用户随口写的备考计划整理成结构化任务。只输出 JSON，不要 Markdown。

规则：
- 只抽取一级科目和二级任务。不要输出每日可用、当天杂事、周格子备注。
- 已有科目名优先原样使用；同义也算同一科（如英语一、英语写作都归到已有的「英语」）。
- 用户没提到的科目或任务不要发明。
- 日期用 yyyy-mm-dd。缺年份用事项日的年份。说「一直到考前 / 考前」则结束日期用 lastDate。没说开始日期则用 today 和 origin 里较晚的那个。
- dailyHours 必须是 0.5 的倍数；没说时长时默认 1。
- evening 仅当用户明确说晚上/夜间学这科。
- method 可空；若用户写了怎么学，或想排在上午/下午/晚上，写入 method。
- 不要给任务配颜色。

结构：
{
  "note": "给用户看的一两句说明，可空",
  "subjects": [
    {
      "name": "英语",
      "evening": false,
      "tasks": [
        { "name": "单词", "dailyHours": 1, "startDate": "2026-09-16", "endDate": "2026-12-18", "method": "新词循环" }
      ]
    }
  ]
}`;

export async function POST(request: Request): Promise<Response> {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return json({ error: "请求格式不对。" }, 400);
  }

  const text = String(body.text ?? "").trim().slice(0, 4000);
  if (!text) return json({ error: "请先写一段计划。" }, 400);

  const context = body.context ?? {};
  const prompt = [
    `今天 ${context.today ?? ""}`,
    `周期起点 origin ${context.origin ?? ""}`,
    `规划最后一天 lastDate ${context.lastDate ?? ""}`,
    `事项日 examDate ${context.examDate ?? ""}`,
    `已有科目：${JSON.stringify(context.subjects ?? [])}`,
    "",
    "请整理下面这段话：",
    text,
  ].join("\n");

  try {
    const { text: output, model } = await runWithFallback(prompt);
    const parsed = parseModelJson(output);
    if (!parsed) {
      return json({ error: "模型返回格式异常，请再试一次。" }, 502);
    }
    return json({ ...parsed, model });
  } catch (error) {
    console.error("批量追加整理", error);
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
      return json({ error: "思考超时，请把计划再写短一些。" }, 504);
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
      maxOutputTokens: 2000,
      maxRetries: 1,
    });
    return { text: result.text, model: MODEL };
  } catch (error) {
    if (!isQuotaError(error)) throw error;
    const result = await generateText({
      model: FALLBACK_MODEL,
      system: SYSTEM_PROMPT,
      prompt,
      temperature: 0.2,
      maxOutputTokens: 2000,
      maxRetries: 1,
    });
    return { text: result.text, model: FALLBACK_MODEL };
  }
}

function parseModelJson(content: string): { subjects: unknown; note?: string } | null {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = fenced?.[1] ?? trimmed;
  try {
    const data = JSON.parse(text) as { subjects?: unknown; note?: unknown };
    return {
      subjects: Array.isArray(data.subjects) ? data.subjects : [],
      note: String(data.note ?? "").trim() || undefined,
    };
  } catch {
    return null;
  }
}
