import { randomUUID } from "node:crypto";
import { trackApiCall } from "../processing/api-call-tracker";
import { pngDimensionsV1, readTokenAssetV1, saveTokenAssetV1, tokenAssetPrefixV1 } from "./assets-v1";
import { tokenCreatorConfigV1 } from "./config-v1";
import { CARD_H, type TokenCardV1 } from "./design-v1";
import {
  createTokenGenerationV1,
  getTokenGenerationV1,
  refundTokenImagesV1,
  reserveTokenImagesV1,
  saveTokenVersionV1,
  updateTokenGenerationV1,
} from "./store-v1";
import {
  normalizeTokenBlendWeightV1,
  TOKEN_BLEND_WEIGHT_DEFAULT_V1,
  TOKEN_STYLE_REGISTRY_VERSION,
  tokenStyleByIdV1,
  type TokenStyleV1,
} from "./styles-v1";
import { tokenSetTemplateByCodeV1 } from "./set-templates-server-v1";
import { defaultSubjectForCardV1 } from "./templates-v1";
import type { TokenDesignV1, TokenGenerationV1, TokenSlotV1, TokenVersionV1 } from "./types-v1";

const SLOT_COUNT = 4;

/**
 * Four requests rather than one with `n=4`: each slot gets its own composition
 * direction, which is what makes the four results different cards instead of
 * four near-copies, and a slot that fails can be retried on its own.
 */
const VARIATIONS = [
  "an iconic close portrait of the subject, centred and facing the viewer, with dramatic lighting",
  "the subject in a full-body wide-shot inside a wide, detailed environment that tells a story",
  "a dynamic action moment with strong diagonal movement, shot as a Dutch angle",
  "a surprising, moody reinterpretation with a different setting, time of day and palette from the obvious one",
];

/** The art window is cropped from the centre, so a subject's head near an edge gets cut off. */
const FRAMING =
  "Whatever the shot, keep the subject's head and face fully in frame and clearly visible; never let a hand, claw or object in the foreground take over the picture.";

/**
 * Generate in the art window's shape: a tall image cropped into a wide window
 * keeps only its middle half, which can lose the subject's head.
 */
export function tokenArtSizeForCardV1(card: TokenCardV1, portraitSize: string): string {
  const full = card.art.mode === "full" || card.art.mode === "under_text";
  return !full && card.art.window.w >= card.art.window.h ? "1536x1024" : portraitSize;
}

const COLOR_WORDS: Record<string, string> = { W: "white", U: "blue", B: "black", R: "red", G: "green" };

function styleLine(style: TokenStyleV1 | null, blend: TokenStyleV1 | null, blendWeight: number, prompt: string): string {
  if (style && blend && style.id !== blend.id) {
    const b = Math.round(blendWeight * 100);
    return [
      `Art style: one unified look that blends two styles, roughly ${100 - b}% ${style.name} and ${b}% ${blend.name}.`,
      `${style.name}: ${style.direction}`,
      `${blend.name}: ${blend.direction}`,
      "Fuse them through the whole image (medium, line, colour and light together) rather than splitting the picture into two halves or two panels.",
    ].join("\n");
  }
  const only = style ?? blend;
  if (only) return `Art style, ${only.name}: ${only.direction}`;
  return prompt.trim() ? "" : "Art style: polished, detailed fantasy illustration.";
}

/**
 * A set-styled card should look like it came from that set: with no style
 * picked the set's art direction is the style; with one picked, the set still
 * sets the world.
 */
function setLine(card: TokenCardV1, hasStyle: boolean): string {
  const set = card.setCode ? tokenSetTemplateByCodeV1(card.setCode) : null;
  if (!set?.artDirection) return "";
  return hasStyle
    ? `Set it in the world of the card's set (${set.setting ?? set.name}).`
    : `Art style: match the illustrations of the token's card set (${set.setting ?? set.name}). ${set.artDirection}`;
}

