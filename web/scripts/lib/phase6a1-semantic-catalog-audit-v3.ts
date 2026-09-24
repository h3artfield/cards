/**
 * Phase 6A.1 semantic catalog audit v3 — FACT vs STRATEGY validation.
 * Does NOT generate BuildPath v3 or retrieval candidates.
 */
import type {
  BridgeHypothesis,
  CommanderMechanismFactsEntry,
  IndependentEngineHypothesis,
  SemanticCatalogFailure,
  SemanticSlotRef,
  StrategyHypothesisEntry,
} from "../../src/lib/deck-synthesis/build-path-semantic-types-v3";
import type { CommanderCaseContext } from "./phase6a1-commander-case-context-v1";
import {
  looksLikeStrategyAssertion,
  oracleSummaryContradictsOracle,
  validateOracleEvidence,
} from "./phase6a1-semantic-evidence-v3";
import { getV2CatalogEntry, mechanicTokenMismatch, v2OracleSummary } from "./phase6a1-strategy-hypothesis-v1";
import { looksLikeStrategyAssertion, validateOracleEvidence } from "./phase6a1-semantic-evidence-v3";

export const SEMANTIC_CATALOG_AUDIT_V3_VERSION = "phase6a1-semantic-catalog-audit-v3";

const KNOWN_NON_CAUSAL_ENGINE_PATTERNS: Array<{
  caseId: string;
  enablerPattern: RegExp;
  payoffPattern: RegExp;
  message: string;
}> = [
  {
    caseId: "multi-kenrith",
    enablerPattern: /counter/i,
    payoffPattern: /reanimation/i,
    message: "+1/+1 counter enablers → Non-Kenrith reanimation are separate packages, not one causal engine",
  },
  {
    caseId: "partner-thrasios-tymna",
    enablerPattern: /creature midrange|combat payoff|efficient creature/i,
    payoffPattern: /card draw|non-combat draw/i,
    message: "Standalone creature midrange → Non-combat card draw is not an enabler→payoff engine",
  },
  {
    caseId: "single-mill-bruvac",
    enablerPattern: /self-mill|mill yourself/i,
    payoffPattern: /thoracle|dread return|graveyard win/i,
    message: "self-mill → Thoracle/Dread Return is invented strategy, not Bruvac Oracle-derived",
  },
];

function fail(
  category: SemanticCatalogFailure["category"],
  caseId: string,
  subjectId: string,
  message: string,
  detail?: Record<string, unknown>,
): SemanticCatalogFailure {
  return { category, caseId, subjectId, message, detail };
}

function auditSlotEvidence(
  caseId: string,
  slot: SemanticSlotRef,
  subjectId: string,
  oracleTexts: CommanderCaseContext["commanderOracleTexts"],
): SemanticCatalogFailure[] {
  const failures: SemanticCatalogFailure[] = [];
  const raw = slot.evidence.oracleSpan ?? slot.evidence.rationale ?? slot.targetMechanic;

  if (slot.evidence.type === "COMMANDER_ORACLE") {
    const v = validateOracleEvidence(slot.evidence, oracleTexts);
    if (!v.valid) {
      failures.push(
        fail("FACTUAL_ORACLE_FAILURE", caseId, subjectId, v.reason ?? "Invalid oracle evidence", {
          targetMechanic: slot.targetMechanic,
          evidence: slot.evidence,
        }),
      );
    }
  }

  if (looksLikeStrategyAssertion(raw) && slot.evidence.type === "COMMANDER_ORACLE") {
    failures.push(
      fail("STRATEGY_PRESENTED_AS_ORACLE_EVIDENCE", caseId, subjectId, `Strategy assertion stored as oracle evidence: "${raw}"`, {
        targetMechanic: slot.targetMechanic,
      }),
    );
  }

  if (mechanicTokenMismatch(slot)) {
    failures.push(
      fail(
        "SEMANTIC_SLOT_RETRIEVAL_TOKEN_MISMATCH",
        caseId,
        subjectId,
        `targetMechanic "${slot.targetMechanic}" incompatible with retrievalToken "${slot.retrievalToken}" / bucket "${slot.retrievalBucket}"`,
        { slot },
      ),
    );
  }

  return failures;
}

