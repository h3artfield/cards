/**
 * Zone FN census — three explicitly named views aligned with census-rc3-remaining-fn classifyFamily.
 * Run: npx tsx scripts/audit-zone-fn-three-view-census-v138.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseOracleSemanticsRC3, ORACLE_ACTION_RC3_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { matchGoldToSemanticActions } from "./oracle-action-semantic-matcher";
import { applyGoldMigrationV135 } from "./lib/rc3-gold-migration-v135";
import { loadEnvLocal } from "./lib/script-env";

loadEnvLocal();

type Envelope = { cases: OracleActionEvalCaseV2[] };

type FnFamily =
  | "search_shuffle_chains"
  | "activated_effects"
  | "replacement_effects"
  | "modal_choice"
  | "zone_transitions"
  | "granted_semantics"
  | "mdfc_face_structure"
  | "reference_resolution"
  | "generic_primitive_gaps"
  | "optionality_dependency"
  | "other";

const Z1B_RECOVERED = new Set(["rc3-pos-cat-0027", "rc3-pos-v12-0098"]);

function loadCases(applyMigration: boolean): OracleActionEvalCaseV2[] {
  const paths = [
    "data/oracle-action-eval-development-v26-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v2-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v3-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v5-v14.json",
    "data/oracle-action-eval-rc3-positive-training-catalog-v133.json",
  ];
  return paths.flatMap((p) => {
    const raw = (JSON.parse(readFileSync(resolve(p), "utf8")) as Envelope).cases;
    return applyMigration ? applyGoldMigrationV135(raw) : raw;
  });
}

function classifyFamily(testCase: OracleActionEvalCaseV2, gold: OracleActionEvalCaseV2["expectedPrimitiveActions"][number]): FnFamily {
  const ev = (gold.evidenceContains ?? "").toLowerCase();
  const text = testCase.oracleText.toLowerCase();
  const stratum = (testCase as { coverageStratum?: string }).coverageStratum ?? "";
  const category = (testCase as { category?: string }).category ?? "";

  if (
    /would.*instead|if a source would|prevent.*damage/i.test(text) ||
    /exile it instead/i.test(ev) ||
    category.includes("replacement")
  ) {
    return "replacement_effects";
  }
  if (/granted|enchanted creature has|equipped creature has|creatures you control have/i.test(text) || stratum.includes("granted")) {
    return "granted_semantics";
  }
  if (gold.optionalEffect || gold.optionalCost || /\bmay\b/.test(ev) || /if you do/i.test(text)) {
    return "optionality_dependency";
  }
  if (/choose one|choose two|choose up to|modal/i.test(text)) return "modal_choice";
  if (/search your library|shuffle/i.test(text) && /search|shuffle/i.test(ev)) return "search_shuffle_chains";
  if (/\{[^}]+\}.*:/.test(text) && /:\s/.test(ev)) return "activated_effects";
  if (/\/\//.test(testCase.oracleText) || testCase.cardFace) return "mdfc_face_structure";
  if (/that card|that permanent|that creature|exiled with|encoded on/i.test(ev)) return "reference_resolution";
  if (/exile|return|put.*onto the battlefield|from your graveyard|from exile/i.test(ev)) return "zone_transitions";
  if (/destroy|counter|draw|tap|untap|sacrifice|create|add \{/i.test(ev)) return "generic_primitive_gaps";
  return "other";
}

function countZoneTransitionFns(cases: OracleActionEvalCaseV2[]) {
  const items: Array<{ caseId: string; actionType: string; evidenceContains?: string; family: FnFamily }> = [];
  for (const testCase of cases) {
    const parsed = parseOracleSemanticsRC3({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const matched = matchGoldToSemanticActions({
      expected,
      parse: parsed,
      tier: "accepted",
      oracleText: testCase.oracleText,
      caseId: testCase.id,
    });
    const matchedExpected = new Set(matched.matches.filter((m) => m.matched).map((m) => m.expectedIndex));
    for (let ei = 0; ei < expected.length; ei++) {
      if (matchedExpected.has(ei)) continue;
      const gold = expected[ei]!;
      const family = classifyFamily(testCase, gold);
      if (family !== "zone_transitions") continue;
      items.push({ caseId: testCase.id, actionType: gold.actionType, evidenceContains: gold.evidenceContains, family });
    }
  }
  return items;
}

function main() {
  const historicalRaw = countZoneTransitionFns(loadCases(false));
  const currentPolicyPostZ1b = countZoneTransitionFns(loadCases(true));

  const preZ1bDerived = currentPolicyPostZ1b.filter((i) => !Z1B_RECOVERED.has(i.caseId));
  const preZ1bIds = new Set(preZ1bDerived.map((i) => `${i.caseId}:${i.actionType}:${i.evidenceContains}`));
  const postZ1bIds = new Set(currentPolicyPostZ1b.map((i) => `${i.caseId}:${i.actionType}:${i.evidenceContains}`));
  const z1bDelta = [...preZ1bIds].filter((id) => !postZ1bIds.has(id));

  const report = {
    generatedAt: new Date().toISOString(),
    checkpoint: "zone-fn-three-view-census-v138",
    parserVersion: ORACLE_ACTION_RC3_PARSER_VERSION,
    classifier: "census-rc3-remaining-fn.classifyFamily (zone_transitions family only)",
    views: {
      historical_raw_zone_gold: {
        definition: "Raw catalog gold, no policy migration overlay, current parser",
        zoneTransitionOpenLayer2Fns: historicalRaw.length,
        engineeringPriority: false,
        items: historicalRaw,
      },
      current_policy_pre_Z1b: {
        definition: "Current-policy gold overlay; Z1b parser recoveries removed (derived from post-Z1b + delta)",
        zoneTransitionOpenLayer2Fns: preZ1bDerived.length,
        engineeringPriority: false,
        items: preZ1bDerived,
        z1bRecoveredCaseIds: [...Z1B_RECOVERED],
      },
      current_policy_post_Z1b: {
        definition: "Current-policy gold overlay + v1.38 parser — use for engineering priority",
        zoneTransitionOpenLayer2Fns: currentPolicyPostZ1b.length,
        engineeringPriority: true,
        items: currentPolicyPostZ1b,
      },
    },
    z1bActionDelta: z1bDelta,
    note: "Engineering priority uses current_policy_post_Z1b.zoneTransitionOpenLayer2Fns only (combined FN denominator zone_transitions bucket).",
  };

  mkdirSync(resolve("data/milestones/rc3-development"), { recursive: true });
  writeFileSync(
    resolve("data/milestones/rc3-development/zone-fn-three-view-census-v138.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report, null, 2));
}

main();
