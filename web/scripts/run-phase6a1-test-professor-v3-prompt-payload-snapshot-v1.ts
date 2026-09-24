#!/usr/bin/env npx tsx
/** Muldrotha prompt payload snapshot — proves semantic layer is model-visible, no OpenAI. */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildProfessorV3PromptPayload } from "./lib/phase6a1-professor-v3-prompt-payload-v1";
import {
  buildFixtureValidatorContext,
  buildMuldrothaProfessorContextV3ZeroAffordances,
  MULDROTHA_CAST_FACT,
  MULDROTHA_LAND_FACT,
  MULDROTHA_ORACLE_ID,
} from "./lib/phase6a1-professor-v3-grounding-fixtures-v1";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";
import { assertLedgerProvenancePreserved, buildProfessorEvidenceLedgerV3 } from "../src/lib/deck-synthesis/professor-v3-evidence-ledger-v1";

const OUT_PATH = resolve(MILESTONES, "phase6a1-professor-v3-prompt-payload-snapshot-muldrotha-v1.json");

function main() {
  const ctx = buildFixtureValidatorContext({
    ctx: buildMuldrothaProfessorContextV3ZeroAffordances(),
    extraRagIds: ["rag-muldrotha-primer-snapshot"],
    extraRagTexts: ["Self-mill Muldrotha decks stock the graveyard with permanents for recursion."],
    extraRagProvenance: [{ tool: "searchMtgKnowledge", query: "Muldrotha sacrifice recursion graveyard stocking", retrievalMode: "COMMANDER_PRIMER" }],
  });

  const payload = buildProfessorV3PromptPayload(ctx);
  const text = payload.modelVisibleText;
  const ledger = buildProfessorEvidenceLedgerV3(ctx);

  const requiredSubstrings = [
    "Muldrotha",
    MULDROTHA_ORACLE_ID,
    MULDROTHA_LAND_FACT,
    MULDROTHA_CAST_FACT,
    "rag-muldrotha-primer-snapshot",
    "Muldrotha sacrifice recursion graveyard stocking",
    "searchMtgKnowledge",
    "PRODUCES_STATE",
    "PERMITS_ACTION",
  ];

  const missing = requiredSubstrings.filter((s) => !text.includes(s));
  const sectionIds = payload.sections.map((s) => s.sectionId);
  const requiredSections = [
    "command-zone",
    "canonical-oracle",
    "commander-mechanism-facts",
    "semantic-relationships",
    "known-mechanical-affordances",
    "constraints",
    "retrieved-knowledge",
    "evidence-id-index",
    "output-contract",
  ];
  const missingSections = requiredSections.filter((s) => !sectionIds.includes(s));

  const provenanceOk = assertLedgerProvenancePreserved({
    ledger,
    evidenceId: "rag-muldrotha-primer-snapshot",
    expectedTool: "searchMtgKnowledge",
    expectedQuery: "Muldrotha sacrifice recursion graveyard stocking",
  });

  const snapshot = {
    version: "phase6a1-professor-v3-prompt-payload-snapshot-muldrotha-v1",
    generatedAt: new Date().toISOString(),
    decision: "PROFESSOR_V3_ARCHITECTURE_CORE_PASS_MODEL_EXECUTION_BLOCK_V3_PROMPT_AGENT_LEDGER_AND_STATE_ENTAILMENT_REQUIRED",
    pass: missing.length === 0 && missingSections.length === 0 && provenanceOk,
    payloadVersion: payload.version,
    caseId: payload.caseId,
    sectionIds,
    evidenceLedgerEntryCount: ledger.entries.length,
    modelVisibleTextSha256: createHash("sha256").update(text, "utf8").digest("hex"),
    checks: {
      requiredSubstrings: requiredSubstrings.map((s) => ({ value: s, present: text.includes(s) })),
      requiredSections: requiredSections.map((s) => ({ value: s, present: sectionIds.includes(s) })),
      ragProvenancePreserved: provenanceOk,
    },
    payload,
  };

  writeFileSync(OUT_PATH, JSON.stringify(snapshot, null, 2));
  console.log(
    JSON.stringify(
      {
        artifact: OUT_PATH,
        sha256: sha256File(OUT_PATH),
        pass: snapshot.pass,
        missing,
        missingSections,
        provenanceOk,
      },
      null,
      2,
    ),
  );
  if (!snapshot.pass) process.exit(1);
}

main();
