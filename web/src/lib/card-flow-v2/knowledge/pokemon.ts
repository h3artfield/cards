import type { CategoryDetectiveGuide } from "../types";

/** Vision rules for Pokémon finish — pattern vs solid, not color. */
export const POKEMON_IMAGE_EVIDENCE_RULES = `Pokémon reverse holo vs normal/non-holo (same collector number):
- The central illustration/art box is usually NOT holo on reverse holos — do not use art shine alone.
- Reverse holo: repeating holo pattern (stars, gears, Poké Balls, set motifs) on the TEXT BOX and/or silver frame/border OUTSIDE the illustration. Modern Scarlet & Violet reverse holos often show the pattern strongly on the border/frame even when the text box looks like a solid color in the photo.
- Normal/non-holo: those areas are a uniform solid fill with NO repeating pattern or holo texture — any base color (gray, tan, beige, etc.).
- The tell is pattern vs no pattern — NOT gray vs colored.
- If you see a repeating pattern anywhere outside the illustration (border, text box, rule box), record foil_pattern as "reverse holo".
- If areas outside the art are uniformly solid with no pattern, record "normal" or "non-holo".
- Japanese Art Rare (AR), Special Art Rare (SAR), and full-art illustration cards often have holo shine on the artwork itself WITHOUT a repeating border/text-box pattern — record foil_pattern as "art rare" or "holo" (NOT "reverse holo").
- If the collector number includes "AR", "SAR", or the card is clearly a Japanese high-rarity illustration card (069/066 over-set-number), prefer "art rare" over "reverse holo".
- If glare/photo quality makes pattern unclear, status must be "unknown" — never guess normal.`;

export const POKEMON_FOIL_FOLLOWUP_PROMPT = `FOCUS ONLY on Pokémon finish (reverse holo vs normal). Ignore pricing and catalog IDs.

Zoom mentally into:
1) The attack/effect text box below the artwork
2) The silver/colored frame and border outside the illustration

Reverse holo = visible repeating holo pattern (Poké Ball, star, gear, set motif) on text box OR border/frame.
Normal = uniform solid fill with NO repeating pattern in those areas.

Return JSON only:
{
  "foil_pattern": "reverse holo" | "normal" | "non-holo" | "unknown",
  "status": "observed" | "unknown",
  "confidence": number between 0 and 1,
  "reasoning": string,
  "patternRegions": string[]
}`;

export function pokemonDetectiveTips(guide: CategoryDetectiveGuide): string {
  return guide.staffTips.slice(0, 3).join("\n- ");
}
