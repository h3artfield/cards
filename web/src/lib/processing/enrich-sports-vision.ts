import type { VisionResult } from "../types";
import { hasBackImage } from "../card-image-utils";
import { normalizeSportsVisionFields } from "./pricing/sports-search-queries";
import { visionEstimateFromEnrich } from "./pricing/merge-vision-pricing";

const ENRICH_SCHEMA = `Return JSON only:
{
  "year": string|null,
  "brand": string|null,
  "setName": string|null,
  "cardNumber": string|null,
  "playerName": string|null,
  "team": string|null,
  "confidence": number between 0 and 1,
  "searchQueries": string[],
  "notes": string[],
  "marketPriceMid": number|null,
  "rawPriceLow": number|null,
  "rawPriceHigh": number|null,
  "priceConfidence": number between 0 and 1,
  "priceRationale": string|null,
  "conditionNote": string|null
}`;

const SPORTS_AGENT_SYSTEM = `You are a sports card identification expert for a buyback program.
Given photos and/or extracted fields, produce the exact trading card identity for pricing lookups.

Critical rules:
- cardNumber is the SET card number (usually on the BACK or in the set checklist), NOT the player's jersey number on the front.
  Example: 1987 Sportflics Wade Boggs — front may say "WADE BOGGS 26" (jersey #26) but the card number in the set is 50 (on the back).
- year comes from copyright line on the back (e.g. "1987 Sportflics, Inc.") or set branding — not the stats table years.
- brand = manufacturer (Sportflics, Donruss, Topps, Fleer, Bowman, Panini, Upper Deck).
- setName = human-readable set (e.g. "1987 Sportflics", "1988 Donruss").
- playerName = full player name only (e.g. "Wade Boggs") — never duplicate in cardName.
- searchQueries: 3-6 strings ordered best-first for PriceCharting/eBay, e.g. "1987 Sportflics Wade Boggs 50", "1987 Sportflics 50 Wade Boggs".
- Do not confuse players with similar last names (Wade Boggs ≠ Randall Boggs).
- Sportflics may appear as "Sportflics" or "Sportflics '87" on cards.
- Topps All-Pro / All Pro inserts: read the SET card number from the BACK (e.g. #233), not the jersey number on the front (e.g. Marino #13).
- Football/baseball: front position text (QUARTERBACK) and team name are NOT the player name — playerName is the person's name only (e.g. "Dan Marino").
- setName should include year when known (e.g. "1984 Topps All-Pro", "1987 Sportflics").

Also estimate raw market value for THIS copy from photos:
- marketPriceMid = fair USD mid for this card in visible condition (typical eBay/marketplace).
- rawPriceLow / rawPriceHigh = realistic range (e.g. $4-8 for common vintage base).
- priceConfidence = how sure you are (lower if identity or condition unclear).
- priceRationale = one sentence: set, player, #, demand, condition adjustment.
- conditionNote = brief condition read (e.g. "EX-MT raw, edge wear, decent centering").`;

export interface SportsImageRefs {
  frontImageUrl?: string;
  backImageUrl?: string;
}

/** Agent pass to refine sports card year, set #, and marketplace search queries. */
export async function enrichSportsCardIdentity(
  vision: VisionResult,
  images?: SportsImageRefs,
): Promise<VisionResult> {
  if (vision.category !== "sports") return vision;

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return vision;

  const model = process.env.OPENAI_VISION_MODEL ?? "gpt-4o";

  const imageContent: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "high" } }
  > = [
    {
      type: "text",
      text: `Extracted fields from prior scan:\n${JSON.stringify(
        {
          playerName: vision.playerName,
          cardName: vision.cardName,
          brand: vision.brand,
          setName: vision.setName,
          year: vision.year,
          cardNumber: vision.cardNumber,
          team: vision.team,
          parallel: vision.parallel,
        },
        null,
        2,
      )}\n\nRead the photos to correct jersey number vs set card number, find the copyright year, and estimate raw market value for this copy.`,
    },
  ];

  if (images?.frontImageUrl) {
    imageContent.push({
      type: "image_url",
      image_url: { url: images.frontImageUrl, detail: "high" },
    });
  }
  if (hasBackImage(images?.backImageUrl)) {
    imageContent.push({
      type: "text",
      text: "Back of card — read copyright year, manufacturer, and set card number (not jersey number).",
    });
    imageContent.push({
      type: "image_url",
      image_url: { url: images!.backImageUrl!, detail: "high" },
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
          { role: "system", content: `${SPORTS_AGENT_SYSTEM}\n${ENRICH_SCHEMA}` },
          { role: "user", content: imageContent },
        ],
        max_tokens: 900,
        temperature: 0.15,
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!response.ok) return vision;

    const data = await response.json();
    const parsed = JSON.parse(
      data.choices?.[0]?.message?.content ?? "{}",
    ) as Partial<{
      year: string | null;
      brand: string | null;
      setName: string | null;
      cardNumber: string | null;
      playerName: string | null;
      team: string | null;
      confidence: number;
      searchQueries: string[];
      marketPriceMid?: number | null;
      rawPriceLow?: number | null;
      rawPriceHigh?: number | null;
      priceConfidence?: number | null;
      priceRationale?: string | null;
      conditionNote?: string | null;
    }>;

    const player =
      parsed.playerName?.trim() ||
      vision.playerName?.trim() ||
      vision.cardName?.trim();

    const searchQueries = Array.isArray(parsed.searchQueries)
      ? parsed.searchQueries.map(String).filter(Boolean).slice(0, 8)
      : [];

    const priceEstimate = visionEstimateFromEnrich(parsed);

    return normalizeSportsVisionFields({
      ...vision,
      playerName: player,
      cardName: player ?? vision.cardName,
      brand: parsed.brand?.trim() || vision.brand,
      setName: parsed.setName?.trim() || vision.setName,
      year: parsed.year?.trim() || vision.year,
      cardNumber: parsed.cardNumber?.trim() || vision.cardNumber,
      team: parsed.team?.trim() || vision.team,
      confidence: Math.min(
        1,
        Math.max(vision.confidence, Number(parsed.confidence) || 0.65),
      ),
      agentSearchQueries: searchQueries.length
        ? searchQueries
        : vision.agentSearchQueries,
      visionPriceEstimate: priceEstimate ?? vision.visionPriceEstimate,
    });
  } catch {
    return vision;
  }
}
