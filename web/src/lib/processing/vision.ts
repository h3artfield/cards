import type { StoreRule, VisionResult } from "../types";
import { hasBackImage } from "../card-image-utils";
import { buildRulesPromptContext } from "./rules-engine";
import { normalizeSlabFields } from "./slab-normalize";
import { TCGPLAYER_CONDITION_GUIDE } from "./tcgplayer-condition-standards";
import { trackApiCall } from "./api-call-tracker";

const VISION_SCHEMA = `Return JSON only with these fields:
{
  "category": "pokemon|magic|yugioh|sports|other",
  "itemType": "raw|graded|unknown",
  "cardName": string,
  "brand": string|null,
  "setName": string|null,
  "year": string|null,
  "cardNumber": string|null,
  "playerName": string|null,
  "team": string|null,
  "variant": string|null,
  "parallel": string|null,
  "autograph": boolean,
  "relicPatch": boolean,
  "serialNumbered": boolean,
  "slabCompany": string|null,
  "slabGrade": string|null,
  "slabCertNumber": string|null,
  "conditionEstimate": "NM|LP|MP|HP|DMG",
  "visibleDamage": string|null,
  "confidence": number between 0 and 1
}`;

const VISION_SYSTEM = `You identify trading cards from photos for a buyback program.
Supported: Pokemon, Magic: The Gathering, Yu-Gi-Oh!, sports cards, other TCGs.
Identify raw singles and graded slabs. Estimate condition from visible wear.

${TCGPLAYER_CONDITION_GUIDE}

Graded vs raw (critical):
- itemType "graded" ONLY when the card is sealed in a hard plastic grading case with a visible grading-company label (PSA, BGS/Beckett, CGC, SGC, etc.) showing a numeric grade (e.g. PSA 10, BGS 9.5).
- Penny sleeves, semi-rigid sleeves, top loaders, card savers, team bags, or clear plastic WITHOUT a grading label = itemType "raw" — never graded.
- Store stickers, price tags, or holder branding (e.g. shop names) on a sleeve/top loader are NOT grading companies — set slabCompany null.
- If you cannot clearly read both grader name and numeric grade on the case label, use itemType "raw" and leave slabCompany, slabGrade, slabCertNumber null.
- For itemType "graded", set conditionEstimate to "NM" — the professional grade is on the slab label; do not estimate raw card wear through the case.

Pokémon-specific rules (critical):
- cardNumber is the collector number at the bottom of the card (e.g. "206/202", "143/147", "DP45") — NEVER the HP value (e.g. 340, 120).
- Promo cards use letter+number codes (e.g. "DP45", "BW56", "SWSH260", "SVP001") at the bottom-right — put the full code in cardNumber.
- Sword & Shield Black Star Promos use SWSH### codes (e.g. SWSH260, SWSH179). Do NOT confuse with SWSD### (Crown Zenith Shiny Vault subset) — read the letters carefully.
- Read setName from the set logo/banner at the bottom (e.g. "Sword & Shield", "Supreme Victors", "Diamond and Pearl Promos").
- Zoom mentally on the bottom-right corner for the collector number and bottom-left for the set symbol — these are small; read them carefully from a sharp photo.
- If the collector number or set text is blurry or unreadable, set cardNumber and/or setName to null and lower confidence below 0.65 rather than guessing.
- LV.X / LEVEL-UP cards: name includes "LV.X"; silver holo border; stage says LEVEL-UP. Charizard G LV.X exists as Supreme Victors 143/147 AND as promo DP45 — they look similar; the collector number distinguishes them.
- SP Pokémon (e.g. "Charizard G LV.X"): the G is part of the card name. Look for the SP logo on the artwork.
- Read year from copyright/set era when visible (e.g. 2009 for Supreme Victors / DP era).
- Rainbow Rare / Secret Rare: full-art rainbow foil border, number often exceeds set size (e.g. 206/202). Put "Rainbow Rare" or "Secret Rare" in variant.
- VMAX / VSTAR / ex / GX belong in cardName. Do not confuse similar Pokémon across different sets.

Magic: read set symbol and collector number.

Sports cards (critical):
- playerName = full name on card (e.g. "Wade Boggs") — never confuse similar surnames (Wade Boggs ≠ Randall Boggs).
- cardName = player name or insert/parallel name if shown separately.
- brand = manufacturer (Donruss, Topps, Fleer, Sportflics, Bowman, Panini, Upper Deck).
- setName = set branding (e.g. "1988 Donruss", "Sportflics").
- year = copyright year or set year from front OR back (e.g. 1988).
- cardNumber = number on front or back (#26, Sportflics "50", etc.).
- team when visible (e.g. "Boston Red Sox").
- When a BACK image is provided, read it carefully: batting/pitching stats header, copyright line, manufacturer logo, card number, and team — sports IDs often depend on the back.
- cardNumber on the front is often the player's JERSEY number (e.g. "13" for Dan Marino, "26" for Wade Boggs). The SET card number is usually on the BACK (e.g. Topps #233, Sportflics #50) — prefer the back number for cardNumber when both are visible.
- playerName must be the athlete's full name only (e.g. "Dan Marino") — never position text like "quarterback" or team slogans.

Store rules to consider:
`;

