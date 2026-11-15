/**
 * Spellbook produces-features → goldfish resource tokens.
 * Reviewed map; unmapped features produce nothing.
 */
export const DR_FEATURE_TOKENS_V2 = "deck-rating-goldfish-feature-tokens-v2";

export const TOKEN_KINDS = [
  "MANA",
  "INF_MANA",
  "INF_DRAW",
  "DRAW_LIBRARY",
  "LIBRARY_EMPTY",
  "INF_STORM",
  "INF_ETB",
  "INF_DEATH",
  "INF_CAST",
  "INF_DAMAGE_EACH_OPP",
  "INF_LIFELOSS_EACH_OPP",
  "INF_MILL_EACH_OPP",
  "WIN",
] as const;

export type TokenKind = (typeof TOKEN_KINDS)[number];

export type ResourceToken = {
  kind: TokenKind;
  colors?: string;
  amount?: number;
  source: string;
};

export function isLethalToken(kind: TokenKind): boolean {
  return (
    kind === "WIN" ||
    kind === "INF_DAMAGE_EACH_OPP" ||
    kind === "INF_LIFELOSS_EACH_OPP" ||
    kind === "INF_MILL_EACH_OPP"
  );
}

function opponentScoped(name: string): boolean {
  return /\b(each opponent|all opponents|opponents|target opponent|an opponent)\b/i.test(name);
}

function selfOnly(name: string): boolean {
  return /\b(self-mill|your library|you mill|yourself)\b/i.test(name) && !opponentScoped(name);
}

/** Map one CommanderSpellbook feature name onto zero or more tokens. */
export function featureNameToTokens(name: string, source: string): ResourceToken[] {
  const n = name.trim();
  const low = n.toLowerCase();
  const out: ResourceToken[] = [];
  const add = (kind: TokenKind, extra?: Partial<ResourceToken>) => {
    out.push({ kind, source, ...extra });
  };

  if (/\bwin the game\b/i.test(low) && !/opponent/.test(low)) add("WIN");
  if (/\bexile your library\b/i.test(low) || /\bempty your library\b/i.test(low)) add("LIBRARY_EMPTY");
  if (/\bdraw (?:the deck|your (?:entire )?library|your deck)\b/i.test(low)) add("DRAW_LIBRARY");

  if (
    (/\binfinite card draw\b/i.test(low) || /\binfinite draw(?: triggers)?\b/i.test(low)) &&
    !/opponent/.test(low) &&
    !/all players/.test(low)
  ) {
    add("INF_DRAW");
  }

  if (/\b(near-)?infinite storm count\b/i.test(low)) add("INF_STORM");
  if (/\binfinite creature etb\b/i.test(low) || /\binfinite etb\b/i.test(low)) add("INF_ETB");
  if (/\binfinite death triggers\b/i.test(low)) add("INF_DEATH");
  if (/\binfinite (?:commander )?casts\b/i.test(low) && !/can't/.test(low)) add("INF_CAST");

  if (/\binfinite colorless mana\b/i.test(low) && !/opponent/.test(low)) {
    add("INF_MANA", { colors: "C" });
  } else if (
    (/\b(near-)?infinite (?:colored |black |blue |red |green |white )?mana\b/i.test(low) ||
      /\binfinite mana (?:nonland )?permanents you control can produce\b/i.test(low) ||
      /\bnear-infinite colored mana\b/i.test(low)) &&
    !/opponent/.test(low) &&
    !/all players/.test(low)
  ) {
    let colors = "WUBRG";
    if (/\bcolorless\b/.test(low)) colors = "C";
    else if (/\bblack mana\b/.test(low)) colors = "B";
    else if (/\bblue mana\b/.test(low)) colors = "U";
    else if (/\bred mana\b/.test(low)) colors = "R";
    else if (/\bgreen mana\b/.test(low)) colors = "G";
    else if (/\bwhite mana\b/.test(low)) colors = "W";
    add("INF_MANA", { colors });
  }

  if (
    (/\b(near-)?infinite (?:combat )?damage\b/i.test(low) ||
      /\binfinite damage to (?:each |all |one )?opponents?\b/i.test(low)) &&
    !/prevent/.test(low)
  ) {
    add("INF_DAMAGE_EACH_OPP");
  }

  if (/\binfinite lifeloss\b/i.test(low) && !/you lose/.test(low)) add("INF_LIFELOSS_EACH_OPP");

  if (/\b(near-)?infinite mill\b/i.test(low) && !selfOnly(low)) add("INF_MILL_EACH_OPP");

  return out;
}

export const FEATURE_TOKEN_REVIEW = {
  version: DR_FEATURE_TOKENS_V2,
  notes: [
    "Infinite mana without a sink is not WIN.",
    "Self-mill is not INF_MILL_EACH_OPP.",
    "Opponent-only draw is not INF_DRAW.",
  ],
};
