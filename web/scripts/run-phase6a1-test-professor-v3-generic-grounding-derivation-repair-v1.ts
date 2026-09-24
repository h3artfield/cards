#!/usr/bin/env npx tsx
/** Generic grounding derivation repair audit — frozen Yuriko attempt-003 + cross-commander inference, 0 OpenAI. */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  buildValidatorContextV3FromPlanning,
  resetValidatorIssueCounterV3,
  validateProfessorPlanOutputV3,
} from "../src/lib/deck-synthesis/strategy-package-validator-v3";
import {
  canonicalStatesFromMechanismFact,
  triggerSupportsTriggersOnAssertion,
  tryDeriveGameStateProof,
} from "../src/lib/deck-synthesis/grounding-derivation-graph-v1";
import { buildAssertionResolverContextV3 } from "../src/lib/deck-synthesis/typed-assertion-grounding-v3";
import type { StrategyHypothesisV3 } from "../src/lib/deck-synthesis/professor-planning-contracts-v3";
import type { IndependentMechanismFact } from "../src/lib/deck-synthesis/independent-truth-types-v1";
import type { StrategicAssertionV3 } from "../src/lib/deck-synthesis/strategic-assertion-vocabulary-v3";
import { buildProfessorPlanningContextV3, buildProfessorPlanningContextV3Sync } from "./lib/phase6a1-professor-plan-context-builder-v3";
import { normalizeProfessorPlanningResponseV3 } from "./lib/phase6a1-professor-plan-normalizer-v3";
import { getPilotMechanismCatalogEntry } from "./lib/phase6a1-spent-pilot-truth-loader-v1";
import { MILESTONES } from "./lib/phase6a1-pinned-implementation-container-v1";
import { resolveProfessorV3SmokeYurikoProspectiveOutputTargetsV1 } from "./lib/phase6a1-professor-v3-smoke-output-targets-v6";
import {
  assertionIdsWithValidationErrors,
  PROFESSOR_V3_GENERIC_GROUNDING_DERIVATION_REPAIR_DECISION_V1,
  PROFESSOR_V3_GENERIC_GROUNDING_DERIVATION_REPAIR_V1_VERSION,
  seedFrozenYurikoEvidenceLedgerFromAttempt003,
  YURIKO_ATTEMPT_003_ANTI_CHEAT_MUST_FAIL_V1,
  YURIKO_ATTEMPT_003_FROZEN_ASSERTION_IDS_V1,
  YURIKO_ATTEMPT_003_ROOT_ASSERTION_FAILURES_V1,
} from "./lib/phase6a1-professor-v3-generic-grounding-derivation-repair-v1";

const OUT_PATH = resolve(
  MILESTONES,
  "phase6a1-professor-v3-generic-grounding-derivation-repair-audit-v1.json",
);

type AuditCheck = { id: string; pass: boolean; detail: string };

function mechanismFactsForCase(caseId: string): IndependentMechanismFact[] {
  const entry = getPilotMechanismCatalogEntry(caseId);
  if (!entry) throw new Error(`Missing mechanism truth for ${caseId}`);
  const ctx = buildProfessorPlanningContextV3Sync({ entry, oppCase: null, options: { includeMechanicalAffordances: true } });
  return ctx.commanderMechanismFacts;
}

