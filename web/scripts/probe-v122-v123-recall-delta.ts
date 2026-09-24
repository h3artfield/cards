/**
 * Compare dev v26 accepted TP: v1.22 parser vs v1.23 parser (current).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import { matchGoldToActions } from "./oracle-action-unified-matcher";

const PARSER_V122 = "a138cbe:web/src/lib/deck-builder/golden-catalog/oracle-action-parser-v1.ts";
const SEG_V122 = "a138cbe:web/src/lib/deck-builder/golden-catalog/oracle-ability-segmentation.ts";
const OPT_V122 = "a138cbe:web/src/lib/deck-builder/golden-catalog/oracle-action-optionality.ts";
const VAR_V122 = "a138cbe:web/src/lib/deck-builder/golden-catalog/oracle-variable-quantity.ts";
const SCHEMA_V122 = "a138cbe:web/src/lib/deck-builder/golden-catalog/oracle-action-schema.ts";

function loadV122ParserModule(): typeof import("../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1") {
  const repoRoot = resolve(process.cwd(), "..");
  const tmpDir = resolve(process.cwd(), ".tmp-v122-parser");
  mkdirSync(tmpDir, { recursive: true });
  for (const spec of [PARSER_V122, SEG_V122, OPT_V122, VAR_V122, SCHEMA_V122]) {
    const [rev, path] = spec.split(":");
    const content = execSync(`git show ${rev}:${path}`, { cwd: repoRoot, encoding: "utf8" });
    const outName = path.split("/").pop()!;
    writeFileSync(resolve(tmpDir, outName), content, "utf8");
  }
  // Patch imports in tmp parser to use local copies - use dynamic require via tsx path alias hack
  // Instead: write a wrapper that copies v122 files over current, runs, restores - too destructive.
  // Use git stash approach: run from subprocess with NODE_PATH
  void tmpDir;
  return require("../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1");
}

interface ActionRow {
  primitive: string | null;
  evidenceText: string;
  evidenceStart: number;
  evidenceEnd: number;
  cardFaceId: string;
  abilityIndex: number;
  reviewStatus: string;
  loyaltyCost?: string;
  sagaChapterId?: string;
  modalOptionId?: string;
}

function extractRows(
  extractFn: (input: { oracleId: string; oracleText: string; cardFace?: string }) => { actions: Array<Record<string, unknown>> },
  testCase: OracleActionEvalCaseV2,
): ActionRow[] {
  const raw = extractFn({
    oracleId: testCase.oracleId,
    oracleText: testCase.oracleText,
    cardFace: testCase.cardFace,
  });
  return raw.actions.map((a) => ({
    primitive: normalizeToPrimitive(String(a.actionType), String(a.evidenceText)),
    evidenceText: String(a.evidenceText),
    evidenceStart: Number(a.evidenceStart),
    evidenceEnd: Number(a.evidenceEnd),
    cardFaceId: String(a.faceId),
    abilityIndex: Number(a.abilityIndex),
    reviewStatus: String(a.reviewStatus),
    loyaltyCost: a.loyaltyCost as string | undefined,
    sagaChapterId: a.sagaChapterId as string | undefined,
    modalOptionId: a.modalOptionId as string | undefined,
  }));
}

function matchedGoldIndices(testCase: OracleActionEvalCaseV2, rows: ActionRow[], tier: "accepted" | "all") {
  const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
  const actions = rows.map((a, index) => ({
    index,
    primitive: a.primitive,
    evidenceText: a.evidenceText,
    evidenceStart: a.evidenceStart,
    evidenceEnd: a.evidenceEnd,
    cardFaceId: a.cardFaceId,
    abilityIndex: a.abilityIndex,
    reviewStatus: a.reviewStatus as "accepted" | "needs_review",
    loyaltyCost: a.loyaltyCost,
    sagaChapterId: a.sagaChapterId,
    modalOptionId: a.modalOptionId,
  }));
  const m = matchGoldToActions({ expected, actions, tier, oracleText: testCase.oracleText });
  return new Set(m.matches.filter((x) => x.matched).map((x) => x.expectedIndex));
}

async function main() {
  const { extractOracleActionsV1: extractV123 } = await import(
    "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1"
  );

  // v1.22: checkout parser files to temp and eval via git show content eval
  const repoRoot = resolve(process.cwd(), "..");
  const v122ParserSrc = execSync(`git show a138cbe:web/src/lib/deck-builder/golden-catalog/oracle-action-parser-v1.ts`, {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const v122SegSrc = execSync(`git show a138cbe:web/src/lib/deck-builder/golden-catalog/oracle-ability-segmentation.ts`, {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const v122OptSrc = execSync(`git show a138cbe:web/src/lib/deck-builder/golden-catalog/oracle-action-optionality.ts`, {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const v122VarSrc = execSync(`git show a138cbe:web/src/lib/deck-builder/golden-catalog/oracle-variable-quantity.ts`, {
    cwd: repoRoot,
    encoding: "utf8",
  });

  const dev = JSON.parse(readFileSync("data/oracle-action-eval-development-v26.json", "utf8")) as {
    cases: OracleActionEvalCaseV2[];
  };

  // Save current files, swap v122, re-import, restore
  const paths = [
    "src/lib/deck-builder/golden-catalog/oracle-action-parser-v1.ts",
    "src/lib/deck-builder/golden-catalog/oracle-ability-segmentation.ts",
    "src/lib/deck-builder/golden-catalog/oracle-action-optionality.ts",
    "src/lib/deck-builder/golden-catalog/oracle-variable-quantity.ts",
  ];
  const saved = paths.map((p) => ({ p, content: readFileSync(p, "utf8") }));

  writeFileSync(paths[0], v122ParserSrc, "utf8");
  writeFileSync(paths[1], v122SegSrc, "utf8");
  writeFileSync(paths[2], v122OptSrc, "utf8");
  writeFileSync(paths[3], v122VarSrc, "utf8");

  // bust module cache
  for (const p of paths) {
    const full = resolve(process.cwd(), p);
    delete require.cache[require.resolve(full)];
  }

  const { extractOracleActionsV1: extractV122 } = require("../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1");

  const lostTp: Array<Record<string, unknown>> = [];
  const fnBreakdown: Record<string, number> = {};

  for (const testCase of dev.cases) {
    const rows122 = extractRows(extractV122, testCase);
    const rows123 = extractRows(extractV123, testCase);

    // restore before next iteration would need re-swap - do all v122 first then v123
    void rows123;
  }

  // Restore files
  for (const s of saved) writeFileSync(s.p, s.content, "utf8");

  // Two-pass approach without corrupting module cache mid-loop
  const v122ByCase = new Map<string, ActionRow[]>();
  writeFileSync(paths[0], v122ParserSrc, "utf8");
  writeFileSync(paths[1], v122SegSrc, "utf8");
  writeFileSync(paths[2], v122OptSrc, "utf8");
  writeFileSync(paths[3], v122VarSrc, "utf8");
  delete require.cache[require.resolve(resolve(process.cwd(), paths[0]))];
  const v122Mod = require("../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1");
  for (const c of dev.cases) {
    v122ByCase.set(c.id, extractRows(v122Mod.extractOracleActionsV1, c));
  }
  for (const s of saved) writeFileSync(s.p, s.content, "utf8");

  let v122AcceptedTp = 0;
  let v123AcceptedTp = 0;
  let v122Fn = 0;
  let v123Fn = 0;

  for (const testCase of dev.cases) {
    const rows122 = v122ByCase.get(testCase.id)!;
    const rows123 = extractRows(extractV123, testCase);
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);

    const matched122 = matchedGoldIndices(testCase, rows122, "accepted");
    const matched123 = matchedGoldIndices(testCase, rows123, "accepted");
    v122AcceptedTp += matched122.size;
    v123AcceptedTp += matched123.size;
    v122Fn += expected.length - matched122.size;
    v123Fn += expected.length - matched123.size;

    for (let ei = 0; ei < expected.length; ei++) {
      if (matched122.has(ei) && !matched123.has(ei)) {
        const exp = expected[ei];
        const a122 = rows122.find(
          (a) =>
            a.primitive === exp.actionType &&
            a.reviewStatus === "accepted" &&
            a.evidenceText.toLowerCase().includes(exp.evidenceContains.toLowerCase().slice(0, 12)),
        );
        const a123 = rows123.find((a) => a.primitive === exp.actionType);
        let cause = "unknown";
        if (!a123) cause = "accepted → missing";
        else if (a123.reviewStatus !== "accepted") cause = `accepted → ${a123.reviewStatus}`;
        else cause = "matcher/evidence_failure";

        lostTp.push({
          caseId: testCase.id,
          primitive: exp.actionType,
          goldEvidence: exp.evidenceContains,
          v122Status: a122?.reviewStatus ?? "matched_other_evidence",
          v123Status: a123?.reviewStatus ?? "missing",
          v122Evidence: a122?.evidenceText,
          v123Evidence: a123?.evidenceText,
          abilityIndex: a123?.abilityIndex ?? a122?.abilityIndex,
          cause,
        });
      }
    }

    if (matched123.size < expected.length) {
      for (let ei = 0; ei < expected.length; ei++) {
        if (matched123.has(ei)) continue;
        const exp = expected[ei];
        const emitted = rows123.filter((a) => a.primitive === exp.actionType);
        let category = "parser_missing_grammar";
        if (emitted.some((a) => a.reviewStatus === "needs_review")) category = "needs_review_only";
        else if (emitted.length === 0) category = "parser_missing_grammar";
        else category = "matcher/evidence_failure";
        fnBreakdown[category] = (fnBreakdown[category] ?? 0) + 1;
      }
    }
  }

  const report = {
    v122AcceptedTp,
    v123AcceptedTp,
    tpDelta: v123AcceptedTp - v122AcceptedTp,
    v122Fn,
    v123Fn,
    v122Recall: v122AcceptedTp / (v122AcceptedTp + v122Fn),
    v123Recall: v123AcceptedTp / (v123AcceptedTp + v123Fn),
    lostTp,
    fnBreakdown,
  };

  const out = resolve(process.cwd(), "data/milestones/rc2-development-planning/v122-v123-recall-delta-dev26.json");
  writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
