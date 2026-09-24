/**
 * Phase 6A calibration v2 — typed negative-constraint severity + upstream spec audit.
 */
import { commanderLegalInIdentity } from "@/lib/semantic-visualization/filters-v1";
import type { DeckResolutionCatalog } from "./load-deck-resolution-catalog";
import type { RetrievalSpecification } from "../../src/lib/deck-synthesis/archetype-discovery-types-v1";
import type { ConstraintSeverity, UpstreamSpecClassification } from "./phase6a-calibration-v2-types";

export const CONSTRAINT_SEVERITY_BY_TOKEN: Record<string, ConstraintSeverity> = {
  minimize_controller_noncreature_spells: "DENSITY_TARGET",
};

export function classifyConstraintSeverity(raw: string): ConstraintSeverity {
  for (const [token, severity] of Object.entries(CONSTRAINT_SEVERITY_BY_TOKEN)) {
    if (raw.includes(token)) return severity;
  }
  if (raw.startsWith("avoid_") || raw.includes("must_not")) return "HARD_EXCLUDE";
  if (raw.includes("prefer_") || raw.includes("substitute")) return "PREFER_SUBSTITUTE";
  if (raw.includes("self_penalty") || raw.includes("penalty")) return "SELF_PENALTY";
  if (raw.includes("minimize") || raw.includes("density")) return "DENSITY_TARGET";
  return "SOFT_AVOID";
}

/** Noncreature spell — not limited to instants/sorceries. */
export function isNoncreatureSpellCard(typeLine: string): boolean {
  const tl = (typeLine ?? "").toLowerCase();
  if (!tl.trim()) return false;
  if (/\bcreature\b/.test(tl)) return false;
  if (/^basic land|^land\b|\bland\b/.test(tl) && !/\b(instant|sorcery|enchantment|artifact|planeswalker|battle)\b/.test(tl)) {
    return false;
  }
  return /\b(instant|sorcery|enchantment|planeswalker|battle)\b/.test(tl) || (/\bartifact\b/.test(tl) && !/\bcreature\b/.test(tl));
}

function commanderOracleBlob(catalog: DeckResolutionCatalog, oracleIds: string[]): string {
  return oracleIds
    .map((id) => catalog.byOracleId.get(id)?.oracleText ?? "")
    .join("\n")
    .toLowerCase();
}

function commanderRewardsNoncreatureSpells(text: string): boolean {
  return (
    /whenever you cast a noncreature spell/.test(text) ||
    /whenever you cast an instant or sorcery spell/.test(text) ||
    /whenever you cast a spell/.test(text) ||
    /prowess/.test(text) ||
    /magecraft/.test(text) ||
    /cast noncreature spells? from the top/.test(text) ||
    /you may cast .* from the top of your library/.test(text)
  );
}

function commanderPunishesOpponentNoncreatureSpells(text: string): boolean {
  return (
    /whenever an opponent casts a noncreature spell/.test(text) ||
    /whenever an opponent casts an instant or sorcery spell/.test(text) ||
    /deals .* damage to any target.*whenever an opponent casts/.test(text)
  );
}

export type UpstreamConstraintAuditEntry = {
  caseId: string;
  commanders: string[];
  rawConstraint: string;
  typedSeverity: ConstraintSeverity;
  classification: UpstreamSpecClassification;
  detail: string;
  commanderSpellRewardSignals: string[];
  commanderSpellPunishmentSignals: string[];
};