export async function analyzeCardImages(
  frontImageUrl: string,
  backImageUrl: string | undefined,
  declaredItemType: string,
  rules: StoreRule[],
): Promise<VisionResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is required for card identification. Add it to web/.env.local and restart the dev server.",
    );
  }

  const rulesContext = buildRulesPromptContext(rules);
  const model = process.env.OPENAI_VISION_MODEL ?? "gpt-4o";

  const imageContent: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "high" } }
  > = [
    {
      type: "text",
      text: hasBackImage(backImageUrl)
        ? `Customer declared item type: ${declaredItemType}. Analyze front and back images. Read the collector number and set name carefully. For sports cards, extract year, brand/manufacturer, set name, card number, and team from BOTH sides — especially the back stats/copyright area.`
        : `Customer declared item type: ${declaredItemType}. Analyze the front image. Read the collector number and set name carefully.`,
    },
    { type: "image_url", image_url: { url: frontImageUrl, detail: "high" } },
  ];
  if (hasBackImage(backImageUrl)) {
    imageContent.push({
      type: "image_url",
      image_url: { url: backImageUrl!, detail: "high" },
    });
  }

  trackApiCall("openai");
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
        {
          role: "system",
          content: `${VISION_SYSTEM}${rulesContext}\n${VISION_SCHEMA}`,
        },
        {
          role: "user",
          content: imageContent,
        },
      ],
      max_tokens: 800,
    }),
    signal: AbortSignal.timeout(
      parseInt(process.env.OPENAI_REQUEST_TIMEOUT_MS ?? "60000", 10),
    ),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI vision failed: ${err}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  const parsed = JSON.parse(content) as VisionResult;
  return normalizeVisionResult(parsed, declaredItemType);
}

const COLLECTION_VISION_SYSTEM = `Identify this trading card from the front photo only.
Return JSON only:
{
  "category": "pokemon|magic|yugioh|sports|other",
  "cardName": string,
  "setName": string|null,
  "cardNumber": string|null,
  "playerName": string|null,
  "confidence": number
}
Read the printed name, set name/symbol, and collector number. If a field is unreadable, use null — do not guess numbers.`;

/** One cheap front-only lookup for the customer binder — not the buyback pipeline. */
export async function analyzeCollectionFront(
  frontImageUrl: string,
): Promise<VisionResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is required for card identification. Add it to web/.env.local and restart the dev server.",
    );
  }

  const model =
    process.env.OPENAI_COLLECTION_VISION_MODEL ??
    process.env.OPENAI_VISION_MODEL ??
    "gpt-4o-mini";

  trackApiCall("openai");
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
        { role: "system", content: COLLECTION_VISION_SYSTEM },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "What card is this? Name, set, and collector number.",
            },
            {
              type: "image_url",
              image_url: { url: frontImageUrl, detail: "auto" },
            },
          ],
        },
      ],
      max_tokens: 250,
    }),
    signal: AbortSignal.timeout(
      parseInt(process.env.OPENAI_REQUEST_TIMEOUT_MS ?? "30000", 10),
    ),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI vision failed: ${err}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  const parsed = JSON.parse(content) as VisionResult;
  return normalizeVisionResult(parsed, "raw");
}

function normalizeVisionResult(
  raw: Partial<VisionResult>,
  declaredItemType: string,
): VisionResult {
  const validCategories = ["pokemon", "magic", "yugioh", "sports", "other"];
  const validConditions = ["NM", "LP", "MP", "HP", "DMG"];
  const validItemTypes = ["raw", "graded", "unknown"];

  const baseItemType = validItemTypes.includes(raw.itemType ?? "")
    ? (raw.itemType as VisionResult["itemType"])
    : declaredItemType === "graded"
      ? "graded"
      : "raw";
  const slab = normalizeSlabFields({ ...raw, itemType: baseItemType });
  const cardNumber = normalizeCollectorNumber(raw.cardNumber, raw.category);
  const isCertifiedSlab = slab.itemType === "graded";

  return {
    category: validCategories.includes(raw.category ?? "")
      ? (raw.category as VisionResult["category"])
      : "other",
    itemType:
      slab.itemType === "unknown" ? "raw" : (slab.itemType as VisionResult["itemType"]),
    cardName: raw.cardName ?? "Unknown Card",
    brand: raw.brand ?? undefined,
    setName: raw.setName ?? undefined,
    year: raw.year ?? undefined,
    cardNumber,
    playerName:
      raw.playerName ??
      (raw.category === "sports" && raw.cardName?.trim()
        ? raw.cardName.trim()
        : undefined),
    team: raw.team ?? undefined,
    variant: raw.variant ?? undefined,
    parallel: raw.parallel ?? undefined,
    autograph: Boolean(raw.autograph),
    relicPatch: Boolean(raw.relicPatch),
    serialNumbered: Boolean(raw.serialNumbered),
    slabCompany: slab.slabCompany,
    slabGrade: slab.slabGrade,
    slabCertNumber: slab.slabCertNumber,
    conditionEstimate: isCertifiedSlab
      ? "NM"
      : validConditions.includes(raw.conditionEstimate ?? "")
        ? (raw.conditionEstimate as VisionResult["conditionEstimate"])
        : "LP",
    visibleDamage: raw.visibleDamage ?? undefined,
    confidence: Math.min(1, Math.max(0, Number(raw.confidence) || 0.5)),
  };
}

/** Reject HP values mistaken for collector numbers (e.g. "340" on a VMAX). */
export function normalizeCollectorNumber(
  cardNumber: string | null | undefined,
  category?: string,
): string | undefined {
  if (!cardNumber?.trim()) return undefined;
  const trimmed = cardNumber.trim();

  if (/\d+\s*\/\s*\d+/.test(trimmed)) {
    return trimmed.replace(/\s+/g, "");
  }

  // Promo collector codes: DP45, BW56, SVP001
  if (/^[A-Za-z]{1,4}\d+$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  if (category === "pokemon") {
    const n = parseInt(trimmed, 10);
    // Pokémon HP is often 50–340; collector numbers in modern sets are usually ≤250
    if (!Number.isNaN(n) && n > 250 && !trimmed.includes("/")) {
      return undefined;
    }
  }

  return trimmed;
}
