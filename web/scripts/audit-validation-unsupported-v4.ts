/**
 * Audit accepted genuinely-unsupported extractions on validation_set_v4.
 * Uses the same FP classification as eval-oracle-action-extraction-v6.
 * Run: npx tsx scripts/audit-validation-unsupported-v4.ts
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  extractOracleActionsV1,
  toLegacyExtractionResult,
} from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { ORACLE_ACTION_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { evaluateCaseSet } from "./eval-oracle-action-extraction-v6";
import {
  inferSupportedPrimitiveFromEvidence,
  REVIEWER_ID,
  spanValid,
  evidenceMatchesExtracted,
} from "./oracle-action-eval-shared";
import { HELD_OUT_CARD_NAMES } from "./validation-held-out-card-names";
import { matchGoldToActions, primitiveMatchesExpected } from "./oracle-action-unified-matcher";

const VALIDATION_V4_HASH = "c422988bc2816a86725cd7042c35d844c2b1cbd80ca5430c08a7f32bb403a076";

const PATTERN_ATTRIBUTION: Array<{ regex: RegExp; actionType: string; label: string }> = [
  {
    regex: /\b(?:you may )?cast spells from(?: your [\w]+)?\b/i,
    actionType: "cast",
    label: "CAST_SPELLS_FROM permission pattern",
  },
  {
    regex: /\bReturn (?:target|up to (?:one|two) target) [\w ]+ (?:card )?from (?:your )?graveyard to the battlefield\b/i,
    actionType: "return_to_battlefield",
    label: "Return target ... from graveyard to the battlefield",
  },
  {
    regex: /\bYou may put [\w ]+ onto the battlefield/i,
    actionType: "search_library",
    label: "You may put ... onto the battlefield (legacy search_library over-match)",
  },
];

function patternThatFired(evidenceText: string, rawActionType: string): string {
  for (const p of PATTERN_ATTRIBUTION) {
    if (p.regex.test(evidenceText) && p.actionType === rawActionType) return p.label;
  }
  return `emitted actionType=${rawActionType}`;
}

function classifyUnsupported(input: {
  testCase: OracleActionEvalCaseV2;
  primitive: string | null;
  evidenceText: string;
  oracleText: string;
  forbidden: boolean;
}): { isGenuinelyUnsupported: boolean; why: string; family: string; guard: string } {
  const { testCase, primitive, evidenceText, oracleText, forbidden } = input;
  const supported = inferSupportedPrimitiveFromEvidence(oracleText, evidenceText);

  if (forbidden && primitive && testCase.forbiddenPrimitiveActions?.includes(primitive as never)) {
    if (!supported || supported === primitive) {
      if (/\bcan'?t cast\b/i.test(evidenceText) || /\bcan'?t cast spells\b/i.test(oracleText)) {
        return {
          isGenuinelyUnsupported: true,
          why: "Cast token appears inside static prohibition ('can't cast spells'); Layer 1 restriction, not Layer 2 cast action.",
          family: "static_cast_restriction_not_cast",
          guard: "Suppress cast/play permission patterns when span is within 'can't cast' / 'can't cast spells' static restriction; emit structure annotation or abstain.",
        };
      }
      return {
        isGenuinelyUnsupported: true,
        why: `Forbidden primitive ${primitive} on negative case; emission is invention relative to gold.`,
        family: "static_restriction_forbidden_primitive",
        guard: "Route forbidden primitives to abstain regardless of pattern match.",
      };
    }
  }

  if (!supported) {
    if (primitive === "return_to_battlefield" && /from (?:your )?graveyard to the battlefield/i.test(evidenceText)) {
      return {
        isGenuinelyUnsupported: true,
        why: "Oracle-valid return_to_battlefield, but inferSupportedPrimitiveFromEvidence fails on 'to the battlefield' (requires 'onto'). Evaluator gap causes unsupported tally on duplicate saga chapters.",
        family: "return_zone_wording_to_vs_onto",
        guard: "Extend return_to_battlefield support heuristic for 'from graveyard to the battlefield'; dedupe repeated saga chapters against single gold label.",
      };
    }
    return {
      isGenuinelyUnsupported: true,
      why: "inferSupportedPrimitiveFromEvidence returned null for accepted emission.",
      family: "evaluator_support_heuristic_gap",
      guard: "Extend primitive support heuristics or route unmatched spans to needs_review.",
    };
  }

  return {
    isGenuinelyUnsupported: false,
    why: "",
    family: "",
    guard: "",
  };
}

function main() {
  const v4 = JSON.parse(
    readFileSync(resolve(process.cwd(), "data", "oracle-action-eval-validation-v4.json"), "utf8"),
  ) as { cases: OracleActionEvalCaseV2[]; contentHash: string };

  if (v4.contentHash !== VALIDATION_V4_HASH) {
    throw new Error(`validation_set_v4 hash mismatch`);
  }

  const evalResults = evaluateCaseSet(v4.cases, "validation_set_v4");
  const records: Array<Record<string, unknown>> = [];

  for (const testCase of v4.cases) {
    const raw = extractOracleActionsV1({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const extraction = toLegacyExtractionResult(raw);
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);

    const actions = extraction.actions.map((a, index) => ({
      index,
      primitive: normalizeToPrimitive(a.effects[0]?.actionType ?? "", a.evidenceText),
      evidenceText: a.evidenceText,
      rawActionType: a.effects[0]?.actionType ?? "",
      reviewStatus: a.reviewStatus,
      confidence: a.confidence,
      evidenceStart: a.evidenceStart,
      evidenceEnd: a.evidenceEnd,
      optionalEffect: a.optionalEffect,
      optional: a.optional,
    }));

    const accepted = matchGoldToActions({
      expected,
      actions: actions.map((a) => ({
        index: a.index,
        primitive: a.primitive,
        evidenceText: a.evidenceText,
        cardFaceId: testCase.cardFace ?? "default",
        abilityIndex: 0,
        reviewStatus: a.reviewStatus as "accepted" | "needs_review",
        optionalEffect: a.optionalEffect,
        optional: a.optional,
      })),
      tier: "accepted",
    });

    const matchedActions = new Set(
      accepted.matches.filter((m) => m.matched && m.actionIndex !== null).map((m) => m.actionIndex!),
    );

    for (const action of actions) {
      if (action.reviewStatus !== "accepted") continue;
      if (matchedActions.has(action.index)) continue;
      if (!spanValid(testCase.oracleText, action.evidenceText, action.evidenceStart, action.evidenceEnd)) continue;

      const verdict = classifyUnsupported({
        testCase,
        primitive: action.primitive,
        evidenceText: action.evidenceText,
        oracleText: testCase.oracleText,
        forbidden: Boolean(
          action.primitive &&
            testCase.forbiddenPrimitiveActions?.includes(action.primitive as never),
        ),
      });

      const supported = inferSupportedPrimitiveFromEvidence(testCase.oracleText, action.evidenceText);
      const isUnsupportedFp =
        !supported ||
        (testCase.forbiddenPrimitiveActions?.includes(action.primitive as never) &&
          (!supported || supported === action.primitive));

      if (!isUnsupportedFp && action.primitive !== supported) continue;
      if (!verdict.isGenuinelyUnsupported && supported && action.primitive !== supported) continue;
      if (!isUnsupportedFp) continue;

      records.push({
        caseId: testCase.id,
        cardName: HELD_OUT_CARD_NAMES[testCase.id] ?? testCase.id,
        oracleText: testCase.oracleText,
        evidenceSpan: action.evidenceText,
        evidenceStart: action.evidenceStart,
        evidenceEnd: action.evidenceEnd,
        primitiveEmitted: action.primitive,
        confidence: action.confidence,
        patternFired: patternThatFired(action.evidenceText, action.rawActionType),
        whyUnsupported: verdict.why,
        whyAccepted: `reviewStatus=accepted, confidence=${action.confidence} — no structural-uncertainty gate when support heuristic null or forbidden primitive emitted.`,
        broadFailureFamily: verdict.family,
        proposedGeneralGuard: verdict.guard,
        inferSupportedResult: supported,
        reviewer: REVIEWER_ID,
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    validationSet: "validation_set_v4",
    validationSetHash: VALIDATION_V4_HASH,
    taxonomyVersion: "three-layer-v1.2",
    authoritativeUnsupportedCount:
      evalResults.authoritativeClassification.counts.genuinely_unsupported_by_oracle,
    recordCount: records.length,
    records,
    note: "No card-name exclusions. Unresolved patterns must route to needs_review or abstain in parser v1.13.",
  };

  const paths = [
    resolve(process.cwd(), "reports", "validation-unsupported-audit-v4.json"),
    resolve(process.cwd(), "data", "milestones", "validation-v4-unsupported-audit", "unsupported-audit.json"),
  ];
  mkdirSync(resolve(process.cwd(), "reports"), { recursive: true });
  mkdirSync(resolve(process.cwd(), "data", "milestones", "validation-v4-unsupported-audit"), { recursive: true });
  for (const p of paths) writeFileSync(p, JSON.stringify(report, null, 2), "utf8");

  console.log("Records:", records.length, "Authoritative:", report.authoritativeUnsupportedCount);
  for (const r of records) console.log(` ${r.caseId} ${r.cardName}`);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("audit-validation-unsupported-v4.ts")) {
  main();
}
