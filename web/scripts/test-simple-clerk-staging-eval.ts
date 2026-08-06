/**
 * Simple clerk staging evaluation — full suite with critical vs explanatory grading.
 *
 * Usage:
 *   npx tsx scripts/test-simple-clerk-staging-eval.ts --local
 *   npx tsx scripts/test-simple-clerk-staging-eval.ts --staging
 *   npx tsx scripts/test-simple-clerk-staging-eval.ts --staging --cold-cache
 *   npx tsx scripts/test-simple-clerk-staging-eval.ts --staging --warm-cache
 */
import {
  CRITICAL_ASSERTION_CATEGORIES,
  SIMPLE_CLERK_EVAL_CASES,
  SIMPLE_CLERK_EVAL_SUITE_REPORT,
  SIMPLE_CLERK_EXPLANATORY_PASS_THRESHOLD_PCT,
  SIMPLE_CLERK_REGRESSION_CASES,
  type ColorFilterExpectation,
  type SimpleClerkEvalCase,
} from "./simple-clerk-evaluation-cases";
import {
  assertStagingDeploymentIdentity,
  loadStagingDeploymentLock,
} from "./staging-deployment-verify";
import {
  clearLookupCaches,
  getLookupAttemptLog,
  getServerLookupTrace,
  getSessionLiveCallCount,
  resetLookupBudget,
} from "../src/lib/store-inventory/clerk-tools/card-catalog";
import { parseClerkInventoryQuery } from "../src/lib/store-inventory/clerk-tools/clerk-query-parser";

const MODE = process.argv.includes("--staging") ? "staging" : "local";
const COLD_CACHE = process.argv.includes("--cold-cache");
const WARM_CACHE = process.argv.includes("--warm-cache");
const BASE =
  process.env.STAGING_URL ??
  "https://buyback-web-staging-rrogeqxyea-uc.a.run.app";
const SLUG = process.env.STORE_SLUG ?? "the-game-lodge";

interface CaseMetrics {
  catalogSource?: string;
  cacheHit?: boolean;
  liveApiCallCount?: number;
  entityResolutionStatus?: string;
  oracleId?: string;
  verificationResult?: string;
  latencyMs: number;
}

interface CaseResult {
  id: string;
  primaryCategory: string;
  question: string;
  passed: boolean;
  criticalPassed: boolean;
  explanatoryPassed: boolean;
  criticalReasons: string[];
  explanatoryReasons: string[];
  reply?: string;
  ruleNumbers?: string[];
  metrics: CaseMetrics;
  regression?: string;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)]!;
}

function extractRuleNumbers(text: string): string[] {
  const matches = text.match(/(?:CR\s)?(\d{3}(?:\.\d+[a-z]?)?)/gi) ?? [];
  return [...new Set(matches.map((m) => m.replace(/^CR\s/i, "")))];
}

interface CaseMetrics {
  catalogSource?: string;
  cacheHit?: boolean;
  liveApiCallCount?: number;
  entityResolutionStatus?: string;
  oracleId?: string;
  verificationResult?: string;
  latencyMs: number;
  serverLookupTrace?: ReturnType<typeof getServerLookupTrace>;
}

interface CaseResult {
  id: string;
  primaryCategory: string;
  question: string;
  passed: boolean;
  criticalPassed: boolean;
  explanatoryPassed: boolean;
  criticalReasons: string[];
  explanatoryReasons: string[];
  reply?: string;
  ruleNumbers?: string[];
  metrics: CaseMetrics;
  regression?: string;
  colorFilterViolations?: number;
}

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function cardMatchesColorFilter(
  colors: string[],
  expectation: ColorFilterExpectation,
): boolean {
  const id = colors ?? [];
  switch (expectation.operator) {
    case "colorIdentityExact":
      return (
        id.length === expectation.colors.length &&
        expectation.colors.every((c) => id.includes(c))
      );
    case "colorIdentityContainsAny":
      return expectation.colors.some((c) => id.includes(c));
    case "colorIdentitySubsetOf":
      return id.every((c) => expectation.colors.includes(c));
    default:
      return true;
  }
}

