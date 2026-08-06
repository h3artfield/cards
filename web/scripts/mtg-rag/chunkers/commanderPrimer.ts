import { parseCsvRecords, splitCommaList } from "../lib/csv-records";
import { buildChunkDraft } from "../lib/chunk-build";
import type { ChunkerContext, ChunkerResult } from "./types";

const SECTIONS: Array<{
  key: string;
  title: string;
  fields: string[];
}> = [
  {
    key: "overview",
    title: "Overview and game plan",
    fields: ["overview", "core_plan", "early_game", "mid_game", "late_game"],
  },
  {
    key: "packages",
    title: "Mulligans and packages",
    fields: [
      "mulligan_priorities",
      "ramp_package",
      "card_advantage_package",
      "interaction_package",
      "protection_and_resilience",
    ],
  },
  {
    key: "engines",
    title: "Engines and win conditions",
    fields: ["core_engines_and_synergies", "win_conditions"],
  },
  {
    key: "traps",
    title: "Weaknesses and budget",
    fields: [
      "common_weaknesses",
      "common_build_traps",
      "suggested_starting_shell",
      "budget_notes",
      "table_expectation_note",
    ],
  },
];

function sectionText(row: Record<string, string>, fields: string[]): string {
  return fields
    .map((f) => row[f])
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export async function chunkCommanderPrimer(ctx: ChunkerContext): Promise<ChunkerResult> {
  const records = parseCsvRecords(ctx.localPath);
  const chunks = [];

  for (const row of records) {
    const commander = row.commander ?? row.primer_id ?? "unknown";
    const colors = row.color_identity_text ?? row.color_names ?? "";
    const archetypes = row.archetypes ?? "";
    let chunkIndex = 0;

    for (const section of SECTIONS) {
      const body = sectionText(row, section.fields);
      if (!body) continue;

      const prefix = [
        `Commander: ${commander}`,
        colors ? `Colors: ${colors}` : "",
        archetypes ? `Archetypes: ${archetypes}` : "",
        `Section: ${section.title}`,
      ]
        .filter(Boolean)
        .join("\n");

      const retrievalText = `${prefix}\n\n${body}`;

      chunks.push(
        buildChunkDraft({
          sourceId: ctx.sourceId,
          corpus: "commander_primer",
          authorityTier: "curated_internal",
          title: `${commander} — ${section.title}`,
          sectionTitle: section.title,
          sectionPath: `commander/${row.primer_id ?? commander}/${section.key}`,
          text: body,
          retrievalText,
          chunkIndex: chunkIndex++,
          citationLabel: `Commander primer: ${commander} (${section.title})`,
          sourceLocator: row.primer_id ?? commander,
          commander,
          colorIdentity: splitCommaList(colors.replace(/\|/g, ",")),
          archetypes: splitCommaList(archetypes),
          keywords: splitCommaList(row.retrieval_keywords),
          aliasesForIndex: [commander, ...(row.alternate_names ? [row.alternate_names] : [])],
        }),
      );
    }
  }

  return { chunks, aliasCount: chunks.length * 2 };
}