export function buildTokenArtPromptV1(input: {
  card: TokenCardV1;
  prompt: string;
  style: TokenStyleV1 | null;
  blendStyle?: TokenStyleV1 | null;
  blendWeight?: number;
  slotIndex: number;
  /** What the customer wants done with their uploaded image, when there is one. */
  referenceUse?: string | null;
}): string {
  const { card, style } = input;
  const referenceUse = input.referenceUse?.trim();
  const subject = defaultSubjectForCardV1(card);
  const colors = card.colors.map((c) => COLOR_WORDS[c]).filter(Boolean).join(" and ");
  const details = [
    card.typeLine ? `It is a ${colors ? `${colors} ` : ""}${card.typeLine.replace(/^Token\s*/i, "").replace("—", "-")}` : "",
    card.power && card.toughness ? `with power ${card.power} and toughness ${card.toughness}, so its size and menace should suit that` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const hasStyle = Boolean(style || input.blendStyle);
  const setDirection = setLine(card, hasStyle);
  const full = card.art.mode === "full" || card.art.mode === "under_text";
  const tall = !full && card.art.window.h > CARD_H * 0.6;
  const composition = full
    ? "The image fills the whole card, so keep the main subject in the middle 70% and leave calmer areas near the top and bottom where a title and text will be placed."
    : tall
      ? "The image fills nearly the whole card, with a name bar over the top edge and a type line near the bottom, so keep the main subject in the middle and the top tenth calm."
      : "The image will be cropped to a window in the upper half of the card, roughly 5:4, so keep the subject centred with breathing room on every side.";
  const wide = !full && card.art.window.w >= card.art.window.h;

  return [
    `Original artwork for a collectible fantasy trading-card token.`,
    input.prompt.trim()
      ? `The customer describes it as: ${input.prompt.trim()}`
      : referenceUse
        ? ""
        : `Subject: ${subject}.`,
    referenceUse
      ? [
          "The customer attached their own image. How they want it used in this artwork, in their words:",
          referenceUse,
          "Follow that instruction closely; whatever they did not ask to keep from the image can change to suit the card.",
          "Ignore any text, logos or watermarks in their image.",
        ].join("\n")
      : "",
    details ? `${details}.` : "",
    setDirection,
    hasStyle || !setDirection
      ? styleLine(style, input.blendStyle ?? null, input.blendWeight ?? TOKEN_BLEND_WEIGHT_DEFAULT_V1, input.prompt)
      : "",
    `This is variation ${input.slotIndex + 1} of 4: ${VARIATIONS[input.slotIndex % VARIATIONS.length]}.`,
    FRAMING,
    composition,
    `${wide ? "Landscape" : "Portrait"} orientation. Artwork only: no text, letters, numbers, card frame, border, logo, signature or watermark. Create an original design and do not depict existing trademarked characters or brand logos.`,
  ]
    .filter(Boolean)
    .join("\n");
}

type OpenAiImageResponse = {
  data?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>;
};

class ImageRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly modelUnavailable: boolean,
    readonly blocked: boolean,
  ) {
    super(message);
  }
}

type ImageRequestOptions = {
  size?: string;
  timeoutMs?: number;
  deadlineAt?: number;
  /** An image the result is made from; sends the request to the edits endpoint. */
  reference?: { bytes: Buffer; contentType: string } | null;
};