function parsedColorOperator(question: string): {
  operator?: string;
  colors?: string[];
} {
  const parsed = parseClerkInventoryQuery({ userQuestion: question });
  const semantic = parsed.semantic;
  if (semantic.colorIdentityExact != null) {
    return { operator: "colorIdentityExact", colors: semantic.colorIdentityExact };
  }
  if (semantic.colorIdentityContainsAny?.length) {
    return { operator: "colorIdentityContainsAny", colors: semantic.colorIdentityContainsAny };
  }
  if (semantic.colorIdentitySubsetOf?.length) {
    return { operator: "colorIdentitySubsetOf", colors: semantic.colorIdentitySubsetOf };
  }
  return {};
}

const INELIGIBLE_COMMANDER_NAMES = [
  "counterspell",
  "lorien revealed",
  "lórien revealed",
  "cultivate",
  "rhystic study",
  "aetherspouts",
  "lightning bolt",
  "sol ring",
];

function gradeCritical(
  c: SimpleClerkEvalCase,
  reply: string,
  recs: Array<{ oracleId?: string; card_name?: string; colorIdentity?: string[] }>,
  suggestedCards: Array<{ name?: string; colorIdentity?: string[] }> = [],
): { reasons: string[]; colorFilterViolations: number } {
  const reasons: string[] = [];
  const lower = reply.toLowerCase();
  const normalizedReply = stripAccents(reply);
  let colorFilterViolations = 0;

  for (const inc of c.criticalMustInclude ?? c.mustInclude ?? []) {
    if (!lower.includes(inc.toLowerCase())) reasons.push(`critical missing: "${inc}"`);
  }
  for (const exc of c.criticalMustExclude ?? c.mustExclude ?? []) {
    if (lower.includes(exc.toLowerCase())) reasons.push(`critical forbidden: "${exc}"`);
  }

  if (c.accentNormalizedMatch?.length) {
    for (const term of c.accentNormalizedMatch) {
      if (!normalizedReply.includes(stripAccents(term))) {
        reasons.push(`critical: accent-normalized match missing "${term}"`);
      }
    }
  }

  if (c.rulesSemanticMustInclude?.length) {
    for (const term of c.rulesSemanticMustInclude) {
      if (!normalizedReply.includes(stripAccents(term))) {
        reasons.push(`critical rules semantic missing: "${term}"`);
      }
    }
  }

  if (c.allowEmptyInventory) {
    const hasStock = recs.length > 0 || suggestedCards.length > 0;
    const honestEmpty = /\b(didn't find|don't have|no matching|not find|no eligible)\b/i.test(reply);
    if (!hasStock && !honestEmpty && (c.criticalMustInclude?.length ?? 0) === 0) {
      // Only require honest empty when no other critical includes mandated
    }
  }

  if (c.colorFilterExpectation) {
    const parsed = parsedColorOperator(c.question);
    if (parsed.operator && parsed.operator !== c.colorFilterExpectation.operator) {
      reasons.push(
        `critical color operator: expected ${c.colorFilterExpectation.operator}, parsed ${parsed.operator}`,
      );
    }
    const cardsToCheck =
      recs.length > 0
        ? recs.map((r) => ({
            name: r.card_name ?? "",
            colorIdentity: r.colorIdentity ?? [],
          }))
        : suggestedCards.map((r) => ({
            name: r.name ?? "",
            colorIdentity: r.colorIdentity ?? [],
          }));
    if (cardsToCheck.length > 0) {
      for (const card of cardsToCheck) {
        if (!cardMatchesColorFilter(card.colorIdentity, c.colorFilterExpectation)) {
          colorFilterViolations += 1;
          reasons.push(
            `critical color filter violation: ${card.name} identity [${card.colorIdentity.join("")}]`,
          );
        }
      }
    }
  }

  if (c.requireOracleId && recs.length > 0) {
    for (const rec of recs) {
      if (!rec.oracleId?.trim()) reasons.push("critical: recommendation missing oracle id");
    }
  }

  if (c.requireRuleNumbers?.length) {
    const found = extractRuleNumbers(reply);
    for (const rn of c.requireRuleNumbers) {
      if (!found.some((f) => f.startsWith(rn))) {
        reasons.push(`critical: missing rule ${rn}`);
      }
    }
  }

  if (c.primaryCategory === "commander_recommendation" || c.requireEligibleCommanderOnly) {
    for (const rec of recs) {
      const name = (rec.card_name ?? "").toLowerCase();
      if (INELIGIBLE_COMMANDER_NAMES.some((bad) => name.includes(bad))) {
        reasons.push(`critical: ineligible commander in results: ${rec.card_name}`);
      }
    }
  }

  if (c.id === "rec-03" && recs.length > 0) {
    const birdRelevant = recs.some((rec) =>
      /bird/i.test(`${rec.card_name ?? ""}`),
    );
    const animarLeak = recs.some((rec) => /animar/i.test(rec.card_name ?? ""));
    if (animarLeak) {
      reasons.push("critical: theme-irrelevant commander Animar for Bird request");
    }
    if (!birdRelevant && !/bird/i.test(reply)) {
      reasons.push("critical: Bird commander request lacks bird-relevant results");
    }
  }

  if (c.primaryCategory === "inventory_availability" || c.primaryCategory === "price_quantity") {
    if (/\bwe have \d+ copies?\b/i.test(reply) && recs.length === 0 && !/\bno\b/i.test(reply)) {
      reasons.push("critical: inventory claim without listing");
    }
  }

  return { reasons, colorFilterViolations };
}

