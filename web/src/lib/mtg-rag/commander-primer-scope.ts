import type { MtgKnowledgeHit } from "./hybrid-retrieval";
import type { HybridRetrievalMode } from "./hybrid-retrieval";
import { chunkHasExactCommanderField } from "./retrieval-match-tiers";
import type { MtgKnowledgeChunk } from "./types";

export const MTG_RAG_COMMANDER_PRIMER_SCOPE_VERSION = "mtg-rag-commander-primer-scope-v1";

export function resolveCommanderPrimerScopeNames(args: {
  resolvedCommanderNames?: string[];
  commanderName?: string;
}): string[] {
  const explicit = (args.resolvedCommanderNames ?? []).map((name) => name.trim()).filter(Boolean);
  if (explicit.length > 0) return explicit;
  const single = args.commanderName?.trim();
  return single ? [single] : [];
}

export function shouldApplyResolvedCommanderPrimerScope(mode: HybridRetrievalMode): boolean {
  return mode === "COMMANDER_PRIMER" || mode === "PACKAGE";
}

export function commanderPrimerChunkMatchesResolvedCommander(
  chunk: Pick<MtgKnowledgeChunk, "corpus" | "commander">,
  resolvedCommanderNames: string[],
): boolean {
  if (chunk.corpus !== "commander_primer") return true;
  if (resolvedCommanderNames.length === 0) return true;
  return resolvedCommanderNames.some((name) => chunkHasExactCommanderField(chunk as MtgKnowledgeChunk, name));
}

export function filterMtgKnowledgeHitsByResolvedCommanderPrimerScope(
  hits: MtgKnowledgeHit[],
  resolvedCommanderNames: string[],
): { hits: MtgKnowledgeHit[]; mismatchedCommanderPrimerCount: number } {
  if (resolvedCommanderNames.length === 0) {
    return { hits, mismatchedCommanderPrimerCount: 0 };
  }

  let mismatchedCommanderPrimerCount = 0;
  const filtered = hits.filter((hit) => {
    if (hit.chunk.corpus !== "commander_primer") return true;
    const matches = resolvedCommanderNames.some((name) => chunkHasExactCommanderField(hit.chunk, name));
    if (!matches) mismatchedCommanderPrimerCount += 1;
    return matches;
  });

  return { hits: filtered, mismatchedCommanderPrimerCount };
}
