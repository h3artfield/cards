import { COLLECTIONS } from "../firebase/collections";
import { requireFirestore } from "../firebase/admin";
import { aliasHashFromNormalized, normalizeAlias } from "./hash";
import type { MtgKnowledgeAlias, MtgKnowledgeChunk } from "./types";

export async function lookupMtgAlias(
  term: string,
): Promise<MtgKnowledgeAlias | null> {
  const normalized = normalizeAlias(term);
  if (!normalized) return null;

  const db = requireFirestore();
  const doc = await db
    .collection(COLLECTIONS.mtgKnowledgeAliases)
    .doc(aliasHashFromNormalized(normalized))
    .get();

  if (!doc.exists) return null;
  const data = doc.data() as MtgKnowledgeAlias;
  return data.active ? data : null;
}

export async function lookupMtgAliasesForTerms(
  terms: string[],
): Promise<MtgKnowledgeAlias[]> {
  const seen = new Set<string>();
  const out: MtgKnowledgeAlias[] = [];

  for (const term of terms) {
    const alias = await lookupMtgAlias(term);
    if (!alias || seen.has(alias.aliasHash)) continue;
    seen.add(alias.aliasHash);
    out.push(alias);
  }

  return out;
}

export async function getMtgKnowledgeChunksByIds(
  chunkIds: string[],
): Promise<MtgKnowledgeChunk[]> {
  if (chunkIds.length === 0) return [];
  const db = requireFirestore();
  const col = db.collection(COLLECTIONS.mtgKnowledgeChunks);
  const refs = chunkIds.map((id) => col.doc(id));
  const snaps = await db.getAll(...refs);

  return snaps
    .filter((s) => s.exists)
    .map((s) => s.data() as MtgKnowledgeChunk)
    .filter((c) => c.active);
}

export function aliasCandidateTerms(question: string): string[] {
  const terms = new Set<string>();
  const cleaned = question.replace(/[^\w\s'-]/g, " ").trim();

  terms.add(cleaned);
  terms.add(normalizeAlias(cleaned));

  for (const quoted of question.matchAll(/"([^"]+)"/g)) {
    if (quoted[1]?.trim()) terms.add(quoted[1].trim());
  }

  const lower = cleaned.toLowerCase();
  for (const pattern of [
    /\bwhat (?:is|are|does) (?:a |an |the )?(.+?)(?:\?|$)/i,
    /\bdefine (.+?)(?:\?|$)/i,
    /\bexplain (.+?)(?:\?|$)/i,
    /\bwhat does (.+?) mean\b/i,
  ]) {
    const match = lower.match(pattern);
    if (match?.[1]) terms.add(match[1].trim());
  }

  const words = cleaned.split(/\s+/).filter(Boolean);
  for (let size = Math.min(5, words.length); size >= 1; size--) {
    for (let i = 0; i <= words.length - size; i++) {
      terms.add(words.slice(i, i + size).join(" "));
    }
  }

  return [...terms].filter((t) => t.length >= 2).slice(0, 40);
}
