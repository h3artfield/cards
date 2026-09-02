import type { MtgKnowledgeCorpus } from "./types";
import type { HybridRetrievalMode } from "./hybrid-retrieval";

/** Mode-specific searchable corpora — authoritative for Professor retrieval modes. */
const MODE_CORPORA: Record<HybridRetrievalMode, MtgKnowledgeCorpus[]> = {
  RULES: ["comprehensive_rules"],
  TERMINOLOGY: ["glossary"],
  STRATEGY: ["youtube_transcript", "glossary"],
  COMMANDER_PRIMER: ["commander_primer", "youtube_transcript"],
  PACKAGE: ["youtube_transcript", "commander_primer", "glossary"],
  INTERACTION: ["comprehensive_rules", "glossary", "youtube_transcript"],
};

export function corporaForRetrievalMode(mode: HybridRetrievalMode): MtgKnowledgeCorpus[] {
  return MODE_CORPORA[mode];
}
