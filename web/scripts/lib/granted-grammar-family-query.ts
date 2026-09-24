/**
 * Parser-blind grammar-family span extraction from canonical oracle text.
 * Does NOT use parser output.
 */
import type { MachineGroundedBenchmarkTarget } from "./benchmark-identity";
import { spanFromRange } from "./benchmark-identity";
import { goldenOracleTextHash } from "./load-golden-catalog-index";

export type GrammarFamily =
  | "equipment_has"
  | "enchanted_has"
  | "creatures_gain"
  | "creatures_have"
  | "target_gains"
  | "token_has";

export type GrammarFamilyDefinition = {
  family: GrammarFamily;
  /** Lexical catalog query — canonical oracle text only */
  catalogQuery: RegExp;
  description: string;
};

export const GRANT_GRAMMAR_FAMILIES: GrammarFamilyDefinition[] = [
  {
    family: "equipment_has",
    catalogQuery: /\bEquipped creature (?:has |gets [^.\n]+ and has )/i,
    description: "Equipped creature has <complement> or gets ... and has ...",
  },
  {
    family: "enchanted_has",
    catalogQuery: /\bEnchanted creature (?:has |gets [^.\n]+ and has )/i,
    description: "Enchanted creature has <complement> or gets ... and has ...",
  },
  {
    family: "creatures_gain",
    catalogQuery: /\bCreatures you control gain /i,
    description: "Creatures you control gain <complement>",
  },
  {
    family: "creatures_have",
    catalogQuery: /\bCreatures you control have /i,
    description: "Creatures you control have <complement>",
  },
  {
    family: "target_gains",
    catalogQuery: /\bTarget (?:creature|permanent|player|spell|artifact|enchantment|planeswalker) gains /i,
    description: "Target X gains <complement>",
  },
  {
    family: "token_has",
    catalogQuery: /\b(?:Each token you control has|This token has|tokens you control have) /i,
    description: "Token-recipient static grant",
  },
];

export type ContextControlKind =
  | "token_definition"
  | "source_owned_reference"
  | "created_object_capability"
  | "reminder_only"
  | "hard_negative_surface";

export const CONTEXT_CONTROL_QUERIES: Array<{
  kind: ContextControlKind;
  catalogQuery: RegExp;
  description: string;
}> = [
  {
    kind: "token_definition",
    catalogQuery: /\bA \w+ token is an artifact with\b/i,
    description: "Glossary token definition parenthetical",
  },
  {
    kind: "source_owned_reference",
    catalogQuery: /\bWhen enchanted (?:creature|permanent) (?:dies|is put into exile)/i,
    description: "Aura-owned trigger referring to enchanted permanent",
  },
  {
    kind: "created_object_capability",
    catalogQuery: /\bCreate (?:a|an|X|\d+) [^.!\n]{0,80}\. It has /i,
    description: "Created object inline capability",
  },
  {
    kind: "reminder_only",
    catalogQuery: /\bFlying \(This creature can't be blocked except by creatures with flying/i,
    description: "Keyword with reminder text only",
  },
  {
    kind: "hard_negative_surface",
    catalogQuery: /\b(?:creature|permanent|artifact) with (?:flying|first strike|trample|hexproof)\b/i,
    description: "Ordinary 'with keyword' not a grant construction",
  },
];

function endOfComplement(text: string, start: number): number {
  let end = start;
  while (end < text.length && text[end] !== "." && text[end] !== "\n") end++;
  return end;
}

function extractHasPattern(
  oracleText: string,
  family: GrammarFamily,
  recipientLabel: "Equipped creature" | "Enchanted creature",
): MachineGroundedBenchmarkTarget[] {
  const results: MachineGroundedBenchmarkTarget[] = [];
  const re = new RegExp(`\\b${recipientLabel.replace(/ /g, " ")} `, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(oracleText)) !== null) {
    const recipientStart = m.index;
    const recipientEnd = recipientStart + recipientLabel.length;
    const hasIdx = oracleText.indexOf(" has ", recipientEnd);
    if (hasIdx < 0) continue;

    const between = oracleText.slice(recipientEnd, hasIdx);
    let nonGrantPredicateSpan: TextSpan | undefined;
    if (/^\s*gets\s+.+\s+and\s*$/i.test(between)) {
      const getsStart = oracleText.indexOf("gets", recipientEnd);
      const andIdx = oracleText.lastIndexOf(" and", hasIdx);
      if (getsStart >= 0 && andIdx > getsStart) {
        nonGrantPredicateSpan = spanFromRange(oracleText, getsStart, andIdx);
      }
    }

    const verbStart = hasIdx + 1;
    const verbEnd = hasIdx + 4;
    const complementStart = hasIdx + 5;
    const complementEndIdx = endOfComplement(oracleText, complementStart);

    results.push({
      grammarFamily: family,
      expectedContext: "genuine_granted",
      recipientSpan: spanFromRange(oracleText, recipientStart, recipientEnd),
      nonGrantPredicateSpan,
      grantingVerbSpan: spanFromRange(oracleText, verbStart, verbEnd),
      grantedComplementSpan: spanFromRange(oracleText, complementStart, complementEndIdx),
      fullRegionSpan: spanFromRange(oracleText, recipientStart, complementEndIdx),
      oracleTextHash: goldenOracleTextHash(oracleText),
      adjudicationStatus: "parser_blind_adjudicated",
    });
  }
  return results;
}

