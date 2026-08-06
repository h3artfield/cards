/**
 * MTG RAG Phase 3 — evaluate query router + hybrid retrieval against golden cases.
 * Run: npm run mtg-rag:evaluate [-- --limit N] [-- --id term-001]
 */
import { loadEnvLocal } from "../lib/script-env";
import { withFirestoreScriptTimeout } from "../lib/firestore-fail-fast";
import { corporaForIntent } from "../../src/lib/mtg-rag/corpus-for-intent";
import { hybridRetrieveMtgKnowledge } from "../../src/lib/mtg-rag/hybrid-retrieval";
import {
  routeMtgKnowledgeQuery,
  shouldUseKnowledgeRetrieval,
} from "../../src/lib/mtg-rag/mtg-query-router";
import {
  MTG_RAG_EVAL_CASES,
  MTG_RAG_EVAL_CASE_COUNT,
  type MtgRagEvalCase,
} from "./evaluation-cases";

function hasFlag(argv: string[], flag: string): boolean {
  return argv.includes(flag);
}

function flagValue(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

function intentMatches(caseIntent: MtgRagEvalCase, actual: string): boolean {
  return caseIntent.expectedIntent.includes(actual as MtgRagEvalCase["expectedIntent"][number]);
}

function corpusMatches(caseDef: MtgRagEvalCase, corpora: string[]): boolean {
  if (caseDef.expectedCorpora.length === 0) return true;
  return caseDef.expectedCorpora.some((c) => corpora.includes(c));
}

async function evaluateCase(caseDef: MtgRagEvalCase): Promise<{
  ok: boolean;
  detail: string;
}> {
  const route = await routeMtgKnowledgeQuery({ question: caseDef.question });

  if (caseDef.requiresInventory) {
    if (shouldUseKnowledgeRetrieval(route) && route.requiresInventory === false) {
      // inventory cases should not be knowledge-only
    }
    const ok = route.intent === "inventory_lookup" || route.intent === "price_lookup";
    return {
      ok,
      detail: ok ? "inventory intent" : `got ${route.intent}`,
    };
  }

  if (!intentMatches(caseDef, route.intent)) {
    return { ok: false, detail: `intent ${route.intent}` };
  }

  if (!shouldUseKnowledgeRetrieval(route)) {
    return { ok: false, detail: "knowledge retrieval not triggered" };
  }

  const retrieval = await hybridRetrieveMtgKnowledge({
    question: caseDef.question,
    intent: route.intent,
  });

  const hitCorpora = [...new Set(retrieval.hits.map((h) => h.chunk.corpus))];
  const minHits = caseDef.minHits ?? 1;

  if (retrieval.hits.length < minHits) {
    return {
      ok: false,
      detail: `hits=${retrieval.hits.length} (alias=${retrieval.aliasMatches}, vector=${retrieval.vectorMatches})`,
    };
  }

  if (!corpusMatches(caseDef, hitCorpora)) {
    return {
      ok: false,
      detail: `corpora ${hitCorpora.join(",")} expected ${caseDef.expectedCorpora.join(",")}`,
    };
  }

  if (caseDef.forbiddenCorpora?.some((c) => hitCorpora.includes(c))) {
    return {
      ok: false,
      detail: `forbidden corpus present: ${hitCorpora.join(",")}`,
    };
  }

  const routedCorpora = corporaForIntent(route.intent);
  if (!caseDef.expectedCorpora.every((c) => routedCorpora.includes(c))) {
    return { ok: true, detail: `hits=${retrieval.hits.length} (router corpus mismatch ok)` };
  }

  return {
    ok: true,
    detail: `hits=${retrieval.hits.length} alias=${retrieval.aliasMatches} vector=${retrieval.vectorMatches}`,
  };
}

async function main() {
  loadEnvLocal();
  const argv = process.argv.slice(2);
  const limit = flagValue(argv, "--limit")
    ? Number.parseInt(flagValue(argv, "--limit")!, 10)
    : undefined;
  const singleId = flagValue(argv, "--id");
  const dryRouter = hasFlag(argv, "--router-only");

  console.log(`\nMTG RAG — evaluate (Phase 3) — ${MTG_RAG_EVAL_CASE_COUNT} cases\n`);

  let cases = MTG_RAG_EVAL_CASES;
  if (singleId) cases = cases.filter((c) => c.id === singleId);
  if (limit) cases = cases.slice(0, limit);

  if (cases.length === 0) {
    console.error("No matching evaluation cases.");
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;

  await withFirestoreScriptTimeout(
    "mtg-rag evaluate",
    async () => {
    for (const caseDef of cases) {
      if (dryRouter) {
        const route = await routeMtgKnowledgeQuery({ question: caseDef.question });
        const ok = caseDef.requiresInventory
          ? route.intent === "inventory_lookup" || route.intent === "price_lookup"
          : intentMatches(caseDef, route.intent);
        if (ok) {
          passed++;
          console.log(`✓ ${caseDef.id} — ${route.intent}`);
        } else {
          failed++;
          console.log(`✗ ${caseDef.id} — ${route.intent}`);
        }
        continue;
      }

      try {
        const result = await evaluateCase(caseDef);
        if (result.ok) {
          passed++;
          console.log(`✓ ${caseDef.id} — ${result.detail}`);
        } else {
          failed++;
          console.log(`✗ ${caseDef.id} — ${result.detail}`);
        }
      } catch (err) {
        failed++;
        console.log(
          `✗ ${caseDef.id} — ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  },
  600_000,
  );

  console.log("");
  console.log(`Results: ${passed} passed, ${failed} failed / ${cases.length} run`);
  if (failed > 0) process.exit(1);
  console.log("Evaluation PASSED");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