function tokensShareCausalDomain(a: string, b: string): boolean {
  const domains: Record<string, string[]> = {
    graveyard: ["graveyard_setup", "reanimation", "recursion", "mill", "creature_dies", "death_trigger"],
    combat: ["combat_payoff", "combat_damage", "evasive", "goblins_controlled"],
    tokens: ["token_generation", "goblin_tokens", "treasure_tokens"],
    mana: ["ramp", "mana_generation", "mana_doubling", "untap_support"],
    draw: ["card_draw", "card_advantage"],
    mill: ["mill", "mill_target_player"],
  };
  for (const members of Object.values(domains)) {
    if (members.includes(a) && members.includes(b)) return true;
  }
  return a === b || a.includes(b) || b.includes(a);
}

function auditIndependentEngine(
  caseId: string,
  engine: IndependentEngineHypothesis,
  oracleTexts: CommanderCaseContext["commanderOracleTexts"],
): SemanticCatalogFailure[] {
  const failures: SemanticCatalogFailure[] = [];
  failures.push(...auditSlotEvidence(caseId, engine.enabler, engine.hypothesisId, oracleTexts));
  failures.push(...auditSlotEvidence(caseId, engine.payoff, engine.hypothesisId, oracleTexts));

  if (!engine.causalRelation?.trim()) {
    failures.push(
      fail("NON_CAUSAL_INDEPENDENT_ENGINE", caseId, engine.hypothesisId, "Missing causalRelation", {}),
    );
  }

  if (
    !tokensShareCausalDomain(engine.enabler.retrievalToken, engine.payoff.retrievalToken) &&
    engine.enabler.retrievalToken !== engine.payoff.retrievalToken
  ) {
    failures.push(
      fail(
        "NON_CAUSAL_INDEPENDENT_ENGINE",
        caseId,
        engine.hypothesisId,
        `Enabler "${engine.enabler.retrievalToken}" does not causally connect to payoff "${engine.payoff.retrievalToken}"`,
        { causalRelation: engine.causalRelation },
      ),
    );
  }

  for (const pattern of KNOWN_NON_CAUSAL_ENGINE_PATTERNS) {
    if (pattern.caseId !== caseId) continue;
    if (
      pattern.enablerPattern.test(engine.enabler.targetMechanic) &&
      pattern.payoffPattern.test(engine.payoff.targetMechanic)
    ) {
      failures.push(
        fail("NON_CAUSAL_INDEPENDENT_ENGINE", caseId, engine.hypothesisId, pattern.message, {
          enabler: engine.enabler.targetMechanic,
          payoff: engine.payoff.targetMechanic,
        }),
      );
    }
  }

  if (engine.hypothesisProvenance === "STRATEGY_HYPOTHESIS") {
    failures.push(
      fail(
        "UNSUPPORTED_STRATEGY_HYPOTHESIS",
        caseId,
        engine.hypothesisId,
        "Independent engine marked as unsupported strategy hypothesis pending adjudication",
        { enabler: engine.enabler.targetMechanic, payoff: engine.payoff.targetMechanic },
      ),
    );
  }

  return failures;
}

