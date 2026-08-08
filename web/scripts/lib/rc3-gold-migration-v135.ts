/**
 * Immutable v135 persistent-permission gold migration overlay (cast + play).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { OracleActionEvalCaseV2 } from "../audit-oracle-action-eval-cases";

export type Layer2Removal = {
  actionType: string;
  evidenceContains: string;
};

export type StaticPermissionDuration =
  | "continuous"
  | "while_condition"
  | "until_end_of_turn"
  | "this_turn";

export type Layer1PermissionModel = {
  permittedAction: "cast" | "play";
  objectCriteria?: string;
  sourceZone?: string;
  destination?: string;
  duration?: StaticPermissionDuration;
};

export type GoldMigrationRecord = {
  caseId: string;
  removeLayer2Actions: Layer2Removal[];
  /** @deprecated use removeLayer2Actions */
  removeCastEvidence?: string;
  layer1Permission?: Layer1PermissionModel | Layer1PermissionModel[];
  policyReason?: string;
  policyClass?: string;
};

export type GoldMigrationEnvelope = {
  migrationVersion: string;
  records: GoldMigrationRecord[];
};

const DEFAULT_PATH = resolve("data/milestones/rc3-development/persistent-permission-gold-migration-v135.json");
const LEGACY_PATH = resolve("data/milestones/rc3-development/persistent-permission-cast-gold-migration-v135.json");

function normalizeRecord(record: GoldMigrationRecord): Layer2Removal[] {
  if (record.removeLayer2Actions?.length) return record.removeLayer2Actions;
  if (record.removeCastEvidence) {
    return [{ actionType: "cast", evidenceContains: record.removeCastEvidence }];
  }
  return [];
}

export function loadGoldMigrationV135(path: string = DEFAULT_PATH): GoldMigrationEnvelope {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as GoldMigrationEnvelope;
  } catch {
    return JSON.parse(readFileSync(LEGACY_PATH, "utf8")) as GoldMigrationEnvelope;
  }
}

function shouldRemoveGold(g: { actionType: string; evidenceContains?: string }, removal: Layer2Removal): boolean {
  if (g.actionType !== removal.actionType) return false;
  const needle = removal.evidenceContains.toLowerCase().slice(0, 20);
  return (g.evidenceContains ?? "").toLowerCase().includes(needle);
}

export function applyGoldMigrationV135<T extends OracleActionEvalCaseV2>(
  cases: T[],
  migration: GoldMigrationEnvelope = loadGoldMigrationV135(),
): T[] {
  const removalsByCase = new Map(
    migration.records.map((r) => [r.caseId, normalizeRecord(r)] as const),
  );
  return cases.map((testCase) => {
    const removals = removalsByCase.get(testCase.id);
    if (!removals?.length) return testCase;
    const expectedPrimitiveActions = testCase.expectedPrimitiveActions.filter(
      (g) => !removals.some((removal) => shouldRemoveGold(g, removal)),
    );
    const forbidden = new Set(testCase.forbiddenPrimitiveActions ?? []);
    for (const removal of removals) forbidden.add(removal.actionType);
    return {
      ...testCase,
      expectedPrimitiveActions,
      forbiddenPrimitiveActions: [...forbidden],
      certifiedEmptyLayer2: expectedPrimitiveActions.every((g) => g.negative),
    };
  });
}
