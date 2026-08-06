import { parseCsvRecords, splitCommaList, splitPipeList } from "../lib/csv-records";
import { aliasEntriesFromTerms, buildChunkDraft } from "../lib/chunk-build";
import type { ChunkerContext, ChunkerResult } from "./types";

export async function chunkColorIdentity(ctx: ChunkerContext): Promise<ChunkerResult> {
  const records = parseCsvRecords(ctx.localPath);
  const chunks = records.map((row, index) => {
    const name = row.primary_name ?? row.display_name ?? `color-${index}`;
    const aliases = [
      name,
      row.canonical_faction,
      row.canonical_order,
      ...splitPipeList(row.aliases),
    ].filter(Boolean) as string[];

    const retrievalText =
      row.rag_text?.trim() ||
      `${name} (${row.canonical_order ?? ""}). ${row.philosophy_summary ?? ""}`;

    return buildChunkDraft({
      sourceId: ctx.sourceId,
      corpus: "color_identity",
      authorityTier: "curated_internal",
      title: name,
      sectionTitle: row.family,
      sectionPath: `color/${row.record_id ?? name}`,
      text: retrievalText,
      retrievalText,
      chunkIndex: index,
      citationLabel: `Color identity: ${name}`,
      sourceLocator: row.record_id ?? name,
      aliasesForIndex: aliases,
      normalizedTerms: [row.canonical_order, row.primary_name].filter(Boolean) as string[],
      keywords: splitPipeList(row.retrieval_keywords),
      tags: [row.family, row.faction_type].filter(Boolean) as string[],
      colorIdentity: splitCommaList(row.colors),
    });
  });

  const aliasCount = chunks.reduce(
    (n, c) =>
      n +
      aliasEntriesFromTerms({
        terms: c.aliasesForIndex ?? [],
        corpus: "color_identity",
        chunkId: c.chunkId,
        sourceId: ctx.sourceId,
      }).length,
    0,
  );

  return { chunks, aliasCount };
}
