/**
 * Grades the shop assistant's chooser against a fixed list of questions.
 *
 *   npx tsx scripts/eval-shop-assistant-chooser.ts              (the model; needs the OpenAI key in the environment)
 *   npx tsx scripts/eval-shop-assistant-chooser.ts --fallback   (the keyword matcher; no network)
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

  let passed = 0;
  for (const expected of EVAL_QUESTIONS) {
    const got = fallbackOnly
      ? (fallbackChooseTool(expected.question, EVAL_NOW) ?? { tool: null })
      : await chooseShopTool(expected.question, EVAL_NOW, { modelOnly: true });
    // In --fallback mode a question marked "none" passes when the matcher declines.
    const want =
      fallbackOnly && expected.fallback === "none" ? { ...expected, tool: "none" as const, args: undefined } : expected;
    const ok = matchesExpected(want, got);
    if (ok) passed += 1;
    console.log(`${ok ? "PASS" : "FAIL"}  ${expected.question}`);
    console.log(`      expected  ${describeChoice(want)}`);
    console.log(`      got       ${describeChoice(got)}`);
  }

  console.log(`\n${passed} of ${EVAL_QUESTIONS.length} passed`);
  process.exit(passed === EVAL_QUESTIONS.length ? 0 : 1);
}

void main();
