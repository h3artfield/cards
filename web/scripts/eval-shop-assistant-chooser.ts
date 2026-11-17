/**
 * Grades the shop assistant's chooser against a fixed list of questions.
 *
 *   npx tsx scripts/eval-shop-assistant-chooser.ts              (the model; needs the OpenAI key in the environment)
 *   npx tsx scripts/eval-shop-assistant-chooser.ts --fallback   (the keyword matcher; no network)
 *   add --runs 3 to ask every question three times and show how many runs each passed
 *
 * Prints, per question: the question, what was expected, what came back, and
 * pass or fail. Nothing else: no key, no prompt, no error text, no store data
 * (none is involved; the chooser is never given any).
 */
import { chooseShopTool, fallbackChooseTool, staffAssistantModel } from "../src/lib/shop-assistant/choose";
import {
  EVAL_NOW,
  EVAL_QUESTIONS,
  describeChoice,
  matchesExpected,
} from "./shop-assistant-eval-questions";

async function main() {
  const fallbackOnly = process.argv.includes("--fallback");
  console.log(fallbackOnly ? "Chooser eval: keyword matcher" : `Chooser eval: model ${staffAssistantModel()}`);
  console.log(`Pretend date: ${EVAL_NOW.toISOString().slice(0, 10)}\n`);

  const runsFlag = process.argv.indexOf("--runs");
  const runs = Math.max(1, Math.min(10, Number.parseInt(runsFlag >= 0 ? (process.argv[runsFlag + 1] ?? "") : "1", 10) || 1));
  const passes = EVAL_QUESTIONS.map(() => 0);

  for (let run = 1; run <= runs; run += 1) {
    if (runs > 1) console.log(`######## run ${run} of ${runs}`);
    for (const [index, expected] of EVAL_QUESTIONS.entries()) {
      const got = fallbackOnly
        ? (fallbackChooseTool(expected.question, EVAL_NOW) ?? { tool: null })
        : await chooseShopTool(expected.question, EVAL_NOW, { modelOnly: true });
      // In --fallback mode a question marked "none" passes when the matcher declines.
      const want =
        fallbackOnly && expected.fallback === "none" ? { ...expected, tool: "none" as const, args: undefined } : expected;
      const ok = matchesExpected(want, got);
      if (ok) passes[index]! += 1;
      console.log(`${ok ? "PASS" : "FAIL"}  ${expected.question}`);
      console.log(`      expected  ${describeChoice(want)}`);
      console.log(`      got       ${describeChoice(got)}`);
    }
  }

  // A question no tool should answer is a safety check: it must pass on every
  // run. The rest pass on at least two runs in three.
  const needed = Math.ceil((2 * runs) / 3);
  let passed = 0;
  const misses: string[] = [];
  for (const [index, expected] of EVAL_QUESTIONS.entries()) {
    const safety = expected.tool === "none";
    if (passes[index]! >= (safety ? runs : needed)) passed += 1;
    else misses.push(`  ${passes[index]}/${runs}  ${safety ? "[safety] " : ""}${expected.question}`);
  }
  if (runs > 1) {
    console.log(`\nPass mark: ${needed} of ${runs} runs; questions no tool should answer, ${runs} of ${runs}.`);
    if (misses.length) console.log(`Below the mark:\n${misses.join("\n")}`);
  }
  console.log(`\n${passed} of ${EVAL_QUESTIONS.length} passed`);
  process.exit(passed === EVAL_QUESTIONS.length ? 0 : 1);
}

void main();
