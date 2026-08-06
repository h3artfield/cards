import type { MtgKnowledgeHit } from "./hybrid-retrieval";

/** Build customer-facing citation lines from retrieved chunks. */
export function citationsFromKnowledgeHits(hits: MtgKnowledgeHit[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const hit of hits) {
    const c = hit.chunk;
    let label: string | undefined;

    if (c.ruleNumberStart) {
      label =
        c.ruleNumberEnd && c.ruleNumberEnd !== c.ruleNumberStart
          ? `Comprehensive Rules ${c.ruleNumberStart}–${c.ruleNumberEnd}`
          : `Comprehensive Rules ${c.ruleNumberStart}`;
    } else if (c.citationLabel?.trim()) {
      label = c.citationLabel.trim();
    } else if (c.sourceLocator?.trim()) {
      label = c.sourceLocator.trim();
    }

    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }

  return out;
}

export function officialRulesHits(hits: MtgKnowledgeHit[]): MtgKnowledgeHit[] {
  return hits.filter(
    (h) =>
      h.chunk.corpus === "comprehensive_rules" ||
      h.chunk.authorityTier === "official_rules",
  );
}

/** Append sources block if the answer body does not already cite them. */
export function appendSourcesIfMissing(
  answer: string,
  citations: string[],
): string {
  const body = answer.trim();
  if (citations.length === 0) return body;

  const missing = citations.filter(
    (c) => !body.toLowerCase().includes(c.toLowerCase().slice(0, 12)),
  );
  if (missing.length === 0 && /\bsources?\s*:/i.test(body)) return body;

  return `${body}\n\nSources: ${citations.join("; ")}`;
}

export function rulesChunksInsufficientMessage(): string {
  return (
    "I couldn't find that topic in our loaded Comprehensive Rules. " +
    "For a definitive ruling at the table, ask a judge — I can cite stack, priority, combat, and trigger rules when those sections are loaded."
  );
}

export function ragDisabledRulesMessage(): string {
  return (
    "Rules lookup isn't available right now (Comprehensive Rules knowledge base is offline). " +
    "Ask a judge at the counter for an official ruling."
  );
}
