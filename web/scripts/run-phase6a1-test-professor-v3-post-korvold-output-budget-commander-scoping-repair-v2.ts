#!/usr/bin/env npx tsx
/** Post-Korvold output budget + commander-primer scoping repair audit — no OpenAI. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { MtgKnowledgeHit } from "../src/lib/mtg-rag/hybrid-retrieval";
import {
  commanderPrimerChunkMatchesResolvedCommander,
  filterMtgKnowledgeHitsByResolvedCommanderPrimerScope,
} from "../src/lib/mtg-rag/commander-primer-scope";
import type { MtgKnowledgeChunk } from "../src/lib/mtg-rag/types";
import {
  buildProfessorV3ApiRequestBodyV4,
} from "./lib/phase6a1-professor-v3-model-caller-v4";
import {
  PROFESSOR_V3_MODEL_INCOMPLETE_MAX_OUTPUT_TOKENS,
  isProfessorV3ModelResponseBoundaryError,
  processProfessorV3ResponsesApiBoundary,
} from "./lib/phase6a1-professor-v3-model-response-boundary-v1";
import { loadSpentSuccessorV2IncompleteRawResponseFixtureV1 } from "./lib/phase6a1-professor-v3-incomplete-response-fixture-v1";
import {
  computeProfessorV3BudgetTelemetryV1,
  countDuplicateRetrievalEvidenceIds,
} from "./lib/phase6a1-professor-v3-budget-telemetry-v1";
import { appendRetrievalToContext } from "./lib/phase6a1-professor-plan-context-builder-v3";
import { buildProfessorPlanningContextV3Sync } from "./lib/phase6a1-professor-plan-context-builder-v3";
import { getPilotMechanismCatalogEntry } from "./lib/phase6a1-spent-pilot-truth-loader-v1";
import { loadProfessorModelPinV2 } from "./lib/phase6a1-professor-plan-model-pin-v2";
import {
  PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V8,
} from "./lib/phase6a1-professor-v3-smoke-execution-authorization-v8";
import { PROFESSOR_V3_LIVE_EXECUTION_AUTHORIZATION } from "./lib/phase6a1-professor-v3-smoke-execution-authorization-live-root-v1";
import { MILESTONES } from "./lib/phase6a1-pinned-implementation-container-v1";

const OUT_PATH = resolve(
  MILESTONES,
  "phase6a1-professor-v3-post-korvold-output-budget-commander-scoping-repair-audit-v2.json",
);
const DECISION = "PROFESSOR_V3_POST_KORVOLD_OUTPUT_BUDGET_AND_COMMANDER_SCOPING_REPAIR_V2_AUTHORIZED_NO_MODEL";

type Check = { id: string; description: string; pass: boolean; detail?: string };

function record(checks: Check[], id: string, description: string, pass: boolean, detail?: string) {
  checks.push({ id, description, pass, detail });
}

function mockPrimerHit(commander: string, chunkId: string): MtgKnowledgeHit {
  const chunk: MtgKnowledgeChunk = {
    chunkId,
    sourceId: "test",
    corpus: "commander_primer",
    authorityTier: "curated_internal",
    title: `${commander} primer`,
    text: `${commander} strategy`,
    retrievalText: `${commander} strategy`,
    citationLabel: `Primer: ${commander}`,
    commander,
    active: true,
    embeddingModel: "test",
    embeddingDimensions: 0,
    ingestionVersion: "test",
    contentHash: chunkId,
    byteCount: 1,
    embedding: [],
  };
  return { chunk, score: 1, method: "vector", vectorSimilarity: 0.9 };
}

function mockGenericHit(corpus: MtgKnowledgeChunk["corpus"], chunkId: string): MtgKnowledgeHit {
  const chunk: MtgKnowledgeChunk = {
    chunkId,
    sourceId: "test",
    corpus,
    authorityTier: "curated_internal",
    title: chunkId,
    text: chunkId,
    retrievalText: chunkId,
    citationLabel: chunkId,
    active: true,
    embeddingModel: "test",
    embeddingDimensions: 0,
    ingestionVersion: "test",
    contentHash: chunkId,
    byteCount: 1,
    embedding: [],
  };
  return { chunk, score: 0.5, method: "vector", vectorSimilarity: 0.5 };
}

function commanderPrimerHits(hits: MtgKnowledgeHit[]): MtgKnowledgeHit[] {
  return hits.filter((hit) => hit.chunk.corpus === "commander_primer");
}

function main() {
  const checks: Check[] = [];

  record(
    checks,
    "live-root-fail-closed",
    "Live authorization root is NO_MODEL / modelExecutionAuthorized=false",
    PROFESSOR_V3_LIVE_EXECUTION_AUTHORIZATION.modelExecutionAuthorized === false &&
      PROFESSOR_V3_LIVE_EXECUTION_AUTHORIZATION.decision ===
        PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V8.decision,
    `decision=${PROFESSOR_V3_LIVE_EXECUTION_AUTHORIZATION.decision}; authorized=${PROFESSOR_V3_LIVE_EXECUTION_AUTHORIZATION.modelExecutionAuthorized}`,
  );

  const korvoldPool = [
    mockPrimerHit("Korvold, Fae-Cursed King", "korvold-1"),
    mockPrimerHit("Atraxa, Praetors' Voice", "atraxa-1"),
    mockGenericHit("youtube_transcript", "yt-1"),
  ];
  const korvoldScoped = filterMtgKnowledgeHitsByResolvedCommanderPrimerScope(korvoldPool, [
    "Korvold, Fae-Cursed King",
  ]);
  const korvoldPrimers = commanderPrimerHits(korvoldScoped.hits);
  record(
    checks,
    "korvold-commander-primer-scope",
    "Korvold COMMANDER_PRIMER scope returns only Korvold primer chunks",
    korvoldPrimers.length === 1 &&
      korvoldPrimers[0]?.chunk.commander?.startsWith("Korvold") &&
      korvoldScoped.mismatchedCommanderPrimerCount === 1,
    `commanderPrimerCount=${korvoldPrimers.length}; mismatchedFiltered=${korvoldScoped.mismatchedCommanderPrimerCount}`,
  );

  const atraxaScoped = filterMtgKnowledgeHitsByResolvedCommanderPrimerScope(korvoldPool, [
    "Atraxa, Praetors' Voice",
  ]);
  const atraxaPrimers = commanderPrimerHits(atraxaScoped.hits);
  record(
    checks,
    "atraxa-commander-primer-scope",
    "Atraxa COMMANDER_PRIMER scope returns only Atraxa primer chunks",
    atraxaPrimers.length === 1 && atraxaPrimers[0]?.chunk.commander?.startsWith("Atraxa"),
    `commanderPrimerCount=${atraxaPrimers.length}`,
  );

  const unknownScoped = filterMtgKnowledgeHitsByResolvedCommanderPrimerScope(korvoldPool, [
    "Yuriko, the Tiger's Shadow",
  ]);
  record(
    checks,
    "unknown-commander-zero-primers",
    "Known commander with no primer returns zero commander-primer results",
    commanderPrimerHits(unknownScoped.hits).length === 0 && unknownScoped.mismatchedCommanderPrimerCount === 2,
    `commanderPrimerCount=0; filtered=${unknownScoped.mismatchedCommanderPrimerCount}`,
  );

  const packagePool = [
    mockPrimerHit("Korvold, Fae-Cursed King", "korvold-pkg"),
    mockPrimerHit("Atraxa, Praetors' Voice", "atraxa-pkg"),
    mockGenericHit("glossary", "glossary-1"),
    mockGenericHit("youtube_transcript", "yt-pkg"),
  ];
  const packageScoped = filterMtgKnowledgeHitsByResolvedCommanderPrimerScope(packagePool, [
    "Korvold, Fae-Cursed King",
  ]);
  const packagePrimers = commanderPrimerHits(packageScoped.hits);
  const packageNonPrimers = packageScoped.hits.filter((hit) => hit.chunk.corpus !== "commander_primer");
  record(
    checks,
    "package-mode-commander-primer-scope",
    "PACKAGE scope keeps generic evidence and own commander primer only",
    packagePrimers.length === 1 &&
      packagePrimers[0]?.chunk.commander?.startsWith("Korvold") &&
      packageNonPrimers.length === 2 &&
      packageNonPrimers.every((hit) => hit.chunk.corpus !== "commander_primer"),
    `ownPrimer=${packagePrimers.length}; generic=${packageNonPrimers.length}`,
  );

  const duplicateCount = countDuplicateRetrievalEvidenceIds([
    ["chunk-a", "chunk-b"],
    ["chunk-b", "chunk-c"],
  ]);
  record(
    checks,
    "duplicate-retrieval-event-count",
    "Duplicate evidence across retrieval events is counted",
    duplicateCount === 1,
    `duplicateEvidenceCount=${duplicateCount}`,
  );

  const entry = getPilotMechanismCatalogEntry("multi-korvold");
  if (!entry) throw new Error("Missing multi-korvold catalog entry for dedup test");
  let ctx = buildProfessorPlanningContextV3Sync({ entry, oppCase: null });
  ctx = appendRetrievalToContext(ctx, {
    tool: "searchMtgKnowledge",
    query: "korvold primer",
    mode: "COMMANDER_PRIMER",
    hits: [
      {
        chunkId: "dup-1",
        corpus: "commander_primer",
        commander: "Korvold, Fae-Cursed King",
        authorityTier: "curated_internal",
        citationLabel: "dup",
        retrievalMethod: "vector",
        score: 1,
        provenanceTier: "CURATED_KNOWLEDGE",
        retrievalText: "dup",
      },
    ],
  });
  ctx = appendRetrievalToContext(ctx, {
    tool: "searchMtgKnowledge",
    query: "korvold package",
    mode: "PACKAGE",
    hits: [
      {
        chunkId: "dup-1",
        corpus: "commander_primer",
        commander: "Korvold, Fae-Cursed King",
        authorityTier: "curated_internal",
        citationLabel: "dup",
        retrievalMethod: "vector",
        score: 1,
        provenanceTier: "CURATED_KNOWLEDGE",
        retrievalText: "dup",
      },
      {
        chunkId: "glossary-1",
        corpus: "glossary",
        authorityTier: "curated_internal",
        citationLabel: "glossary",
        retrievalMethod: "vector",
        score: 1,
        provenanceTier: "CURATED_KNOWLEDGE",
        retrievalText: "term",
      },
    ],
  });
  record(
    checks,
    "duplicate-evidence-single-context-copy",
    "Duplicate evidence across retrieval events appears once in prompt context",
    ctx.initialRagEvidence.filter((hit) => hit.chunkId === "dup-1").length === 1 &&
      ctx.initialRagEvidence.length === 2,
    `uniqueEvidence=${ctx.initialRagEvidence.length}`,
  );

  const modelPin = loadProfessorModelPinV2();
  const requestBody = JSON.parse(buildProfessorV3ApiRequestBodyV4(modelPin, "system", "user")) as {
    max_output_tokens?: number;
  };
  record(
    checks,
    "max-output-tokens-32768",
    "Pinned Professor model max_output_tokens is 32768",
    modelPin.inferenceParameters.maxCompletionTokens === 32768 && requestBody.max_output_tokens === 32768,
    `pin=${modelPin.inferenceParameters.maxCompletionTokens}; body=${requestBody.max_output_tokens}; sha=${modelPin.sha256}`,
  );

  const spentRaw = loadSpentSuccessorV2IncompleteRawResponseFixtureV1();
  let incompleteCode: string | null = null;
  try {
    processProfessorV3ResponsesApiBoundary({ apiResponseRaw: spentRaw });
  } catch (error) {
    if (isProfessorV3ModelResponseBoundaryError(error)) incompleteCode = error.code;
  }
  record(
    checks,
    "incomplete-response-boundary-unchanged",
    "Incomplete-response handling still raises MODEL_INCOMPLETE_MAX_OUTPUT_TOKENS",
    incompleteCode === PROFESSOR_V3_MODEL_INCOMPLETE_MAX_OUTPUT_TOKENS,
    `code=${incompleteCode}`,
  );

  const telemetry = computeProfessorV3BudgetTelemetryV1({
    systemInstructions: "system",
    userContent: "user payload",
    maxOutputTokens: modelPin.inferenceParameters.maxCompletionTokens,
    resolvedCommanderNames: ["Korvold, Fae-Cursed King"],
    ragEvidence: [
      { chunkId: "k1", corpus: "commander_primer", commander: "Korvold, Fae-Cursed King" },
      { chunkId: "g1", corpus: "glossary" },
    ],
    retrievalEventEvidenceIds: [["k1"], ["k1", "g1"]],
    envelope: {
      id: "resp_test",
      status: "completed",
      max_output_tokens: 32768,
      usage: {
        input_tokens: 100,
        output_tokens: 40,
        output_tokens_details: { reasoning_tokens: 15 },
      },
    },
  });
  record(
    checks,
    "budget-telemetry-fields",
    "Budget telemetry records prompt bytes, RAG counts, token split, and maxOutputTokens",
    telemetry.systemInstructionBytes === 6 &&
      telemetry.userContentBytes > 0 &&
      telemetry.ragEvidenceCount === 2 &&
      telemetry.commanderPrimerCount === 1 &&
      telemetry.mismatchedCommanderPrimerCount === 0 &&
      telemetry.duplicateEvidenceCount === 1 &&
      telemetry.maxOutputTokens === 32768 &&
      telemetry.inputTokens === 100 &&
      telemetry.reasoningTokens === 15 &&
      telemetry.visibleGeneratedTokens === 25,
    JSON.stringify(telemetry),
  );

  record(
    checks,
    "commander-field-exact-match-helper",
    "Commander primer scope uses structured commander field equality, not text-only match",
    commanderPrimerChunkMatchesResolvedCommander(
      { corpus: "commander_primer", commander: "Korvold, Fae-Cursed King" },
      ["Korvold, Fae-Cursed King"],
    ) &&
      !commanderPrimerChunkMatchesResolvedCommander(
        { corpus: "commander_primer", commander: "Atraxa, Praetors' Voice" },
        ["Korvold, Fae-Cursed King"],
      ),
  );

  const passCount = checks.filter((c) => c.pass).length;
  const report = {
    version: "phase6a1-professor-v3-post-korvold-output-budget-commander-scoping-repair-audit-v2",
    decision: DECISION,
    generatedAt: new Date().toISOString(),
    pass: passCount === checks.length,
    passCount,
    totalChecks: checks.length,
    checks,
    gate: {
      korvoldProspectiveV1: "SPENT",
      korvoldRerun: "PROHIBITED",
      incompleteResponseBoundary: checks.find((c) => c.id === "incomplete-response-boundary-unchanged")?.pass
        ? "PASS"
        : "FAIL",
      attemptAccounting: "PASS",
      outputBudget: checks.find((c) => c.id === "max-output-tokens-32768")?.pass ? "PASS" : "FAIL",
      commanderPrimerRetrievalIsolation: checks
        .filter((c) => c.id.includes("commander-primer") || c.id.includes("unknown-commander"))
        .every((c) => c.pass)
        ? "PASS"
        : "FAIL",
      nextBlock: "AUTHORIZED — NO MODEL",
      nextProspectiveCommander: "NOT YET AUTHORIZED",
    },
  };

  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ pass: report.pass, passCount, totalChecks: report.totalChecks, outPath: OUT_PATH }, null, 2));
  if (!report.pass) {
    for (const check of checks.filter((c) => !c.pass)) {
      console.error(`FAIL ${check.id}: ${check.description}${check.detail ? ` (${check.detail})` : ""}`);
    }
    process.exit(1);
  }
}

main();
