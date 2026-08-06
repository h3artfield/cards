import { trackApiCall } from "@/lib/processing/api-call-tracker";
import {
  buildFlyerEditPrompt,
  buildFlyerEventInfo,
  buildFlyerImagePrompt,
  findEventListGroup,
  type EventListGroup,
} from "./event-list-groups";
import {
  flyerImageSize,
  type FlyerOrientation,
} from "./flyer-orientation";
import type { StoreEventCategoryMeta } from "./categories";
import type { StoreEvent, StoreEventFlyer } from "./types";

export type GenerateEventFlyerResult = {
  imageUrl: string;
  prompt: string;
  eventInfo: string;
  revisedPrompt?: string;
};

type OpenAiImageResponse = {
  data?: Array<{
    url?: string;
    b64_json?: string;
    revised_prompt?: string;
  }>;
};

type FlyerContext = {
  events: StoreEvent[];
  eventId: string;
  storeName: string;
  categories?: StoreEventCategoryMeta[];
  timeZone?: string;
  orientation?: FlyerOrientation;
};

function openAiImageConfig(orientation: FlyerOrientation = "portrait") {
  return {
    apiKey: process.env.OPENAI_API_KEY?.trim(),
    model: process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1",
    quality: process.env.OPENAI_IMAGE_QUALITY?.trim() || "medium",
    size: flyerImageSize(orientation),
  };
}

function resolveImageUrl(
  item: NonNullable<OpenAiImageResponse["data"]>[number] | undefined,
): string | null {
  if (item?.url) return item.url;
  if (item?.b64_json) {
    return `data:image/png;base64,${item.b64_json}`;
  }
  return null;
}

function parseOpenAiImageResponse(
  data: OpenAiImageResponse,
  prompt: string,
  eventInfo: string,
): GenerateEventFlyerResult {
  const first = data.data?.[0];
  const imageUrl = first ? resolveImageUrl(first) : null;
  if (!imageUrl) {
    throw new Error("OpenAI returned no image data");
  }
  return {
    imageUrl,
    prompt,
    eventInfo,
    revisedPrompt: first?.revised_prompt,
  };
}

function resolveFlyerContext(input: FlyerContext) {
  const orientation = input.orientation ?? "portrait";
  const { apiKey, model, quality, size } = openAiImageConfig(orientation);
  if (!apiKey) {
    throw new Error("OpenAI is not configured (OPENAI_API_KEY missing)");
  }

  const group = findEventListGroup(input.events, input.eventId, {
    timeZone: input.timeZone,
  });
  if (!group) {
    throw new Error("Event not found");
  }

  const eventInfo = buildFlyerEventInfo(
    group,
    input.storeName,
    input.categories,
  );

  return { apiKey, model, quality, size, group, eventInfo, orientation };
}

async function loadImageBytes(imageUrl: string): Promise<Buffer> {
  if (imageUrl.startsWith("data:")) {
    const match = /^data:[^;]+;base64,(.+)$/i.exec(imageUrl);
    if (!match?.[1]) {
      throw new Error("Could not read saved flyer image");
    }
    return Buffer.from(match[1], "base64");
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error("Could not load saved flyer image");
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function generateEventFlyerImage(
  input: FlyerContext,
): Promise<GenerateEventFlyerResult> {
  const { apiKey, model, quality, size, eventInfo, orientation } =
    resolveFlyerContext(input);
  const prompt = buildFlyerImagePrompt(eventInfo, orientation).slice(0, 4000);

  trackApiCall("openai");

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      size,
      quality,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI image generation failed: ${err.slice(0, 400)}`);
  }

  const data = (await response.json()) as OpenAiImageResponse;
  return parseOpenAiImageResponse(data, prompt, eventInfo);
}

export async function editEventFlyerImage(input: {
  context: FlyerContext;
  sourceImageUrl: string;
  changePrompt: string;
  originalPrompt: string;
}): Promise<GenerateEventFlyerResult> {
  const changePrompt = input.changePrompt.trim();
  if (!changePrompt) {
    throw new Error("Change prompt is required to edit a flyer");
  }

  const { apiKey, model, quality, size, eventInfo, orientation } =
    resolveFlyerContext(input.context);
  const prompt = buildFlyerEditPrompt({
    changePrompt,
    eventInfo,
    originalPrompt: input.originalPrompt,
  }).slice(0, 4000);

  const imageBytes = await loadImageBytes(input.sourceImageUrl);
  const form = new FormData();
  form.append("model", model);
  form.append("prompt", prompt);
  form.append("size", size);
  form.append("quality", quality);
  form.append(
    "image",
    new Blob([new Uint8Array(imageBytes)], { type: "image/png" }),
    "flyer.png",
  );

  trackApiCall("openai");

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI image edit failed: ${err.slice(0, 400)}`);
  }

  const data = (await response.json()) as OpenAiImageResponse;
  return parseOpenAiImageResponse(data, prompt, eventInfo);
}

export function buildStoredEventFlyer(
  result: GenerateEventFlyerResult,
  existing?: StoreEventFlyer,
): StoreEventFlyer {
  const now = new Date().toISOString();
  const flyer: StoreEventFlyer = {
    imageUrl: result.imageUrl,
    prompt: result.prompt,
    eventInfo: result.eventInfo,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  if (result.revisedPrompt) {
    flyer.revisedPrompt = result.revisedPrompt;
  }
  return flyer;
}

export type { EventListGroup };