function auditBridge(
  caseId: string,
  bridge: BridgeHypothesis,
  facts: CommanderMechanismFactsEntry,
  engines: IndependentEngineHypothesis[],
): SemanticCatalogFailure[] {
  const failures: SemanticCatalogFailure[] = [];

  if (!bridge.commanderSideJob.causalProof?.trim()) {
    failures.push(
      fail("BRIDGE_MISSING_CAUSAL_SIDE", caseId, bridge.hypothesisId, "Bridge missing commanderSideJob causal proof", {}),
    );
  }
  if (!bridge.independentSideJob.causalProof?.trim()) {
    failures.push(
      fail("BRIDGE_MISSING_CAUSAL_SIDE", caseId, bridge.hypothesisId, "Bridge missing independentSideJob causal proof", {}),
    );
  }

  if (bridge.commanderSideJob.commanderMechanismFactIds.length === 0) {
    failures.push(
      fail(
        "BRIDGE_MISSING_CAUSAL_SIDE",
        caseId,
        bridge.hypothesisId,
        "Bridge commanderSideJob not grounded to any CommanderMechanismFact",
        { commanderJob: bridge.commanderSideJob.description },
      ),
    );
  }

  const engineId = bridge.independentSideJob.independentEngineHypothesisId;
  if (engineId && !engines.some((e) => e.hypothesisId === engineId)) {
    failures.push(
      fail(
        "BRIDGE_MISSING_CAUSAL_SIDE",
        caseId,
        bridge.hypothesisId,
        "Bridge independentSideJob references missing independent engine",
        { engineId },
      ),
    );
  }

  if (bridge.independentSideJob.evidence.type === "STRATEGY_HYPOTHESIS" && !bridge.independentSideJob.causalProof) {
    failures.push(
      fail(
        "UNSUPPORTED_STRATEGY_HYPOTHESIS",
        caseId,
        bridge.hypothesisId,
        "Bridge independent side is unsupported strategy hypothesis",
        { independentJob: bridge.independentSideJob.description },
      ),
    );
  }

  const depMechanics = new Set(
    facts.memberFacts.flatMap((m) => m.mechanisms.map((f) => f.output ?? f.action ?? f.trigger ?? "")),
  );
  const bridgeMech = bridge.candidateMechanic.targetMechanic.toLowerCase();
  const touchesCommander = [...depMechanics].some((m) => m && bridgeMech.includes(m.toLowerCase().slice(0, 8)));
  if (!touchesCommander && bridge.commanderSideJob.commanderMechanismFactIds.length === 0) {
    failures.push(
      fail(
        "HARMONY_ZERO_MEANINGFUL_OVERLAP",
        caseId,
        bridge.hypothesisId,
        "Bridge candidate does not meaningfully connect to commander mechanism facts",
        { bridgeMech },
      ),
    );
  }

  return failures;
}

function auditMultiMember(ctx: CommanderCaseContext, facts: CommanderMechanismFactsEntry): SemanticCatalogFailure[] {
  const failures: SemanticCatalogFailure[] = [];
  const memberCount = ctx.commanderOracleTexts.length;
  const isMulti =
    ctx.commandZoneConfiguration === "partner_pair" ||
    ctx.commandZoneConfiguration === "commander_with_background";

  if (isMulti && memberCount >= 2) {
    if (facts.memberFacts.length < memberCount) {
      failures.push(
        fail(
          "MULTI_MEMBER_FLATTENING_ERROR",
          ctx.caseId,
          ctx.caseId,
          `Expected ${memberCount} member fact records, got ${facts.memberFacts.length}`,
        ),
      );
    }
    for (const member of facts.memberFacts) {
      if (member.mechanisms.length === 0) {
        failures.push(
          fail(
            "MULTI_MEMBER_FLATTENING_ERROR",
            ctx.caseId,
            member.sourceOracleId,
            `${member.commanderName} has zero extracted mechanism facts — generic flattening suspected`,
          ),
        );
      }
    }
    const v2 = getV2CatalogEntry(ctx.caseId);
    if (v2?.oracleSummary && /generic|cross-support|partner\/background member/i.test(v2.oracleSummary)) {
      failures.push(
        fail(
          "MULTI_MEMBER_FLATTENING_ERROR",
          ctx.caseId,
          ctx.caseId,
          `v2 oracleSummary flattens multi-member command zone: "${v2.oracleSummary}"`,
        ),
      );
    }
  }

  if (ctx.caseId === "partner-thrasios-tymna" && ctx.commandZoneConfiguration === "single_commander") {
    failures.push(
      fail(
        "MULTI_MEMBER_FLATTENING_ERROR",
        ctx.caseId,
        ctx.caseId,
        "partner-thrasios-tymna has commandZoneConfiguration single_commander despite two commanders",
      ),
    );
  }

  return failures;
}

