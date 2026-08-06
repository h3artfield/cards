import type { SpecialistResponse } from "../../clerk-types";
import type { ClerkToolResults } from "../../clerk-tools";
import type { MtgKnowledgeHit } from "../../../mtg-rag/hybrid-retrieval";
import { officialRulesHits } from "../../../mtg-rag/rules-citations";
import { isRulesQuestion } from "../../clerk-tools/rules-question";
import type { MtgQueryRouterResult } from "../../../mtg-rag/mtg-query-router";
import type { VerifierCheckDetail } from "../types";

function extractRuleCitations(text: string): string[] {
  const out = new Set<string>();
  for (const match of text.matchAll(/\bCR\s+(\d{3}(?:\.\d+[a-z]?)?)\b/gi)) {
    if (match[1]) out.add(match[1]);
  }
  for (const match of text.matchAll(
    /\b(?:rule|comprehensive rules)\s+(\d{3}(?:\.\d+[a-z]?)?)\b/gi,
  )) {
    if (match[1]) out.add(match[1]);
  }
  return [...out];
}

export function checkKnowledgeGrounding(input: {
  mtgRoute: MtgQueryRouterResult | null | undefined;
  tools: ClerkToolResults;
  specialist: SpecialistResponse | null;
  userQuestion?: string;
}): VerifierCheckDetail & { hardFailures: string[] } {
  const knowledge = input.tools.knowledge;
  if (!knowledge || !input.specialist) {
    return { score: 100, passed: true, hardFailures: [] };
  }

  const hardFailures: string[] = [];
  const warnings: string[] = [];
  const answer = input.specialist.direct_answer;
  const hits: MtgKnowledgeHit[] = knowledge.knowledge.hits;

  const mtgRoute = input.mtgRoute ?? knowledge.mtgRoute;
  const usedDirectFallback = Boolean(
    input.specialist?.missing_information?.some((m) =>
      m.includes("direct model knowledge"),
    ),
  );

  const rulesIntent =
    mtgRoute.intent === "rules_question" ||
    isRulesQuestion(input.userQuestion ?? "");

  if (usedDirectFallback && rulesIntent) {
    hardFailures.push(
      "Rules questions must not use model knowledge fallback — Comprehensive Rules only.",
    );
  }

  if (hits.length === 0 && rulesIntent) {
    warnings.push("Knowledge retrieval returned no chunks.");
    hardFailures.push(
      "Rules question answered without retrieved Comprehensive Rules chunks.",
    );
  }

  if (rulesIntent) {
    const official = officialRulesHits(hits);
    if (official.length === 0 && hits.length > 0) {
      hardFailures.push(
        "Rules question requires official Comprehensive Rules chunks — none retrieved.",
      );
    }

    const cited = extractRuleCitations(answer);
    const retrievedRules = official
      .flatMap((h) => [h.chunk.ruleNumberStart, h.chunk.ruleNumberEnd])
      .filter(Boolean) as string[];

    if (cited.length === 0 && retrievedRules.length > 0) {
      hardFailures.push(
        "Rules answer must cite at least one Comprehensive Rules number (e.g. CR 117.3).",
      );
    }

    const transcriptOnly =
      hits.length > 0 &&
      hits.every((h) => h.chunk.authorityTier === "community_education");
    if (transcriptOnly && !/community|transcript|general guidance/i.test(answer)) {
      warnings.push(
        "Answer relies on community transcript sources — should not be framed as official rules.",
      );
    }
  }

  const passed = hardFailures.length === 0;
  return {
    score: passed ? (warnings.length ? 85 : 95) : 40,
    passed,
    reason: passed ? undefined : hardFailures[0],
    warnings,
    hardFailures,
  };
}