function extractGainPattern(
  oracleText: string,
  family: GrammarFamily,
  prefix: string,
): MachineGroundedBenchmarkTarget[] {
  const results: MachineGroundedBenchmarkTarget[] = [];
  const re = new RegExp(`\\b${prefix}`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(oracleText)) !== null) {
    const recipientStart = m.index;
    const gainIdx = oracleText.indexOf(" gain ", recipientStart);
    const haveIdx = oracleText.indexOf(" have ", recipientStart);
    const verbIdx = gainIdx >= 0 ? gainIdx : haveIdx;
    if (verbIdx < 0 || verbIdx > recipientStart + prefix.length + 5) continue;
    const verbWord = gainIdx >= 0 ? "gain" : "have";
    const verbStart = verbIdx + 1;
    const verbEnd = verbStart + verbWord.length;
    const complementStart = verbEnd + 1;
    const complementEndIdx = endOfComplement(oracleText, complementStart);
    const recipientEnd = verbIdx;

    results.push({
      grammarFamily: family,
      expectedContext: "genuine_granted",
      recipientSpan: spanFromRange(oracleText, recipientStart, recipientEnd),
      grantingVerbSpan: spanFromRange(oracleText, verbStart, verbEnd),
      grantedComplementSpan: spanFromRange(oracleText, complementStart, complementEndIdx),
      fullRegionSpan: spanFromRange(oracleText, recipientStart, complementEndIdx),
      oracleTextHash: goldenOracleTextHash(oracleText),
      adjudicationStatus: "parser_blind_adjudicated",
    });
  }
  return results;
}

function extractTargetGains(oracleText: string): MachineGroundedBenchmarkTarget[] {
  const results: MachineGroundedBenchmarkTarget[] = [];
  const re = /\bTarget (?:creature|permanent|player|spell|artifact|enchantment|planeswalker) gains /gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(oracleText)) !== null) {
    const recipientStart = m.index;
    const gainsIdx = m.index + m[0].toLowerCase().indexOf("gains");
    const recipientEnd = gainsIdx;
    const verbStart = gainsIdx;
    const verbEnd = gainsIdx + 5;
    const complementStart = m.index + m[0].length;
    const complementEndIdx = endOfComplement(oracleText, complementStart);
    results.push({
      grammarFamily: "target_gains",
      expectedContext: "genuine_granted",
      recipientSpan: spanFromRange(oracleText, recipientStart, recipientEnd),
      grantingVerbSpan: spanFromRange(oracleText, verbStart, verbEnd),
      grantedComplementSpan: spanFromRange(oracleText, complementStart, complementEndIdx),
      fullRegionSpan: spanFromRange(oracleText, recipientStart, complementEndIdx),
      oracleTextHash: goldenOracleTextHash(oracleText),
      adjudicationStatus: "parser_blind_adjudicated",
    });
  }
  return results;
}

export function extractGrammarFamilyTargets(
  oracleText: string,
  family: GrammarFamily,
): MachineGroundedBenchmarkTarget[] {
  switch (family) {
    case "equipment_has":
      return extractHasPattern(oracleText, family, "Equipped creature");
    case "enchanted_has":
      return extractHasPattern(oracleText, family, "Enchanted creature");
    case "creatures_gain":
      return extractGainPattern(oracleText, family, "Creatures you control");
    case "creatures_have":
      return extractGainPattern(oracleText, family, "Creatures you control");
    case "target_gains":
      return extractTargetGains(oracleText);
    case "token_has": {
      const patterns = ["Each token you control", "This token", "tokens you control"];
      const all: MachineGroundedBenchmarkTarget[] = [];
      for (const p of patterns) {
        all.push(...extractGainPattern(oracleText, family, p));
      }
      return all;
    }
    default:
      return [];
  }
}

export function extractContextControlTarget(
  oracleText: string,
  kind: ContextControlKind,
): MachineGroundedBenchmarkTarget | null {
  const hash = goldenOracleTextHash(oracleText);
  const expectedContext =
    kind === "hard_negative_surface"
      ? "no_grant"
      : kind === "token_definition"
        ? "token_definition"
        : kind === "source_owned_reference"
          ? "source_owned_reference"
          : kind === "created_object_capability"
            ? "created_object_capability"
            : "reminder_only";

  for (const def of CONTEXT_CONTROL_QUERIES) {
    if (def.kind !== kind) continue;
    const m = def.catalogQuery.exec(oracleText);
    if (!m) return null;
    const start = m.index;
    const end = endOfComplement(oracleText, start + m[0].length);
    return {
      expectedContext,
      fullRegionSpan: spanFromRange(oracleText, start, Math.min(end, start + 200)),
      oracleTextHash: hash,
      adjudicationStatus: "parser_blind_adjudicated",
    };
  }
  return null;
}

export function catalogMatchesFamily(oracleText: string, family: GrammarFamily): boolean {
  const def = GRANT_GRAMMAR_FAMILIES.find((f) => f.family === family);
  return def ? def.catalogQuery.test(oracleText) : false;
}

export function catalogMatchesContextControl(oracleText: string, kind: ContextControlKind): boolean {
  const def = CONTEXT_CONTROL_QUERIES.find((c) => c.kind === kind);
  return def ? def.catalogQuery.test(oracleText) : false;
}