export function auditUpstreamNegativeSpec(input: {
  caseId: string;
  commanders: string[];
  commanderOracleIds: string[];
  spec: RetrievalSpecification;
  catalog: DeckResolutionCatalog;
}): UpstreamConstraintAuditEntry[] {
  const blob = commanderOracleBlob(input.catalog, input.commanderOracleIds);
  const spellReward = commanderRewardsNoncreatureSpells(blob);
  const spellPunish = commanderPunishesOpponentNoncreatureSpells(blob);
  const entries: UpstreamConstraintAuditEntry[] = [];

  for (const raw of input.spec.constructionConstraints) {
    const typedSeverity = classifyConstraintSeverity(raw);
    let classification: UpstreamSpecClassification = "CONSISTENT";
    let detail = "Constraint consistent with commander mechanics.";

    if (raw.includes("minimize_controller_noncreature_spells")) {
      if (spellReward && !spellPunish) {
        classification = "HUMAN_REVIEW_REQUIRED_SPEC_CONFLICT";
        detail =
          "Commander oracle rewards/permit controller noncreature spell casting; minimize_controller_noncreature_spells contradicts the frozen direction — pending independent spec adjudication.";
      } else if (spellReward && spellPunish) {
        classification = "AMBIGUOUS";
        detail = "Commander both rewards controller spells and punishes opponent spells — density target may be intentional.";
      } else if (spellPunish) {
        classification = "CONSISTENT";
        detail = "Spell-punishment direction — density pressure on controller noncreature spells is mechanically coherent.";
      }
    }

    entries.push({
      caseId: input.caseId,
      commanders: input.commanders,
      rawConstraint: raw,
      typedSeverity,
      classification,
      detail,
      commanderSpellRewardSignals: spellReward ? ["controller_noncreature_spell_reward"] : [],
      commanderSpellPunishmentSignals: spellPunish ? ["opponent_noncreature_spell_punishment"] : [],
    });
  }

  for (const cls of input.spec.avoidCardClasses) {
    entries.push({
      caseId: input.caseId,
      commanders: input.commanders,
      rawConstraint: cls,
      typedSeverity: "HARD_EXCLUDE",
      classification: "CONSISTENT",
      detail: "Typed avoidCardClasses entry.",
      commanderSpellRewardSignals: [],
      commanderSpellPunishmentSignals: [],
    });
  }

  for (const fn of input.spec.avoidFunctions) {
    entries.push({
      caseId: input.caseId,
      commanders: input.commanders,
      rawConstraint: fn,
      typedSeverity: "SOFT_AVOID",
      classification: "CONSISTENT",
      detail: "Typed avoidFunctions entry.",
      commanderSpellRewardSignals: [],
      commanderSpellPunishmentSignals: [],
    });
  }

  for (const penalty of input.spec.selfPenaltyConditions) {
    entries.push({
      caseId: input.caseId,
      commanders: input.commanders,
      rawConstraint: typeof penalty === "string" ? penalty : JSON.stringify(penalty),
      typedSeverity: "SELF_PENALTY",
      classification: "CONSISTENT",
      detail: "Typed selfPenaltyConditions entry.",
      commanderSpellRewardSignals: [],
      commanderSpellPunishmentSignals: [],
    });
  }

  return entries;
}

export function auditAllUpstreamNegativeSpecs(
  cases: Array<{
    caseId: string;
    commanders: string[];
    commanderOracleIds: string[];
    spec: RetrievalSpecification;
  }>,
  catalog: DeckResolutionCatalog,
): {
  entries: UpstreamConstraintAuditEntry[];
  casesWithMinimizeConstraint: number;
  upstreamSpecConflicts: UpstreamConstraintAuditEntry[];
} {
  const entries = cases.flatMap((c) =>
    auditUpstreamNegativeSpec({ ...c, catalog }),
  );
  const minimizeCases = entries.filter((e) => e.rawConstraint.includes("minimize_controller_noncreature_spells"));
  const upstreamSpecConflicts = entries.filter((e) => e.classification === "HUMAN_REVIEW_REQUIRED_SPEC_CONFLICT");
  return {
    entries,
    casesWithMinimizeConstraint: new Set(minimizeCases.map((e) => e.caseId)).size,
    upstreamSpecConflicts,
  };
}

export function colorIdentityLegal(
  catalog: DeckResolutionCatalog,
  oracleId: string,
  combinedColorIdentity: string[],
): boolean {
  const card = catalog.byOracleId.get(oracleId);
  if (!card) return false;
  return commanderLegalInIdentity(card.colorIdentity ?? [], combinedColorIdentity);
}