async function requestImage(
  model: string,
  prompt: string,
  { size, timeoutMs, reference }: ImageRequestOptions = {},
): Promise<{ bytes: Buffer; revisedPrompt: string | null }> {
  const config = tokenCreatorConfigV1();
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new ImageRequestError("Image generation is not configured.", 503, false, false);

  trackApiCall("openai");
  const fields = { model, prompt, size: size ?? config.size, quality: config.quality, n: "1" };
  let body: string | FormData;
  if (reference) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    const ext = reference.contentType.split("/")[1] ?? "png";
    form.set("image", new Blob([new Uint8Array(reference.bytes)], { type: reference.contentType }), `reference.${ext}`);
    body = form;
  } else {
    body = JSON.stringify({ ...fields, n: 1 });
  }
  const response = await fetch(`https://api.openai.com/v1/images/${reference ? "edits" : "generations"}`, {
    method: "POST",
    headers: reference
      ? { Authorization: `Bearer ${apiKey}` }
      : { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body,
    signal: AbortSignal.timeout(timeoutMs ?? config.requestTimeoutMs),
  });

  if (!response.ok) {
    const text = await response.text();
    let code = "";
    let message = text.slice(0, 300);
    try {
      const parsed = JSON.parse(text) as { error?: { code?: string; message?: string } };
      code = parsed.error?.code ?? "";
      message = parsed.error?.message ?? message;
    } catch {
      /* not JSON */
    }
    const modelUnavailable =
      response.status === 404 ||
      code === "model_not_found" ||
      (response.status === 400 && /model/i.test(message) && /(not|invalid|exist|support)/i.test(message));
    const blocked = code === "moderation_blocked" || /safety|moderation/i.test(message);
    throw new ImageRequestError(message, response.status, modelUnavailable, blocked);
  }

  const data = (await response.json()) as OpenAiImageResponse;
  const first = data.data?.[0];
  if (first?.b64_json) {
    return { bytes: Buffer.from(first.b64_json, "base64"), revisedPrompt: first.revised_prompt ?? null };
  }
  if (first?.url) {
    const img = await fetch(first.url, { signal: AbortSignal.timeout(60_000) });
    if (!img.ok) throw new ImageRequestError("Could not download the generated image.", 502, false, false);
    return { bytes: Buffer.from(await img.arrayBuffer()), revisedPrompt: first.revised_prompt ?? null };
  }
  throw new ImageRequestError("The image service returned no image.", 502, false, false);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One image, trying the configured model and then the fallbacks, and retrying
 * throttling and server errors with backoff.
 */
async function generateOneImage(preferredModel: string, prompt: string, options: ImageRequestOptions = {}) {
  const config = tokenCreatorConfigV1();
  const models = [...new Set([preferredModel, ...config.fallbackModels])];
  let lastError: unknown = null;
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let timeoutMs = options.timeoutMs;
      if (options.deadlineAt) {
        const left = options.deadlineAt - Date.now();
        if (left < 20_000) throw lastError ?? new ImageRequestError("The image service is slow right now.", 504, false, false);
        timeoutMs = Math.min(timeoutMs ?? config.requestTimeoutMs, left);
      }
      try {
        const result = await requestImage(model, prompt, { ...options, timeoutMs });
        return { ...result, model };
      } catch (err) {
        lastError = err;
        if (err instanceof ImageRequestError) {
          if (err.modelUnavailable) break;
          if (err.blocked) throw err;
          if (err.status === 429 || err.status >= 500) {
            await sleep(2000 * (attempt + 1) ** 2);
            continue;
          }
          throw err;
        }
        if ((err as { name?: string }).name === "TimeoutError" && attempt < 2) {
          console.warn(`[token-creator] ${model} timed out (attempt ${attempt + 1}); retrying`);
          continue;
        }
        throw err;
      }
    }
  }
  throw lastError ?? new Error("No image model is available.");
}

export function customerMessageForImageErrorV1(err: unknown): string {
  if (err instanceof ImageRequestError) {
    if (err.blocked) return "The image service declined this one for content safety. Try rewording the description.";
    if (err.status === 429) return "The image service is busy right now. Try this one again in a minute.";
    if (err.status === 503) return err.message;
  }
  if ((err as { name?: string }).name === "TimeoutError") return "This image took too long. Try it again.";
  return "This image could not be created. Try it again.";
}

/**
 * Plain "violence" is left out: monsters, battles and "destroy target
 * creature" are what fantasy cards are made of. The image API still applies
 * its own safety checks to every request.
 */