function gradeExplanatory(c: SimpleClerkEvalCase, reply: string): string[] {
  const reasons: string[] = [];
  const lower = reply.toLowerCase();
  for (const inc of c.explanatoryMustInclude ?? []) {
    if (!lower.includes(inc.toLowerCase())) reasons.push(`explanatory missing: "${inc}"`);
  }
  return reasons;
}

async function runLocalCase(c: SimpleClerkEvalCase): Promise<CaseResult> {
  resetLookupBudget(8);
  const started = Date.now();

  const { classifySimpleClerkQuestion } = await import(
    "../src/lib/store-inventory/simple-clerk/simple-clerk-intent"
  );
  const { runSimpleClerkPipeline } = await import(
    "../src/lib/store-inventory/simple-clerk/simple-clerk-pipeline"
  );

  const ctx = {
    storeId: "eval-local",
    storeSlug: SLUG,
    storeName: "Eval Store",
    user_question: c.question,
    conversation_summary: "",
  };

  const pipeline = await runSimpleClerkPipeline({ ctx });
  const reply = pipeline?.specialist?.direct_answer ?? "";
  const recs = pipeline?.specialist?.recommendations ?? [];
  const lookupLog = getLookupAttemptLog();
  const lastLookup = lookupLog[lookupLog.length - 1];

  const graded = gradeCritical(c, reply, recs);
  const criticalReasons = graded.reasons;
  const explanatoryReasons = gradeExplanatory(c, reply);

  if (c.expectedIntent) {
    const intent = classifySimpleClerkQuestion({ question: c.question });
    if (intent !== c.expectedIntent) {
      criticalReasons.push(`intent: expected ${c.expectedIntent}, got ${intent}`);
    }
  }

  if (!reply && c.primaryCategory !== "unresolved_conflict") {
    criticalReasons.push("critical: empty reply");
  }

  return {
    id: c.id,
    primaryCategory: c.primaryCategory,
    question: c.question,
    passed: criticalReasons.length === 0 && explanatoryReasons.length === 0,
    criticalPassed: criticalReasons.length === 0,
    explanatoryPassed: explanatoryReasons.length === 0,
    criticalReasons,
    explanatoryReasons,
    reply,
    ruleNumbers: extractRuleNumbers(reply),
    colorFilterViolations: graded.colorFilterViolations,
    metrics: {
      catalogSource: lastLookup?.catalogSource,
      cacheHit: lastLookup?.cacheHit,
      liveApiCallCount: getSessionLiveCallCount(),
      entityResolutionStatus: lastLookup?.entityResolutionStatus,
      oracleId: lastLookup?.oracleId ?? recs[0]?.oracleId,
      latencyMs: Date.now() - started,
      serverLookupTrace: getServerLookupTrace(),
    },
    regression: c.regression,
  };
}

