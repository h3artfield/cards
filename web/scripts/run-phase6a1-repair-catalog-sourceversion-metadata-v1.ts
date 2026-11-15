/**
 * Fail-closed sourceVersion metadata repair for exactly 293 audited Oracle documents.
 * Mutates sourceVersion only — no other catalog fields.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { COLLECTIONS } from "../src/lib/firebase/collections";
import type { GoldenCatalogOracleCard } from "../src/lib/deck-builder/golden-catalog/schemas";
import type { DocumentReference } from "firebase-admin/firestore";
import { buildCanonicalOracleInput } from "./lib/catalog-population-classifier-v1";
import { combinedGoldenOracleText, goldenOracleTextHash } from "./lib/load-golden-catalog-index";
import { loadProjectEnvLocal } from "./lib/script-env";
import { requireLocalFirestore, withFirestoreScriptTimeout } from "./lib/firestore-fail-fast";
import { writeOnceMilestoneArtifact } from "./lib/write-once-milestone-artifact-v2";

loadProjectEnvLocal();

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const REPO = resolve(HERE, "../..");
const MILESTONES = resolve(REPO, "web/data/milestones/deck-synthesis");
const AUDIT_PATH = resolve(MILESTONES, "phase6a1-professor-plan-catalog-sourceversion-divergence-audit-v1.json");
const COMMITMENT_PATH = resolve(MILESTONES, "phase6a1-professor-plan-full-catalog-data-state-commitment-v2.json");
const MANIFEST_BASENAME = "phase6a1-professor-plan-catalog-sourceversion-repair-manifest-v1.json";
const MANIFEST_PATH = resolve(
  process.env.PHASE6A1_ARTIFACT_OUTPUT_DIR?.trim() || MILESTONES,
  MANIFEST_BASENAME,
);

type AuditRecord = {
  oracleId: string;
  name: string;
  committedSourceVersion: string;
  runtimeSourceVersion: string;
  committedOracleTextHash: string;
  committedCardStructureHash: string;
};

type AuditArtifact = {
  records: AuditRecord[];
  committedCatalogVersion: string;
};

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function runtimeHashes(card: GoldenCatalogOracleCard): {
  oracleTextHash: string;
  cardStructureHash: string;
} {
  const oracleText = combinedGoldenOracleText(card);
  return {
    oracleTextHash: goldenOracleTextHash(oracleText),
    cardStructureHash: buildCanonicalOracleInput(card).cardStructureHash,
  };
}

async function main(): Promise<void> {
  if (!existsSync(AUDIT_PATH)) {
    throw new Error(`FAIL_CLOSED: missing divergence audit ${AUDIT_PATH}`);
  }
  if (!existsSync(COMMITMENT_PATH)) {
    throw new Error(`FAIL_CLOSED: missing commitment v2 ${COMMITMENT_PATH}`);
  }

  const audit = JSON.parse(readFileSync(AUDIT_PATH, "utf8")) as AuditArtifact;
  const commitment = JSON.parse(readFileSync(COMMITMENT_PATH, "utf8")) as { catalogVersion: string };
  const targetSourceVersion = commitment.catalogVersion;

  if (audit.records.length !== 293) {
    throw new Error(`FAIL_CLOSED: audit record count ${audit.records.length} != 293`);
  }
  if (audit.committedCatalogVersion !== targetSourceVersion) {
    throw new Error("FAIL_CLOSED: audit committedCatalogVersion != commitment v2 catalogVersion");
  }

  const { ensureFirebaseAdmin, requireFirestore, isAdminConfigured } =
    await import("../src/lib/firebase/admin");
  if (!ensureFirebaseAdmin().initialized || !isAdminConfigured()) {
    throw new Error("FAIL_CLOSED: Firestore admin required for sourceVersion repair");
  }
  const db = await requireLocalFirestore("catalogOracleCards load", () => Promise.resolve(requireFirestore()));

  const snap = await withFirestoreScriptTimeout(
    "catalogOracleCards get",
    () => db.collection(COLLECTIONS.catalogOracleCards).get(),
    120_000,
  );

  const byOracleId = new Map<string, { ref: DocumentReference; data: GoldenCatalogOracleCard }>();
  for (const doc of snap.docs) {
    const data = doc.data() as GoldenCatalogOracleCard;
    if (!data.oracleId) continue;
    if (byOracleId.has(data.oracleId)) {
      throw new Error(`FAIL_CLOSED: duplicate Firestore oracleId ${data.oracleId}`);
    }
    byOracleId.set(data.oracleId, { ref: doc.ref, data });
  }

  const repairRows: Array<{
    oracleId: string;
    name: string;
    beforeSourceVersion: string;
    afterSourceVersion: string;
    oracleTextHash: string;
    cardStructureHash: string;
  }> = [];

  let batch = db.batch();
  let batchOps = 0;
  let preconditionFailureCount = 0;
  let preconditionFailure: string | null = null;

  for (const [index, record] of audit.records.entries()) {
    const located = byOracleId.get(record.oracleId);
    if (!located) {
      preconditionFailureCount = 1;
      preconditionFailure = `record ${index}: missing Firestore oracleId ${record.oracleId}`;
      break;
    }
    const { ref, data } = located;
    if (data.oracleId !== record.oracleId) {
      preconditionFailureCount = 1;
      preconditionFailure = `record ${index}: oracleId field mismatch ${data.oracleId} != ${record.oracleId}`;
      break;
    }
    if (data.sourceVersion !== record.runtimeSourceVersion) {
      preconditionFailureCount = 1;
      preconditionFailure = `record ${index} ${record.oracleId}: sourceVersion ${data.sourceVersion} != audited ${record.runtimeSourceVersion}`;
      break;
    }
    const hashes = runtimeHashes(data);
    if (hashes.oracleTextHash !== record.committedOracleTextHash) {
      preconditionFailureCount = 1;
      preconditionFailure = `record ${index} ${record.oracleId}: oracleTextHash drift ${hashes.oracleTextHash} != ${record.committedOracleTextHash}`;
      break;
    }
    if (hashes.cardStructureHash !== record.committedCardStructureHash) {
      preconditionFailureCount = 1;
      preconditionFailure = `record ${index} ${record.oracleId}: cardStructureHash drift ${hashes.cardStructureHash} != ${record.committedCardStructureHash}`;
      break;
    }

    batch.update(ref, { sourceVersion: targetSourceVersion });
    batchOps += 1;
    repairRows.push({
      oracleId: record.oracleId,
      name: record.name,
      beforeSourceVersion: record.runtimeSourceVersion,
      afterSourceVersion: targetSourceVersion,
      oracleTextHash: record.committedOracleTextHash,
      cardStructureHash: record.committedCardStructureHash,
    });

    if (batchOps >= 400) {
      await batch.commit();
      batch = db.batch();
      batchOps = 0;
    }
  }

  if (preconditionFailureCount > 0) {
    throw new Error(`FAIL_CLOSED: STOP ENTIRE REPAIR — ${preconditionFailure}`);
  }

  if (batchOps > 0) await batch.commit();

  if (repairRows.length !== 293) {
    throw new Error(`FAIL_CLOSED: repairRows ${repairRows.length} != 293`);
  }

  repairRows.sort((a, b) => a.oracleId.localeCompare(b.oracleId));

  const manifest = {
    version: "phase6a1-professor-plan-catalog-sourceversion-repair-manifest-v1",
    repairedAt: new Date().toISOString(),
    authorization: "SOURCEVERSION_METADATA_REPAIR_AUTHORIZED_293_ONLY",
    auditArtifact: "phase6a1-professor-plan-catalog-sourceversion-divergence-audit-v1.json",
    auditArtifactSha256: sha256File(AUDIT_PATH),
    commitmentArtifact: "phase6a1-professor-plan-full-catalog-data-state-commitment-v2.json",
    commitmentArtifactSha256: sha256File(COMMITMENT_PATH),
    targetSourceVersion,
    mutationScope: {
      allowedFields: ["sourceVersion"],
      forbiddenFields: [
        "oracle text",
        "type/layout/face structure",
        "legalities",
        "paperEligible",
        "catalogVersion",
        "commander classification",
        "any other catalog field",
      ],
    },
    requestedCount: 293,
    successfullyUpdatedCount: repairRows.length,
    skippedCount: 0,
    preconditionFailureCount: 0,
    records: repairRows,
    instruction: "REPORT_AND_WAIT",
  };

  writeOnceMilestoneArtifact(MANIFEST_PATH, manifest);
  console.log(
    JSON.stringify(
      {
        manifestPath: MANIFEST_PATH,
        manifestSha256: sha256File(MANIFEST_PATH),
        successfullyUpdatedCount: repairRows.length,
        targetSourceVersion,
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
