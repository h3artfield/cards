/**
 * Immutable v135 persistent-permission gold migration overlay (cast + play).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { OracleActionEvalCaseV2, ExpectedStructure } from "../audit-oracle-action-eval-cases";
import type { ExpectedMechanicContext } from "./gold-reminder-text-policy";

export type Layer2Removal = {
  actionType: string;
  evidenceContains: string;
};

export type Layer2Replacement = {
  fromActionType: string;
  fromEvidenceContains: string;
  toActionType: string;
  toEvidenceContains?: string;
};

export type StaticPermissionDuration =
  | "continuous"
  | "while_condition"
  | "until_end_of_turn"
  | "this_turn";

export type PermissionObjectScope = "specific_object" | "object_class";

export type Layer1PermissionModel = {
  permittedAction: "cast" | "play";
  objectScope?: PermissionObjectScope;
  objectRef?: string;
  objectCriteria?: string;
  sourceZone?: string;
  destination?: string;
  duration?: StaticPermissionDuration;
  condition?: string;
  evidenceContains?: string;
};

export type Layer1ConditionModel = {
  kind: "termination_condition" | "future_event_reference";
  eventReference?: string;
  objectRef?: string;
  evidenceContains: string;
};

export type Layer2Addition = {
  actionType: string;
  evidenceContains: string;
};

export type GoldMigrationRecord = {
  caseId: string;
  removeLayer2Actions?: Layer2Removal[];
  replaceLayer2Actions?: Layer2Replacement[];
  addLayer2Actions?: Layer2Addition[];
  /** @deprecated use removeLayer2Actions */
  removeCastEvidence?: string;
  layer1Permission?: Layer1PermissionModel | Layer1PermissionModel[];
  layer1Condition?: Layer1ConditionModel | Layer1ConditionModel[];
  expectedMechanicContext?: ExpectedMechanicContext;
  expectedStructurePatch?: Partial<ExpectedStructure>;
  policyReason?: string;
  policyClass?: string;
};

export type GoldMigrationEnvelope = {
  migrationVersion: string;
  records: GoldMigrationRecord[];
};

const DEFAULT_PATH = resolve("data/milestones/rc3-development/persistent-permission-gold-migration-v135.json");
const LEGACY_PATH = resolve("data/milestones/rc3-development/persistent-permission-cast-gold-migration-v135.json");
const SHUFFLE_MIGRATION_PATH = resolve("data/milestones/rc3-development/granted-shuffle-gold-migration-v135.json");
const TOKEN_DEFINITION_MIGRATION_PATH = resolve("data/milestones/rc3-development/token-definition-gold-migration-v135.json");
const LAND_GRANT_PERMISSION_MIGRATION_PATH = resolve(
  "data/milestones/rc3-development/land-grant-permission-gold-migration-v137.json",
);
const ZONE_NINJUTSU_REPLACEMENT_MIGRATION_PATH = resolve(
  "data/milestones/rc3-development/zone-ninjutsu-replacement-gold-migration-v137.json",
);

const ACTIVATED_COST_FALL_TO_EARTH_MIGRATION_PATH = resolve(
  "data/milestones/rc3-development/activated-cost-fall-to-earth-gold-migration-v139.json",
);

const MIGRATION_PATHS = [
  DEFAULT_PATH,
  SHUFFLE_MIGRATION_PATH,
  TOKEN_DEFINITION_MIGRATION_PATH,
  LAND_GRANT_PERMISSION_MIGRATION_PATH,
  ZONE_NINJUTSU_REPLACEMENT_MIGRATION_PATH,
  ACTIVATED_COST_FALL_TO_EARTH_MIGRATION_PATH,
];

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

function shouldReplaceGold(
  g: { actionType: string; evidenceContains?: string },
  replacement: Layer2Replacement,
): boolean {
  if (g.actionType !== replacement.fromActionType) return false;
  const needle = replacement.fromEvidenceContains.toLowerCase().slice(0, 20);
  return (g.evidenceContains ?? "").toLowerCase().includes(needle);
}

