import { FieldPath } from "firebase-admin/firestore";
import { COLLECTIONS } from "../firebase/collections";
import { requireFirestore } from "../firebase/admin";
import { chunkHasExactCommanderField, chunkHasExactGlossaryTitle, chunkHasExactRuleCitation } from "./retrieval-match-tiers";
import {
  chunkMatchesCommanderName,
  chunkMatchesNamedKeyword,
  extractLexicalRetrievalSignals,
} from "./retrieval-lexical-signals";
import type { MtgKnowledgeChunk, MtgKnowledgeCorpus } from "./types";

const PAGE_SIZE = 200;
const DEFAULT_LEXICAL_CANDIDATE_CAP = 24;

async function paginateActiveCorpusChunks(corpus: MtgKnowledgeCorpus): Promise<MtgKnowledgeChunk[]> {
  const db = requireFirestore();
  const col = db.collection(COLLECTIONS.mtgKnowledgeChunks);
  const chunks: MtgKnowledgeChunk[] = [];
  let last: FirebaseFirestore.DocumentSnapshot | undefined;

  while (true) {
    let q = col
      .where("active", "==", true)
      .where("corpus", "==", corpus)
      .orderBy(FieldPath.documentId())
      .limit(PAGE_SIZE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      chunks.push(doc.data() as MtgKnowledgeChunk);
    }
    last = snap.docs[snap.docs.length - 1];
  }

  return chunks;
}

function corporaForLexicalScan(
  corpora: MtgKnowledgeCorpus[],
  signals: ReturnType<typeof extractLexicalRetrievalSignals>,
): MtgKnowledgeCorpus[] {
  const out = new Set<MtgKnowledgeCorpus>();

  if (signals.hasExplicitRuleReference && corpora.includes("comprehensive_rules")) {
    out.add("comprehensive_rules");
  }

  if (signals.keywordTerms.length > 0) {
    if (corpora.includes("comprehensive_rules")) out.add("comprehensive_rules");
    if (corpora.includes("glossary")) out.add("glossary");
  }

  if (signals.namedGlossaryTerms.length > 0 && corpora.includes("glossary")) {
    out.add("glossary");
  }

  if (signals.commanderNames.length > 0 && corpora.includes("commander_primer")) {
    out.add("commander_primer");
  }

  return [...out];
}

function chunkMatchesLexicalSignals(
  chunk: MtgKnowledgeChunk,
  signals: ReturnType<typeof extractLexicalRetrievalSignals>,
): boolean {
  if (signals.ruleReferences.some((ref) => chunkHasExactRuleCitation(chunk, ref))) {
    return true;
  }

  if (signals.namedGlossaryTerms.some((term) => chunkHasExactGlossaryTitle(chunk, term))) {
    return true;
  }

  if (
    chunk.corpus === "commander_primer" &&
    signals.commanderNames.some((name) => chunkHasExactCommanderField(chunk, name))
  ) {
    return true;
  }

  if (signals.ruleReferences.some((ref) => {
    const normalized = ref.toLowerCase();
    const text = chunk.retrievalText.toLowerCase();
    return text.includes(`${normalized}.`) || text.includes(`${normalized} `);
  })) {
    return true;
  }

  if (signals.namedGlossaryTerms.some((term) => chunkMatchesNamedKeyword(chunk, term))) {
    return true;
  }

  if (
    chunk.corpus === "commander_primer" &&
    signals.commanderNames.some((name) => chunkMatchesCommanderName(chunk, name))
  ) {
    return true;
  }

  if (signals.keywordTerms.some((term) => chunkMatchesNamedKeyword(chunk, term))) {
    return true;
  }

  return false;
}

/**
 * Deterministic full-corpus lexical scan for explicit CR refs, named keywords, and commander names.
 * Independent of vector top-N — unions with vector candidates downstream.
 */
export async function lexicalRetrieveMtgCandidates(input: {
  question: string;
  corpora: MtgKnowledgeCorpus[];
  commanderName?: string;
  maxCandidates?: number;
}): Promise<MtgKnowledgeChunk[]> {
  const signals = extractLexicalRetrievalSignals({
    query: input.question,
    commanderName: input.commanderName,
  });

  const scanCorpora = corporaForLexicalScan(input.corpora, signals);
  if (scanCorpora.length === 0) return [];

  const cap = input.maxCandidates ?? DEFAULT_LEXICAL_CANDIDATE_CAP;
  const seen = new Set<string>();
  const matches: MtgKnowledgeChunk[] = [];

  for (const corpus of scanCorpora) {
    const chunks = await paginateActiveCorpusChunks(corpus);
    for (const chunk of chunks) {
      if (seen.has(chunk.chunkId)) continue;
      if (!chunkMatchesLexicalSignals(chunk, signals)) continue;
      seen.add(chunk.chunkId);
      matches.push(chunk);
      if (matches.length >= cap) return matches;
    }
  }

  return matches;
}
