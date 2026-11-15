/**
 * Freeze annotation protocol after calibration disagreements are resolved.
 *
 * Run: cd web && npx tsx scripts/freeze-catalog-coverage-annotation-protocol-v1.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

const OUT_DIR = "data/milestones/catalog-shadow";

function main() {
  const protocol = JSON.parse(
    readFileSync(resolve(OUT_DIR, "catalog-coverage-annotation-protocol-v1.json"), "utf8"),
  );
  const calibration = JSON.parse(
    readFileSync(resolve(OUT_DIR, "catalog-coverage-calibration-batch-v1.json"), "utf8"),
  );
  const ledger = JSON.parse(
    readFileSync(resolve(OUT_DIR, "catalog-coverage-gold-adjudication-ledger-v1.json"), "utf8"),
  );

  const calIds = new Set(calibration.cards.map((c: { oracleId: string }) => c.oracleId));
  const calRecords = ledger.records.filter((r: { oracleId: string }) => calIds.has(r.oracleId));
  const unresolved = (ledger.disagreements ?? []).filter((d: { resolved?: boolean }) => !d.resolved);

  if (unresolved.length > 0) {
    throw new Error(`Unresolved calibration disagreements: ${unresolved.length}`);
  }

  const primaryComplete = calRecords.filter((r: { primary?: unknown }) => r.primary).length;
  const secondaryComplete = calRecords.filter((r: { secondary?: unknown }) => r.secondary).length;
  if (primaryComplete < calibration.batchSize || secondaryComplete < calibration.batchSize) {
    throw new Error(
      `Calibration adjudication incomplete: primary ${primaryComplete}/${calibration.batchSize}, secondary ${secondaryComplete}/${calibration.batchSize}`,
    );
  }

  const now = new Date().toISOString();
  protocol.status = "FROZEN";
  protocol.calibratedAt = now;
  protocol.frozenAt = now;
  protocol.calibrationSummary = {
    batchIdentityHash: calibration.batchIdentityHash,
    primaryComplete,
    secondaryComplete,
    disagreementsResolved: ledger.disagreements?.length ?? 0,
  };
  protocol.protocolContentHash = createHash("sha256").update(JSON.stringify(protocol)).digest("hex");

  writeFileSync(
    resolve(OUT_DIR, "catalog-coverage-annotation-protocol-v1.json"),
    `${JSON.stringify(protocol, null, 2)}\n`,
  );

  const workspace = JSON.parse(
    readFileSync(resolve(OUT_DIR, "catalog-coverage-gold-workspace-v1.json"), "utf8"),
  );
  workspace.status = "CALIBRATION_FROZEN_BULK_AUTHORIZED";
  workspace.workflow.phase = "P2_bulk_human_gold";
  workspace.workflow.calibrationComplete = true;
  writeFileSync(
    resolve(OUT_DIR, "catalog-coverage-gold-workspace-v1.json"),
    `${JSON.stringify(workspace, null, 2)}\n`,
  );

  const rubric = JSON.parse(
    readFileSync(resolve(OUT_DIR, "catalog-coverage-whole-card-rubric-v1.json"), "utf8"),
  );
  rubric.status = "FROZEN";
  rubric.frozenAt = now;
  writeFileSync(
    resolve(OUT_DIR, "catalog-coverage-whole-card-rubric-v1.json"),
    `${JSON.stringify(rubric, null, 2)}\n`,
  );

  console.log(
    JSON.stringify(
      {
        protocolStatus: protocol.status,
        protocolContentHash: protocol.protocolContentHash,
        bulkAnnotationAuthorized: true,
      },
      null,
      2,
    ),
  );
}

main();
