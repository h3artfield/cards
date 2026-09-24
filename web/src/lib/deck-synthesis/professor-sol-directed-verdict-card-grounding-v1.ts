/**
 * Checks that a Head Professor verdict only describes cards the deck contains.
 *
 * A Fynn review graded A- discussed The Great Henge, Bow of Nylea, and Inkmoth
 * Nexus at length — none of which were in the list. All three are well-known
 * Fynn staples, so the model was describing the commander it knows rather than
 * the 99 it was handed, and it built arguments on them ("more top-heavy ...
 * because of The Great Henge"). A review that cites cards the player does not
 * own is worse than no review, because there is no way to tell which parts to
 * trust.
 *
 * Suggestions are held to a different standard than descriptions: proposing a
 * card the deck lacks is the entire point of a suggestion, while asserting the
 * deck contains one is a factual error.
 *
 * This module is pure — the caller supplies name resolution — so it can be
 * tested against real review text with no catalog present.
 */

export const PROFESSOR_SOL_DIRECTED_VERDICT_CARD_GROUNDING_V1_VERSION =
  "professor-sol-directed-verdict-card-grounding-v1";

/** Fields that assert what the deck contains. Every card named must be in it. */
export const DESCRIPTIVE_VERDICT_FIELDS_V1 = [
  "bracketFit",
  "strategyCoherence",
  "manaAssessment",
  "earlyMidLateGameAssessment",
  "winConditionAssessment",
  "interactionAssessment",
  "resilienceAssessment",
  "reasoningSummary",
  "selfBuildQuestionAnswer",
  "offPlanCards",
] as const;

/** Fields that propose changes. Naming a card the deck lacks is expected. */
export const SUGGESTION_VERDICT_FIELDS_V1 = ["requiredChanges", "optionalChanges"] as const;

export type VerdictFieldKindV1 = "DESCRIPTIVE" | "SUGGESTION";

export type OffDeckCitationV1 = {
  field: string;
  kind: VerdictFieldKindV1;
  /** The span as the model wrote it. */
  cited: string;
};

export type VerdictCardGroundingV1 = {
  citations: OffDeckCitationV1[];
  /** Off-deck cards asserted as present. These are factual errors. */
  descriptiveViolations: OffDeckCitationV1[];
  /** True when no descriptive field names a card outside the deck. */
  grounded: boolean;
};

/**
 * Words that are capitalised in these reviews and could collide with a real
 * card name. Basic land types are both card names and generic terms.
 */
const STOP_WORDS_V1 = new Set([
  "commander",
  "bracket",
  "professor",
  "architect",
  "constructor",
  "oracle",
  "plains",
  "island",
  "swamp",
  "mountain",
  "forest",
  "wastes",
  "yes",
  "no",
]);

/** Longest card name in Magic is well under this many words. */
const MAX_SPAN_WORDS_V1 = 6;

/**
 * Short spans normalise into common English and match by accident. Real
 * one-word card names below this length are missed, which is the safer error.
 */
const MIN_NORMALIZED_LENGTH_V1 = 5;