export function loadAllGoldMigrationsV135(): GoldMigrationRecord[] {
  const records: GoldMigrationRecord[] = [];
  for (const path of MIGRATION_PATHS) {
    try {
      records.push(...loadGoldMigrationV135(path).records);
    } catch {
      if (path === DEFAULT_PATH) {
        records.push(...loadGoldMigrationV135(LEGACY_PATH).records);
      }
    }
  }
  return records;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function applyGoldMigrationV135<T extends OracleActionEvalCaseV2>(
  cases: T[],
  migration?: GoldMigrationEnvelope,
): T[] {
  const records = migration?.records ?? loadAllGoldMigrationsV135();
  const recordsByCase = new Map<string, GoldMigrationRecord[]>();
  for (const record of records) {
    const existing = recordsByCase.get(record.caseId) ?? [];
    existing.push(record);
    recordsByCase.set(record.caseId, existing);
  }
  return cases.map((testCase) => {
    const caseRecords = recordsByCase.get(testCase.id);
    if (!caseRecords?.length) return testCase;

    const removals = caseRecords.flatMap((record) => normalizeRecord(record));
    const replacements = caseRecords.flatMap((record) => record.replaceLayer2Actions ?? []);
    const additions = caseRecords.flatMap((record) => record.addLayer2Actions ?? []);
    let expectedPrimitiveActions = testCase.expectedPrimitiveActions;
    if (removals.length) {
      expectedPrimitiveActions = expectedPrimitiveActions.filter(
        (g) => !removals.some((removal) => shouldRemoveGold(g, removal)),
      );
    }
    if (replacements.length) {
      expectedPrimitiveActions = expectedPrimitiveActions.map((g) => {
        const replacement = replacements.find((candidate) => shouldReplaceGold(g, candidate));
        if (!replacement) return g;
        return {
          ...g,
          actionType: replacement.toActionType as typeof g.actionType,
          evidenceContains: replacement.toEvidenceContains ?? g.evidenceContains,
        };
      });
    }
    if (additions.length) {
      for (const addition of additions) {
        const exists = expectedPrimitiveActions.some(
          (g) =>
            g.actionType === addition.actionType &&
            (g.evidenceContains ?? "").toLowerCase().includes(addition.evidenceContains.toLowerCase().slice(0, 20)),
        );
        if (!exists) {
          expectedPrimitiveActions = [
            ...expectedPrimitiveActions,
            {
              actionType: addition.actionType as (typeof expectedPrimitiveActions)[number]["actionType"],
              evidenceContains: addition.evidenceContains,
            },
          ];
        }
      }
    }

    const forbidden = new Set(testCase.forbiddenPrimitiveActions ?? []);
    for (const removal of removals) forbidden.add(removal.actionType);

    const layer1Permissions = caseRecords.flatMap((record) => asArray(record.layer1Permission));
    const layer1Conditions = caseRecords.flatMap((record) => asArray(record.layer1Condition));
    const policyClass = caseRecords.find((record) => record.policyClass)?.policyClass;
    const mechanicContext = caseRecords.find((record) => record.expectedMechanicContext)?.expectedMechanicContext;
    const structurePatch = caseRecords.reduce<Partial<ExpectedStructure>>(
      (merged, record) => ({ ...merged, ...(record.expectedStructurePatch ?? {}) }),
      {},
    );
    const positiveActions = expectedPrimitiveActions.filter((g) => !g.negative);

    return {
      ...testCase,
      expectedPrimitiveActions,
      ...(Object.keys(structurePatch).length
        ? { expectedStructure: { ...(testCase.expectedStructure ?? {}), ...structurePatch } }
        : {}),
      ...(forbidden.size ? { forbiddenPrimitiveActions: [...forbidden] } : {}),
      ...(layer1Permissions.length ? { expectedLayer1Permissions: layer1Permissions } : {}),
      ...(layer1Conditions.length ? { expectedLayer1Conditions: layer1Conditions } : {}),
      ...(mechanicContext ? { expectedMechanicContext: mechanicContext } : {}),
      ...(policyClass ? { permissionPolicyClass: policyClass } : {}),
      certifiedEmptyLayer2: positiveActions.length === 0,
    };
  });
}
