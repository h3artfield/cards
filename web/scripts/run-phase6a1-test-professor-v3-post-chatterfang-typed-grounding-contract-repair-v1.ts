#!/usr/bin/env npx tsx
/** Post-Chatterfang typed grounding contract repair audit — frozen attempt-003 replay, 0 OpenAI. */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  buildValidatorContextV3FromPlanning,
  resetValidatorIssueCounterV3,
  validateProfessorPlanOutputV3,
} from "../src/lib/deck-synthesis/strategy-package-validator-v3";
import {
  canonicalStatesFromMechanismFact,
  flattenMechanismActions,
  normalizedResourcesFromPermanentSubtype,
  normalizedResourcesFromTokenDescriptor,
  requiredStatesFromMechanismFact,
  tokenDescriptorMatchesAssertionObject,
} from "../src/lib/deck-synthesis/grounding-derivation-graph-v1";
import { buildAssertionResolverContextV3 } from "../src/lib/deck-synthesis/typed-assertion-grounding-v3";
import type { StrategyHypothesisV3 } from "../src/lib/deck-synthesis/professor-planning-contracts-v3";
import type { IndependentMechanismFact } from "../src/lib/deck-synthesis/independent-truth-types-v1";
import { buildProfessorPlanningContextV3 } from "./lib/phase6a1-professor-plan-context-builder-v3";
import { normalizeProfessorPlanningResponseV3 } from "./lib/phase6a1-professor-plan-normalizer-v3";
import { getPilotMechanismCatalogEntry } from "./lib/phase6a1-spent-pilot-truth-loader-v1";
import { MILESTONES } from "./lib/phase6a1-pinned-implementation-container-v1";
import { resolveProfessorV3SmokeChatterfangProspectiveOutputTargetsV1 } from "./lib/phase6a1-professor-v3-smoke-output-targets-v6";
import {
  assertionIdsWithValidationErrors,
  CHATTERFANG_ATTEMPT_003_MECHANISM_ENTAILED_ASSERTION_IDS_V1,
  CHATTERFANG_ATTEMPT_003_MUST_FAIL_ASSERTION_IDS_V1,
  PROFESSOR_V3_POST_CHATTERFANG_TYPED_GROUNDING_CONTRACT_REPAIR_DECISION_V1,
  PROFESSOR_V3_POST_CHATTERFANG_TYPED_GROUNDING_CONTRACT_REPAIR_V1_VERSION,
  seedFrozenChatterfangEvidenceLedgerFromAttempt003,
} from "./lib/phase6a1-professor-v3-post-chatterfang-typed-grounding-contract-repair-v1";

const OUT_PATH = resolve(
  MILESTONES,
  "phase6a1-professor-v3-post-chatterfang-typed-grounding-contract-repair-audit-v1.json",
);

type AuditCheck = { id: string; pass: boolean; detail: string };

function loadChatterfangMechanismFacts(): IndependentMechanismFact[] {
  const entry = getPilotMechanismCatalogEntry("multi-chatterfang");
  if (!entry) throw new Error("Missing multi-chatterfang mechanism truth");
  const truthPath = resolve(MILESTONES, "phase6a1-professor-v3-chatterfang-prospective-mechanism-truth-v1.json");
  const truth = JSON.parse(readFileSync(truthPath, "utf8")) as {
    case: { independentMechanismFacts: IndependentMechanismFact[] };
  };
  return truth.case.independentMechanismFacts;
}

function runGenericMechanismInferenceChecks(): AuditCheck[] {
  const checks: AuditCheck[] = [];
  const facts = loadChatterfangMechanismFacts();
  const tokenFact = facts.find((f) => f.mechanismId === "commander-token-creation-replacement-modification");
  const sacrificeFact = facts.find((f) => f.mechanismId === "commander-sacrifice-squirrels-stat-modification");

  if (tokenFact) {
    const nested = flattenMechanismActions(tokenFact).find((action) => action.type === "CREATE_TOKEN");
    const token = String(nested?.token ?? "");
    const resources = normalizedResourcesFromTokenDescriptor(token);
    checks.push({
      id: "nested-create-token-resource-normalization",
      pass:
        resources.includes("SQUIRRELS") &&
        resources.includes("SQUIRREL_TOKENS") &&
        tokenDescriptorMatchesAssertionObject(token, "1/1_GREEN_SQUIRREL_CREATURE_TOKEN"),
      detail: `nested token resources: ${resources.join(", ")}`,
    });
    const produced = canonicalStatesFromMechanismFact(tokenFact);
    checks.push({
      id: "modify-token-creation-produces-token-resource",
      pass: produced.has("SQUIRRELS") && produced.has("CREATURE_TOKENS"),
      detail: `produced states: ${[...produced].sort().join(", ")}`,
    });
  }

  if (sacrificeFact) {
    const required = requiredStatesFromMechanismFact(sacrificeFact);
    const subtypeResources = normalizedResourcesFromPermanentSubtype("Squirrel");
    checks.push({
      id: "sacrifice-subtype-requires-normalized-resource",
      pass: subtypeResources.every((state) => required.has(state)),
      detail: `required states: ${[...required].sort().join(", ")}`,
    });
  }

  checks.push({
    id: "no-commander-name-branches-in-derivation-graph",
    pass: !readFileSync(join(process.cwd(), "src/lib/deck-synthesis/grounding-derivation-graph-v1.ts"), "utf8").match(
      /\bChatterfang\b|\bSquirrel tribal\b/i,
    ),
    detail: "grounding-derivation-graph-v1.ts contains no commander-name branches",
  });

  return checks;
}