const BLOCKED_MODERATION_CATEGORIES = new Set([
  "sexual",
  "sexual/minors",
  "hate",
  "hate/threatening",
  "harassment/threatening",
  "self-harm",
  "self-harm/intent",
  "self-harm/instructions",
  "violence/graphic",
  "illicit/violent",
]);

/** Asks the moderation endpoint about the customer's text before spending on images. */
export async function moderateTokenPromptV1(text: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const input = text.trim();
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!input || !apiKey) return { ok: true };
  try {
    trackApiCall("openai");
    const response = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "omni-moderation-latest", input }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return { ok: true };
    const data = (await response.json()) as { results?: Array<{ categories?: Record<string, boolean> }> };
    const blocked = data.results?.some((r) =>
      Object.entries(r.categories ?? {}).some(([category, hit]) => hit && BLOCKED_MODERATION_CATEGORIES.has(category)),
    );
    if (blocked) {
      return { ok: false, message: "That description can't be used for printed merchandise. Please describe something else." };
    }
  } catch (err) {
    // The image API moderates again on its own, so a moderation outage is not fatal.
    console.warn("[token-creator] moderation check failed:", err);
  }
  return { ok: true };
}

function generationStatus(slots: TokenSlotV1[]): TokenGenerationV1["status"] {
  if (slots.some((s) => s.status === "queued" || s.status === "running")) return "running";
  const done = slots.filter((s) => s.status === "done").length;
  if (done === slots.length) return "done";
  return done > 0 ? "partial" : "failed";
}

const running = new Set<string>();

async function runSlot(generation: TokenGenerationV1, slotIndex: number): Promise<void> {
  const claimed = await updateTokenGenerationV1(generation.generationId, (current) => {
    const slot = current.slots[slotIndex];
    if (!slot || slot.status !== "queued") return null;
    const slots = current.slots.map((s, i) =>
      i === slotIndex ? { ...s, status: "running" as const, attempts: s.attempts + 1, startedAt: new Date().toISOString(), error: null } : s,
    );
    return { ...current, slots, status: generationStatus(slots) };
  });
  const slot = claimed?.slots[slotIndex];
  if (!claimed || !slot || slot.status !== "running") return;

  const style = tokenStyleByIdV1(slot.styleId ?? claimed.styleId);
  const blendStyle = tokenStyleByIdV1(slot.blendStyleId);
  const blendWeight = normalizeTokenBlendWeightV1(slot.blendWeight);
  const prompt = buildTokenArtPromptV1({
    card: claimed.card,
    prompt: claimed.prompt,
    style,
    blendStyle,
    blendWeight,
    slotIndex,
    referenceUse: claimed.reference?.use,
  });

  try {
    const reference = claimed.reference ? await readTokenAssetV1(claimed.reference.path) : null;
    if (claimed.reference && !reference) throw new Error("The uploaded image could not be found.");
    const image = await generateOneImage(claimed.model, prompt, { reference, size: claimed.size });
    const versionId = randomUUID();
    const path = `${tokenAssetPrefixV1(claimed.storeId, claimed.customerId)}${claimed.generationId}/${versionId}.png`;
    await saveTokenAssetV1(path, image.bytes, "image/png");
    const [fallbackW, fallbackH] = (claimed.size || "1024x1536").split("x").map(Number);
    const dims = pngDimensionsV1(image.bytes) ?? { width: fallbackW || 1024, height: fallbackH || 1536 };
    const version: TokenVersionV1 = {
      versionId,
      generationId: claimed.generationId,
      designId: claimed.designId,
      customerId: claimed.customerId,
      storeId: claimed.storeId,
      slotIndex,
      artworkPath: path,
      artworkWidth: dims.width,
      artworkHeight: dims.height,
      card: null,
      prompt,
      revisedPrompt: image.revisedPrompt,
      styleId: style?.id ?? null,
      blendStyleId: blendStyle && blendStyle.id !== style?.id ? blendStyle.id : null,
      blendWeight,
      model: image.model,
      status: "active",
      createdAt: new Date().toISOString(),
    };
    await saveTokenVersionV1(version);
    await updateTokenGenerationV1(claimed.generationId, (current) => {
      const slots = current.slots.map((s, i) =>
        i === slotIndex
          ? {
              ...s,
              status: "done" as const,
              versionId,
              history: [...s.history, versionId],
              finishedAt: new Date().toISOString(),
              error: null,
            }
          : s,
      );
      return {
        ...current,
        model: image.model,
        slots,
        status: generationStatus(slots),
        imageCount: current.imageCount + 1,
        estimatedCostCents: current.estimatedCostCents + tokenCreatorConfigV1().imageCostCents,
      };
    });
  } catch (err) {
    console.error(`[token-creator] slot ${slotIndex} of ${claimed.generationId} failed:`, err);
    await updateTokenGenerationV1(claimed.generationId, (current) => {
      const slots = current.slots.map((s, i) =>
        i === slotIndex
          ? { ...s, status: "failed" as const, error: customerMessageForImageErrorV1(err), finishedAt: new Date().toISOString() }
          : s,
      );
      return { ...current, slots, status: generationStatus(slots) };
    });
    await refundTokenImagesV1(claimed.customerId, claimed.storeId, 1).catch(() => {});
  }
}