function auditV2RawOracleEvidence(ctx: CommanderCaseContext): SemanticCatalogFailure[] {
  const failures: SemanticCatalogFailure[] = [];
  const v2 = getV2CatalogEntry(ctx.caseId);
  if (!v2) return failures;

  const allSlots: Array<{ id: string; oracleEvidence: string }> = [
    ...v2.commanderInputs.map((s) => ({ id: s.id, oracleEvidence: s.oracleEvidence })),
    ...v2.commanderOutputExploits.map((s) => ({ id: s.id, oracleEvidence: s.oracleEvidence })),
    { id: v2.independentEngine.enabler.id, oracleEvidence: v2.independentEngine.enabler.oracleEvidence },
    { id: v2.independentEngine.payoff.id, oracleEvidence: v2.independentEngine.payoff.oracleEvidence },
    ...v2.bridges.map((s) => ({ id: s.id, oracleEvidence: s.oracleEvidence })),
  ];

  for (const slot of allSlots) {
    if (looksLikeStrategyAssertion(slot.oracleEvidence)) {
      failures.push(
        fail(
          "STRATEGY_PRESENTED_AS_ORACLE_EVIDENCE",
          ctx.caseId,
          slot.id,
          `v2 slot oracleEvidence is strategy assertion, not Oracle span: "${slot.oracleEvidence}"`,
        ),
      );
    } else {
      const check = validateOracleEvidence(
        { type: "COMMANDER_ORACLE", oracleSpan: slot.oracleEvidence },
        ctx.commanderOracleTexts,
      );
      if (!check.valid) {
        failures.push(
          fail(
            "FACTUAL_ORACLE_FAILURE",
            ctx.caseId,
            slot.id,
            `v2 slot oracleEvidence not found in canonical Oracle: "${slot.oracleEvidence}"`,
          ),
        );
      }
    }
  }

  return failures;
}

function auditV2FactualErrors(ctx: CommanderCaseContext): SemanticCatalogFailure[] {
  const failures: SemanticCatalogFailure[] = [];
  const summary = v2OracleSummary(ctx.caseId);
  if (!summary) return failures;

  const oracleBlob = ctx.commanderOracleTexts.map((t) => t.oracleText).join("\n");
  if (oracleSummaryContradictsOracle(summary, oracleBlob)) {
    failures.push(
      fail("FACTUAL_ORACLE_FAILURE", ctx.caseId, ctx.caseId, `v2 oracleSummary contradicts canonical Oracle: "${summary}"`, {
        commanderOracleTexts: ctx.commanderOracleTexts.map((t) => ({ name: t.name, oracleText: t.oracleText })),
      }),
    );
  }

  return failures;
}

function computeHarmonyOverlap(
  strategy: StrategyHypothesisEntry,
  facts: CommanderMechanismFactsEntry,
): { depShared: string[]; indShared: string[] } {
  const depTokens = new Set([
    ...strategy.dependentInputs.map((s) => s.retrievalToken),
    ...strategy.dependentOutputExploits.map((s) => s.retrievalToken),
  ]);
  const indTokens = new Set(strategy.independentEngines.flatMap((e) => [e.enabler.retrievalToken, e.payoff.retrievalToken]));
  const bridgeTokens = strategy.bridgeHypotheses.map((b) => b.candidateMechanic.retrievalToken);

  const factOutputs = facts.memberFacts.flatMap((m) =>
    m.mechanisms.flatMap((f) => [f.output, f.action, f.trigger].filter(Boolean) as string[]),
  );

  const depShared = bridgeTokens.filter((t) => depTokens.has(t) || factOutputs.some((o) => t.includes(o.slice(0, 4))));
  const indShared = bridgeTokens.filter((t) => indTokens.has(t));

  return { dependentSharedMechanics: depShared, independentSharedMechanics: indShared };
}

export type CaseSemanticAuditV3 = {
  caseId: string;
  commanders: string[];
  mechanismFactCount: number;
  strategyHypothesisCounts: {
    dependentInputs: number;
    dependentOutputExploits: number;
    independentEngines: number;
    bridgeHypotheses: number;
  };
  harmonyOverlap: {
    dependentSharedMechanics: string[];
    independentSharedMechanics: string[];
  };
  failures: SemanticCatalogFailure[];
  pathReadiness: {
    dependentHasCommanderDependentIdentity: boolean;
    independentHasCommanderFreeIdentity: boolean;
    harmonyHasVerifiedDualRoleBridges: boolean;
  };
};

