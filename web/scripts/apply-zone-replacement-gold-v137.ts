/**
 * Apply zone/ninjutsu/replacement gold corrections to positive training catalog.
 * Run: npx tsx scripts/apply-zone-replacement-gold-v137.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadGoldMigrationV135, type GoldMigrationRecord } from "./lib/rc3-gold-migration-v135";
import { inferDerivedRoles } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

const CATALOG_PATH = resolve("data/oracle-action-eval-rc3-positive-training-catalog-v133.json");
const MIGRATION_PATH = resolve("data/milestones/rc3-development/zone-ninjutsu-replacement-gold-migration-v137.json");

function shouldRemoveGold(
  g: { actionType: string; evidenceContains?: string },
  removal: { actionType: string; evidenceContains: string },
): boolean {
  if (g.actionType !== removal.actionType) return false;
  const needle = removal.evidenceContains.toLowerCase().slice(0, 20);
  return (g.evidenceContains ?? "").toLowerCase().includes(needle);
}

function shouldReplaceGold(
  g: { actionType: string; evidenceContains?: string },
  replacement: { fromActionType: string; fromEvidenceContains: string },
): boolean {
  if (g.actionType !== replacement.fromActionType) return false;
  const needle = replacement.fromEvidenceContains.toLowerCase().slice(0, 20);
  return (g.evidenceContains ?? "").toLowerCase().includes(needle);
}

function applyRecord<
  T extends {
    id: string;
    expectedPrimitiveActions: Array<{ actionType: string; evidenceContains?: string; negative?: boolean }>;
    expectedRoles?: Array<{ role: string; fromPrimitiveActions: string[] }>;
    expectedStructure?: Record<string, unknown>;
    forbiddenPrimitiveActions?: string[];
  },
>(testCase: T, record: GoldMigrationRecord): T {
  const removals = record.removeLayer2Actions ?? [];
  const replacements = record.replaceLayer2Actions ?? [];

  let expectedPrimitiveActions = testCase.expectedPrimitiveActions.filter(
    (g) => !removals.some((removal) => shouldRemoveGold(g, removal)),
  );
  expectedPrimitiveActions = expectedPrimitiveActions.map((g) => {
    const replacement = replacements.find((candidate) => shouldReplaceGold(g, candidate));
    if (!replacement) return g;
    return {
      ...g,
      actionType: replacement.toActionType,
      evidenceContains: replacement.toEvidenceContains ?? g.evidenceContains,
    };
  });

  const forbidden = new Set(testCase.forbiddenPrimitiveActions ?? []);
  for (const removal of removals) forbidden.add(removal.actionType);

  const positive = expectedPrimitiveActions.filter((g) => !g.negative);
  const primitives = positive.map((p) => p.actionType);

  return {
    ...testCase,
    expectedPrimitiveActions,
    ...(record.expectedStructurePatch
      ? { expectedStructure: { ...(testCase.expectedStructure ?? {}), ...record.expectedStructurePatch } }
      : {}),
    forbiddenPrimitiveActions: forbidden.size ? [...forbidden] : undefined,
    expectedLayer1Conditions: record.layer1Condition
      ? Array.isArray(record.layer1Condition)
        ? record.layer1Condition
        : [record.layer1Condition]
      : undefined,
    expectedMechanicContext: record.expectedMechanicContext,
    permissionPolicyClass: record.policyClass,
    expectedRoles: positive.length
      ? inferDerivedRoles(primitives).map((role) => ({ role, fromPrimitiveActions: [...primitives] }))
      : [],
    goldReviewVersion: "zone-ninjutsu-replacement-gold-v137",
    goldReviewedAt: "2026-08-09T13:00:00.000Z",
    goldReviewer: "rc3-v137-zone-replacement-policy-adjudication",
    certifiedEmptyLayer2: positive.length === 0,
    parserConsulted: false,
  };
}

function main() {
  const envelope = JSON.parse(readFileSync(CATALOG_PATH, "utf8")) as {
    cases: Array<{ id: string; expectedPrimitiveActions: Array<{ actionType: string; evidenceContains?: string }> }>;
  };
  const migration = loadGoldMigrationV135(MIGRATION_PATH);
  const records = new Map(migration.records.map((record) => [record.caseId, record]));

  envelope.cases = envelope.cases.map((testCase) => {
    const record = records.get(testCase.id);
    if (!record) return testCase;
    return applyRecord(testCase, record);
  });

  writeFileSync(CATALOG_PATH, `${JSON.stringify(envelope, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        catalog: CATALOG_PATH,
        migration: MIGRATION_PATH,
        updatedCaseIds: [...records.keys()],
      },
      null,
      2,
    ),
  );
}

main();
