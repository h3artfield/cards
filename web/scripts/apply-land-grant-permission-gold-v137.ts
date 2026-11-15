/**
 * Apply land-grant permission gold correction to positive training catalog.
 * Run: npx tsx scripts/apply-land-grant-permission-gold-v137.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadGoldMigrationV135, type GoldMigrationRecord } from "./lib/rc3-gold-migration-v135";
import { inferDerivedRoles } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

const CATALOG_PATH = resolve("data/oracle-action-eval-rc3-positive-training-catalog-v133.json");
const MIGRATION_PATH = resolve("data/milestones/rc3-development/land-grant-permission-gold-migration-v137.json");

function shouldRemoveGold(
  g: { actionType: string; evidenceContains?: string },
  removal: { actionType: string; evidenceContains: string },
): boolean {
  if (g.actionType !== removal.actionType) return false;
  const needle = removal.evidenceContains.toLowerCase().slice(0, 20);
  return (g.evidenceContains ?? "").toLowerCase().includes(needle);
}

function applyRecord<T extends { id: string; expectedPrimitiveActions: Array<{ actionType: string; evidenceContains?: string }>; expectedRoles?: Array<{ role: string; fromPrimitiveActions: string[] }>; forbiddenPrimitiveActions?: string[] }>(
  testCase: T,
  record: GoldMigrationRecord,
): T {
  const removals = record.removeLayer2Actions ?? [];
  const expectedPrimitiveActions = testCase.expectedPrimitiveActions.filter(
    (g) => !removals.some((removal) => shouldRemoveGold(g, removal)),
  );
  const forbidden = new Set(testCase.forbiddenPrimitiveActions ?? []);
  for (const removal of removals) forbidden.add(removal.actionType);
  const primitives = expectedPrimitiveActions.map((p) => p.actionType);
  return {
    ...testCase,
    expectedPrimitiveActions,
    forbiddenPrimitiveActions: forbidden.size ? [...forbidden] : undefined,
    expectedLayer1Permissions: record.layer1Permission
      ? Array.isArray(record.layer1Permission)
        ? record.layer1Permission
        : [record.layer1Permission]
      : undefined,
    expectedLayer1Conditions: record.layer1Condition
      ? Array.isArray(record.layer1Condition)
        ? [record.layer1Condition]
        : [record.layer1Condition]
      : undefined,
    permissionPolicyClass: record.policyClass,
    expectedRoles: inferDerivedRoles(primitives).map((role) => ({ role, fromPrimitiveActions: [...primitives] })),
    goldReviewVersion: "land-grant-permission-gold-v137",
    goldReviewedAt: "2026-08-09T12:00:00.000Z",
    goldReviewer: "rc3-v137-permission-policy-adjudication",
  };
}

function main() {
  const envelope = JSON.parse(readFileSync(CATALOG_PATH, "utf8")) as {
    cases: Array<{ id: string; expectedPrimitiveActions: Array<{ actionType: string; evidenceContains?: string }> }>;
  };
  const migration = loadGoldMigrationV135(MIGRATION_PATH);
  const records = new Map(migration.records.map((record) => [record.caseId, record]));

  envelope.cases = envelope.cases.map((testCase) => {
    if (testCase.id === "rc3-pos-cat-0022") {
      const expectedPrimitiveActions = [
        ...testCase.expectedPrimitiveActions,
        {
          actionType: "deal_damage",
          evidenceContains:
            "deals damage equal to twice the number of creatures you control to target creature or planeswalker",
        },
      ];
      const primitives = expectedPrimitiveActions.map((p) => p.actionType);
      return {
        ...testCase,
        expectedPrimitiveActions,
        expectedRoles: inferDerivedRoles(primitives).map((role) => ({
          role,
          fromPrimitiveActions: [...primitives],
        })),
        goldReviewVersion: "modal-full-card-gold-v137",
        goldReviewedAt: "2026-08-09T12:00:00.000Z",
        goldReviewer: "rc3-v137-cabaretti-scope-correction",
        scopeReason: "Complete primitive gold for all modal Layer-2 options within full_card scope.",
      };
    }
    const record = records.get(testCase.id);
    if (!record) return testCase;
    return applyRecord(testCase, record);
  });

  writeFileSync(CATALOG_PATH, `${JSON.stringify(envelope, null, 2)}\n`);
  console.log(JSON.stringify({ catalog: CATALOG_PATH, updatedCaseIds: [...records.keys(), "rc3-pos-cat-0022"] }, null, 2));
}

main();