export function auditCaseSemanticCatalog(
  ctx: CommanderCaseContext,
  facts: CommanderMechanismFactsEntry,
  strategy: StrategyHypothesisEntry | null,
): CaseSemanticAuditV3 {
  const failures: SemanticCatalogFailure[] = [];

  failures.push(...auditV2FactualErrors(ctx));
  failures.push(...auditV2RawOracleEvidence(ctx));
  failures.push(...auditMultiMember(ctx, facts));

  for (const member of facts.memberFacts) {
    for (const mech of member.mechanisms) {
      const v = validateOracleEvidence(mech.evidence, ctx.commanderOracleTexts);
      if (!v.valid) {
        failures.push(
          fail("FACTUAL_ORACLE_FAILURE", ctx.caseId, mech.factId, v.reason ?? "Mechanism fact evidence invalid", {
            evidenceSpan: mech.evidenceSpan,
          }),
        );
      }
    }
  }

  if (!strategy) {
    return {
      caseId: ctx.caseId,
      commanders: ctx.commanders,
      mechanismFactCount: facts.memberFacts.reduce((n, m) => n + m.mechanisms.length, 0),
      strategyHypothesisCounts: { dependentInputs: 0, dependentOutputExploits: 0, independentEngines: 0, bridgeHypotheses: 0 },
      harmonyOverlap: { dependentSharedMechanics: [], independentSharedMechanics: [] },
      failures,
      pathReadiness: {
        dependentHasCommanderDependentIdentity: facts.memberFacts.some((m) => m.mechanisms.length > 0),
        independentHasCommanderFreeIdentity: false,
        harmonyHasVerifiedDualRoleBridges: false,
      },
    };
  }

  for (const slot of [...strategy.dependentInputs, ...strategy.dependentOutputExploits]) {
    failures.push(...auditSlotEvidence(ctx.caseId, slot, `${ctx.caseId}--${slot.retrievalToken}`, ctx.commanderOracleTexts));
  }

  for (const engine of strategy.independentEngines) {
    failures.push(...auditIndependentEngine(ctx.caseId, engine, ctx.commanderOracleTexts));
  }

  for (const bridge of strategy.bridgeHypotheses) {
    failures.push(...auditBridge(ctx.caseId, bridge, facts, strategy.independentEngines));
  }

  const harmonyOverlap = computeHarmonyOverlap(strategy, facts);

  const pathReadiness = {
    dependentHasCommanderDependentIdentity:
      strategy.dependentInputs.length > 0 || strategy.dependentOutputExploits.length > 0,
    independentHasCommanderFreeIdentity: strategy.independentEngines.some(
      (e) => e.worksWithoutCommander && !failures.some((f) => f.subjectId === e.hypothesisId && f.category === "NON_CAUSAL_INDEPENDENT_ENGINE"),
    ),
    harmonyHasVerifiedDualRoleBridges: strategy.bridgeHypotheses.some(
      (b) =>
        b.commanderSideJob.commanderMechanismFactIds.length > 0 &&
        b.independentSideJob.independentEngineHypothesisId !== null &&
        !failures.some((f) => f.subjectId === b.hypothesisId && f.category === "BRIDGE_MISSING_CAUSAL_SIDE"),
    ),
  };

  if (strategy.bridgeHypotheses.length > 0 && harmonyOverlap.dependentSharedMechanics.length === 0 && harmonyOverlap.independentSharedMechanics.length === 0) {
    failures.push(
      fail(
        "HARMONY_ZERO_MEANINGFUL_OVERLAP",
        ctx.caseId,
        ctx.caseId,
        "Harmony bridges exist but share no mechanics with Dependent or Independent plans (v2 overlap audit blind spot)",
        { harmonyOverlap },
      ),
    );
  }

  return {
    caseId: ctx.caseId,
    commanders: ctx.commanders,
    mechanismFactCount: facts.memberFacts.reduce((n, m) => n + m.mechanisms.length, 0),
    strategyHypothesisCounts: {
      dependentInputs: strategy.dependentInputs.length,
      dependentOutputExploits: strategy.dependentOutputExploits.length,
      independentEngines: strategy.independentEngines.length,
      bridgeHypotheses: strategy.bridgeHypotheses.length,
    },
    harmonyOverlap,
    failures,
    pathReadiness,
  };
}

export function summarizeFailures(failures: SemanticCatalogFailure[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of failures) {
    counts[f.category] = (counts[f.category] ?? 0) + 1;
  }
  return counts;
}

export function summarizeByCase(failures: SemanticCatalogFailure[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of failures) {
    counts[f.caseId] = (counts[f.caseId] ?? 0) + 1;
  }
  return counts;
}
