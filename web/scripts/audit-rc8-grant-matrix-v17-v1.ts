/**
 * RC8-1 — exact nine-case grant matrix for v17 genuine-parser FN rows.
 * Run: cd web && npx tsx scripts/audit-rc8-grant-matrix-v17-v1.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { detectGrantedRulesSpans } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-span-detector";
import { findGrantedQuoteContexts } from "../src/lib/deck-builder/golden-catalog/oracle-granted-ability-extraction";
import { extractClauseNativeActions } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native";
import { segmentCardFaces, segmentAbilities } from "../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";

const OUT_DIR = "data/milestones/rc8-development";
const OUT_PATH = `${OUT_DIR}/rc8-grant-matrix-v17-v1.json`;

const UNIQUE_CASES = ["vh17-0002", "vh17-0005", "vh17-0006", "vh17-0007", "vh17-0009", "vh17-0015", "vh17-0020"];

type BenchCase = {
  id: string;
  cardName?: string;
  oracleId: string;
  oracleText: string;
  expectedPrimitiveActions: Array<{ actionType: string; evidenceContains?: string }>;
};

function grantClause(text: string): string {
  const m =
    text.match(/(?:have|gains?)\s+["(\u201c][^"\u201d]+["\u201d]/i) ??
    text.match(/(?:have|gains?)\s+[^.\n]+/i);
  return m?.[0]?.slice(0, 120) ?? "";
}

function recipientPhrase(text: string): string {
  const m = text.match(
    /(?:[\w-]+ you control have|creatures you control have|Face-down creatures you control have|permanent cards in your graveyard perpetually gain|target creature gains|This Saga gains|Elves you control have)/i,
  );
  return m?.[0] ?? "";
}

function primaryFailureStage(input: {
  spanDetected: boolean;
  subabilityCreated: boolean;
  primitiveRecovered: boolean;
  castOnlyMiss: boolean;
}): string {
  if (!input.spanDetected) return "grant_span_detection";
  if (!input.subabilityCreated) return "subability_materialization";
  if (input.castOnlyMiss) return "immediate_cast_grammar";
  if (!input.primitiveRecovered) return "granted_primitive_extraction";
  return "recovered";
}

function main() {
  const bench = JSON.parse(readFileSync("data/oracle-action-eval-validation-v17.json", "utf8")) as {
    cases: BenchCase[];
  };

  const matrix = UNIQUE_CASES.map((caseId) => {
    const tc = bench.cases.find((c) => c.id === caseId)!;
    const faces = segmentCardFaces(tc.oracleText);
    const segments = faces.flatMap((f) => segmentAbilities(tc.oracleId, f.faceId, f.text, f.start));
    const spans = segments.flatMap((s) =>
      detectGrantedRulesSpans(s.paragraphText).map((g) => ({ seg: s.abilityIndex, ...g })),
    );
    const contexts = segments.flatMap((s) =>
      findGrantedQuoteContexts(s.paragraphText, `${tc.oracleId}:${s.faceId}:${s.abilityIndex}`),
    );
    const native = extractClauseNativeActions({ oracleId: tc.oracleId, oracleText: tc.oracleText });
    const parse = parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText });
    const grantedAst = parse.abilities.filter((a) => a.abilityId.includes(".granted-"));

    const grantGold = tc.expectedPrimitiveActions.filter(
      (g) => g.evidenceContains && !/Search your library|then shuffle/i.test(g.evidenceContains),
    );
    const recovered = grantGold.filter((g) =>
      parse.actions.some(
        (a) =>
          a.reviewStatus === "accepted" &&
          a.actionType === g.actionType &&
          a.provenance.actionSpan.text.toLowerCase().includes((g.evidenceContains ?? "").toLowerCase().slice(0, 16)),
      ),
    );
    const castOnlyMiss = caseId === "vh17-0020" && grantedAst.length > 0 && recovered.length === 0;

    const stage = primaryFailureStage({
      spanDetected: contexts.length > 0,
      subabilityCreated: native.grantedAbilities.length > 0 || grantedAst.length > 0,
      primitiveRecovered: recovered.length === grantGold.length,
      castOnlyMiss,
    });

    return {
      caseId,
      cardName: tc.cardName,
      fullGrantClause: grantClause(tc.oracleText),
      recipientPhrase: recipientPhrase(tc.oracleText),
      grantedText: contexts[0]?.innerText.slice(0, 120) ?? spans[0]?.innerText.slice(0, 120) ?? null,
      quoteTypography: spans[0]?.typography ?? null,
      duration: /until end of turn|perpetually/i.exec(tc.oracleText)?.[0] ?? null,
      detectedGrantSpan: contexts.length > 0 || spans.length > 0,
      subabilityCreated: native.grantedAbilities.length > 0 || grantedAst.length > 0,
      nestedAbilityType: contexts[0]?.grantedAbilityType ?? null,
      expectedPrimitives: grantGold.map((g) => g.actionType),
      currentAstGrantedIds: grantedAst.map((a) => a.abilityId),
      currentAcceptedGrantedActions: parse.actions
        .filter((a) => a.reviewStatus === "accepted" && a.executionContext === "granted_ability")
        .map((a) => ({ type: a.actionType, evidence: a.provenance.actionSpan.text.slice(0, 80) })),
      primaryFailureStage: stage,
      exactFailingFunction:
        stage === "grant_span_detection"
          ? "detectGrantedRulesSpans / findGrantedQuoteContexts"
          : stage === "subability_materialization"
            ? "buildGrantedSemanticAbilities / parseGrantedRef"
            : stage === "immediate_cast_grammar"
              ? "extractPrimitivesFromClause (cast referent: the exiled card)"
              : "extractPrimitivesFromClause (granted nested)",
      rc8FamilyGeneralized: stage !== "immediate_cast_grammar",
    };
  });

  const report = {
    artifactType: "Rc8GrantMatrix",
    version: "rc8-grant-matrix-v17-v1",
    uniqueCaseCount: UNIQUE_CASES.length,
    fnRowCount: 9,
    familySummary: {
      grant_span_detection: matrix.filter((r) => r.primaryFailureStage === "grant_span_detection").length,
      subability_materialization: matrix.filter((r) => r.primaryFailureStage === "subability_materialization").length,
      granted_primitive_extraction: matrix.filter((r) => r.primaryFailureStage === "granted_primitive_extraction").length,
      immediate_cast_grammar: matrix.filter((r) => r.primaryFailureStage === "immediate_cast_grammar").length,
      recovered: matrix.filter((r) => r.primaryFailureStage === "recovered").length,
    },
    ledgerBookkeeping: {
      evaluator_evidence_mismatch_row: "vh17-0094 (Beluna Grandsquall // Seek Thrills)",
      evaluator_evidence_mismatch_disposition: "evaluator_defect (FN) — parser draw emission vs gold span mismatch on MDFC face",
      genuine_parser_fp_row: "vh17-0042 (Chandra, Hope's Beacon add_mana)",
      vh17_0049_role: "structural_invariant_defect (semanticInvalid/validatorViolation/provenanceViolation) — NOT genuine_parser FP; sacrifice span ownership under RC8-0",
      categoryMutualExclusivity:
        "genuine_parser census counts parser-debt FN/FP only; evaluator_defect and structural_invariant rows are separate dispositions",
    },
    matrix,
  };

  mkdirSync(resolve(OUT_DIR), { recursive: true });
  writeFileSync(resolve(OUT_PATH), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main();
