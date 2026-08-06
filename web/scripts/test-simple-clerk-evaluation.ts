/**
 * Simple clerk golden evaluation — local unit tests + optional staging API.
 * Run locally: npx tsx scripts/test-simple-clerk-evaluation.ts
 * Run staging:  STAGING_URL=... npx tsx scripts/test-simple-clerk-evaluation.ts --staging
 */
import {
  SIMPLE_CLERK_EVAL_CASES,
  SIMPLE_CLERK_EVAL_PASS_THRESHOLD_PCT,
  SIMPLE_CLERK_REGRESSION_CASES,
} from "./simple-clerk-evaluation-cases";
import {
  classifySimpleClerkQuestion,
  extractCardPhraseFromFactQuestion,
} from "../src/lib/store-inventory/simple-clerk/simple-clerk-intent";
import { answerCardFactQuestion } from "../src/lib/store-inventory/simple-clerk/simple-card-fact";
import { lookupEmbeddedClerkKnowledge } from "../src/lib/mtg-rag/embedded-clerk-knowledge";
import { parseClerkInventoryQuery } from "../src/lib/store-inventory/clerk-tools/clerk-query-parser";

const STAGING = process.argv.includes("--staging");
const BASE =
  process.env.STAGING_URL ??
  "https://buyback-web-staging-rrogeqxyea-uc.a.run.app";
const SLUG = process.env.STORE_SLUG ?? "the-game-lodge";

interface GradeResult {
  id: string;
  passed: boolean;
  reasons: string[];
}

async function gradeLocalCase(
  c: (typeof SIMPLE_CLERK_EVAL_CASES)[number],
): Promise<GradeResult> {
  const reasons: string[] = [];
  const category = classifySimpleClerkQuestion({ question: c.question });

  if (c.expectedIntent && category !== c.expectedIntent) {
    reasons.push(`intent: expected ${c.expectedIntent}, got ${category}`);
  }

  if (category === "card_fact" || c.category === "commander_eligibility") {
    const fact = extractCardPhraseFromFactQuestion(c.question);
    if (!fact) {
      reasons.push("could not extract card phrase");
    } else {
      const answer = await answerCardFactQuestion({
        question: c.question,
        kind: fact.kind,
        cardPhrase: fact.cardPhrase,
      });
      if (!answer || ("ambiguous" in answer && answer.ambiguous)) {
        reasons.push("card fact unresolved");
      } else if (!("ambiguous" in answer)) {
        const text = `${answer.directAnswer} ${answer.reason}`.toLowerCase();
        for (const inc of c.mustInclude ?? []) {
          if (!text.includes(inc.toLowerCase())) {
            reasons.push(`missing: "${inc}"`);
          }
        }
        for (const exc of c.mustExclude ?? []) {
          if (text.includes(exc.toLowerCase())) {
            reasons.push(`forbidden: "${exc}"`);
          }
        }
        if (!answer.oracleId) reasons.push("missing oracle id");
      }
    }
  }

  if (category === "terminology") {
    const hits = lookupEmbeddedClerkKnowledge(c.question);
    if (hits.length === 0) {
      reasons.push("no glossary hit");
    } else {
      const text = hits[0]!.chunk.text.toLowerCase();
      for (const inc of c.mustInclude ?? []) {
        if (!text.includes(inc.toLowerCase())) {
          reasons.push(`glossary missing: "${inc}"`);
        }
      }
    }
  }

  if (c.category === "color_filter") {
    const parsed = parseClerkInventoryQuery({ userQuestion: c.question });
    if (c.question.includes("mono-blue")) {
      if (
        JSON.stringify(parsed.semantic?.colorIdentityExact) !==
        JSON.stringify(["U"])
      ) {
        reasons.push("mono-blue should use exact U filter");
      }
    }
    if (c.question === "Show me blue cards") {
      if (!parsed.semantic?.colorIdentityContainsAny?.includes("U")) {
        reasons.push("blue should use contains-any U filter");
      }
    }
  }

  if (
    reasons.length === 0 &&
    (c.category === "inventory" ||
      c.category === "price" ||
      c.category === "commander_recommendation" ||
      c.category === "mixed" ||
      c.category === "misspelling")
  ) {
    if (category === "complex" || category === "deck_build") {
      reasons.push(`unexpected category ${category} for simple question`);
    }
  }

  return { id: c.id, passed: reasons.length === 0, reasons };
}

async function gradeStagingCase(
  c: (typeof SIMPLE_CLERK_EVAL_CASES)[number],
): Promise<GradeResult> {
  const reasons: string[] = [];
  const res = await fetch(
    `${BASE}/api/store/${encodeURIComponent(SLUG)}/inventory/clerk`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: c.question, history: [], filters: {} }),
    },
  );
  const data = (await res.json()) as Record<string, unknown>;
  const reply = String(data.reply ?? "").toLowerCase();

  if (!res.ok) reasons.push(`HTTP ${res.status}`);

  for (const inc of c.mustInclude ?? []) {
    if (!reply.includes(inc.toLowerCase())) reasons.push(`missing: "${inc}"`);
  }
  for (const exc of c.mustExclude ?? []) {
    if (reply.includes(exc.toLowerCase())) reasons.push(`forbidden: "${exc}"`);
  }

  const recs = data.recommendations as Array<{ oracleId?: string }> | undefined;
  if (recs?.length) {
    for (const rec of recs) {
      if (!rec.oracleId?.trim()) reasons.push("recommendation missing oracle id");
    }
  }

  return { id: c.id, passed: reasons.length === 0, reasons };
}

function dedupeEvalCases(
  cases: typeof SIMPLE_CLERK_EVAL_CASES,
): typeof SIMPLE_CLERK_EVAL_CASES {
  const seen = new Set<string>();
  return cases.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}

async function main() {
  const cases = dedupeEvalCases(
    STAGING
      ? SIMPLE_CLERK_EVAL_CASES
      : [
          ...SIMPLE_CLERK_REGRESSION_CASES,
          ...SIMPLE_CLERK_EVAL_CASES.filter(
            (c) =>
              c.category === "card_fact" ||
              c.category === "commander_eligibility" ||
              c.category === "terminology" ||
              c.category === "color_filter",
          ),
        ],
  );

  console.log(
    `Running ${cases.length} simple clerk eval cases (${STAGING ? "staging API" : "local"})…\n`,
  );

  let passed = 0;
  const failures: GradeResult[] = [];

  for (const c of cases) {
    const result = STAGING
      ? await gradeStagingCase(c)
      : await gradeLocalCase(c);
    if (
      !STAGING &&
      (c.category === "card_fact" || c.category === "commander_eligibility")
    ) {
      await new Promise((r) => setTimeout(r, 120));
    }
    if (result.passed) {
      passed += 1;
      console.log(`✓ ${c.id} — ${c.question.slice(0, 60)}`);
    } else {
      failures.push(result);
      console.log(`✗ ${c.id} — ${c.question.slice(0, 60)}`);
      console.log(`  ${result.reasons.join("; ")}`);
    }
  }

  const pct = Math.round((passed / cases.length) * 100);
  console.log(`\n${passed}/${cases.length} passed (${pct}%)`);

  if (pct < SIMPLE_CLERK_EVAL_PASS_THRESHOLD_PCT) {
    console.error(
      `\nBelow pass threshold (${SIMPLE_CLERK_EVAL_PASS_THRESHOLD_PCT}%)`,
    );
    process.exit(1);
  }

  console.log("\nSimple clerk evaluation PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
