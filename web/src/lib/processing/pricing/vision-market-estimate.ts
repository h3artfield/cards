import type {
  CardConditionReport,
  ScannedCard,
  VisionPriceEstimate,
  VisionResult,
} from "../../types";
import { hasBackImage } from "../../card-image-utils";
import { sportsDisplayName } from "../sports-card-fields";
import { visionEstimateFromEnrich } from "./merge-vision-pricing";

const ESTIMATE_SCHEMA = `Return JSON only:
{
  "marketPriceMid": number,
  "rawPriceLow": number,
  "rawPriceHigh": number,
  "priceConfidence": number between 0 and 1,
  "priceRationale": string,
  "conditionNote": string|null
}`;

const ESTIMATE_SYSTEM = `You estimate fair market value for trading cards at retail buyback shops.
Use photos, card identity, and visible condition. Base estimates on typical eBay sold / marketplace prices for THIS exact card printing in raw ungraded condition.

Rules:
- Give realistic USD ranges for common vintage/modern singles (e.g. 1987 Topps All-Pro Dan Marino #233 raw NM-LP ≈ $4-8, not $400).
- Adjust mid price down for visible edge/corner wear, off-centering, surface issues, or sleeve glare hiding damage.
- For graded slabs with a visible label, price for THAT grader and grade (e.g. CGC 10, PSA 9) — not raw ungraded.
- marketPriceMid = best single-number estimate for THIS copy's condition (slab grade if graded).
- priceRationale = one sentence citing set, player, number, and why (condition/demand).
- If identity is uncertain, lower priceConfidence below 0.5 and widen the range.
- Do NOT invent ultra-rare parallels — assume base card unless photos show otherwise.`;

function conditionContext(
  vision: VisionResult,
  report?: CardConditionReport,
): string {
  const parts = [`Vision condition estimate: ${vision.conditionEstimate}`];
  if (report?.serviceAvailable) {
    parts.push(
      `OpenCV subgrades — centering: ${report.centering?.toFixed(1) ?? "?"}, corners: ${report.corners?.toFixed(1) ?? "?"}, edges: ${report.edges?.toFixed(1) ?? "?"}, surface: ${report.surface?.toFixed(1) ?? "?"}`,
    );
    if (report.compositeScore != null) {
      parts.push(`Composite: ${report.compositeScore.toFixed(1)}`);
    }
  }
  if (vision.visibleDamage) parts.push(`Visible damage: ${vision.visibleDamage}`);
  return parts.join("\n");
}

/** Vision-only market estimate when catalog/eBay APIs return no price. */
export async function estimateMarketPriceFromVision(
  card: ScannedCard,
  vision: VisionResult,
  conditionReport?: CardConditionReport,
): Promise<VisionPriceEstimate | undefined> {
  const existing = vision.visionPriceEstimate;
  if (existing && existing.marketPrice > 0) return existing;

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || !card.frontImageUrl) return undefined;

  const model = process.env.OPENAI_VISION_MODEL ?? "gpt-4o";
  const displayName =
    vision.category === "sports" ? sportsDisplayName(vision) : vision.cardName;

  const identity = {
    category: vision.category,
    name: displayName || vision.cardName,
    player: vision.playerName,
    set: vision.setName,
    year: vision.year,
    brand: vision.brand,
    number: vision.cardNumber,
    team: vision.team,
    variant: vision.variant,
    parallel: vision.parallel,
    itemType: vision.itemType,
    slab: vision.slabCompany
      ? `${vision.slabCompany} ${vision.slabGrade ?? ""}`.trim()
      : undefined,
  };

  const imageContent: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "high" } }
  > = [
    {
      type: "text",
      text: `Estimate raw market value for this card:\n${JSON.stringify(identity, null, 2)}\n\n${conditionContext(vision, conditionReport ?? card.conditionReport)}`,
    },
    {
      type: "image_url",
      image_url: { url: card.frontImageUrl, detail: "high" },
    },
  ];

  if (hasBackImage(card.backImageUrl)) {
    imageContent.push({
      type: "text",
      text: "Back of card — use set number and copyright year for identity.",
    });
    imageContent.push({
      type: "image_url",
      image_url: { url: card.backImageUrl!, detail: "high" },
    });
  }

  try {
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
          { role: "system", content: `${ESTIMATE_SYSTEM}\n${ESTIMATE_SCHEMA}` },
          { role: "user", content: imageContent },
        ],
        max_tokens: 400,
        temperature: 0.25,
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!response.ok) return undefined;

    const data = await response.json();
    const parsed = JSON.parse(
      data.choices?.[0]?.message?.content ?? "{}",
    ) as Parameters<typeof visionEstimateFromEnrich>[0];

    return visionEstimateFromEnrich(parsed);
  } catch {
    return undefined;
  }
}
