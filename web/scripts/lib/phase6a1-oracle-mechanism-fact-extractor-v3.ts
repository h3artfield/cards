/**
 * Extract CommanderMechanismFacts from canonical Oracle text.
 * Facts only — no deck-strategy inference.
 */
import type {
  CommanderMechanismFactsEntry,
  CrossMemberRelationship,
  MechanismFact,
} from "../../src/lib/deck-synthesis/build-path-semantic-types-v3";
import type { CommanderCaseContext } from "./phase6a1-commander-case-context-v1";

export const ORACLE_MECHANISM_FACT_EXTRACTOR_V3_VERSION = "phase6a1-oracle-mechanism-fact-extractor-v3";

function splitOracleSegments(oracleText: string): string[] {
  return oracleText
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^choose a background/i.test(s) && !/^partner/i.test(s));
}

function parseSegment(segment: string, sourceOracleId: string, commanderName: string, idx: number): MechanismFact {
  const evidenceSpan = segment;
  const lower = segment.toLowerCase();

  let trigger: string | null = null;
  let action: string | null = null;
  let subject: string | null = null;
  let condition: string | null = null;
  let object: string | null = null;
  let zoneFrom: string | null = null;
  let zoneTo: string | null = null;
  let resourceConsumed: string | null = null;
  let output: string | null = null;

  const whenever = segment.match(/^(Whenever|When|At the beginning of)[^,:.]+/i);
  if (whenever) {
    trigger = whenever[0].trim();
    subject = "controller_or_game";
  }

  if (/\{t\}/i.test(segment) || /^[^:]+\:/.test(segment)) {
    action = "ACTIVATED";
    const costMatch = segment.match(/^(\{[^}]+\}(?:,\s*\{[^}]+\})*)/);
    if (costMatch) resourceConsumed = costMatch[1];
  }

  if (/create .* token/i.test(segment)) {
    output = segment.match(/create [^.]+/i)?.[0] ?? "token";
  }
  if (/draw a card/i.test(segment)) output = "draw_card";
  if (/mills? \w+/i.test(segment)) {
    action = action ?? "MILL";
    object = segment.match(/mills? [^.]+/i)?.[0] ?? null;
  }
  if (/return target .* from your graveyard/i.test(segment)) {
    action = action ?? "RETURN_FROM_GRAVEYARD";
    zoneFrom = "graveyard";
    zoneTo = "battlefield";
  }
  if (/put .* on top of .* library/i.test(segment)) {
    zoneFrom = "graveyard";
    zoneTo = "library_top";
  }
  if (/costs?\s*\{[^}]+\}\s*less/i.test(segment)) {
    action = "STATIC_COST_MODIFICATION";
    condition = segment.match(/[^"]*costs?[^"]*/i)?.[0] ?? null;
  }
  if (/have "/i.test(segment)) {
    action = "GRANTS_ABILITY";
    subject = "other_permanents";
  }

  return {
    factId: `${sourceOracleId}--fact-${idx}`,
    sourceOracleId,
    commanderName,
    trigger,
    action,
    subject,
    condition,
    object,
    zoneFrom,
    zoneTo,
    resourceConsumed,
    output,
    evidenceSpan,
    evidence: {
      type: "COMMANDER_ORACLE",
      sourceOracleId,
      sourceCommander: commanderName,
      oracleSpan: evidenceSpan,
    },
  };
}

function extractCrossMemberRelationships(ctx: CommanderCaseContext): CrossMemberRelationship[] {
  const rels: CrossMemberRelationship[] = [];
  if (ctx.commanderOracleTexts.length < 2) return rels;

  for (let i = 0; i < ctx.commanderOracleTexts.length; i++) {
    for (let j = i + 1; j < ctx.commanderOracleTexts.length; j++) {
      const a = ctx.commanderOracleTexts[i]!;
      const b = ctx.commanderOracleTexts[j]!;

      const isBackgroundGrant =
        /commander creatures you own have/i.test(b.oracleText) ||
        /commander creatures you own have/i.test(a.oracleText);

      rels.push({
        relationshipId: `${ctx.caseId}--${a.sourceOracleId}--${b.sourceOracleId}`,
        memberAOracleId: a.sourceOracleId,
        memberBOracleId: b.sourceOracleId,
        relationshipType: isBackgroundGrant ? "BACKGROUND_GRANT" : "PARTNER",
        description: isBackgroundGrant
          ? `${b.name} grants static ability to commander creatures`
          : `Partner command zone: ${a.name} + ${b.name}`,
        evidence: {
          type: "COMMANDER_ORACLE",
          sourceOracleId: isBackgroundGrant ? b.sourceOracleId : a.sourceOracleId,
          sourceCommander: isBackgroundGrant ? b.name : a.name,
          oracleSpan: isBackgroundGrant
            ? b.oracleText.slice(0, 120)
            : a.oracleText.split("\n")[0]?.slice(0, 120) ?? a.oracleText.slice(0, 120),
        },
      });
    }
  }
  return rels;
}

export function buildCommanderMechanismFacts(ctx: CommanderCaseContext): CommanderMechanismFactsEntry {
  const memberFacts = ctx.commanderOracleTexts.map((member) => {
    const segments = splitOracleSegments(member.oracleText);
    const mechanisms = segments.map((seg, idx) =>
      parseSegment(seg, member.sourceOracleId, member.name, idx),
    );
    return {
      sourceOracleId: member.sourceOracleId,
      commanderName: member.name,
      oracleText: member.oracleText,
      colorIdentity: member.colorIdentity,
      mechanisms,
    };
  });

  return {
    caseId: ctx.caseId,
    commanders: ctx.commanders,
    commandZoneConfiguration: ctx.commandZoneConfiguration,
    combinedColorIdentity: ctx.combinedColorIdentity,
    bracket: ctx.bracket,
    commanderOracleTexts: ctx.commanderOracleTexts.map((t) => ({
      sourceOracleId: t.sourceOracleId,
      name: t.name,
      oracleText: t.oracleText,
    })),
    memberFacts,
    crossMemberRelationships: extractCrossMemberRelationships(ctx),
    adjudicationStatus: "PENDING_INDEPENDENT_SEMANTIC_ADJUDICATION",
  };
}

export function buildMechanismFactsCatalog(contexts: CommanderCaseContext[]): CommanderMechanismFactsEntry[] {
  return contexts.map(buildCommanderMechanismFacts);
}

export function oracleSummaryFromFacts(entry: CommanderMechanismFactsEntry): string {
  return entry.memberFacts
    .flatMap((m) => m.mechanisms.map((f) => f.evidenceSpan))
    .slice(0, 3)
    .join("; ");
}