async function runStagingCase(c: SimpleClerkEvalCase): Promise<CaseResult> {
  resetLookupBudget(8);
  const started = Date.now();

  const res = await fetch(
    `${BASE}/api/store/${encodeURIComponent(SLUG)}/inventory/clerk`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: c.question, history: [], filters: {} }),
    },
  );
  const data = (await res.json()) as Record<string, unknown>;
  const reply = String(data.reply ?? "");
  const recs = (data.recommendations as Array<{ oracleId?: string; card_name?: string; colorIdentity?: string[] }>) ?? [];
  const suggestedCards = (data.suggestedCards as Array<{ name?: string; colorIdentity?: string[] }>) ?? [];
  const verification = data.verification as { status?: string } | undefined;

  const graded = gradeCritical(c, reply, recs, suggestedCards);
  const criticalReasons = graded.reasons;
  const explanatoryReasons = gradeExplanatory(c, reply);

  if (!res.ok) criticalReasons.push(`HTTP ${res.status}`);

  return {
    id: c.id,
    primaryCategory: c.primaryCategory,
    question: c.question,
    passed: criticalReasons.length === 0 && explanatoryReasons.length === 0,
    criticalPassed: criticalReasons.length === 0,
    explanatoryPassed: explanatoryReasons.length === 0,
    criticalReasons,
    explanatoryReasons,
    reply,
    ruleNumbers: extractRuleNumbers(reply),
    colorFilterViolations: graded.colorFilterViolations,
    metrics: {
      verificationResult: verification?.status,
      latencyMs: Date.now() - started,
      serverLookupTrace: (data.trace as { catalogLookupSources?: string[] }) ? getServerLookupTrace() : undefined,
    },
    regression: c.regression,
  };
}

