import type {
  MtgKnowledgeAuthorityTier,
  MtgKnowledgeCorpus,
  MtgKnowledgeSourceType,
} from "./types";

export type MtgRagSourceKey =
  | "glossary"
  | "colors"
  | "commander"
  | "comprehensive-rules"
  | "transcripts";

export interface MtgRagSourceDefinition {
  sourceKey: MtgRagSourceKey;
  sourceId: string;
  title: string;
  sourceType: MtgKnowledgeSourceType;
  authorityTier: MtgKnowledgeAuthorityTier;
  corpus: MtgKnowledgeCorpus;
  gcsSubdir: string;
  /** Preferred canonical filename, then fallbacks searched in the sources directory. */
  candidateFilenames: string[];
  /** Optional companion files uploaded alongside the primary file. */
  companionFilenames?: string[];
  /** Glob-style suffix match for multi-file sources (transcripts). */
  filenamePattern?: RegExp;
  transcriptTopic?: string;
}

export const MTG_RAG_TRANSCRIPT_FILES: Array<{
  filename: string;
  topic: string;
}> = [
  { filename: "deckbuilding101.txt", topic: "foundational deck construction" },
  {
    filename: "formulabehindmagic.txt",
    topic: "deck-building formulas and ratios",
  },
  { filename: "powerandthestack.txt", topic: "stack and priority fundamentals" },
  {
    filename: "scryfallreference.txt",
    topic: "how to use Scryfall for card lookup",
  },
  {
    filename: "whatmtgcolorareyou.txt",
    topic: "color pie and color identity education",
  },
  {
    filename: "quadrant-theory.txt",
    topic: "quadrant theory and card evaluation in Commander",
  },
  { filename: "buffs.txt", topic: "combat buffs and team pump effects" },
  {
    filename: "commanderdeckbuildingmath.txt",
    topic: "Commander mana curve and deck ratios",
  },
  { filename: "counterweight.txt", topic: "politics and threat assessment" },
  {
    filename: "hiddencommander.txt",
    topic: "hidden commander and alternate win lines",
  },
  {
    filename: "usingoracle.txt",
    topic: "how to interpret Oracle text",
  },
  {
    filename: "usingscryfall.txt",
    topic: "how to use Scryfall (not live card data)",
  },
  {
    filename: "archetypesofcommander.txt",
    topic: "Commander deck archetypes and strategy labels",
  },
  {
    filename: "bracket4commander.txt",
    topic: "Commander power brackets and bracket 4 play",
  },
  {
    filename: "creativedeckbuilding.txt",
    topic: "creative Commander deck building and themes",
  },
  { filename: "ramping.txt", topic: "mana ramp in Commander decks" },
];

export const MTG_RAG_SOURCE_DEFINITIONS: MtgRagSourceDefinition[] = [
  {
    sourceKey: "glossary",
    sourceId: "curated-glossary-v1",
    title: "MTG RAG Glossary — Slang and Terminology",
    sourceType: "curated_glossary",
    authorityTier: "curated_internal",
    corpus: "glossary",
    gcsSubdir: "curated/glossary",
    candidateFilenames: [
      "mtg_rag_glossary_500.jsonl",
      "mtg_rag_glossary_500.csv",
    ],
    companionFilenames: ["manifest.json", "validation.json", "README.md"],
  },
  {
    sourceKey: "colors",
    sourceId: "curated-colors-v1",
    title: "MTG Color and Faction Combination Records",
    sourceType: "curated_color_identity",
    authorityTier: "curated_internal",
    corpus: "color_identity",
    gcsSubdir: "curated/colors",
    candidateFilenames: [
      "mtg_color_faction_30.jsonl",
      "mtg_color_faction_30.csv",
    ],
    companionFilenames: ["manifest.json", "validation.json", "README.md"],
  },
  {
    sourceKey: "commander",
    sourceId: "curated-commander-primers-v1",
    title: "MTG Commander Primer Corpus — 75 Primers",
    sourceType: "curated_commander_primer",
    authorityTier: "curated_internal",
    corpus: "commander_primer",
    gcsSubdir: "curated/commander",
    candidateFilenames: [
      "mtg_commander_primers_75.jsonl",
      "mtg_commander_primers_75.csv",
    ],
    companionFilenames: [
      "INDEX.md",
      "all_commander_primers_75.md",
      "manifest.json",
      "validation.json",
      "README.md",
    ],
  },
  {
    sourceKey: "comprehensive-rules",
    sourceId: "official-comprehensive-rules",
    title: "Magic: The Gathering Comprehensive Rules",
    sourceType: "official_comprehensive_rules",
    authorityTier: "official_rules",
    corpus: "comprehensive_rules",
    gcsSubdir: "rules",
    candidateFilenames: ["mtg-comprehensive-rules.txt"],
  },
];

export function transcriptSourceId(filename: string): string {
  const stem = filename.replace(/\.txt$/i, "");
  return `transcript-${stem}`;
}

export function transcriptSourceDefinition(filename: string, topic: string) {
  return {
    sourceKey: "transcripts" as const,
    sourceId: transcriptSourceId(filename),
    title: `YouTube transcript — ${filename}`,
    sourceType: "community_transcript" as const,
    authorityTier: "community_education" as const,
    corpus: "youtube_transcript" as const,
    gcsSubdir: "transcripts",
    candidateFilenames: [filename],
    transcriptTopic: topic,
  };
}

export function allSourceDefinitions(): Array<
  MtgRagSourceDefinition & { transcriptTopic?: string }
> {
  const transcripts = MTG_RAG_TRANSCRIPT_FILES.map(({ filename, topic }) =>
    transcriptSourceDefinition(filename, topic),
  );
  return [...MTG_RAG_SOURCE_DEFINITIONS, ...transcripts];
}

export function sourceDefinitionForKey(
  sourceKey: MtgRagSourceKey,
): MtgRagSourceDefinition[] {
  if (sourceKey === "transcripts") {
    return MTG_RAG_TRANSCRIPT_FILES.map(({ filename, topic }) =>
      transcriptSourceDefinition(filename, topic),
    );
  }
  return MTG_RAG_SOURCE_DEFINITIONS.filter((d) => d.sourceKey === sourceKey);
}
