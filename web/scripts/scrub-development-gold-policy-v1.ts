/**
 * Parser-blind development gold policy scrub — generates rc4-development-gold-policy-scrub-v1 overlay.
 * Run: cd web && npx tsx scripts/scrub-development-gold-policy-v1.ts
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ExpectedPrimitiveAction, OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  GOLD_POLICY_VALIDATOR_VERSION,
  GOLD_POLICY_VERSION,
  validateBenchmarkGoldPolicy,
  validateGoldAction,
  type GoldPolicyViolation,
} from "./lib/gold-policy-validator-v1";
import { applyGoldMigrationV135, loadAllGoldMigrationsV135, type GoldMigrationRecord } from "./lib/rc3-gold-migration-v135";
import { enrichGoldAction } from "./lib/gold-semantic-enrichment-v1";

const DEV_PATHS = [
  "data/oracle-action-eval-development-v26-v14.json",
  "data/oracle-action-eval-development-generalization-expansion-v2-v14.json",
  "data/oracle-action-eval-development-generalization-expansion-v3-v14.json",
  "data/oracle-action-eval-development-generalization-expansion-v5-v14.json",
  "data/oracle-action-eval-rc3-positive-training-catalog-v133.json",
];

const OUT_DIR = "data/milestones/rc4-development";
const SCRUB_PATH = `${OUT_DIR}/rc4-development-gold-policy-scrub-v1.json`;

type CensusFamily =
  | "invalid_cost_gold"
  | "invalid_trigger_event_gold"
  | "invalid_permission_gold"
  | "invalid_reminder_gold"
  | "invalid_created_object_gold"
  | "invalid_replacement_gold"
  | "scope_completeness"
  | "primitive_distinction"
  | "duplicate_semantic"
  | "invalid_evidence_span"
  | "other";

function mapViolationToCensus(v: GoldPolicyViolation): CensusFamily {
  switch (v.code) {
    case "invalid_layer2_cost_gold":
      return "invalid_cost_gold";
    case "trigger_reference_action_gold":
      return "invalid_trigger_event_gold";
    case "condition_reference_action_gold":
      return "invalid_trigger_event_gold";
    case "invalid_permission_action_gold":
      return "invalid_permission_gold";
    case "reminder_card_native_gold":
      return "invalid_reminder_gold";
    case "created_object_ownership_violation":
      return "invalid_created_object_gold";
    case "invalid_replacement_gold":
      return "invalid_replacement_gold";
    case "scope_completeness_violation":
      return "scope_completeness";
    case "primitive_distinction_violation":
      return "primitive_distinction";
    case "duplicate_semantic_gold":
      return "duplicate_semantic";
    case "invalid_evidence_span":
      return "invalid_evidence_span";
    default:
      return "other";
  }
}

function loadDevelopmentCases(): OracleActionEvalCaseV2[] {
  return DEV_PATHS.flatMap((p) =>
    applyGoldMigrationV135(
      (JSON.parse(readFileSync(resolve(p), "utf8")) as { cases: OracleActionEvalCaseV2[] }).cases,
    ),
  );
}

function developmentHash(cases: OracleActionEvalCaseV2[]): string {
  return createHash("sha256").update(JSON.stringify(cases)).digest("hex");
}

function goldMatches(g: ExpectedPrimitiveAction, actionType: string, evidenceContains: string): boolean {
  if (g.actionType !== actionType) return false;
  const a = (g.evidenceContains ?? "").toLowerCase();
  const b = evidenceContains.toLowerCase();
  return a.includes(b.slice(0, Math.min(20, b.length))) || b.includes(a.slice(0, Math.min(20, a.length)));
}

function buildScrubRecords(cases: OracleActionEvalCaseV2[]): {
  records: GoldMigrationRecord[];
  corrections: Array<Record<string, unknown>>;
  census: Record<CensusFamily, number>;
} {
  const validation = validateBenchmarkGoldPolicy({
    cases,
    benchmarkHash: developmentHash(cases),
    benchmarkPath: "development-pre-scrub-with-prior-migrations",
  });

  const census: Record<CensusFamily, number> = {
    invalid_cost_gold: 0,
    invalid_trigger_event_gold: 0,
    invalid_permission_gold: 0,
    invalid_reminder_gold: 0,
    invalid_created_object_gold: 0,
    invalid_replacement_gold: 0,
    scope_completeness: 0,
    primitive_distinction: 0,
    duplicate_semantic: 0,
    invalid_evidence_span: 0,
    other: 0,
  };

  const byCase = new Map<string, GoldMigrationRecord>();
  const corrections: Array<Record<string, unknown>> = [];

  for (const v of validation.violations) {
    const family = mapViolationToCensus(v);
    census[family]++;

    if (v.actionType === "*") {
      // scope completeness — handled separately if needed
      corrections.push({
        caseId: v.caseId,
        cardName: v.cardName,
        censusFamily: family,
        policyRule: v.policyFamily,
        policyReason: v.policyReason,
        oldGold: null,
        correctedGold: null,
        migrationReason: "Scope completeness — requires manual case metadata review",
      });
      continue;
    }

    const testCase = cases.find((c) => c.id === v.caseId);
    if (!testCase) continue;

    const oldGold = testCase.expectedPrimitiveActions.find((g) =>
      goldMatches(g, v.actionType, v.evidenceContains),
    );

    if (!byCase.has(v.caseId)) {
      byCase.set(v.caseId, {
        caseId: v.caseId,
        removeLayer2Actions: [],
        replaceLayer2Actions: [],
        addLayer2Actions: [],
        policyClass: v.policyFamily,
        policyReason: v.policyReason,
      });
    }
    const record = byCase.get(v.caseId)!;

    if (v.code === "primitive_distinction_violation") {
      // Relabel primitive
      let toActionType = v.actionType;
      let toEvidence = v.evidenceContains;
      if (v.actionType === "return_to_hand" && /\bonto the battlefield\b/i.test(v.evidenceContains)) {
        toActionType = "return_to_battlefield";
      } else if (v.actionType === "put_into_hand" && /\bfrom (?:your )?graveyard\b/i.test(v.evidenceContains)) {
        toActionType = "return_to_hand";
      } else if (v.actionType === "draw" && /\bput [^.\n]+ into (?:your )?hand\b/i.test(v.evidenceContains)) {
        toActionType = "put_into_hand";
      } else if (v.actionType === "search_library" && /\bon top of (?:your )?library\b/i.test(v.evidenceContains)) {
        toActionType = "put_into_hand"; // library-top placement
      } else if (v.actionType === "shuffle_library" && /\binto (?:your )?library\b/i.test(v.evidenceContains)) {
        toActionType = "shuffle_into_library";
      }
      record.replaceLayer2Actions!.push({
        fromActionType: v.actionType,
        fromEvidenceContains: v.evidenceContains,
        toActionType,
        toEvidenceContains: toEvidence,
      });
      corrections.push({
        caseId: v.caseId,
        cardName: v.cardName,
        censusFamily: family,
        policyRule: v.policyFamily,
        policyReason: v.policyReason,
        oldGold: oldGold ?? { actionType: v.actionType, evidenceContains: v.evidenceContains },
        correctedGold: { actionType: toActionType, evidenceContains: toEvidence },
        evidenceSpan: v.semanticJustification.evidenceSpan,
        migrationReason: "Primitive distinction relabel per semantic policy registry",
      });
      continue;
    }

    if (v.code === "duplicate_semantic_gold") {
      record.removeLayer2Actions!.push({
        actionType: v.actionType,
        evidenceContains: v.evidenceContains,
      });
      corrections.push({
        caseId: v.caseId,
        cardName: v.cardName,
        censusFamily: family,
        policyRule: v.policyFamily,
        policyReason: v.policyReason,
        oldGold: oldGold ?? { actionType: v.actionType, evidenceContains: v.evidenceContains },
        correctedGold: null,
        evidenceSpan: v.semanticJustification.evidenceSpan,
        migrationReason: "Duplicate semantic gold entry removed",
      });
      continue;
    }

    // Default: remove invalid L2 gold
    record.removeLayer2Actions!.push({
      actionType: v.actionType,
      evidenceContains: v.evidenceContains,
    });

    const semantic = enrichGoldAction(testCase, {
      actionType: v.actionType as ExpectedPrimitiveAction["actionType"],
      evidenceContains: v.evidenceContains,
    });

    if (
      v.code === "invalid_permission_action_gold" &&
      (semantic.executionContext === "permission" || v.actionType === "cast")
    ) {
      record.layer1Permission = {
        permittedAction: "cast",
        evidenceContains: v.evidenceContains,
        duration: "continuous",
        objectScope: "object_class",
      };
    }

    corrections.push({
      caseId: v.caseId,
      cardName: v.cardName,
      censusFamily: family,
      policyRule: v.policyFamily,
      policyReason: v.policyReason,
      oldGold: oldGold ?? { actionType: v.actionType, evidenceContains: v.evidenceContains },
      correctedGold: null,
      evidenceSpan: v.semanticJustification.evidenceSpan,
      migrationReason:
        v.code === "invalid_layer2_cost_gold"
          ? "Payment primitive in cost region — Layer 1 only; forbiddenPrimitiveActions will include cost primitive"
          : v.code === "reminder_card_native_gold"
            ? "Reminder/mechanic definition — not card-native Layer-2"
            : v.code === "invalid_permission_action_gold"
              ? "Cast/play permission — Layer-1 only; moved to expectedLayer1Permissions"
              : v.code === "trigger_reference_action_gold" || v.code === "condition_reference_action_gold"
                ? "Trigger/condition reference — not resolving effect Layer-2"
                : v.code === "created_object_ownership_violation"
                  ? "Created-object capability owned by token — not source-card L2"
                  : v.code === "invalid_replacement_gold"
                    ? "Replacement event structural — not effect primitive L2"
                    : "Removed invalid Layer-2 gold per semantic policy registry",
    });
  }

  // Dedupe removal entries per case
  for (const record of byCase.values()) {
    const seen = new Set<string>();
    record.removeLayer2Actions = (record.removeLayer2Actions ?? []).filter((r) => {
      const k = `${r.actionType}|${r.evidenceContains}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (!record.removeLayer2Actions.length) delete record.removeLayer2Actions;
    if (!record.replaceLayer2Actions?.length) delete record.replaceLayer2Actions;
  }

  return { records: [...byCase.values()], corrections, census };
}

function main() {
  mkdirSync(resolve(OUT_DIR), { recursive: true });
  const preScrubCases = loadDevelopmentCases();
  const preValidation = validateBenchmarkGoldPolicy({
    cases: preScrubCases,
    benchmarkHash: developmentHash(preScrubCases),
    benchmarkPath: "development-pre-scrub",
  });

  const { records, corrections, census } = buildScrubRecords(preScrubCases);

  const postScrubCases = applyGoldMigrationV135(preScrubCases, {
    migrationVersion: "rc4-development-gold-policy-scrub-v1",
    records,
  });
  const postValidation = validateBenchmarkGoldPolicy({
    cases: postScrubCases,
    benchmarkHash: developmentHash(postScrubCases),
    benchmarkPath: "development-post-scrub",
  });

  const scrubEnvelope = {
    migrationVersion: "rc4-development-gold-policy-scrub-v1",
    generatedAt: new Date().toISOString(),
    parserBlind: true,
    parserConsulted: false,
    policyVersion: GOLD_POLICY_VERSION,
    validatorVersion: GOLD_POLICY_VALIDATOR_VERSION,
    priorMigrationCount: loadAllGoldMigrationsV135().length,
    rule: "Parser-blind semantic policy scrub — removes or relabels all Gold Policy Validator violations in current-policy development corpus.",
    preScrubViolationCount: preValidation.violations.length,
    postScrubViolationCount: postValidation.violations.length,
    postScrubPass: postValidation.pass,
    preScrubCensus: census,
    recordCount: records.length,
    correctionCount: corrections.length,
    records,
  };

  writeFileSync(resolve(SCRUB_PATH), `${JSON.stringify(scrubEnvelope, null, 2)}\n`);
  writeFileSync(
    resolve(`${OUT_DIR}/rc4-development-gold-policy-scrub-corrections-v1.json`),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), census, corrections }, null, 2)}\n`,
  );

  console.log(
    JSON.stringify(
      {
        preScrubViolations: preValidation.violations.length,
        postScrubViolations: postValidation.violations.length,
        postScrubPass: postValidation.pass,
        scrubRecords: records.length,
        corrections: corrections.length,
        census,
        scrubPath: SCRUB_PATH,
      },
      null,
      2,
    ),
  );
}

main();
