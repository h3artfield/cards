/**
 * PROFESSOR SEMANTIC PATH REGRESSION v1
 * Evidence only — does not retune retrieval, scoring, or prompts.
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadDeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { resolveCommanderBlueprintFromCatalogV417 } from "./professor-commander-catalog-v4-17-v1";
import { ingestArchitectResponseV11 } from "./professor-sol-directed-architect-ingestion-v1-1";
import {
  diagnoseRequirementRetrievalV11,
  runSolDirectedRetrievalV11,
} from "./professor-sol-directed-retrieval-v1-1";
import {
  acceptanceTestConstructorInputV11,
  buildConstructorInputBundleV11,
} from "./professor-sol-directed-constructor-input-v1-1";
import { evaluateConstructorSupplyGateMandatoryV11 } from "./professor-sol-directed-supply-gate-v1-1";
import { SOL_DIRECTED_CONSTRUCTOR_SYSTEM_V1_1 } from "./professor-sol-directed-constructor-system-prompt-v1-1-1";
import { PROFESSOR_PREDICTIVE_LAYER_PROMPT_CLAUSE } from "./professor-predictive-layer-boundary-v1";
import {
  isUserSemanticPreferencesNoneV111,
  userSemanticPreferencesForPromptV111,
} from "./professor-user-semantic-preferences-v1-1-1";
import type { CanonicalCardFactsV11, RetrievalContractRequirementV11 } from "./professor-sol-directed-types-v1-1";
import { resolvePlayableExactNameInCatalog } from "./professor-playable-oracle-resolution-v1-1-1";

const REPORT_DIR = resolve(
  process.cwd(),
  existsSync(resolve(process.cwd(), "data/milestones"))
    ? "data/milestones/deck-synthesis/professor-semantic-path-regression-v1"
    : "web/data/milestones/deck-synthesis/professor-semantic-path-regression-v1",
);

const FORBIDDEN_IMPORT = /from\s+["'][^"']*(mechanical-space|pressure-v4|profiles-v2|hodge|poset)[^"']*["']/;
const FORBIDDEN_IDENT = /\b(M_hostile|STABLE_DIRECTION|PRESSURE_V4|K_V3|PROFILES_V2)\b/;

const FROZEN_TESTS: Array<{ id: string; file: string; catalog?: boolean }> = [
  { id: "semantic-oracle-construction", file: "src/lib/deck-synthesis/professor-semantic-oracle-construction-v1-1-1.selftest.ts" },
  { id: "architect-ingestion", file: "src/lib/deck-synthesis/professor-sol-directed-architect-ingestion-v1-1.selftest.ts" },
  { id: "quality-gate", file: "src/lib/deck-synthesis/professor-sol-directed-quality-gate-v1-1-1.selftest.ts" },
  { id: "deck-preferences", file: "src/lib/deck-synthesis/professor-sol-directed-deck-preferences-v1-1-1.selftest.ts" },
  { id: "deck-count-repair", file: "src/lib/deck-synthesis/professor-sol-directed-deck-count-repair-v1-1-1.selftest.ts" },
  { id: "deck-singleton-repair", file: "src/lib/deck-synthesis/professor-sol-directed-deck-singleton-repair-v1-1-1.selftest.ts" },
  { id: "off-plan-repair", file: "src/lib/deck-synthesis/professor-sol-directed-off-plan-repair-v1-1-1.selftest.ts" },
  { id: "architect-count-repair", file: "src/lib/deck-synthesis/professor-sol-directed-architect-count-repair-v1-1-1.selftest.ts" },
  { id: "slot-repair", file: "src/lib/deck-synthesis/professor-sol-directed-slot-repair-v1-1-1.selftest.ts" },
  { id: "deck-display", file: "src/lib/deck-synthesis/professor-sol-directed-deck-display-v1-1-1.selftest.ts" },
];

const PROBES: Array<{
  requirementId: string;
  primaryRole: string;
  expectedPrimary: string[];
  expectedNotPrimary: string[];
  underrecognizedRisk: string[];
}> = [
  {
    requirementId: "repeatable_token_engines",
    primaryRole: "Repeatable token engines",
    expectedPrimary: ["Bitterblossom", "Awakening Zone", "Squirrel Nest", "Ophiomancer"],
    expectedNotPrimary: ["Chatterstorm", "Acorn Harvest"],
    underrecognizedRisk: ["Parallel Lives", "Second Harvest", "Sprout Swarm"],
  },
  {
    requirementId: "sacrifice_outlets",
    primaryRole: "Sacrifice outlets",
    expectedPrimary: ["Viscera Seer", "Carrion Feeder", "Ashnod's Altar", "Phyrexian Altar"],
    expectedNotPrimary: ["Bone Splinters", "Village Rites"],
    underrecognizedRisk: ["Yawgmoth, Thran Physician"],
  },
  {
    requirementId: "recursion",
    primaryRole: "Recursion",
    expectedPrimary: ["Eternal Witness", "Regrowth", "Reanimate", "Animate Dead"],
    expectedNotPrimary: ["Satyr Wayfinder", "Grisly Salvage"],
    underrecognizedRisk: ["Living Death", "Rise of the Dark Realms"],
  },
  {
    requirementId: "card_advantage_and_selection",
    primaryRole: "Card advantage and selection",
    expectedPrimary: ["Phyrexian Arena", "Dark Confidant", "Sylvan Library"],
    expectedNotPrimary: ["Night's Whisper", "Sign in Blood"],
    underrecognizedRisk: ["Skullclamp", "Beast Whisperer"],
  },
  {
    requirementId: "protection",
    primaryRole: "Protection",
    expectedPrimary: ["Lightning Greaves", "Swiftfoot Boots", "Heroic Intervention"],
    expectedNotPrimary: ["Giant Growth"],
    underrecognizedRisk: ["Veil of Summer", "Snakeskin Veil", "Autumn's Veil"],
  },
  {
    requirementId: "ramp_and_fixing",
    primaryRole: "Ramp and fixing",
    expectedPrimary: ["Sol Ring", "Arcane Signet", "Birds of Paradise", "Three Visits"],
    expectedNotPrimary: ["Shock"],
    underrecognizedRisk: ["Growing Rites of Itlimoc", "Crypt Ghast"],
  },
];

function loadEnvLocal() {
  for (const rel of [".env.local", "web/.env.local"]) {
    const path = resolve(process.cwd(), rel);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

function fixturePath(): string {
  const candidates = [
    resolve(process.cwd(), "data/milestones/deck-synthesis/sol-directed-chatterfang-v1/call-1-architect-response.json"),
    resolve(process.cwd(), "web/data/milestones/deck-synthesis/sol-directed-chatterfang-v1/call-1-architect-response.json"),
  ];
  for (const p of candidates) if (existsSync(p)) return p;
  throw new Error("Missing Chatterfang architect fixture");
}

function webRoot(): string {
  return existsSync(resolve(process.cwd(), "src/lib/deck-synthesis"))
    ? process.cwd()
    : resolve(process.cwd(), "web");
}

function runFrozenTest(file: string): { pass: boolean; detail: string; ms: number } {
  const started = Date.now();
  try {
    const out = execSync(`npx --yes tsx "${file}"`, {
      cwd: webRoot(),
      encoding: "utf8",
      timeout: 180_000,
      windowsHide: true,
    });
    return { pass: true, detail: out.trim().split(/\r?\n/).slice(-2).join(" | "), ms: Date.now() - started };
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 500) : String(err);
    return { pass: false, detail: message, ms: Date.now() - started };
  }
}

function listProfessorFiles(): string[] {
  const root = webRoot();
  const files: string[] = [];
  function walk(dir: string) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) files.push(full);
    }
  }
  walk(resolve(root, "src/lib/deck-synthesis"));
  walk(resolve(root, "src/components/professor"));
  walk(resolve(root, "src/app"));
  return files.filter((f) => {
    const rel = f.replace(/\\/g, "/");
    return (
      rel.includes("/professor") &&
      !rel.includes("/mechanical-space/") &&
      !rel.includes("experimental/mechanical-space")
    );
  });
}

function poolIds(retrieval: { requirementPools: Array<{ requirementId: string; oracleIds: string[] }> }, id: string) {
  return new Set(retrieval.requirementPools.find((p) => p.requirementId === id)?.oracleIds ?? []);
}

async function main() {
  loadEnvLocal();
  mkdirSync(REPORT_DIR, { recursive: true });

  const frozen = FROZEN_TESTS.map((test) => ({
    id: test.id,
    file: test.file,
    ...runFrozenTest(test.file),
  }));

  const catalog = await loadDeckResolutionCatalog();
  const commander = resolveCommanderBlueprintFromCatalogV417({
    catalog,
    commanderName: "Chatterfang, Squirrel General",
  });
  const ingested = ingestArchitectResponseV11(JSON.parse(readFileSync(fixturePath(), "utf8")));

  const retrievalDefault = runSolDirectedRetrievalV11({
    contract: ingested.retrievalContract,
    catalog,
    commander,
  });
  const retrievalEmptyPrefs = runSolDirectedRetrievalV11({
    contract: ingested.retrievalContract,
    catalog,
    commander,
    userSemanticPreferences: { prefer: [], avoid: [] },
  });
  const retrievalPreferTokens = runSolDirectedRetrievalV11({
    contract: ingested.retrievalContract,
    catalog,
    commander,
    userSemanticPreferences: { prefer: ["create_tokens"], avoid: [] },
  });

  const defaultPoolKey = retrievalDefault.requirementPools
    .map((p) => `${p.requirementId}:${p.oracleIds.join(",")}`)
    .join("|");
  const emptyPrefPoolKey = retrievalEmptyPrefs.requirementPools
    .map((p) => `${p.requirementId}:${p.oracleIds.join(",")}`)
    .join("|");
  const preferTokenPoolKey = retrievalPreferTokens.requirementPools
    .map((p) => `${p.requirementId}:${p.oracleIds.join(",")}`)
    .join("|");

  const supplyGate = evaluateConstructorSupplyGateMandatoryV11({
    contract: ingested.retrievalContract,
    retrieval: retrievalDefault,
  });
  const bundle = buildConstructorInputBundleV11({
    architectRawPlan: ingested.architectRawPlan,
    retrievalContract: ingested.retrievalContract,
    retrieval: retrievalDefault,
    commander,
    bracket: 3,
    supplyGate,
  });
  const acceptance = acceptanceTestConstructorInputV11({ bundle, retrieval: retrievalDefault });
  const payload = JSON.parse(bundle.userPrompt) as {
    candidateDictionary: Record<string, Record<string, unknown>>;
    userSemanticPreferences?: unknown;
    playerIntent?: { userSemanticPreferences?: unknown };
    retrievalEvidence?: Record<string, string>;
    evidenceHierarchy?: Record<string, string>;
  };

  const promptBytes = Buffer.byteLength(bundle.userPrompt, "utf8");
  const systemBytes = Buffer.byteLength(bundle.systemPrompt, "utf8");
  const approxTokens = Math.ceil((promptBytes + systemBytes) / 4);
  const dictionarySize = Object.keys(payload.candidateDictionary).length;

  const canonicalFieldsOk = Object.values(payload.candidateDictionary).every((entry) => {
    return (
      typeof entry.name === "string" &&
      typeof entry.typeLine === "string" &&
      typeof entry.oracleText === "string" &&
      "manaValue" in entry &&
      Array.isArray(entry.colorIdentity) &&
      "semanticOracle" in entry
    );
  });
  const dictionaryJson = JSON.stringify(payload.candidateDictionary);
  const noSemanticScoreField =
    !dictionaryJson.includes("semanticScore") &&
    !dictionaryJson.includes("semanticMatch") &&
    !dictionaryJson.includes("M_hostile") &&
    !dictionaryJson.includes("pressureNet");

  const sampleContradictions: Array<{
    name: string;
    action: string;
    oracleMentionsAction: boolean;
    oracleTextPresent: boolean;
  }> = [];
  for (const [oracleId, facts] of Object.entries(retrievalDefault.candidateDictionary)) {
    const sem = facts.semanticOracle;
    if (!sem || facts.isLand) continue;
    for (const action of sem.semanticActions.slice(0, 3)) {
      const needle = action.replace(/_/g, " ");
      const mentions = facts.oracleText.toLowerCase().includes(needle) || facts.oracleText.toLowerCase().includes(action);
      if (!mentions) {
        sampleContradictions.push({
          name: facts.name,
          action,
          oracleMentionsAction: false,
          oracleTextPresent: facts.oracleText.length > 0,
        });
      }
      if (sampleContradictions.length >= 8) break;
    }
    if (sampleContradictions.length >= 8) break;
    void oracleId;
  }

  const promptForbidsOverride =
    SOL_DIRECTED_CONSTRUCTOR_SYSTEM_V1_1.includes("Canonical Oracle truth means") &&
    SOL_DIRECTED_CONSTRUCTOR_SYSTEM_V1_1.includes("You must use all three") &&
    bundle.systemPrompt.includes(PROFESSOR_PREDICTIVE_LAYER_PROMPT_CLAUSE);

  const professorFiles = listProfessorFiles();
  const importHits: Array<{ file: string; line: string }> = [];
  for (const file of professorFiles) {
    const text = readFileSync(file, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
      if (FORBIDDEN_IMPORT.test(line) || (line.includes("import ") && FORBIDDEN_IDENT.test(line))) {
        importHits.push({ file: file.replace(/\\/g, "/").split("/src/")[1] ?? file, line: trimmed.slice(0, 160) });
      }
    }
  }

  function resolveNamed(name: string) {
    return resolvePlayableExactNameInCatalog({
      name,
      catalog,
      commanderColorIdentity: commander.colorIdentity,
    });
  }

  const requirementById = new Map(
    ingested.retrievalContract.cardRequirements.map((r) => [r.requirementId, r]),
  );

  const roleDemos = PROBES.map((probe) => {
    const requirement = requirementById.get(probe.requirementId) ?? {
      requirementId: probe.requirementId,
      requestedCount: 4,
      primaryRole: probe.primaryRole,
      naturalLanguageRequirements: [probe.primaryRole],
      preferredExamples: [],
    } satisfies RetrievalContractRequirementV11;
    const inPool = poolIds(retrievalDefault, probe.requirementId);
    const pool = retrievalDefault.requirementPools.find((p) => p.requirementId === probe.requirementId);

    const inspect = (name: string) => {
      const resolved = resolveNamed(name);
      if (!resolved.resolved || !resolved.oracleId) {
        return { name, status: "not_in_identity_or_catalog" as const };
      }
      const facts = retrievalDefault.candidateDictionary[resolved.oracleId] as CanonicalCardFactsV11 | undefined;
      if (!facts) {
        return { name, oracleId: resolved.oracleId, status: "not_in_candidate_dictionary" as const };
      }
      const diagnosis = diagnoseRequirementRetrievalV11({ facts, requirement });
      return {
        name,
        oracleId: resolved.oracleId,
        lane: diagnosis.lane,
        functionalMatch: diagnosis.functionalMatch,
        retrievalScore: diagnosis.score,
        inActualPool: inPool.has(resolved.oracleId),
        semanticActions: facts.semanticOracle?.semanticActions ?? [],
        repeatability: facts.semanticOracle?.repeatability ?? null,
        oracleTextPreview: facts.oracleText.slice(0, 140),
      };
    };

    const expectedPrimary = probe.expectedPrimary.map(inspect);
    const expectedNotPrimary = probe.expectedNotPrimary.map(inspect);
    const underrecognizedRisk = probe.underrecognizedRisk.map(inspect);

    const primaryOk = expectedPrimary.filter((row) => "functionalMatch" in row && row.functionalMatch);
    const incidentalCorrect = expectedNotPrimary.filter(
      (row) => "functionalMatch" in row && row.functionalMatch === false,
    );

    let expansionEligibleNotInPool = 0;
    let primaryCount = 0;
    let expansionInPool = 0;
    if (pool) {
      for (const oracleId of pool.oracleIds) {
        const facts = retrievalDefault.candidateDictionary[oracleId];
        if (!facts) continue;
        const diagnosis = diagnoseRequirementRetrievalV11({ facts, requirement });
        if (diagnosis.lane === "primary") primaryCount += 1;
        if (diagnosis.lane === "expansion") expansionInPool += 1;
      }
    }

    const excludedFromPrimaryRecoverable: Array<{ name: string; lane: string; inActualPool: boolean }> = [];
    for (const row of [...expectedNotPrimary, ...underrecognizedRisk]) {
      if (!("lane" in row)) continue;
      if (row.lane !== "primary") {
        excludedFromPrimaryRecoverable.push({
          name: row.name,
          lane: row.lane,
          inActualPool: row.inActualPool,
        });
        if (row.lane === "expansion" && !row.inActualPool) expansionEligibleNotInPool += 1;
      }
    }

    return {
      requirementId: probe.requirementId,
      poolSize: pool?.oracleIds.length ?? 0,
      targetPoolSize: pool?.targetPoolSize ?? null,
      primaryInPool: primaryCount,
      expansionInPool,
      expansionSaturatedOut:
        (pool?.targetPoolSize ?? 0) > 0 &&
        primaryCount >= (pool?.targetPoolSize ?? 0) &&
        expansionInPool === 0,
      expectedPrimaryHits: primaryOk.length,
      expectedPrimarySampled: expectedPrimary.filter((r) => "lane" in r).length,
      incidentalKeptOutOfPrimary: incidentalCorrect.length,
      incidentalSampled: expectedNotPrimary.filter((r) => "lane" in r).length,
      expectedPrimary,
      expectedNotPrimary,
      underrecognizedRisk,
      excludedFromPrimaryRecoverable,
      expansionEligibleNotInPool,
    };
  });

  const payloadSample = Object.values(payload.candidateDictionary)[0] ?? {};
  const report = {
    artifactType: "ProfessorSemanticPathRegressionV1",
    version: "professor-semantic-path-regression-v1",
    status: "REPORT",
    commander: commander.name,
    checks: {
      "1_simple_card_oracle_behavior_unchanged": {
        pass: canonicalFieldsOk && acceptance.pass && supplyGate.pass,
        candidateStillHasCanonicalOracleFields: canonicalFieldsOk,
        constructorAcceptancePass: acceptance.pass,
        supplyGatePass: supplyGate.pass,
        sampleCandidateKeys: Object.keys(payloadSample).sort(),
      },
      "2_frozen_professor_tests": {
        pass: frozen.every((t) => t.pass),
        results: frozen,
      },
      "3_semantic_retrieval_corrections": {
        pass: roleDemos.every(
          (row) =>
            row.expectedPrimarySampled === 0 ||
            (row.expectedPrimaryHits > 0 && row.incidentalKeptOutOfPrimary > 0),
        ),
        roles: roleDemos.map((row) => ({
          requirementId: row.requirementId,
          expectedPrimaryHits: `${row.expectedPrimaryHits}/${row.expectedPrimarySampled}`,
          incidentalKeptOutOfPrimary: `${row.incidentalKeptOutOfPrimary}/${row.incidentalSampled}`,
          examples: {
            primary: row.expectedPrimary,
            notPrimary: row.expectedNotPrimary,
          },
        })),
      },
      "4_false_semantic_exclusion_audit": {
        note: "Primary lane = functional Semantic Oracle match. Expansion only fills leftover slots after primary. If primary saturates targetPoolSize, expansion-eligible cards never reach Constructor.",
        roles: roleDemos.map((row) => ({
          requirementId: row.requirementId,
          poolSize: row.poolSize,
          targetPoolSize: row.targetPoolSize,
          primaryInPool: row.primaryInPool,
          expansionInPool: row.expansionInPool,
          expansionSaturatedOut: row.expansionSaturatedOut,
          expansionEligibleNotInPool: row.expansionEligibleNotInPool,
          rejectedFromPrimary: row.excludedFromPrimaryRecoverable,
          underrecognizedRisk: row.underrecognizedRisk,
        })),
        anyPrimarySaturation: roleDemos.some((row) => row.expansionSaturatedOut),
      },
      "5_constructor_payload_budget": {
        pass: promptBytes < 1_500_000 && approxTokens < 250_000,
        promptBytes,
        systemBytes,
        approxTokensBytesOver4: approxTokens,
        dictionarySize,
        uniqueNonlandCount: retrievalDefault.uniqueNonlandCount,
        oracleTextCapPerCard: 600,
      },
      "6_semantic_cannot_override_canonical_oracle": {
        pass: promptForbidsOverride && canonicalFieldsOk && sampleContradictions.every((c) => c.oracleTextPresent),
        constructorToldToUseAllThree: promptForbidsOverride,
        semanticDoesNotReplaceOracleTextField: canonicalFieldsOk,
        sampleSemanticActionsWithoutLiteralOracleSubstring: sampleContradictions,
        rule: "Canonical oracleText remains on every candidate. Semantic Oracle is adjacent evidence, not a replacement field.",
      },
      "7_predictive_layer_boundary": {
        pass: importHits.length === 0 && noSemanticScoreField && promptForbidsOverride,
        professorPathForbiddenImports: importHits,
        constructorPayloadHasNoMatchupScores: noSemanticScoreField,
        promptClausePresent: bundle.systemPrompt.includes("PREDICTIVE LAYER BOUNDARY"),
        note: "Does not scan Architect prose for the English word pressure — only candidate score fields and imports.",
        filesScanned: professorFiles.length,
      },
      "8_advanced_preferences_off_identical": {
        pass:
          defaultPoolKey === emptyPrefPoolKey &&
          userSemanticPreferencesForPromptV111(undefined) === "none" &&
          isUserSemanticPreferencesNoneV111({ prefer: [], avoid: [] }),
        emptyPrefsSamePoolsAsOmitted: defaultPoolKey === emptyPrefPoolKey,
        preferTokensChangesPools: defaultPoolKey !== preferTokenPoolKey,
        promptPreferencesWhenOff: payload.userSemanticPreferences,
      },
    },
  };

  const hardFails = [
    report.checks["1_simple_card_oracle_behavior_unchanged"].pass,
    report.checks["2_frozen_professor_tests"].pass,
    report.checks["5_constructor_payload_budget"].pass,
    report.checks["6_semantic_cannot_override_canonical_oracle"].pass,
    report.checks["7_predictive_layer_boundary"].pass,
    report.checks["8_advanced_preferences_off_identical"].pass,
  ];
  const overallPass = hardFails.every(Boolean);
  const out = { ...report, overallHardPass: overallPass };

  writeFileSync(resolve(REPORT_DIR, "REPORT.json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ overallHardPass: overallPass, reportPath: resolve(REPORT_DIR, "REPORT.json") }, null, 2));

  assert.ok(report.checks["1_simple_card_oracle_behavior_unchanged"].pass, "check 1 failed");
  assert.ok(report.checks["2_frozen_professor_tests"].pass, "check 2 failed");
  assert.ok(report.checks["5_constructor_payload_budget"].pass, "check 5 failed");
  assert.ok(report.checks["6_semantic_cannot_override_canonical_oracle"].pass, "check 6 failed");
  assert.ok(report.checks["7_predictive_layer_boundary"].pass, "check 7 failed");
  assert.ok(report.checks["8_advanced_preferences_off_identical"].pass, "check 8 failed");

  console.log("ALL PASS — professor-semantic-path-regression-v1 hard checks");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