/** Runs every queued slot of a generation in this process. Safe to call repeatedly. */
export function kickTokenGenerationV1(generationId: string): void {
  if (running.has(generationId)) return;
  running.add(generationId);
  void (async () => {
    try {
      const generation = await getTokenGenerationV1(generationId);
      if (!generation) return;
      await Promise.all(
        generation.slots.map((slot, i) => (slot.status === "queued" ? runSlot(generation, i) : Promise.resolve())),
      );
    } catch (err) {
      console.error("[token-creator] generation worker failed:", err);
    } finally {
      running.delete(generationId);
    }
  })();
}

/**
 * Puts slots whose worker was lost (an instance restart mid-request) back in
 * the queue and starts them again. Called whenever a client polls.
 */
export async function resumeTokenGenerationIfStaleV1(generation: TokenGenerationV1): Promise<TokenGenerationV1> {
  if (running.has(generation.generationId)) return generation;
  const stale = tokenCreatorConfigV1().staleSlotMs;
  const now = Date.now();
  const needsWork = generation.slots.some(
    (s) =>
      s.status === "queued" ||
      (s.status === "running" && (!s.startedAt || now - Date.parse(s.startedAt) > stale)),
  );
  if (!needsWork) return generation;
  const next = await updateTokenGenerationV1(generation.generationId, (current) => {
    const slots = current.slots.map((s) =>
      s.status === "running" && (!s.startedAt || now - Date.parse(s.startedAt) > stale)
        ? { ...s, status: "queued" as const }
        : s,
    );
    return { ...current, slots, status: generationStatus(slots) };
  });
  kickTokenGenerationV1(generation.generationId);
  return next ?? generation;
}

export type StartTokenGenerationResultV1 =
  | { ok: true; generation: TokenGenerationV1; remainingToday: number | null }
  | { ok: false; status: number; message: string };

