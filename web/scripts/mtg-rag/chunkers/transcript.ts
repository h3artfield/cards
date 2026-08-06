import { readFileSync } from "fs";
import { buildChunkDraft } from "../lib/chunk-build";
import { estimateTokenCount, splitToMaxEmbedSize } from "../lib/token-estimate";
import type { ChunkerContext, ChunkerResult } from "./types";

const TARGET_TOKENS = 550;
const OVERLAP_CHARS = 400;

function cleanTranscript(text: string): string {
  return text
    .replace(/\[\/?(?:music|laughter|applause|clears throat)\]/gi, " ")
    .replace(/\(\/?(?:music|laughter|applause)\)/gi, " ")
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 80);
}

function chunkParagraphs(paragraphs: string[]): string[] {
  const out: string[] = [];
  let current = "";
  let overlapTail = "";

  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;
    if (estimateTokenCount(candidate) > TARGET_TOKENS && current) {
      out.push(current);
      overlapTail = current.slice(-OVERLAP_CHARS);
      current = overlapTail ? `${overlapTail}\n\n${para}` : para;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

export async function chunkTranscript(
  ctx: ChunkerContext & { transcriptTopic?: string },
): Promise<ChunkerResult> {
  const raw = readFileSync(ctx.localPath, "utf8");
  const cleaned = cleanTranscript(raw);
  const paragraphs = splitParagraphs(raw);
  const merged =
    paragraphs.length > 0 ? chunkParagraphs(paragraphs) : [cleaned];
  const bodies = merged.flatMap((body) => splitToMaxEmbedSize(body)).filter(Boolean);

  const transcriptName = ctx.filename;
  const topic = ctx.transcriptTopic ?? "community education";

  const chunks = bodies.map((body, index) => {
    const retrievalText = [
      `Transcript: ${transcriptName}`,
      `Topic: ${topic}`,
      `Authority: community_education`,
      body,
    ].join("\n\n");

    return buildChunkDraft({
      sourceId: ctx.sourceId,
      corpus: "youtube_transcript",
      authorityTier: "community_education",
      title: transcriptName.replace(/\.txt$/i, ""),
      sectionTitle: topic,
      sectionPath: `transcript/${transcriptName}/chunk-${index}`,
      text: body,
      retrievalText,
      chunkIndex: index,
      citationLabel: `Transcript: ${transcriptName}`,
      sourceLocator: `${transcriptName}#${index}`,
      transcriptName,
      transcriptTopic: topic,
      tags: [topic],
    });
  });

  return { chunks, aliasCount: 0 };
}
