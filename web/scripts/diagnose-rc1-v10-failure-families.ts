/**
 * One-time RC1/v10 failure-family diagnostic for RC2 development planning.
 * Does NOT modify validation gold. Run: npx tsx scripts/diagnose-rc1-v10-failure-families.ts
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import { auditValidationSet } from "./audit-validation-errors-v12";
import { evaluateCaseSet } from "./eval-oracle-action-extraction-v6";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  assignPrimaryRootCause,
  type PrimaryRootCause,
} from "./lib/validation-primary-root-cause";
import {
  evidenceMatchesExtracted,
  inferSupportedPrimitiveFromEvidence,
  spanValid,
} from "./oracle-action-eval-shared";
import { matchGoldToActions } from "./oracle-action-unified-matcher";

const V10_HASH = "2af9eafaf0b021fd3c73193e1629b6b8fe06a402a7baea30c8e5999852041a81";

type GrammarFamily =
  | "zone_transition_wording"
  | "modal_wording"
  | "quantified_action"
  | "passive_construction"
  | "delayed_later_action"
  | "nested_optionality"
  | "pronoun_coreference"
  | "granted_quoted_structure"
  | "multiface_structure"
  | "unusual_imperative_verb"
  | "compound_then_clause"
  | "search_tutor_resolution"
  | "replacement_routing"
  | "other";

function classifyGrammarFamily(input: {
  expectedPrimitive: string;
  expectedEvidence: string;
  oracleText: string;
  cardFace?: string;
}): GrammarFamily {
  const { expectedPrimitive, expectedEvidence, oracleText } = input;
  const ev = expectedEvidence.toLowerCase();
  const ot = oracleText.toLowerCase();

  if (/\bfrom (?:your |a |their )?(?:graveyard|exile|hand|library)\b.*\b(?:to|onto) (?:the )?(?:battlefield|hand|library|graveyard|exile)\b/i.test(expectedEvidence)) {
    return "zone_transition_wording";
  }
  if (/\bchoose (?:one|two|three)\b/i.test(oracleText) && expectedPrimitive !== "draw") return "modal_wording";
  if (/\bup to \d+\b|\bup to one\b|\bup to two\b|\bup to three\b/i.test(expectedEvidence)) return "quantified_action";
  if (/\b(?:is|are|becomes|gain|loses|can't|cannot)\b/i.test(expectedEvidence) && !/^(?:destroy|exile|return|put|draw|create|cast|play|search|shuffle|mill|scry|surveil|tap|untap|counter|copy|sacrifice|discard|deal)/i.test(expectedEvidence)) {
    return "passive_construction";
  }
  if (/\b(?:at the beginning of|until end of turn|next end step|when you do|if you do|then )\b/i.test(ot) && /\bthen\b/i.test(expectedEvidence)) {
    return "delayed_later_action";
  }
  if (/\bif you do\b|\bwhen you do\b|\bunless\b/i.test(ot) && /\byou may\b/i.test(expectedEvidence)) {
    return "nested_optionality";
  }
  if (/\b(?:it|that|those|they|this)\b/i.test(expectedEvidence) && expectedEvidence.split(/\s+/).length <= 6) {
    return "pronoun_coreference";
  }
  if (/"/.test(oracleText) && /"/.test(expectedEvidence)) return "granted_quoted_structure";
  if (oracleText.includes("\n//\n") || input.cardFace) return "multiface_structure";
  if (/\bthen\b/i.test(expectedEvidence) || (/\bthen\b/i.test(ot) && /\bsearch\b/i.test(expectedEvidence))) {
    return "compound_then_clause";
  }
  if (expectedPrimitive === "search_library" || /\bsearch(?:es)? (?:your |their )?library\b/i.test(expectedEvidence)) {
    return "search_tutor_resolution";
  }
  if (/\binstead\b|\bwould be put\b/i.test(ot)) return "replacement_routing";
  if (["put_onto_battlefield", "return_to_battlefield", "return_to_hand", "shuffle_into_library"].includes(expectedPrimitive)) {
    return "zone_transition_wording";
  }
  return "unusual_imperative_verb";
}

function classifyWrongPrimitiveFamily(input: {
  expected: string;
  emitted: string;
  evidence: string;
}): string {
  const { expected, emitted, evidence } = input;
  if (expected === "return_to_battlefield" && emitted === "return_to_hand") {
    return "gy_to_battlefield_misrouted_as_hand";
  }
  if (expected === "return_to_hand" && emitted === "return_to_battlefield") {
    return "hand_return_misrouted_as_battlefield";
  }
  if (expected === "put_onto_battlefield" && emitted === "search_library") {
    return "put_onto_bf_misrouted_as_search";
  }
  if (expected === "return_to_battlefield" && emitted === "put_onto_battlefield") {
    return "return_bf_zone_primitive_confusion";
  }
  if (/\bfrom (?:your )?graveyard\b/i.test(evidence) && emitted === "return_to_hand") {
    return "graveyard_zone_routing";
  }
  if (expected === "play" && emitted === "cast") return "play_vs_cast_permission";
  if (expected === "cast" && emitted === "play") return "cast_vs_play_permission";
  if (expected === "copy" && emitted === "cast") return "copy_vs_cast_trigger";
  if (expected === "mill" && emitted === "discard") return "mill_vs_discard";
  if (expected === "exile" && emitted === "destroy") return "exile_vs_destroy";
  return `${expected}_vs_${emitted}`;
}

function classifyOtherParserDefect(input: {
  auditClassification: string;
  mismatchKind: string;
  evidence?: string;
  oracleText: string;
}): string {
  const { auditClassification, mismatchKind, evidence, oracleText } = input;
  if (auditClassification === "duplicate_extraction") return "duplicate_extraction";
  if (auditClassification === "wrong_ability_attachment") return "wrong_ability_attachment";
  if (auditClassification === "wrong_condition_or_optionality") return "optionality_attachment";
  if (auditClassification === "unsupported_parser_extraction") return "unsupported_extraction_accepted";
  if (auditClassification === "missing_gold_label") {
    if (/\bcast this\b/i.test(evidence ?? "")) return "static_cast_permission_leak";
    return "extraneous_emission";
  }
  if (mismatchKind === "false_positive" && /\bthen\b/i.test(oracleText)) return "compound_clause_attachment";
  return auditClassification;
}

function catalogSelectionRule(family: string): string {
  const rules: Record<string, string> = {
    zone_transition_wording:
      "catalog: oracle contains explicit zone pair (graveyard/hand/library/exile → battlefield/hand/library) with Return/Put/Mill/Shuffle verbs; exclude validation oracleId set",
    gy_to_battlefield_misrouted_as_hand:
      "catalog: 'Return/Put target … from (your/a) graveyard (onto/to) the battlefield' on cards not in validation set; gold return_to_battlefield",
    modal_wording:
      "catalog: 'Choose one/two/three' bullets with distinct imperative verbs; gold uses modal stem where policy allows",
    quantified_action:
      "catalog: 'up to N' target selection on unrelated removal/ramp/tutor cards",
    compound_then_clause:
      "catalog: resolution clauses with 'then' linking search/shuffle/put/draw on unrelated instants/sorceries",
    search_tutor_resolution:
      "catalog: Search library + optional reveal + zone destination + shuffle on unrelated tutors",
    granted_quoted_structure:
      "catalog: emblem/aura with quoted triggered abilities; gold excludes persistent permissions",
    multiface_structure:
      "catalog: split/DFC/adventure with distinct face-scoped primitives",
    static_cast_permission_leak:
      "catalog: commander/flashback/cycling reminder lines — regression must stay abstained",
    duplicate_extraction:
      "catalog: repeated identical imperatives in separate clauses (modal, multiple triggers)",
    optionality_attachment:
      "catalog: 'you may' scoped to specific clause vs ability-level optional",
    unusual_imperative_verb:
      "catalog: low-frequency verbs (distribute, manifest, connive, etc.) on unrelated cards",
    delayed_later_action:
      "catalog: 'At the beginning of…', 'Until end of turn…', 'If you do… then…' delayed effects",
    nested_optionality:
      "catalog: unless/may/pay nested conditionals (Rhystic, tribute-style)",
    replacement_routing:
      "catalog: 'instead', 'would be put into graveyard' replacement effects",
  };
  return rules[family] ?? `catalog: cards exhibiting '${family}' oracle structure; exclude validation oracleIds`;
}

function main() {
  const v10 = JSON.parse(
    readFileSync(resolve(process.cwd(), "data/oracle-action-eval-validation-v10.json"), "utf8"),
  ) as { cases: OracleActionEvalCaseV2[]; contentHash: string };

  if (v10.contentHash !== V10_HASH) {
    throw new Error(`Expected v10 hash ${V10_HASH}, got ${v10.contentHash}`);
  }

  const evalResults = evaluateCaseSet(v10.cases, "validation_set_v10");
  const audit = auditValidationSet(v10.cases);

  const unsupportedAccepted: Array<Record<string, unknown>> = [];
  for (const testCase of v10.cases) {
    const raw = extractOracleActionsV1({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    for (const a of raw.actions) {
      if (a.reviewStatus !== "accepted") continue;
      const primitive = normalizeToPrimitive(a.actionType, a.evidenceText);
      const spanOk = spanValid(testCase.oracleText, a.evidenceText, a.evidenceStart, a.evidenceEnd);
      const supported = inferSupportedPrimitiveFromEvidence(testCase.oracleText, a.evidenceText);
      if (!spanOk || !supported || supported !== primitive) {
        unsupportedAccepted.push({
          caseId: testCase.id,
          cardName: testCase.cardName,
          oracleId: testCase.oracleId,
          actionType: primitive,
          emittedActionType: a.actionType,
          evidence: a.evidenceText,
          evidenceStart: a.evidenceStart,
          evidenceEnd: a.evidenceEnd,
          textRole: a.textRole,
          spanValid: spanOk,
          inferSupportedPrimitive: supported,
          confidence: a.confidence,
          whyUnsupported: !spanOk
            ? "evidence span invalid in oracle"
            : !supported
              ? "no supported primitive inferred from evidence"
              : `inferred ${supported} !== emitted ${primitive}`,
          generalGrammar: a.evidenceText.match(/^[\w\s,'"{}\-]+/)?.[0]?.trim() ?? a.evidenceText.slice(0, 40),
          generalFix: !supported
            ? "Add span-role guard or abstain pattern for this evidence class; do not card-specific block"
            : supported !== primitive
              ? `Improve zone/verb routing: evidence maps to ${supported} not ${primitive}`
              : "Fix evidence span boundary segmentation",
          regressionExamples:
            "Select unrelated catalog cards with same evidence-class pattern (see selection rule in expansion plan)",
        });
      }
    }
  }

  const primaryRecords: Array<{
    caseId: string;
    cardName: string;
    mismatchKind: string;
    primaryRootCause: PrimaryRootCause;
    auditClassification: string;
    expected?: string;
    emitted?: string;
    evidence?: string;
  }> = [];

  for (const rec of audit.records) {
    const testCase = v10.cases.find((c) => c.id === rec.caseId)!;
    primaryRecords.push({
      caseId: rec.caseId,
      cardName: testCase.cardName ?? rec.caseId,
      mismatchKind: rec.mismatchKind,
      primaryRootCause: assignPrimaryRootCause({
        mismatchKind: rec.mismatchKind,
        auditClassification: rec.classification,
        testCase,
        parserPrimitive: rec.parserPrimitive,
        parserEvidence: rec.parserEvidence,
        expectedPrimitive: rec.expectedPrimitive,
      }),
      auditClassification: rec.classification,
      expected: rec.expectedPrimitive,
      emitted: rec.parserPrimitive,
      evidence: rec.parserEvidence ?? rec.expectedEvidence,
    });
  }

  const missingGrammar = primaryRecords.filter((r) => r.primaryRootCause === "missing_grammar");
  const wrongPrimitive = primaryRecords.filter((r) => r.primaryRootCause === "wrong_primitive");
  const otherParserDefect = primaryRecords.filter((r) => r.primaryRootCause === "other_parser_defect");
  const spanRole = primaryRecords.filter((r) => r.primaryRootCause === "span_role");

  const grammarClusters = new Map<GrammarFamily, typeof missingGrammar>();
  for (const r of missingGrammar) {
    if (r.mismatchKind !== "false_negative" || !r.expected || !r.evidence) continue;
    const testCase = v10.cases.find((c) => c.id === r.caseId)!;
    const family = classifyGrammarFamily({
      expectedPrimitive: r.expected,
      expectedEvidence: r.evidence,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const list = grammarClusters.get(family) ?? [];
    list.push(r);
    grammarClusters.set(family, list);
  }

  const wrongPrimitiveClusters = new Map<string, typeof wrongPrimitive>();
  for (const r of wrongPrimitive) {
    if (!r.expected || !r.emitted || !r.evidence) continue;
    const family = classifyWrongPrimitiveFamily({
      expected: r.expected,
      emitted: r.emitted,
      evidence: r.evidence,
    });
    const list = wrongPrimitiveClusters.get(family) ?? [];
    list.push(r);
    wrongPrimitiveClusters.set(family, list);
  }

  const otherClusters = new Map<string, typeof otherParserDefect>();
  for (const r of otherParserDefect) {
    const testCase = v10.cases.find((c) => c.id === r.caseId)!;
    const family = classifyOtherParserDefect({
      auditClassification: r.auditClassification,
      mismatchKind: r.mismatchKind,
      evidence: r.evidence,
      oracleText: testCase.oracleText,
    });
    const list = otherClusters.get(family) ?? [];
    list.push(r);
    otherClusters.set(family, list);
  }

  const expansionFamilies = new Set<string>();
  for (const [family] of grammarClusters) expansionFamilies.add(family);
  for (const [family] of wrongPrimitiveClusters) expansionFamilies.add(family);
  for (const [family] of otherClusters) expansionFamilies.add(family);
  if (unsupportedAccepted.length) expansionFamilies.add("accepted_unsupported_emission");

  const estimatedCasesPerFamily = 4;
  const totalExpansionCases = expansionFamilies.size * estimatedCasesPerFamily;
  const trainingPct = 0.75;
  const expansionTrainingSize = Math.round(totalExpansionCases * trainingPct);
  const expansionCheckSize = totalExpansionCases - expansionTrainingSize;

  const report = {
    generatedAt: new Date().toISOString(),
    validationSet: "validation_set_v10",
    validationV10Hash: V10_HASH,
    rc1ParserVersion: "oracle-action-v1.19-precision-pass",
    purpose: "RC2 development planning — abstract failure families only",
    metrics: evalResults.metricsByEmissionTier.acceptedOnly,
    acceptedUnsupported: evalResults.authoritativeClassification.counts.genuinely_unsupported_by_oracle,
    primaryRootCauseTotals: {
      missing_grammar: missingGrammar.length,
      wrong_primitive: wrongPrimitive.length,
      other_parser_defect: otherParserDefect.length,
      span_role: spanRole.length,
    },
    unsupportedAcceptedDiagnosis: unsupportedAccepted,
    missingGrammarClusters: Object.fromEntries(
      [...grammarClusters.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([family, items]) => [
          family,
          {
            count: items.length,
            catalogSelectionRule: catalogSelectionRule(family),
            items: items.map((i) => ({
              caseId: i.caseId,
              cardName: i.cardName,
              expected: i.expected,
              evidence: i.evidence,
            })),
          },
        ]),
    ),
    wrongPrimitiveClusters: Object.fromEntries(
      [...wrongPrimitiveClusters.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([family, items]) => [
          family,
          {
            count: items.length,
            catalogSelectionRule: catalogSelectionRule(family),
            confusionPairs: items.map((i) => ({
              caseId: i.caseId,
              cardName: i.cardName,
              expected: i.expected,
              emitted: i.emitted,
              evidence: i.evidence?.slice(0, 80),
            })),
          },
        ]),
    ),
    otherParserDefectClusters: Object.fromEntries(
      [...otherClusters.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([family, items]) => [
          family,
          {
            count: items.length,
            catalogSelectionRule: catalogSelectionRule(family),
            items: items.map((i) => ({
              caseId: i.caseId,
              cardName: i.cardName,
              kind: i.mismatchKind,
              auditClassification: i.auditClassification,
              evidence: i.evidence?.slice(0, 80),
            })),
          },
        ]),
    ),
    spanRoleItems: spanRole.map((i) => ({
      caseId: i.caseId,
      cardName: i.cardName,
      evidence: i.evidence,
    })),
    proposedDevelopmentExpansion: {
      name: "development_generalization_expansion_v1",
      selectionPrinciple:
        "Mine golden catalog for unrelated cards sharing abstract linguistic structures; never copy validation oracleIds/text",
      families: [...expansionFamilies].map((f) => ({
        family: f,
        catalogSelectionRule: catalogSelectionRule(f),
        targetCases: estimatedCasesPerFamily,
      })),
      estimatedTotalCases: totalExpansionCases,
      expansionTrainingSize,
      expansionCheckSize,
      splitRatio: "75% training / 25% check",
      checkSubsetFrozenBefore: "any parser tuning",
    },
    developmentTrackingViews: [
      "original_development_corpus (v25+)",
      "expansion-training",
      "expansion-check",
    ],
    rc2DevelopmentGates: {
      combinedDevelopment: { acceptedPrecisionMin: 0.98, acceptedRecallMin: 0.9, acceptedUnsupportedMax: 0 },
      expansionCheck: { acceptedPrecisionMin: 0.95, acceptedRecallMin: 0.85, acceptedUnsupportedMax: 0 },
    },
  };

  const outDir = resolve(process.cwd(), "data/milestones/rc2-development-planning");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "rc1-v10-failure-family-diagnosis.json");
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main();
