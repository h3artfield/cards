import type {
  CardCategory,
  CardEvidenceInput,
  CategoryClassificationReport,
  DetectedSide,
} from "./types";
import { callOpenAiJson } from "./openai-json";
import { buildCustomerImageContent } from "./vision-images";

const CATEGORY_SCHEMA = `Return JSON only:
{
  "category": "pokemon|yugioh|mtg|sports|riftbound|onepiece|lorcana|unknown",
  "confidence": number between 0 and 1,
  "evidence": string[],
  "detectedSides": ["front"|"back"|"slab_front"|"slab_back"|"unknown"],
  "possibleCategories": [
    { "category": "pokemon|yugioh|mtg|sports|riftbound|onepiece|lorcana|unknown", "confidence": number, "reason": string }
  ]
}`;

const CATEGORY_SYSTEM = `You are a cheap trading-card category classifier.

Determine whether the card is Pokémon, Yu-Gi-Oh, Magic: The Gathering (mtg), sports, Riftbound, One Piece, Lorcana, or unknown.

Use front and back images when available. The back may be enough to classify category but is NOT enough to lock exact identity.

Rules:
- Do NOT price the card.
- Do NOT output a final exact card identity, set, or collector number.
- Do NOT search external catalogs.
- "magic" cards should be returned as category "mtg".
- If unsure between two categories, pick the best guess but lower confidence and fill possibleCategories.

${CATEGORY_SCHEMA}`;

const CATEGORIES: CardCategory[] = [
  "pokemon",
  "yugioh",
  "mtg",
  "sports",
  "riftbound",
  "onepiece",
  "lorcana",
  "unknown",
];

const SIDES: DetectedSide[] = [
  "front",
  "back",
  "slab_front",
  "slab_back",
  "unknown",
];

type RawCategory = {
  category?: string;
  confidence?: number;
  evidence?: string[];
  detectedSides?: string[];
  possibleCategories?: Array<{
    category?: string;
    confidence?: number;
    reason?: string;
  }>;
};

function normalizeCategory(value: unknown): CardCategory {
  if (value === "magic") return "mtg";
  if (typeof value === "string" && CATEGORIES.includes(value as CardCategory)) {
    return value as CardCategory;
  }
  return "unknown";
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Apply confidence thresholds from Directive 001. */
export function applyCategoryConfidenceRules(
  raw: RawCategory,
): CategoryClassificationReport {
  let category = normalizeCategory(raw.category);
  let confidence = clamp01(Number(raw.confidence) || 0);

  const possibleCategories = (raw.possibleCategories ?? [])
    .map((entry) => ({
      category: normalizeCategory(entry.category),
      confidence: clamp01(Number(entry.confidence) || 0),
      reason: entry.reason?.trim() || "Alternate category considered.",
    }))
    .filter((entry) => entry.category !== category)
    .slice(0, 4);

  let needsHigherVision = false;

  if (confidence >= 0.85) {
    needsHigherVision = false;
  } else if (confidence >= 0.6) {
    needsHigherVision = true;
  } else {
    needsHigherVision = true;
    if (category !== "unknown" && confidence < 0.6) {
      if (!possibleCategories.some((p) => p.category === category)) {
        possibleCategories.unshift({
          category,
          confidence,
          reason: "Low-confidence primary guess.",
        });
      }
      category = "unknown";
    }
  }

  const detectedSides = (raw.detectedSides ?? ["front"])
    .map((s) =>
      SIDES.includes(s as DetectedSide) ? (s as DetectedSide) : "unknown",
    )
    .filter((s, i, arr) => arr.indexOf(s) === i);

  return {
    category,
    confidence,
    evidence: Array.isArray(raw.evidence)
      ? raw.evidence.map(String).slice(0, 10)
      : [],
    detectedSides,
    needsHigherVision,
    possibleCategories:
      possibleCategories.length > 0 ? possibleCategories : undefined,
  };
}

export function parseCategoryClassificationResponse(
  raw: RawCategory,
): CategoryClassificationReport {
  return applyCategoryConfidenceRules(raw);
}

export async function runCategoryClassifierAgent(
  input: CardEvidenceInput,
): Promise<CategoryClassificationReport> {
  const userContent = buildCustomerImageContent(
    input,
    "Classify the trading card category only. Do not identify the exact card or price it.",
  );

  const model =
    process.env.OPENAI_CATEGORY_CLASSIFIER_MODEL ??
    process.env.OPENAI_VISION_MODEL ??
    "gpt-4o-mini";

  const raw = await callOpenAiJson<RawCategory>(CATEGORY_SYSTEM, userContent, {
    model,
    maxTokens: 500,
    temperature: 0.1,
  });

  return parseCategoryClassificationResponse(raw);
}
