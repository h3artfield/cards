#!/usr/bin/env npx tsx
/** Diagnose Muldrotha initial RAG through the exact smoke execution retrieval stack — no OpenAI. */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { searchMtgKnowledge } from "../src/lib/deck-intelligence/mtg-knowledge-service";
import { isMtgRagEnabled } from "../src/lib/mtg-rag/constants";
import { buildProfessorPlanningContextV3 } from "./lib/phase6a1-professor-plan-context-builder-v3";
import {
  buildProfessorV3RagEnvironmentIdentityV1,
  classifyProfessorV3RetrievalAttemptStatusV1,
} from "./lib/phase6a1-professor-v3-rag-environment-identity-v1";
import { initRunLedgerFromContext } from "../src/lib/deck-synthesis/professor-v3-run-ledger-v1";
import { getPilotMechanismCatalogEntry } from "./lib/phase6a1-spent-pilot-truth-loader-v1";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";
import { loadProjectEnvLocal } from "./lib/script-env";

const OUT_PATH = resolve(MILESTONES, "phase6a1-professor-v3-muldrotha-rag-diagnostic-v1.json");
const COMMANDER = "Muldrotha, the Gravetide";

async function runDiagnostic(envLoaded: boolean) {
  const environmentIdentity = buildProfessorV3RagEnvironmentIdentityV1();
  const mtgRagEnabled = isMtgRagEnabled();

  const searches = [
    {
      label: "COMMANDER_PRIMER",
      request: {
        query: `${COMMANDER} commander strategy enablers payoffs`,
        mode: "COMMANDER_PRIMER" as const,
        consumer: "professor_planner" as const,
        commanderName: COMMANDER,
        limit: 4,
      },
    },
    {
      label: "PACKAGE",
      request: {
        query: `${COMMANDER} deckbuilding packages synergy`,
        mode: "PACKAGE" as const,
        consumer: "professor_planner" as const,
        limit: 4,
      },
    },
  ];

  const directResults = [];
  for (const search of searches) {
    let result;
    let error: string | undefined;
    try {
      result = await searchMtgKnowledge(search.request);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      result = {
        mode: search.request.mode,
        consumer: search.request.consumer,
        query: search.request.query,
        enabled: mtgRagEnabled,
        hits: [],
        corpora: [],
        aliasMatches: 0,
        lexicalMatches: 0,
        vectorMatches: 0,
      };
    }
    directResults.push({
      label: search.label,
      query: search.request.query,
      mode: search.request.mode,
      enabled: result.enabled,
      status: classifyProfessorV3RetrievalAttemptStatusV1(result, error),
      error: error ?? null,
      resultCount: result.hits.length,
      returnedEvidenceIds: result.hits.map((h) => h.chunkId),
      corpora: result.corpora,
      aliasMatches: result.aliasMatches,
      lexicalMatches: result.lexicalMatches,
      vectorMatches: result.vectorMatches,
      retrievalRankingVersion: result.retrievalRankingVersion ?? null,
      sourceEnvironmentIdentity: buildProfessorV3RagEnvironmentIdentityV1(result),
      sampleCitations: result.hits.slice(0, 3).map((h) => ({ chunkId: h.chunkId, corpus: h.corpus, citationLabel: h.citationLabel })),
    });
  }

  const entry = getPilotMechanismCatalogEntry("multi-muldrotha");
  if (!entry) throw new Error("Missing Muldrotha mechanism truth");
  const ctx = await buildProfessorPlanningContextV3({ entry, oppCase: null, options: { includeMechanicalAffordances: true } });
  const runLedger = initRunLedgerFromContext({ ...ctx, caseId: "professor-v3-rag-diagnostic-v1" });

  const totalHits = directResults.reduce((n, r) => n + r.resultCount, 0);
  const diagnosis = !mtgRagEnabled
    ? "MTG_RAG_ENABLED is false — retrieval stack disabled before hybrid search"
    : totalHits === 0
      ? "RAG enabled but zero hits — inspect Firebase project/credentials, corpus availability, index wiring, or genuinely empty matching content"
      : "RAG reachable with meaningful hits";

  return {
    envLoaded,
    environmentIdentity,
    mtgRagEnabled,
    envPresence: {
      MTG_RAG_ENABLED: process.env.MTG_RAG_ENABLED ?? "(unset)",
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ? "(set)" : "(unset)",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ? "(set)" : "(unset)",
      GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS ? "(set)" : "(unset)",
    },
    directSearchResults: directResults,
    contextBuilder: {
      initialRagEvidenceCount: ctx.initialRagEvidence.length,
      initialRetrievalAttemptCount: ctx.initialRetrievalAttempts?.length ?? 0,
      initialRetrievalAttempts: ctx.initialRetrievalAttempts ?? [],
    },
    runLedger: {
      retrievalEventCount: runLedger.retrievalEvents.length,
      retrievalEvents: runLedger.retrievalEvents,
    },
    totalHits,
    diagnosis,
    successorSmokeAuthorizationReady: mtgRagEnabled && totalHits > 0,
  };
}

async function main() {
  const withoutEnv = await runDiagnostic(false);
  loadProjectEnvLocal();
  const withEnv = await runDiagnostic(true);

  const report = {
    version: "phase6a1-professor-v3-muldrotha-rag-diagnostic-v1",
    generatedAt: new Date().toISOString(),
    decision: "PROFESSOR_V3_SMOKE_V1_SPENT_FAIL_CONTRACT_SCHEMA_AND_RAG_ENVIRONMENT_REPAIR_REQUIRED_NO_MODEL",
    commander: COMMANDER,
    spentSmokePathNote:
      "Authorized execute runner does not call loadProjectEnvLocal(); spent smoke therefore ran with process env only.",
    withoutProjectEnvLocal: withoutEnv,
    withProjectEnvLocal: withEnv,
    diagnosis:
      withEnv.totalHits > 0 && !withoutEnv.mtgRagEnabled
        ? "Spent smoke zero-hit root cause: MTG_RAG_ENABLED unset in process env and execute runner does not load web/.env.local; RAG reachable once project env is loaded"
        : withEnv.diagnosis,
    successorSmokeAuthorizationReady: withEnv.successorSmokeAuthorizationReady,
  };

  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        artifact: OUT_PATH,
        sha256: sha256File(OUT_PATH),
        diagnosis: report.diagnosis,
        withoutEnvHits: withoutEnv.totalHits,
        withEnvHits: withEnv.totalHits,
        successorSmokeAuthorizationReady: report.successorSmokeAuthorizationReady,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
