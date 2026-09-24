#!/usr/bin/env npx tsx
/**
 * Validate prospective holdout CR anchors against authoritative comprehensive_rules chunks.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { FieldPath } from "firebase-admin/firestore";
import { loadProjectEnvLocal } from "../lib/script-env";
import { COLLECTIONS } from "../../src/lib/firebase/collections";
import { requireFirestore } from "../../src/lib/firebase/admin";
import { validateHoldoutQueryIntegrity } from "../../src/lib/mtg-rag/holdout-integrity";
import {
  MTG_RAG_RETRIEVAL_PROSPECTIVE_HOLDOUT_V3,
  MTG_RAG_RETRIEVAL_PROSPECTIVE_HOLDOUT_V3_VERSION,
} from "../../src/lib/mtg-rag/mtg-rag-retrieval-prospective-holdout-v3";
import type { MtgKnowledgeChunk } from "../../src/lib/mtg-rag/types";

async function loadComprehensiveRuleChunks(): Promise<MtgKnowledgeChunk[]> {
  const db = requireFirestore();
  const col = db.collection(COLLECTIONS.mtgKnowledgeChunks);
  const chunks: MtgKnowledgeChunk[] = [];
  let last: FirebaseFirestore.DocumentSnapshot | undefined;

  while (true) {
    let q = col
      .where("active", "==", true)
      .where("corpus", "==", "comprehensive_rules")
      .orderBy(FieldPath.documentId())
      .limit(200);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) chunks.push(doc.data() as MtgKnowledgeChunk);
    last = snap.docs[snap.docs.length - 1];
  }

  return chunks;
}

async function main() {
  loadProjectEnvLocal();
  const holdout = MTG_RAG_RETRIEVAL_PROSPECTIVE_HOLDOUT_V3;
  const ruleChunks = await loadComprehensiveRuleChunks();

  const results = holdout.map((item) => {
    const integrity = validateHoldoutQueryIntegrity({
      query: item.query,
      expectation: item.integrityExpectation,
      authoritativeRuleChunks: ruleChunks,
    });
    return {
      holdoutId: item.id,
      mode: item.mode,
      query: item.query,
      integrityExpectation: item.integrityExpectation,
      ...integrity,
    };
  });

  const failed = results.filter((r) => !r.ok);
  const report = {
    version: "mtg-rag-retrieval-prospective-holdout-v3-integrity-v1",
    generatedAt: new Date().toISOString(),
    holdoutVersion: MTG_RAG_RETRIEVAL_PROSPECTIVE_HOLDOUT_V3_VERSION,
    queryCount: holdout.length,
    passed: results.filter((r) => r.ok).length,
    failed: failed.length,
    results,
    sealAuthorized: failed.length === 0,
  };

  const outPath = resolve(
    "data/milestones/deck-synthesis/mtg-rag-retrieval-prospective-holdout-v3-integrity-v1.json",
  );
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(
    JSON.stringify(
      {
        outPath,
        sha256: createHash("sha256").update(JSON.stringify(report)).digest("hex"),
        passed: report.passed,
        failed: report.failed,
        sealAuthorized: report.sealAuthorized,
        failures: failed.map((f) => ({ id: f.holdoutId, note: f.note })),
      },
      null,
      2,
    ),
  );

  if (!report.sealAuthorized) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
