import { deckBuilderStore } from "../../deck-builder/deck-builder-store";
import type { EdhrecCommanderMeta } from "../../deck-builder/types";

function normalizeKeyword(keyword: string): string {
  return keyword.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim();
}

function keywordMatchesText(keyword: string, text: string): boolean {
  const k = normalizeKeyword(keyword);
  const t = text.toLowerCase();
  if (!k) return false;
  if (t.includes(k)) return true;
  if (k.endsWith("s") && t.includes(k.slice(0, -1))) return true;
  if (!k.endsWith("s") && t.includes(`${k}s`)) return true;
  return false;
}

const TRIBAL_PATTERN =
  /\b(bird|elf|goblin|zombie|dragon|vampire|merfolk|human|cat|dog|sliver|dinosaur|wizard|warrior|knight|soldier|spirit|horror|demon|angel)s?\b/i;

const MECHANIC_PATTERNS: Array<{ pattern: RegExp; keyword: string }> = [
  { pattern: /\bartifact/i, keyword: "artifact" },
  { pattern: /\bexile|cast(?:ing)?\s+(?:spells?\s+)?from\s+exile/i, keyword: "exile" },
  { pattern: /\btoken/i, keyword: "token" },
  { pattern: /\bblink|flicker/i, keyword: "blink" },
  { pattern: /\bgraveyard|mill|reanimat/i, keyword: "graveyard" },
  { pattern: /\bcounter/i, keyword: "counter" },
  { pattern: /\bequipment|voltron/i, keyword: "equipment" },
];

/** Extract explicit tribal/mechanic theme keywords from a commander question. */
export function extractCommanderThemeKeywords(question: string): string[] {
  const keywords = new Set<string>();
  const tribal = question.match(TRIBAL_PATTERN);
  if (tribal?.[1]) keywords.add(tribal[1].toLowerCase());

  for (const { pattern, keyword } of MECHANIC_PATTERNS) {
    if (pattern.test(question)) keywords.add(keyword);
  }

  return [...keywords];
}

export function hasExplicitCommanderTheme(question: string): boolean {
  return extractCommanderThemeKeywords(question).length > 0;
}

export function scoreEdhrecThemeFit(
  meta: EdhrecCommanderMeta | null,
  keywords: string[],
): number {
  if (!meta || keywords.length === 0) return 0;
  let score = 0;
  for (const keyword of keywords) {
    for (const theme of meta.themes ?? []) {
      const label = theme.label ?? "";
      const slug = theme.slug ?? "";
      if (keywordMatchesText(keyword, label) || keywordMatchesText(keyword, slug)) {
        score += 10 + Math.min(theme.count ?? 0, 5000) / 500;
      }
    }
    for (const [tag, count] of Object.entries(meta.tagCounts ?? {})) {
      if (keywordMatchesText(keyword, tag)) {
        score += 8 + Math.min(count ?? 0, 2000) / 200;
      }
    }
  }
  return score;
}

/** Score how well a commander matches requested theme keywords. */
export function scoreCommanderThemeRelevance(input: {
  keywords: string[];
  name: string;
  typeLine?: string;
  oracleText?: string;
  edhrecMeta?: EdhrecCommanderMeta | null;
}): number {
  if (input.keywords.length === 0) return 1;

  let score = 0;
  const combined = `${input.name} ${input.typeLine ?? ""} ${input.oracleText ?? ""}`;

  for (const keyword of input.keywords) {
    if (keywordMatchesText(keyword, combined)) score += 12;
    if (keywordMatchesText(keyword, input.typeLine ?? "")) score += 8;
    if (keywordMatchesText(keyword, input.oracleText ?? "")) score += 6;
  }

  score += scoreEdhrecThemeFit(input.edhrecMeta ?? null, input.keywords);
  return score;
}

export async function loadEdhrecMetaForCommander(input: {
  scryfallId?: string;
  name: string;
}): Promise<EdhrecCommanderMeta | null> {
  const cached = await deckBuilderStore.listEdhrecCommanders(2500);
  if (input.scryfallId) {
    const byId = cached.find(
      (m) => m.scryfallId === input.scryfallId && !m.themeSlug,
    );
    if (byId) return byId;
  }
  const norm = input.name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    cached.find(
      (m) =>
        !m.themeSlug &&
        m.commanderName?.toLowerCase().replace(/[^a-z0-9]/g, "") === norm,
    ) ?? null
  );
}