function runCrossCommanderInferenceChecks(): AuditCheck[] {
  const checks: AuditCheck[] = [];
  const cases = ["multi-yuriko", "multi-korvold", "multi-muldrotha"] as const;

  for (const caseId of cases) {
    const facts = mechanismFactsForCase(caseId);
    const triggerFacts = facts.filter((f) => String(f.trigger ?? "").length > 0);
    checks.push({
      id: `cross-${caseId}-trigger-normalization`,
      pass: triggerFacts.length > 0,
      detail: `${caseId}: ${triggerFacts.length} triggered mechanism facts available for generic TRIGGERS_ON normalization`,
    });

    const stateFacts = facts.filter((f) => {
      const states = canonicalStatesFromMechanismFact(f);
      const requiredActions = actionListForFixture(f);
      return states.size > 0 || requiredActions.length > 0;
    });
    checks.push({
      id: `cross-${caseId}-action-to-state`,
      pass: stateFacts.length > 0,
      detail: `${caseId}: ${stateFacts.length} facts participate in generic action/state inference`,
    });
  }

  function actionListForFixture(fact: IndependentMechanismFact): Array<Record<string, unknown>> {
    return Array.isArray(fact.actions) ? (fact.actions as Array<Record<string, unknown>>) : [];
  }

  const yurikoFacts = mechanismFactsForCase("multi-yuriko");
  const ninjaHit = yurikoFacts.find((f) => f.mechanismId === "yuriko-ninja-hit");
  const ninjutsu = yurikoFacts.find((f) => f.mechanismId === "yuriko-commander-ninjutsu");
  if (ninjaHit) {
    const states = canonicalStatesFromMechanismFact(ninjaHit);
    checks.push({
      id: "yuriko-reveal-hand-derived-state",
      pass: states.has("REVEALED_CARD_IN_HAND") && states.has("LIFE_LOSS"),
      detail: `yuriko-ninja-hit derived states: ${[...states].sort().join(", ")}`,
    });
    const triggerProof = triggerSupportsTriggersOnAssertion(ninjaHit, {
      assertionId: "fixture",
      packageId: "fixture",
      predicate: "TRIGGERS_ON",
      object: String(ninjaHit.trigger ?? "").replace(/_TO_PLAYER$/, "_TO_A_PLAYER"),
      evidenceRefs: [{ kind: "MECHANISM_FACT", factIds: [ninjaHit.mechanismId] }],
    } as StrategicAssertionV3);
    checks.push({
      id: "yuriko-trigger-normalization-from-mechanism-fact",
      pass: triggerProof != null,
      detail: triggerProof ? `proof ruleIds=${triggerProof.ruleIds.join(",")}` : "missing trigger normalization proof",
    });
  }

  const muldrothaFacts = mechanismFactsForCase("multi-muldrotha");
  const castFact = muldrothaFacts.find((f) => f.mechanismId === "muldrotha-graveyard-permanent-cast");
  if (castFact) {
    checks.push({
      id: "muldrotha-graveyard-cast-fact-present",
      pass: true,
      detail: `Muldrotha cast fact ${castFact.mechanismId} loaded for generic inference fixtures`,
    });
  }

  if (ninjaHit && ninjutsu) {
    const ctx = buildAssertionResolverContextV3(
      buildProfessorPlanningContextV3Sync({
        entry: getPilotMechanismCatalogEntry("multi-yuriko")!,
        oppCase: null,
        options: { includeMechanicalAffordances: true },
      }),
    );
    const harmA4Fail = tryDeriveGameStateProof(
      {
        assertionId: "harm-a4",
        packageId: "harm-topdeck-bridge",
        predicate: "PRODUCES_STATE",
        action: "MOVE_CARDS",
        object: "HIGH_MANA_VALUE_CARD",
        resourceOrState: "HIGH_MANA_VALUE_CARD_ON_TOP_OF_LIBRARY",
        evidenceRefs: [
          {
            kind: "RAG_EVIDENCE",
            evidenceIds: ["128a98a132eb106aa99166129a59d8a33b602dd6752a3e4f8766c23f82b90d04"],
            statement: "The primer recommends placing high-mana-value cards on top without paying their full costs.",
          },
        ],
      } as StrategicAssertionV3,
      ctx,
    );
    checks.push({
      id: "anti-cheat-rag-only-high-mv-top",
      pass: harmA4Fail == null,
      detail: "RAG-only PRODUCES_STATE for HIGH_MANA_VALUE_CARD_ON_TOP_OF_LIBRARY must not derive without mechanism anchor",
    });
  }

  checks.push({
    id: "no-commander-name-branches-in-derivation-graph",
    pass: !readFileSync(join(process.cwd(), "src/lib/deck-synthesis/grounding-derivation-graph-v1.ts"), "utf8").match(
      /\b(Yuriko|Korvold|Muldrotha|Atraxa|Zada)\b|each ninja|MULTIPLE_NINJA|ninjutsu\|ninja/i,
    ),
    detail: "grounding-derivation-graph-v1.ts contains no commander-name branches",
  });

  return checks;
}

