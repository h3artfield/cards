import type { MtgKnowledgeSourceType } from "../../../src/lib/mtg-rag/types";
import type { MtgRagSourceDefinition } from "../../../src/lib/mtg-rag/source-definitions";
import { chunkColorIdentity } from "./colorIdentity";
import { chunkCommanderPrimer } from "./commanderPrimer";
import { chunkComprehensiveRules } from "./comprehensiveRules";
import { chunkGlossary } from "./glossary";
import { chunkTranscript } from "./transcript";
import type { ChunkerContext, ChunkerResult, MtgRagChunker } from "./types";

export function chunkerForSourceType(
  sourceType: MtgKnowledgeSourceType,
): MtgRagChunker {
  switch (sourceType) {
    case "curated_glossary":
      return chunkGlossary;
    case "curated_color_identity":
      return chunkColorIdentity;
    case "curated_commander_primer":
      return chunkCommanderPrimer;
    case "official_comprehensive_rules":
      return chunkComprehensiveRules;
    case "community_transcript":
      return chunkTranscript as MtgRagChunker;
    default:
      throw new Error(`No chunker for source type: ${sourceType}`);
  }
}

export async function runChunker(
  def: MtgRagSourceDefinition & { transcriptTopic?: string },
  ctx: ChunkerContext,
): Promise<ChunkerResult> {
  const chunker = chunkerForSourceType(def.sourceType);
  if (def.sourceType === "community_transcript") {
    return chunkTranscript({ ...ctx, transcriptTopic: def.transcriptTopic });
  }
  return chunker(ctx);
}

export type { ChunkDraft, ChunkerContext, ChunkerResult } from "./types";
export { chunkColorIdentity } from "./colorIdentity";
export { chunkCommanderPrimer } from "./commanderPrimer";
export { chunkComprehensiveRules } from "./comprehensiveRules";
export { chunkGlossary } from "./glossary";
export { chunkTranscript } from "./transcript";
