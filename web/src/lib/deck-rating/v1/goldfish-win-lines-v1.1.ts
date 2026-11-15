/**
 * Authored terminal lines (spec rev2 work-order step 3).
 * T_first fires on first opponent eliminated or a terminal line.
 * Infinite-mana without a sink is not a win.
 */
export const DR_WIN_LINES = "deck-rating-win-lines-v1.1";

export const THASSAS_ORACLE = "Thassa's Oracle";
export const DEMONIC_CONSULTATION = "Demonic Consultation";
export const TAINTED_PACT = "Tainted Pact";

export const AUTHORED_WIN_LINE_NAMES = new Set([
  THASSAS_ORACLE,
  DEMONIC_CONSULTATION,
  TAINTED_PACT,
  "Ad Nauseam",
  "Necropotence",
  "Underworld Breach",
  "Wheel of Fortune",
  "Final Fortune",
  "Birgi, God of Storytelling // Harnfel, Horn of Bounty",
  "Brain Freeze",
  "Sevinne's Reclamation",
  "Beseech the Mirror",
  "Snap",
]);

export function isOracleLineCard(name: string): boolean {
  return name === THASSAS_ORACLE || name === DEMONIC_CONSULTATION || name === TAINTED_PACT;
}

export function oracleLineCost(hasConsult: boolean, hasPact: boolean): number | null {
  if (hasConsult) return 1 + 3;
  if (hasPact) return 2 + 3;
  return null;
}

/** Infinite mana with no sink does not end the game. */
export function infiniteManaIsTerminal(_mana: number, hasSink: boolean): boolean {
  return hasSink;
}