export async function startTokenGenerationV1(input: {
  design: TokenDesignV1;
  requestId: string;
  prompt: string;
  styleId: string | null;
  blendStyleId?: string | null;
  blendWeight?: number;
  /** Four styles, one per image; when given the blend is not used. */
  slotStyleIds?: Array<string | null> | null;
  hq: boolean;
}): Promise<StartTokenGenerationResultV1> {
  const { design } = input;
  const generationId = `${design.designId}_${input.requestId}`.slice(0, 200);
  const existing = await getTokenGenerationV1(generationId);
  if (existing) return { ok: true, generation: existing, remainingToday: -1 };

  const reference = design.reference?.path ? design.reference : null;
  if (reference && !reference.use.trim()) {
    return { ok: false, status: 400, message: "Tell us how you want your uploaded image used in the card art." };
  }
  const moderation = await moderateTokenPromptV1(
    `${input.prompt}\n${reference?.use ?? ""}\n${design.card.name}\n${design.card.rulesText}\n${design.card.flavorText}`,
  );
  if (!moderation.ok) return { ok: false, status: 422, message: moderation.message };

  const usage = await reserveTokenImagesV1(design.customerId, design.storeId, SLOT_COUNT);
  if (!usage.ok) return { ok: false, status: 429, message: usage.message };

  const config = tokenCreatorConfigV1();
  const now = new Date().toISOString();
  const mixed = Array.isArray(input.slotStyleIds) && input.slotStyleIds.length > 0;
  const slotStyles = Array.from({ length: SLOT_COUNT }, (_, i) =>
    tokenStyleByIdV1(mixed ? input.slotStyleIds?.[i] : input.styleId),
  );
  const style = mixed ? slotStyles[0] : tokenStyleByIdV1(input.styleId);
  const blend = mixed ? null : tokenStyleByIdV1(input.blendStyleId);
  const blendStyleId = blend && blend.id !== style?.id ? blend.id : null;
  const blendWeight = normalizeTokenBlendWeightV1(input.blendWeight);
  const generation: TokenGenerationV1 = {
    generationId,
    designId: design.designId,
    customerId: design.customerId,
    storeId: design.storeId,
    prompt: input.prompt.trim().slice(0, 1500),
    styleId: style?.id ?? null,
    blendStyleId,
    blendWeight,
    styleMode: mixed ? "mixed" : "single",
    styleRegistryVersion: TOKEN_STYLE_REGISTRY_VERSION,
    provider: "openai",
    model: input.hq ? config.modelHq : config.model,
    quality: input.hq ? "high" : config.quality,
    size: tokenArtSizeForCardV1(design.card, config.size),
    status: "running",
    slots: Array.from({ length: SLOT_COUNT }, (_, slotIndex) => ({
      slotIndex,
      status: "queued" as const,
      versionId: null,
      history: [],
      error: null,
      attempts: 0,
      startedAt: null,
      finishedAt: null,
      styleId: slotStyles[slotIndex]?.id ?? null,
      blendStyleId,
      blendWeight,
    })),
    card: design.card,
    reference,
    imageCount: 0,
    estimatedCostCents: 0,
    createdAt: now,
    updatedAt: now,
  };
  const created = await createTokenGenerationV1(generation);
  if (!created) {
    await refundTokenImagesV1(design.customerId, design.storeId, SLOT_COUNT);
    const raced = await getTokenGenerationV1(generationId);
    if (raced) return { ok: true, generation: raced, remainingToday: -1 };
  }
  kickTokenGenerationV1(generationId);
  return { ok: true, generation, remainingToday: usage.customerRemaining };
}

/**
 * `retry` re-runs failed slots. `regenerate` makes a new image for finished
 * slots; the old version stays in the slot's history and in storage.
 */
export async function requeueTokenSlotsV1(input: {
  generation: TokenGenerationV1;
  slotIndexes: number[];
  mode: "retry" | "regenerate";
}): Promise<StartTokenGenerationResultV1> {
  const { generation } = input;
  const eligible = input.slotIndexes.filter((i) => {
    const slot = generation.slots[i];
    if (!slot) return false;
    return input.mode === "retry" ? slot.status === "failed" : slot.status === "done" || slot.status === "failed";
  });
  if (!eligible.length) return { ok: false, status: 409, message: "Nothing to redo in those slots right now." };

  const usage = await reserveTokenImagesV1(generation.customerId, generation.storeId, eligible.length);
  if (!usage.ok) return { ok: false, status: 429, message: usage.message };

  const next = await updateTokenGenerationV1(generation.generationId, (current) => {
    const slots = current.slots.map((s, i) =>
      eligible.includes(i) && s.status !== "running" && s.status !== "queued"
        ? { ...s, status: "queued" as const, error: null }
        : s,
    );
    return { ...current, slots, status: generationStatus(slots) };
  });
  kickTokenGenerationV1(generation.generationId);
  return { ok: true, generation: next ?? generation, remainingToday: usage.customerRemaining };
}

