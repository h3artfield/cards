/**
 * Shared ability-block parser — native and granted abilities use the same structural path.
 */
import type { OracleActionV1 } from "./oracle-action-parser-v1";
import type { SegmentedAbility, OracleAbilityType } from "./oracle-action-schema";
import { compoundClauseSpansWithRoles, type TextRole } from "./oracle-span-role-classifier";
import type { ExecutionContext, RC3ActionExtensions } from "./oracle-rc3-extraction-metadata";
import { tagGrantedContext } from "./oracle-rc3-extraction-metadata";

export interface AbilityBlockClause {
  clauseId: string;
  role: TextRole;
  text: string;
  localStart: number;
  localEnd: number;
}

export interface ParsedAbilityBlock {
  abilityId: string;
  abilityType: OracleAbilityType | "unknown";
  clauses: AbilityBlockClause[];
  costRegion?: { text: string; localStart: number; localEnd: number };
  effectRegion?: { text: string; localStart: number; localEnd: number };
}

export interface ActivatedColonSplit {
  costEnd: number;
  effectStart: number;
}

/** Colon-aware split for activated abilities (costRegion / effectRegion). */
export function splitActivatedColon(paragraph: string): ActivatedColonSplit | null {
  const trimmed = paragraph.trimStart();
  const offset = paragraph.length - trimmed.length;
  if (/^(When|Whenever|At the beginning|If |Choose one)/i.test(trimmed)) return null;

  let colonIdx = -1;
  let depth = 0;
  let inQuote = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (inQuote) continue;
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === ":" && depth === 0) {
      colonIdx = i;
      break;
    }
  }
  if (colonIdx < 0) return null;

  const before = trimmed.slice(0, colonIdx).trim();
  const looksLikeCost =
    /^[+\−-]\d/.test(before) ||
    /\{[WUBRGC\d]+\}/.test(before) ||
    /\{T\}/.test(before) ||
    /\b(?:Discard|Sacrifice|Exile|Pay|Tap|Remove)\b/i.test(before);
  if (!looksLikeCost) return null;

  return { costEnd: offset + colonIdx, effectStart: offset + colonIdx + 1 };
}

export function inferBlockAbilityType(paragraph: string): OracleAbilityType | "unknown" {
  const t = paragraph.trim();
  if (/^(When|Whenever|At the beginning of)/i.test(t)) return "triggered";
  if (/^If .+ would /i.test(t)) return "replacement";
  if (splitActivatedColon(paragraph)) return "activated";
  if (/^[+\−-]\d:/.test(t) || /^\{[^}]+\}:/.test(t)) return "activated";
  return "static";
}

/** Parse paragraph into AbilityBlock with clause roles (same path for native + granted). */
export function parseAbilityBlock(input: {
  abilityId: string;
  paragraphText: string;
  paragraphStart: number;
  hostAbilityType?: OracleAbilityType | "unknown";
}): ParsedAbilityBlock {
  const colon = splitActivatedColon(input.paragraphText);
  const abilityType = inferBlockAbilityType(input.paragraphText);

  if (colon) {
    const costText = input.paragraphText.slice(0, colon.costEnd).trim();
    const effectText = input.paragraphText.slice(colon.effectStart).trimStart();
    const effectAbsStart = colon.effectStart + (input.paragraphText.slice(colon.effectStart).length - effectText.length);
    const effectClauses = compoundClauseSpansWithRoles(effectText, `${input.abilityId}:effect`).map((span, idx) => ({
      clauseId: `${input.abilityId}:effect:${idx}`,
      role: span.role,
      text: span.text,
      localStart: effectAbsStart + span.localStart,
      localEnd: effectAbsStart + span.localStart + span.text.length,
    }));
    return {
      abilityId: input.abilityId,
      abilityType: "activated",
      clauses: effectClauses,
      costRegion: { text: costText, localStart: 0, localEnd: colon.costEnd },
      effectRegion: { text: effectText, localStart: effectAbsStart, localEnd: input.paragraphText.length },
    };
  }

  const clauses = compoundClauseSpansWithRoles(input.paragraphText, input.abilityId).map((span, idx) => ({
    clauseId: `${input.abilityId}:clause-${idx}`,
    role: span.role,
    text: span.text,
    localStart: span.localStart,
    localEnd: span.localStart + span.text.length,
  }));

  return {
    abilityId: input.abilityId,
    abilityType: abilityType === "unknown" ? (input.hostAbilityType ?? "unknown") : abilityType,
    clauses,
  };
}

export function mapNestedProvenance(input: {
  action: OracleActionV1 & RC3ActionExtensions;
  block: ParsedAbilityBlock;
  hostAbility: SegmentedAbility;
  cardParagraphStart: number;
  executionContext: ExecutionContext;
  grantedMeta?: { grantingClauseId: string; grantedAbilityId: string; grantedTo?: string };
}): OracleActionV1 & RC3ActionExtensions {
  const absStart = input.cardParagraphStart + input.action.evidenceStart;
  const absEnd = input.cardParagraphStart + input.action.evidenceEnd;
  let mapped: OracleActionV1 & RC3ActionExtensions = {
    ...input.action,
    evidenceStart: absStart,
    evidenceEnd: absEnd,
    cardEvidenceStart: absStart,
    cardEvidenceEnd: absEnd,
    parentAbilityId: input.block.abilityId,
    executionContext: input.executionContext,
    extractionSource: "rc3_clause_native",
  };
  if (input.grantedMeta) {
    mapped = tagGrantedContext({
      action: mapped,
      grantingClauseId: input.grantedMeta.grantingClauseId,
      grantedAbilityId: input.grantedMeta.grantedAbilityId,
      grantedTo: input.grantedMeta.grantedTo,
    });
  }
  return mapped;
}