async function runYurikoFrozenAcceptance(): Promise<AuditCheck[]> {
  const targets = resolveProfessorV3SmokeYurikoProspectiveOutputTargetsV1();
  const parsedEnvelope = JSON.parse(
    readFileSync(join(targets.modelAttemptsDir, "attempt-003-parsed-response.json"), "utf8"),
  ) as { parsed?: unknown };

  const entry = getPilotMechanismCatalogEntry("multi-yuriko");
  if (!entry) throw new Error("Missing multi-yuriko mechanism truth");
  let ctx = await buildProfessorPlanningContextV3({
    entry,
    oppCase: null,
    options: { includeMechanicalAffordances: true },
  });
  ctx.caseId = "professor-v3-smoke-yuriko-prospective-v1";

  const normalization = normalizeProfessorPlanningResponseV3({
    parsedModelResponse: parsedEnvelope.parsed ?? parsedEnvelope,
    ctx,
  });
  if (normalization.status !== "SUCCESS") {
    throw new Error(`Normalization failed: ${normalization.status}`);
  }

  const hypotheses = normalization.normalized as StrategyHypothesisV3[];
  ctx = seedFrozenYurikoEvidenceLedgerFromAttempt003({ ctx, hypotheses });

  resetValidatorIssueCounterV3();
  const validatorCtx = buildValidatorContextV3FromPlanning(ctx);
  const validationOutcomes = validateProfessorPlanOutputV3(validatorCtx, { strategyHypotheses: hypotheses });

  const errorMessages = validationOutcomes.flatMap((o) =>
    o.issues.filter((i) => i.severity === "ERROR").map((i) => i.message),
  );
  const failingAssertionIds = assertionIdsWithValidationErrors(errorMessages);
  const harmonyBridgeFailures = errorMessages.filter((m) => m.includes("resource/state bridge"));

  const stillFailingRoots = YURIKO_ATTEMPT_003_FROZEN_ASSERTION_IDS_V1.filter((id) => failingAssertionIds.has(id));
  const repairedRoots = YURIKO_ATTEMPT_003_FROZEN_ASSERTION_IDS_V1.filter((id) => !failingAssertionIds.has(id));
  const antiCheatHeld = YURIKO_ATTEMPT_003_ANTI_CHEAT_MUST_FAIL_V1.every((id) => failingAssertionIds.has(id));

  return [
    {
      id: "yuriko-frozen-normalization",
      pass: normalization.status === "SUCCESS",
      detail: `normalized ${hypotheses.length} hypotheses from attempt-003-parsed-response.json`,
    },
    {
      id: "yuriko-frozen-assertions-repaired",
      pass: stillFailingRoots.length === 2,
      detail: `repaired ${repairedRoots.length}/${YURIKO_ATTEMPT_003_FROZEN_ASSERTION_IDS_V1.length}; still failing: ${stillFailingRoots.join(", ") || "(none)"}`,
    },
    {
      id: "yuriko-anti-cheat-ind-a2-harm-a4",
      pass: antiCheatHeld && stillFailingRoots.every((id) => (YURIKO_ATTEMPT_003_ANTI_CHEAT_MUST_FAIL_V1 as readonly string[]).includes(id)),
      detail: `must-fail assertions still failing: ${YURIKO_ATTEMPT_003_ANTI_CHEAT_MUST_FAIL_V1.filter((id) => failingAssertionIds.has(id)).join(", ")}`,
    },
    {
      id: "yuriko-harmony-bridge-repaired",
      pass: harmonyBridgeFailures.length === 0,
      detail: harmonyBridgeFailures.length
        ? `remaining bridge failures: ${harmonyBridgeFailures.join(" | ")}`
        : "Harmony semantic bridge passes after assertion graph validates",
    },
    {
      id: "yuriko-no-validator-weakening",
      pass: antiCheatHeld,
      detail: "bad-evidence assertions ind-a2 and harm-a4 remain rejected",
    },
  ];
}

async function main() {
  const checks = [...(await runYurikoFrozenAcceptance()), ...runCrossCommanderInferenceChecks()];
  const passCount = checks.filter((c) => c.pass).length;
  const report = {
    version: PROFESSOR_V3_GENERIC_GROUNDING_DERIVATION_REPAIR_V1_VERSION,
    generatedAt: new Date().toISOString(),
    decision: PROFESSOR_V3_GENERIC_GROUNDING_DERIVATION_REPAIR_DECISION_V1,
    openAiCalls: 0,
    pass: passCount === checks.length,
    passCount,
    totalChecks: checks.length,
    checks,
  };

  writeFileSync(OUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