async function runFrozenChatterfangAcceptance(): Promise<AuditCheck[]> {
  const targets = resolveProfessorV3SmokeChatterfangProspectiveOutputTargetsV1();
  const parsedEnvelope = JSON.parse(
    readFileSync(join(targets.modelAttemptsDir, "attempt-003-parsed-response.json"), "utf8"),
  ) as { parsed?: unknown };

  const entry = getPilotMechanismCatalogEntry("multi-chatterfang");
  if (!entry) throw new Error("Missing multi-chatterfang mechanism truth");
  let ctx = await buildProfessorPlanningContextV3({
    entry,
    oppCase: null,
    options: { includeMechanicalAffordances: true },
  });
  ctx.caseId = "professor-v3-smoke-chatterfang-prospective-v1";

  const normalization = normalizeProfessorPlanningResponseV3({
    parsedModelResponse: parsedEnvelope.parsed ?? parsedEnvelope,
    ctx,
  });
  if (normalization.status !== "SUCCESS") {
    throw new Error(`Normalization failed: ${normalization.status}`);
  }

  const hypotheses = normalization.normalized as StrategyHypothesisV3[];
  ctx = seedFrozenChatterfangEvidenceLedgerFromAttempt003({ ctx, hypotheses });

  resetValidatorIssueCounterV3();
  const validatorCtx = buildValidatorContextV3FromPlanning(ctx);
  const validationOutcomes = validateProfessorPlanOutputV3(validatorCtx, { strategyHypotheses: hypotheses });

  const errorMessages = validationOutcomes.flatMap((o) =>
    o.issues.filter((i) => i.severity === "ERROR").map((i) => i.message),
  );
  const failingAssertionIds = assertionIdsWithValidationErrors(errorMessages);
  const issueCodes = validationOutcomes.flatMap((o) => o.issues.filter((i) => i.severity === "ERROR").map((i) => i.code));
  const codeCounts = issueCodes.reduce<Record<string, number>>((acc, code) => {
    acc[code] = (acc[code] ?? 0) + 1;
    return acc;
  }, {});

  const repairedMechanismClaims = CHATTERFANG_ATTEMPT_003_MECHANISM_ENTAILED_ASSERTION_IDS_V1.filter(
    (id) => !failingAssertionIds.has(id),
  );
  const stillFailingMechanismClaims = CHATTERFANG_ATTEMPT_003_MECHANISM_ENTAILED_ASSERTION_IDS_V1.filter((id) =>
    failingAssertionIds.has(id),
  );
  const mustFailHeld = CHATTERFANG_ATTEMPT_003_MUST_FAIL_ASSERTION_IDS_V1.every((id) => failingAssertionIds.has(id));

  const resolverCtx = buildAssertionResolverContextV3(ctx);
  void resolverCtx;

  return [
    {
      id: "chatterfang-frozen-normalization",
      pass: normalization.status === "SUCCESS",
      detail: `normalized ${hypotheses.length} hypotheses from frozen attempt-003-parsed-response.json`,
    },
    {
      id: "chatterfang-mechanism-entailed-claims-repaired",
      pass: stillFailingMechanismClaims.length === 0,
      detail: `repaired ${repairedMechanismClaims.length}/${CHATTERFANG_ATTEMPT_003_MECHANISM_ENTAILED_ASSERTION_IDS_V1.length}; still failing: ${stillFailingMechanismClaims.join(", ") || "(none)"}`,
    },
    {
      id: "chatterfang-incomplete-action-claims-still-fail",
      pass: mustFailHeld,
      detail: `must-fail assertions still failing: ${CHATTERFANG_ATTEMPT_003_MUST_FAIL_ASSERTION_IDS_V1.filter((id) => failingAssertionIds.has(id)).join(", ")}`,
    },
    {
      id: "chatterfang-harmony-bridge-from-validated-graph",
      pass: !errorMessages.some((message) => message.includes("Harmony lacks validated producer/consumer resource/state bridge")),
      detail: errorMessages.some((message) => message.includes("Harmony lacks validated producer/consumer resource/state bridge"))
        ? "Harmony bridge still underdetermined"
        : "Harmony bridge passes after mechanism assertions validate",
    },
    {
      id: "chatterfang-remaining-failure-summary",
      pass: true,
      detail: `remaining failing assertion ids: ${[...failingAssertionIds].sort().join(", ") || "(none)"}; codes=${JSON.stringify(codeCounts)}`,
    },
  ];
}

async function main() {
  const checks = [...runGenericMechanismInferenceChecks(), ...(await runFrozenChatterfangAcceptance())];
  const passCount = checks.filter((c) => c.pass).length;
  const report = {
    version: PROFESSOR_V3_POST_CHATTERFANG_TYPED_GROUNDING_CONTRACT_REPAIR_V1_VERSION,
    generatedAt: new Date().toISOString(),
    decision: PROFESSOR_V3_POST_CHATTERFANG_TYPED_GROUNDING_CONTRACT_REPAIR_DECISION_V1,
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
