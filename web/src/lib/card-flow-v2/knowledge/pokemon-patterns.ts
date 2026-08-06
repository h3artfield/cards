/** Set IDs (Pokémon TCG API) known to include Master Ball reverse holo variants. */
export const POKEMON_MASTER_BALL_SET_IDS = new Set([
  "sv8pt5", // Prismatic Evolutions
  "sv3pt5", // Scarlet & Violet—151
  "zsv10pt5", // Black Bolt (when released in EN)
  "rsv10pt5", // White Flare
]);

export function setSupportsMasterBallReverse(setCode?: string, setName?: string): boolean {
  const code = setCode?.toLowerCase().trim() ?? "";
  if (code && POKEMON_MASTER_BALL_SET_IDS.has(code)) return true;
  const name = setName?.toLowerCase() ?? "";
  return (
    name.includes("prismatic evolutions") ||
    name.includes("151") ||
    name.includes("black bolt") ||
    name.includes("white flare")
  );
}

export const POKEMON_REVERSE_PATTERN_RULES = `Pokémon reverse holo pattern specialist (static photo):

PATTERN vs SOLID — not color. The art box is usually matte on reverse holos.

STANDARD REVERSE: repeating stars, dots, set motif, or generic holo texture on TEXT BOX and/or BORDER outside the art — no distinct Poké Ball icons in the pattern.

POKÉ BALL REVERSE: repeating Poké Ball icons in the holo pattern on border/text box (no letter M on the balls).

MASTER BALL REVERSE: repeating Master Ball icons — look for a visible "M" on the ball in the pattern. Much rarer than Poké Ball reverse. Not available on Trainer/Item/Stadium in some sets (e.g. Prismatic Evolutions).

NORMAL/NON-HOLO: border and text areas are uniform solid with NO repeating pattern.

Return JSON only:
{
  "reversePattern": "none"|"standard_reverse"|"poke_ball"|"master_ball"|"unknown",
  "confidence": number,
  "cropQuality": "clear"|"usable"|"poor"|"blocked"|"unknown",
  "inspectedRegions": string[],
  "evidenceNotes": string[]
}`;