async function main() {
  if (MODE === "staging") {
    console.log("=== Staging deployment identity check ===\n");
    const { lock, identity } = await assertStagingDeploymentIdentity({ baseUrl: BASE });
    console.log("Confirmed application version:");
    console.log(JSON.stringify(identity, null, 2));
    if (lock) {
      console.log("\nDeployment lock:");
      console.log(JSON.stringify(lock, null, 2));
    }
    console.log("");
  } else {
    const lock = loadStagingDeploymentLock();
    if (lock) {
      console.log(`(local mode — expected staging lock: ${lock.gitCommitSha})\n`);
    }
  }

  console.log("=== Simple Clerk Evaluation Suite Report ===\n");
  console.log(`Total before dedup: ${SIMPLE_CLERK_EVAL_SUITE_REPORT.totalBeforeDedup}`);
  console.log(`Exact duplicates removed: ${SIMPLE_CLERK_EVAL_SUITE_REPORT.exactDuplicatesRemoved.length}`);
  for (const d of SIMPLE_CLERK_EVAL_SUITE_REPORT.exactDuplicatesRemoved) {
    console.log(`  - ${d.id} duplicate of ${d.duplicateOf}: "${d.question}"`);
  }
  console.log(`Near-duplicates consolidated: ${SIMPLE_CLERK_EVAL_SUITE_REPORT.nearDuplicatesConsolidated.length}`);
  for (const d of SIMPLE_CLERK_EVAL_SUITE_REPORT.nearDuplicatesConsolidated) {
    console.log(`  - ${d.removedId} consolidated into ${d.keptId}: "${d.question}"`);
  }
  console.log(`Final unique count: ${SIMPLE_CLERK_EVAL_SUITE_REPORT.finalCount}`);
  console.log("Final count by category:");
  for (const [cat, count] of Object.entries(SIMPLE_CLERK_EVAL_SUITE_REPORT.finalCountByCategory)) {
    console.log(`  ${cat}: ${count}`);
  }
  console.log(`\nFinal test IDs (${SIMPLE_CLERK_EVAL_SUITE_REPORT.finalTestIds.length}):`);
  console.log(SIMPLE_CLERK_EVAL_SUITE_REPORT.finalTestIds.join(", "));

  const cases = SIMPLE_CLERK_EVAL_CASES;
  if (COLD_CACHE) clearLookupCaches();

  console.log(`\n=== Running ${cases.length} cases (${MODE}${COLD_CACHE ? ", cold-cache" : WARM_CACHE ? ", warm-cache" : ""}) ===\n`);

  const results: CaseResult[] = [];
  let liveCallsBefore = getSessionLiveCallCount();

  for (const c of cases) {
    if (COLD_CACHE) {
      clearLookupCaches();
      resetLookupBudget(8);
    }
    const result =
      MODE === "staging" ? await runStagingCase(c) : await runLocalCase(c);
    results.push(result);
    const icon = result.passed ? "✓" : result.criticalPassed ? "~" : "✗";
    console.log(
      `${icon} ${result.id} [${result.primaryCategory}] ${result.question.slice(0, 55)}${result.question.length > 55 ? "…" : ""}`,
    );
    if (!result.criticalPassed) {
      console.log(`    CRITICAL: ${result.criticalReasons.join("; ")}`);
    } else if (!result.explanatoryPassed) {
      console.log(`    explanatory: ${result.explanatoryReasons.join("; ")}`);
    }
  }

  const criticalCases = results.filter((r) =>
    CRITICAL_ASSERTION_CATEGORIES.includes(r.primaryCategory as typeof CRITICAL_ASSERTION_CATEGORIES[number]),
  );
  const criticalPassed = criticalCases.filter((r) => r.criticalPassed).length;
  const explanatoryPassed = results.filter((r) => r.explanatoryPassed).length;
  const allPassed = results.filter((r) => r.passed).length;
  const latencies = results.map((r) => r.metrics.latencyMs);
  const liveCalls = getSessionLiveCallCount() - liveCallsBefore;

  console.log("\n=== Summary ===");
  console.log(`Mode: ${MODE}`);
  console.log(`Final unique tests: ${cases.length}`);
  console.log(`All passed: ${allPassed}/${cases.length} (${Math.round((allPassed / cases.length) * 100)}%)`);
  console.log(`Critical assertions: ${criticalPassed}/${criticalCases.length} (${Math.round((criticalPassed / criticalCases.length) * 100)}%) — requires 100%`);
  console.log(`Explanatory quality: ${explanatoryPassed}/${cases.length} (${Math.round((explanatoryPassed / cases.length) * 100)}%) — threshold ${SIMPLE_CLERK_EXPLANATORY_PASS_THRESHOLD_PCT}%`);
  console.log(`Scryfall live calls (session): ${liveCalls}`);
  console.log(`Median latency: ${percentile(latencies, 50)}ms`);
  console.log(`P95 latency: ${percentile(latencies, 95)}ms`);

  console.log("\n=== Category pass rates ===");
  const byCat = new Map<string, { pass: number; total: number }>();
  for (const r of results) {
    const cur = byCat.get(r.primaryCategory) ?? { pass: 0, total: 0 };
    cur.total += 1;
    if (r.passed) cur.pass += 1;
    byCat.set(r.primaryCategory, cur);
  }
  for (const [cat, { pass, total }] of byCat) {
    console.log(`  ${cat}: ${pass}/${total}`);
  }

  const failures = results.filter((r) => !r.passed);
  if (failures.length > 0) {
    console.log("\n=== Failing cases ===");
    for (const f of failures) {
      console.log(`\n${f.id} — ${f.question}`);
      console.log(`  critical: ${f.criticalReasons.join("; ") || "ok"}`);
      console.log(`  explanatory: ${f.explanatoryReasons.join("; ") || "ok"}`);
      if (f.reply) console.log(`  reply: ${f.reply.slice(0, 200)}…`);
    }
  }

  const regressions = results.filter((r) => r.regression);
  if (regressions.length > 0) {
    console.log("\n=== Regression case replies ===");
    for (const r of regressions) {
      console.log(`\n[${r.regression}] ${r.id}: ${r.question}`);
      console.log(`  ${(r.reply ?? "(no reply)").slice(0, 300)}`);
    }
  }

  const rulesCases = results.filter((r) => r.primaryCategory === "rules_legality");
  if (rulesCases.length > 0) {
    console.log("\n=== Rules cases — retrieved rule numbers ===");
    for (const r of rulesCases) {
      console.log(`  ${r.id}: ${r.ruleNumbers?.join(", ") || "(none)"}`);
    }
  }

  const criticalFail = criticalCases.some((r) => !r.criticalPassed);
  const explanatoryPct = Math.round((explanatoryPassed / cases.length) * 100);

  if (criticalFail) {
    console.error("\nFAILED: Critical assertion test(s) failed — deployment blocked.");
    process.exit(1);
  }
  if (explanatoryPct < SIMPLE_CLERK_EXPLANATORY_PASS_THRESHOLD_PCT) {
    console.error(`\nFAILED: Explanatory quality ${explanatoryPct}% below ${SIMPLE_CLERK_EXPLANATORY_PASS_THRESHOLD_PCT}%`);
    process.exit(1);
  }

  console.log("\nSimple clerk evaluation PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
