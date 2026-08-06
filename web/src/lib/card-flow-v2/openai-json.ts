import { trackApiCall } from "../processing/api-call-tracker";

export type VisionMessageContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail: "high" | "low" } };

export function requireOpenAiApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is required for Card Flow V2 evidence agents.",
    );
  }
  return apiKey;
}

export async function callOpenAiJson<T>(
  system: string,
  userContent: VisionMessageContent[],
  options?: { model?: string; maxTokens?: number; temperature?: number },
): Promise<T> {
  const apiKey = requireOpenAiApiKey();
  trackApiCall("openai");
  const model =
    options?.model ??
    process.env.OPENAI_VISION_MODEL ??
    process.env.OPENAI_CATEGORY_CLASSIFIER_MODEL ??
    "gpt-4o-mini";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
      max_tokens: options?.maxTokens ?? 1200,
      temperature: options?.temperature ?? 0.2,
    }),
    signal: AbortSignal.timeout(
      parseInt(process.env.OPENAI_REQUEST_TIMEOUT_MS ?? "60000", 10),
    ),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI request failed: ${err}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned empty content");
  return JSON.parse(content) as T;
}
