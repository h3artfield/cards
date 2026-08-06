import { readFileSync } from "fs";
import { parseCsvRecords, splitPipeList } from "../lib/csv-records";
import { aliasEntriesFromTerms, buildChunkDraft } from "../lib/chunk-build";
import type { ChunkerContext, ChunkerResult } from "./types";

export async function chunkGlossary(ctx: ChunkerContext): Promise<ChunkerResult> {
  const records = parseCsvRecords(ctx.localPath);
  const chunks = records.map((row, index) => {
    const term = row.term ?? row.normalized_term ?? `term-${index}`;
    const aliases = [
      term,
      row.normalized_term,
      ...splitPipeList(row.aliases),
    ].filter(Boolean) as string[];

    const retrievalText =
      row.rag_text?.trim() ||
      `Term: ${term}. Definition: ${row.definition ?? ""}. Category: ${row.category ?? ""}.`;

    return buildChunkDraft({
      sourceId: ctx.sourceId,
      corpus: "glossary",
      authorityTier: "curated_internal",
      title: term,
      sectionTitle: row.category,
      sectionPath: `glossary/${row.id ?? term}`,
      text: retrievalText,
      retrievalText,
      chunkIndex: index,
      citationLabel: `Glossary: ${term}`,
      sourceLocator: row.id ?? term,
      aliasesForIndex: aliases,
      normalizedTerms: [row.normalized_term].filter(Boolean) as string[],
      keywords: splitPipeList(row.retrieval_keywords),
      tags: [row.category, row.designation].filter(Boolean) as string[],
    });
  });

  const aliasCount = chunks.reduce(
    (n, c) => n + aliasEntriesFromTerms({
      terms: c.aliasesForIndex ?? [],
      corpus: "glossary",
      chunkId: c.chunkId,
      sourceId: ctx.sourceId,
    }).length,
    0,
  );

  return { chunks, aliasCount };
}