export type TokenPanelToneV1 = "light" | "dark";

export function buildTokenPanelPromptV1(input: {
  description: string;
  style: TokenStyleV1 | null;
  blendStyle: TokenStyleV1 | null;
  blendWeight: number;
  tone: TokenPanelToneV1;
}): string {
  const look = input.description.trim();
  return [
    "A flat, front-on decorative surface used as the background behind printed text on a fantasy trading card (a name plate and a rules-text box).",
    look ? `The customer wants it to look like: ${look}` : "",
    styleLine(input.style, input.blendStyle, input.blendWeight, look),
    input.tone === "light"
      ? "Keep it light-toned overall (pale parchment, bone, pale stone, light metal or similar) so dark text printed on it stays easy to read."
      : "Keep it dark-toned overall (deep stone, dark wood, dark metal, night sky or similar) so light text printed on it stays easy to read.",
    "Even, low-contrast detail spread across the whole image, edge to edge, with no single focal object. Subtle texture, ornament and wear are good; busy patterns are not.",
    "Landscape orientation. No text, letters, numbers, runes that read as words, symbols, logos, borders, frames, people, creatures or objects.",
  ]
    .filter(Boolean)
    .join("\n");
}

export type TokenPanelResultV1 =
  | { ok: true; path: string; width: number; height: number; remainingToday: number | null }
  | { ok: false; status: number; message: string };

/**
 * One texture for the title plate and rules panel. Runs inline (one image is
 * well inside the route's time limit) and counts against the daily allowance.
 */
export async function generateTokenPanelTextureV1(input: {
  storeId: string;
  customerId: string;
  description: string;
  styleId: string | null;
  blendStyleId: string | null;
  blendWeight: number;
  tone: TokenPanelToneV1;
}): Promise<TokenPanelResultV1> {
  const moderation = await moderateTokenPromptV1(input.description);
  if (!moderation.ok) return { ok: false, status: 422, message: moderation.message };

  const usage = await reserveTokenImagesV1(input.customerId, input.storeId, 1);
  if (!usage.ok) return { ok: false, status: 429, message: usage.message };

  const prompt = buildTokenPanelPromptV1({
    description: input.description,
    style: tokenStyleByIdV1(input.styleId),
    blendStyle: tokenStyleByIdV1(input.blendStyleId),
    blendWeight: normalizeTokenBlendWeightV1(input.blendWeight),
    tone: input.tone,
  });
  try {
    // The customer is waiting on this request: a call that has not answered in
    // 75 s has usually stalled, and a fresh one tends to come back in seconds.
    const image = await generateOneImage(tokenCreatorConfigV1().model, prompt, {
      size: "1536x1024",
      timeoutMs: 75_000,
      deadlineAt: Date.now() + 270_000,
    });
    const path = `${tokenAssetPrefixV1(input.storeId, input.customerId)}panels/${randomUUID()}.png`;
    await saveTokenAssetV1(path, image.bytes, "image/png");
    const dims = pngDimensionsV1(image.bytes) ?? { width: 1536, height: 1024 };
    return { ok: true, path, width: dims.width, height: dims.height, remainingToday: usage.customerRemaining };
  } catch (err) {
    console.error("[token-creator] panel texture failed:", err);
    await refundTokenImagesV1(input.customerId, input.storeId, 1).catch(() => {});
    return { ok: false, status: 502, message: customerMessageForImageErrorV1(err) };
  }
}
