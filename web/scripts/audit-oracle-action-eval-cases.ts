/**
 * Audit and relabel 204 gold eval cases onto three-layer taxonomy.
 * Run: npx tsx scripts/audit-oracle-action-eval-cases.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  inferDerivedRoles,
  normalizeToPrimitive,
  type DerivedDeckRole,
  type PrimitiveActionType,
} from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

export interface ExpectedStructure {
  minTriggeredAbilities?: number;
  minActivatedAbilities?: number;
  abilityTypes?: Array<"static" | "activated" | "triggered" | "spell_effect" | "replacement">;
  optional?: boolean;
  requiresFace?: string;
}

export interface ExpectedPrimitiveAction {
  actionType: PrimitiveActionType;
  evidenceContains: string;
  cardFace?: string;
  optional?: boolean;
  optionalEffect?: boolean;
  optionalCost?: boolean;
  targetMinimum?: number;
  targetMaximum?: number | "X";
  quantityMayBeZero?: boolean;
  optionalityController?: "you" | "opponent" | "target_player" | "each_player" | "object_controller";
  optionalityScopeId?: string;
  dependsOnActionIds?: string[];
  negative?: boolean;
}

export interface ExpectedCondition {
  textContains: string;
  type?: "if" | "unless" | "only_if" | "as_long_as" | "if_you_do" | "when_you_do" | "delayed" | "intervening_if" | "replacement";
  attachesToEvidence?: string;
  attachesToAbilityIndex?: number;
}

export interface ExpectedRole {
  role: DerivedDeckRole;
  fromPrimitiveActions?: PrimitiveActionType[];
}

export interface OracleActionEvalCaseV2 {
  id: string;
  category: string;
  layout?: string;
  oracleId: string;
  oracleText: string;
  cardFace?: string;
  expectedStructure?: ExpectedStructure;
  expectedPrimitiveActions: ExpectedPrimitiveAction[];
  expectedConditions?: ExpectedCondition[];
  expectedRoles?: ExpectedRole[];
  forbiddenPrimitiveActions?: PrimitiveActionType[];
}

interface LegacyCase {
  id: string;
  category: string;
  layout?: string;
  oracleId: string;
  oracleText: string;
  cardFace?: string;
  expectedActions: Array<{
    actionType: string;
    abilityType?: string;
    evidenceContains: string;
    negative?: boolean;
  }>;
  forbiddenActions?: string[];
}

interface RelabelAuditEntry {
  caseId: string;
  originalLabel: string;
  newLabel: string;
  reason: string;
}

function migrateCase(legacy: LegacyCase): { case: OracleActionEvalCaseV2; audits: RelabelAuditEntry[] } {
  const audits: RelabelAuditEntry[] = [];
  const expectedStructure: ExpectedStructure = {};
  const expectedPrimitiveActions: ExpectedPrimitiveAction[] = [];
  const forbiddenPrimitiveActions: PrimitiveActionType[] = [];

  if (legacy.cardFace) {
    expectedStructure.requiresFace = legacy.cardFace;
  }

  for (const forbidden of legacy.forbiddenActions ?? []) {
    const p = normalizeToPrimitive(forbidden);
    if (p) forbiddenPrimitiveActions.push(p);
    else if (forbidden === "ramp / add mana") forbiddenPrimitiveActions.push("add_mana");
  }

  for (const exp of legacy.expectedActions) {
    if (exp.negative) continue;

    if (exp.actionType === "triggered") {
      expectedStructure.minTriggeredAbilities = (expectedStructure.minTriggeredAbilities ?? 0) + 1;
      audits.push({
        caseId: legacy.id,
        originalLabel: "triggered",
        newLabel: "expectedStructure.minTriggeredAbilities",
        reason: "Trigger structure is Layer 1, not a primitive action",
      });
      continue;
    }

    if (exp.actionType === "multiple") {
      expectedStructure.minTriggeredAbilities = Math.max(expectedStructure.minTriggeredAbilities ?? 0, 2);
      audits.push({
        caseId: legacy.id,
        originalLabel: "multiple",
        newLabel: "expectedStructure.minTriggeredAbilities>=2",
        reason: "Multiple abilities evaluated via ability count, not action type",
      });
      continue;
    }

    if (exp.actionType === "optional") {
      expectedStructure.optional = true;
      const inferred = inferPrimitiveFromOracleText(legacy.oracleText);
      if (inferred) {
        expectedPrimitiveActions.push({
          actionType: inferred,
          evidenceContains: exp.evidenceContains || inferredEvidenceFor(inferred, legacy.oracleText),
          optional: true,
        });
        audits.push({
          caseId: legacy.id,
          originalLabel: "optional",
          newLabel: `${inferred}+optional:true`,
          reason: "Optionality is a boolean modifier on primitive actions",
        });
      } else {
        audits.push({
          caseId: legacy.id,
          originalLabel: "optional",
          newLabel: "expectedStructure.optional:true",
          reason: "Optionality modifier only — primitive inferred separately",
        });
      }
      continue;
    }

    if (exp.actionType === "protection") {
      expectedStructure.abilityTypes = [...(expectedStructure.abilityTypes ?? []), "static"];
      audits.push({
        caseId: legacy.id,
        originalLabel: "protection",
        newLabel: "expectedStructure.static + expectedRoles.protection",
        reason: "Protection is a derived role / static structure, not a primitive action",
      });
      continue;
    }

    if (exp.actionType === "spell_effect" || exp.actionType === "variable" || exp.actionType === "granted") {
      expectedStructure.abilityTypes = [...(expectedStructure.abilityTypes ?? []), "spell_effect"];
      audits.push({
        caseId: legacy.id,
        originalLabel: exp.actionType,
        newLabel: "expectedStructure.spell_effect",
        reason: "Spell effect is ability structure, not a primitive action label",
      });
      continue;
    }

    // Jace -12: mill → exile + shuffle_into_library
    if (
      legacy.id === "eval-0053" &&
      exp.actionType === "mill" &&
      exp.evidenceContains.includes("Exile all cards")
    ) {
      expectedPrimitiveActions.push({
        actionType: "exile",
        evidenceContains: "Exile all cards",
      });
      expectedPrimitiveActions.push({
        actionType: "shuffle_into_library",
        evidenceContains: "shuffles their hand into their library",
      });
      audits.push({
        caseId: legacy.id,
        originalLabel: "mill:Exile all cards",
        newLabel: "exile + shuffle_into_library",
        reason: "Jace ultimate is library exile plus hand-to-library shuffle, not mill",
      });
      continue;
    }

    const primitive = normalizeToPrimitive(exp.actionType, exp.evidenceContains);
    if (!primitive) {
      audits.push({
        caseId: legacy.id,
        originalLabel: exp.actionType,
        newLabel: "SKIPPED",
        reason: "Could not map to primitive action",
      });
      continue;
    }

    if (exp.actionType !== primitive) {
      audits.push({
        caseId: legacy.id,
        originalLabel: `${exp.actionType}:${exp.evidenceContains}`,
        newLabel: `${primitive}:${exp.evidenceContains}`,
        reason: legacyLabelReason(exp.actionType, primitive),
      });
    }

    const optional = /\bYou may\b|\bup to\b/i.test(exp.evidenceContains) ||
      /\bYou may\b|\bup to\b/i.test(legacy.oracleText);

    expectedPrimitiveActions.push({
      actionType: primitive,
      evidenceContains: exp.evidenceContains,
      cardFace: legacy.cardFace,
      optional: optional || undefined,
    });

    if (exp.abilityType === "triggered") {
      expectedStructure.minTriggeredAbilities = (expectedStructure.minTriggeredAbilities ?? 0) + 1;
    }
    if (exp.abilityType === "activated") {
      expectedStructure.minActivatedAbilities = (expectedStructure.minActivatedAbilities ?? 0) + 1;
    }
  }

  const primitives = expectedPrimitiveActions.map((e) => e.actionType);
  const expectedRoles = inferDerivedRoles(primitives).map((role) => ({
    role,
    fromPrimitiveActions: primitives.filter((p) =>
      role === "tutor" ? p === "search_library" :
      role === "ramp" ? p === "add_mana" :
      role === "removal" ? ["destroy", "exile", "deal_damage", "counter"].includes(p) :
      role === "card_advantage" ? p === "draw" :
      role === "recursion" ? ["play", "cast", "return_to_battlefield"].includes(p) :
      false,
    ),
  }));

  if (legacy.expectedActions.some((e) => e.actionType === "protection")) {
    expectedRoles.push({ role: "protection", fromPrimitiveActions: [] });
  }

  const caseV2: OracleActionEvalCaseV2 = {
    id: legacy.id,
    category: legacy.category,
    layout: legacy.layout,
    oracleId: legacy.oracleId,
    oracleText: legacy.oracleText,
    cardFace: legacy.cardFace,
    expectedStructure: Object.keys(expectedStructure).length ? expectedStructure : undefined,
    expectedPrimitiveActions,
    expectedRoles: expectedRoles.length ? expectedRoles : undefined,
    forbiddenPrimitiveActions: forbiddenPrimitiveActions.length ? forbiddenPrimitiveActions : undefined,
  };

  return { case: caseV2, audits };
}

function legacyLabelReason(original: string, primitive: PrimitiveActionType): string {
  if (original === "tutor") return "Tutor is a derived role; primitive is search_library";
  if (original === "ramp / add mana") return "Ramp is a derived role; primitive is add_mana";
  if (original === "bounce") return "Bounce maps to return_to_hand";
  if (original === "reanimate") return "Reanimate maps to return_to_battlefield";
  if (original === "create tokens") return "Primitive is create_token";
  if (original === "board wipe") return "Board wipe is a role; primitive destroy with mass target evidence";
  if (original === "cast/play from exile") return "Primitive is cast";
  if (original === "graveyard recursion") return "Primitive is play from graveyard zone";
  if (original === "deal damage") return "Normalized to deal_damage snake_case";
  return `Mapped ${original} → ${primitive}`;
}

function inferPrimitiveFromOracleText(text: string): PrimitiveActionType | null {
  if (/\bdraw a card\b/i.test(text)) return "draw";
  if (/\bsearch your library\b/i.test(text)) return "search_library";
  if (/\bsacrifice\b/i.test(text)) return "sacrifice";
  if (/\bexile target\b/i.test(text)) return "exile";
  if (/\bcounter target\b/i.test(text)) return "counter";
  if (/\bdestroy target\b/i.test(text)) return "destroy";
  if (/\breturn target.*hand\b/i.test(text)) return "return_to_hand";
  if (/\bcreate.*token\b/i.test(text)) return "create_token";
  if (/\bdiscard\b/i.test(text)) return "discard";
  return null;
}

function inferredEvidenceFor(primitive: PrimitiveActionType, text: string): string {
  if (primitive === "draw") return "draw";
  if (primitive === "search_library") return "search your library";
  if (primitive === "sacrifice") return "Sacrifice";
  if (primitive === "exile") return "exile";
  if (primitive === "counter") return "Counter";
  if (primitive === "destroy") return "destroy";
  if (primitive === "return_to_hand") return "Return target";
  if (primitive === "create_token") return "create";
  if (primitive === "discard") return "discard";
  return text.slice(0, 20);
}

function main() {
  const legacyPath = resolve(process.cwd(), "data", "oracle-action-eval-cases.json");
  const legacy = JSON.parse(readFileSync(legacyPath, "utf8")) as {
    caseCount: number;
    cases: LegacyCase[];
  };

  const allAudits: RelabelAuditEntry[] = [];
  const migratedCases: OracleActionEvalCaseV2[] = [];

  for (const c of legacy.cases) {
    const { case: migrated, audits } = migrateCase(c);
    migratedCases.push(migrated);
    allAudits.push(...audits);
  }

  const relabeledCount = allAudits.filter((a) => a.originalLabel !== a.newLabel.split("+")[0]).length;

  const out = {
    version: 2,
    taxonomyVersion: "three-layer-v1",
    caseCount: migratedCases.length,
    relabeledExpectationCount: allAudits.length,
    distinctCasesRelabeled: new Set(allAudits.map((a) => a.caseId)).size,
    cases: migratedCases,
  };

  const outPath = resolve(process.cwd(), "data", "oracle-action-eval-cases-v2.json");
  writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");

  const report = {
    generatedAt: new Date().toISOString(),
    relabeledExpectationCount: allAudits.length,
    distinctCasesRelabeled: out.distinctCasesRelabeled,
    incorrectOriginalLabelExamples: allAudits.slice(0, 25),
    triggerEvaluatorBug: {
      finding: "evaluator wiring regression, not parser regression",
      explanation:
        "Prior eval (v2) computed trigger precision at case level: if any extracted action had abilityType=triggered, triggerTp++. Rewritten eval tied triggerTp to matched action expectations only; pseudo-type 'triggered' matches evidence on non-trigger-classified actions, yielding triggerTp=0 and precision=0/0=0. Trigger grading must use extraction.abilities (Layer 1) independently of primitive action matching.",
      priorMetric: "100% precision (case-level, zero false positives by construction)",
      brokenMetric: "0% precision (tp=0, fp=0 → division defaults to 0)",
      fix: "Grade triggers from segmented abilities vs expectedStructure.minTriggeredAbilities",
    },
    audits: allAudits,
  };

  const reportPath = resolve(process.cwd(), "reports", "oracle-action-eval-audit.json");
  mkdirSync(resolve(reportPath, ".."), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`Migrated ${migratedCases.length} cases → ${outPath}`);
  console.log(`Relabeled ${allAudits.length} expectations across ${out.distinctCasesRelabeled} cases`);
  console.log(`Audit report: ${reportPath}`);
}

main();
