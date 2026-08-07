/**
 * Cost-policy gold audit — classify gold expectations whose evidence spans are cost-classified.
 * Run: npx tsx scripts/audit-cost-policy-gold-v21.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  classifyTextRoleAt,
  type TextRole,
} from "../src/lib/deck-builder/golden-catalog/oracle-span-role-classifier";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { evidenceMatchesOracle } from "./oracle-action-eval-shared";

const COST_PRIMITIVES = new Set(["sacrifice", "discard", "exile", "tap"]);

function corpusForFace(oracleText: string, cardFace?: string): string {
  if (!cardFace || !oracleText.includes("\n//\n")) return oracleText;
  return oracleText.split("\n//\n")[cardFace === "back" ? 1 : 0];
}

function locateEvidenceSpan(
  oracleText: string,
  evidenceContains: string,
  cardFace?: string,
): { localStart: number; localEnd: number; paragraph: string; corpusOffset: number } | null {
  const corpus = corpusForFace(oracleText, cardFace);
  const corpusOffset = oracleText.indexOf(corpus);
  const needle = evidenceContains.toLowerCase().slice(0, Math.min(24, evidenceContains.length));
  const idx = corpus.toLowerCase().indexOf(needle);
  if (idx < 0) return null;
  return {
    localStart: idx,
    localEnd: idx + evidenceContains.length,
    paragraph: corpus,
    corpusOffset,
  };
}

type CostPolicyCategory =
  | "activated_cost_incorrectly_golded_layer2"
  | "additional_cost_incorrectly_golded_layer2"
  | "optional_effect_correctly_layer2"
  | "replacement_alternative_correctly_layer2"
  | "ambiguous";

function classifyCostGoldEntry(input: {
  testCase: OracleActionEvalCaseV2;
  actionType: string;
  evidenceContains: string;
  cardFace?: string;
  spanRole: TextRole;
  window: string;
}): CostPolicyCategory {
  const { actionType, spanRole, window } = input;
  const w = window;

  if (!COST_PRIMITIVES.has(actionType)) return "ambiguous";

  if (spanRole !== "cost") return "ambiguous";

  if (/\bAs an additional cost to cast\b/i.test(w)) {
    return "additional_cost_incorrectly_golded_layer2";
  }

  if (/\b(?:You|They|That player|Its controller) may (?:sacrifice|discard|exile)\b/i.test(w)) {
    return "optional_effect_correctly_layer2";
  }

  if (/\bIf you do,\s*(?:sacrifice|discard|exile)\b/i.test(w) || /\bIf you don't,\s*(?:sacrifice|discard|exile)\b/i.test(w)) {
    return "optional_effect_correctly_layer2";
  }

  if (/\b(?:Rather than pay|Instead of paying|Evoke—|Evoke —)\b/i.test(w)) {
    return "replacement_alternative_correctly_layer2";
  }

  if (/:\s*(?:Add|Search|Draw|Destroy|Exile|Return|Put|Create|Target|Each|You)/i.test(w) && /:\s/.test(w)) {
    return "activated_cost_incorrectly_golded_layer2";
  }

  if (/\{[WUBRGC\d]+\}.*:\s/.test(w) || /^[+\−-]\d+:/.test(w.trim())) {
    return "activated_cost_incorrectly_golded_layer2";
  }

  if (/\b(?:Sacrifice|Discard|Exile) [^:]{0,80}:/i.test(w)) {
    return "activated_cost_incorrectly_golded_layer2";
  }

  return "ambiguous";
}

async function main() {
  const dev = JSON.parse(
    readFileSync(resolve(process.cwd(), "data/oracle-action-eval-development-v20.json"), "utf8"),
  ) as { cases: OracleActionEvalCaseV2[] };

  const entries: Array<Record<string, unknown>> = [];
  const counts: Record<CostPolicyCategory, number> = {
    activated_cost_incorrectly_golded_layer2: 0,
    additional_cost_incorrectly_golded_layer2: 0,
    optional_effect_correctly_layer2: 0,
    replacement_alternative_correctly_layer2: 0,
    ambiguous: 0,
  };

  for (const testCase of dev.cases) {
    for (const exp of testCase.expectedPrimitiveActions.filter((e) => !e.negative)) {
      if (!COST_PRIMITIVES.has(exp.actionType) && exp.actionType !== "cast") continue;
      const span = locateEvidenceSpan(testCase.oracleText, exp.evidenceContains, exp.cardFace);
      if (!span) continue;
      const spanRole = classifyTextRoleAt({
        paragraph: span.paragraph,
        localStart: span.localStart,
        localEnd: span.localEnd,
      });
      const window = span.paragraph.slice(
        Math.max(0, span.localStart - 100),
        Math.min(span.paragraph.length, span.localStart + exp.evidenceContains.length + 80),
      );
      const category = classifyCostGoldEntry({
        testCase,
        actionType: exp.actionType,
        evidenceContains: exp.evidenceContains,
        cardFace: exp.cardFace,
        spanRole,
        window,
      });
      if (spanRole !== "cost" && exp.actionType !== "cast") continue;
      if (exp.actionType === "cast" && spanRole === "cost") {
        counts.ambiguous += 1;
        entries.push({
          caseId: testCase.id,
          card: testCase.cardName,
          actionType: exp.actionType,
          evidence: exp.evidenceContains,
          spanRole,
          category: "ambiguous",
          note: "cast in cost region — assess separately",
          window: window.slice(0, 120),
        });
        continue;
      }
      counts[category] += 1;
      entries.push({
        caseId: testCase.id,
        card: testCase.cardName,
        actionType: exp.actionType,
        evidence: exp.evidenceContains,
        spanRole,
        category,
        window: window.slice(0, 120),
      });
    }
  }

  const out = { counts, entries, totalCostSpanGold: entries.length };
  mkdirSync(resolve(process.cwd(), "reports"), { recursive: true });
  const outPath = resolve(process.cwd(), "reports/cost-policy-gold-audit-v20.json");
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ outPath, counts, total: entries.length }, null, 2));
}

main();