function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Splits prose into words, dropping surrounding punctuation but keeping
 * name-internal apostrophes and hyphens ("Gaea's Cradle", "Nykthos, Shrine to
 * Nyx" — the comma normalises away, so list separators do not merge names).
 */
function tokenize(text: string): string[] {
  return text
    .split(/\s+/)
    .map((token) => token.replace(/^[^\p{L}\p{N}'"]+/u, "").replace(/[^\p{L}\p{N}'".]+$/u, ""))
    .map((token) => token.replace(/[.,;:!?]+$/u, ""))
    .filter(Boolean);
}

function startsCapitalized(token: string): boolean {
  const first = token.replace(/^["']/, "").charAt(0);
  return first !== "" && first === first.toUpperCase() && /\p{L}/u.test(first);
}

/**
 * Finds card names mentioned in a block of prose.
 *
 * Card names are always capitalised in review prose, so a span must start with
 * a capital. At each position the longest resolving span wins, so "Bow of
 * Nylea" is preferred over a bare "Bow".
 */
export function findCardNamesInTextV1(args: {
  text: string;
  isRealCardName: (name: string) => boolean;
}): string[] {
  const tokens = tokenize(args.text);
  const found: string[] = [];

  let i = 0;
  while (i < tokens.length) {
    if (!startsCapitalized(tokens[i]!)) {
      i += 1;
      continue;
    }

    let matched: { span: string; words: number } | null = null;
    const maxLen = Math.min(MAX_SPAN_WORDS_V1, tokens.length - i);
    for (let len = maxLen; len >= 1; len -= 1) {
      const span = tokens.slice(i, i + len).join(" ");
      const key = normalizeName(span);
      if (key.length < MIN_NORMALIZED_LENGTH_V1) continue;
      if (len === 1 && STOP_WORDS_V1.has(key)) continue;
      if (!args.isRealCardName(span)) continue;
      matched = { span, words: len };
      break;
    }

    if (matched) {
      found.push(matched.span);
      i += matched.words;
      continue;
    }
    i += 1;
  }

  return found;
}

/**
 * Every name a deck entry can legitimately be cited by.
 *
 * A decklist stores a double-faced card under its printed name, "Bala Ged
 * Recovery // Bala Ged Sanctuary", while a review naturally refers to the face
 * it means. Indexing the printed name alone reported a card the deck genuinely
 * contained as off-deck, which then spent a corrective re-ask rewriting prose
 * that was already accurate.
 */
function deckNameKeysV1(name: string): string[] {
  const keys = [normalizeName(name)];
  if (name.includes("//")) {
    for (const face of name.split("//")) keys.push(normalizeName(face));
  }
  return keys.filter(Boolean);
}

function fieldText(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string");
  return [];
}

export function checkVerdictCardGroundingV1(args: {
  verdict: Record<string, unknown>;
  /** Every card name in the deck, including the commander. */
  deckCardNames: readonly string[];
  /** True when the name resolves to a real card in the catalog. */
  isRealCardName: (name: string) => boolean;
}): VerdictCardGroundingV1 {
  const deckKeys = new Set(args.deckCardNames.flatMap((name) => deckNameKeysV1(name)));
  const citations: OffDeckCitationV1[] = [];
  const seen = new Set<string>();

  const scan = (fields: readonly string[], kind: VerdictFieldKindV1): void => {
    for (const field of fields) {
      for (const text of fieldText(args.verdict[field])) {
        for (const name of findCardNamesInTextV1({ text, isRealCardName: args.isRealCardName })) {
          const key = normalizeName(name);
          if (deckKeys.has(key)) continue;
          const dedupeKey = `${field}::${key}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);
          citations.push({ field, kind, cited: name });
        }
      }
    }
  };

  scan(DESCRIPTIVE_VERDICT_FIELDS_V1, "DESCRIPTIVE");
  scan(SUGGESTION_VERDICT_FIELDS_V1, "SUGGESTION");

  const descriptiveViolations = citations.filter((citation) => citation.kind === "DESCRIPTIVE");
  return {
    citations,
    descriptiveViolations,
    grounded: descriptiveViolations.length === 0,
  };
}

/** Instruction appended to a re-ask so the model corrects its own claims. */
export function buildGroundingCorrectionNoticeV1(grounding: VerdictCardGroundingV1): string {
  const byName = new Map<string, string[]>();
  for (const violation of grounding.descriptiveViolations) {
    const fields = byName.get(violation.cited) ?? [];
    fields.push(violation.field);
    byName.set(violation.cited, fields);
  }

  const lines = [...byName.entries()].map(
    ([name, fields]) => `- "${name}" (described in: ${[...new Set(fields)].join(", ")})`,
  );

  return [
    "GROUNDING_CORRECTION_REQUIRED",
    "",
    "Your previous review described these cards as being in the deck, but they are NOT in the decklist you were given:",
    ...lines,
    "",
    "Re-read constructedDeck. Produce the review again, describing only cards that appear there.",
    "Do not restate a claim about a card that is not in the list, and do not build arguments on one.",
    "You may still recommend cards the deck lacks, but only inside requiredChanges or optionalChanges.",
  ].join("\n");
}
