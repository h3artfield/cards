/**
 * Structured compound-clause segmentation for Oracle ability paragraphs.
 * Separates clause structure from primitive extraction.
 */
import { createHash } from "node:crypto";
import {
  classifyTextRoleAt,
  clauseBoundaries,
  type TextRole,
} from "./oracle-span-role-classifier";

export type ClauseDependencyKind =
  | "sequence_after"
  | "if_you_do"
  | "when_you_do"
  | "parallel_and"
  | "unless"
  | "equal_to"
  | "none";

export interface ClauseDependency {
  kind: ClauseDependencyKind;
  referencedClauseId?: string;
  referentText?: string;
}

export interface CompoundClauseSegment {
  clauseId: string;
  parentAbilityId: string;
  evidenceStart: number;
  evidenceEnd: number;
  text: string;
  textRole: TextRole;
  dependency: ClauseDependency;
  sequenceIndex: number;
  referentTexts: string[];
}

const REFERENT_PATTERN =
  /\b(?:it|that card|that creature|that permanent|that land|that token|those cards|them|that player|cards exiled this way|creatures destroyed this way|cards they exiled this way)\b/gi;

const PARALLEL_VERB_SPLIT =
  /,\s+(?=(?:each |target |you |that |this |all |(?:discards?|sacrifices?|loses?|draws?|mills?|exiles?|destroys?|returns?|puts?|searches?|shuffles?|creates?|counters?|reveals?|gains?|deals?|taps?|untaps?)\b))/gi;

function stableClauseId(parentAbilityId: string, sequenceIndex: number, text: string): string {
  return createHash("sha256")
    .update(`${parentAbilityId}|${sequenceIndex}|${text.slice(0, 48)}`)
    .digest("hex")
    .slice(0, 16);
}

function detectReferentTexts(text: string): string[] {
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(REFERENT_PATTERN.source, REFERENT_PATTERN.flags);
  while ((m = re.exec(text)) !== null) {
    found.add(m[0].toLowerCase());
  }
  return [...found];
}

function splitDelimiterKind(delimiter: string): ClauseDependencyKind {
  if (/,\s*then\s+/i.test(delimiter) || /\.\s+Then\s+/i.test(delimiter)) return "sequence_after";
  if (/\b(?:If|When) you do\b/i.test(delimiter)) return "if_you_do";
  if (/,\s*and if you do\b/i.test(delimiter)) return "if_you_do";
  if (/,\s*and\s+/i.test(delimiter)) return "parallel_and";
  if (/\bunless\b/i.test(delimiter)) return "unless";
  if (/\bthat many\b/i.test(delimiter) || /\bequal to\b/i.test(delimiter)) return "equal_to";
  if (/;\s*/.test(delimiter)) return "sequence_after";
  if (/,\s+(?=discards?|sacrifices?|loses?|draws?|mills?|exiles?|destroys?)/i.test(delimiter)) {
    return "parallel_and";
  }
  return "none";
}

function extendedClauseBoundaries(paragraph: string): number[] {
  const starts = new Set(clauseBoundaries(paragraph));

  PARALLEL_VERB_SPLIT.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PARALLEL_VERB_SPLIT.exec(paragraph)) !== null) {
    if (m.index !== undefined) {
      const before = paragraph.slice(0, m.index);
      if (/\bsearch (?:your |their )?library for\b/i.test(before) && !/\bthen\b/i.test(before)) {
        continue;
      }
      starts.add(m.index + m[0].length);
    }
  }

  return [...starts].sort((a, b) => a - b);
}

/** Segment an ability paragraph into structured compound clauses. */
export function segmentCompoundClauses(input: {
  parentAbilityId: string;
  paragraph: string;
  paragraphStart?: number;
}): CompoundClauseSegment[] {
  const { parentAbilityId, paragraph } = input;
  const bounds = extendedClauseBoundaries(paragraph);
  const segments: CompoundClauseSegment[] = [];

  for (let i = 0; i < bounds.length; i++) {
    const start = bounds[i];
    const end = bounds[i + 1] ?? paragraph.length;
    const text = paragraph.slice(start, end).trim();
    if (text.length < 2) continue;

    let dependencyKind: ClauseDependencyKind = "none";
    let referencedClauseId: string | undefined;
    if (i > 0) {
      const delimiter = paragraph.slice(bounds[i - 1], start);
      dependencyKind = splitDelimiterKind(delimiter);
      if (dependencyKind !== "none" && segments.length > 0) {
        referencedClauseId = segments[segments.length - 1]?.clauseId;
      }
    }

    const localStart = start;
    const localEnd = start + text.length;
    segments.push({
      clauseId: stableClauseId(parentAbilityId, i, text),
      parentAbilityId,
      evidenceStart: (input.paragraphStart ?? 0) + localStart,
      evidenceEnd: (input.paragraphStart ?? 0) + localEnd,
      text,
      textRole: classifyTextRoleAt({
        paragraph,
        localStart: start,
        localEnd: end,
        segmentBounds: { start, end },
      }),
      dependency: {
        kind: dependencyKind,
        referencedClauseId,
        referentText: detectReferentTexts(text)[0],
      },
      sequenceIndex: i,
      referentTexts: detectReferentTexts(text),
    });
  }

  if (segments.length === 0 && paragraph.trim().length >= 2) {
    const text = paragraph.trim();
    segments.push({
      clauseId: stableClauseId(parentAbilityId, 0, text),
      parentAbilityId,
      evidenceStart: input.paragraphStart ?? 0,
      evidenceEnd: (input.paragraphStart ?? 0) + text.length,
      text,
      textRole: classifyTextRoleAt({
        paragraph,
        localStart: 0,
        localEnd: text.length,
        segmentBounds: { start: 0, end: paragraph.length },
      }),
      dependency: { kind: "none" },
      sequenceIndex: 0,
      referentTexts: detectReferentTexts(text),
    });
  }

  return segments;
}

/** Back-compat wrapper returning role-tagged spans for existing parser loop. */
export function compoundClauseSpansFromSegmentation(input: {
  parentAbilityId: string;
  paragraph: string;
}): Array<{ localStart: number; text: string; role: TextRole; clause: CompoundClauseSegment }> {
  const paragraphStartOffset = 0;
  return segmentCompoundClauses({
    parentAbilityId: input.parentAbilityId,
    paragraph: input.paragraph,
    paragraphStart: paragraphStartOffset,
  }).map((clause) => ({
    localStart: clause.evidenceStart - paragraphStartOffset,
    text: clause.text,
    role: clause.textRole,
    clause,
  }));
}
