/**
 * Search catalog for representative cards matching synthetic fragment oracle text.
 */
import { readFileSync } from "node:fs";
import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex, combinedGoldenOracleText } from "./lib/load-golden-catalog-index";
import { NEW_MULTIFACE_CASES, NEW_MULTIFACE_V5_CASES } from "./oracle-action-eval-multiface-cases";

loadEnvLocal();

function searchCatalog(catalog: Awaited<ReturnType<typeof loadGoldenCatalogIndex>>, needle: string, layout?: string) {
  const lower = needle.toLowerCase();
  const hits: Array<{ name: string; layout?: string; oracleId: string; snippet: string }> = [];
  for (const card of catalog.byOracleId.values()) {
    const text = combinedGoldenOracleText(card);
    if (!text.toLowerCase().includes(lower)) continue;
    if (layout && card.layout !== layout) continue;
    hits.push({
      name: card.canonicalName,
      layout: card.layout,
      oracleId: card.oracleId,
      snippet: text.slice(0, 120).replace(/\n/g, " "),
    });
  }
  return hits.slice(0, 5);
}

async function main() {
  const v10 = JSON.parse(readFileSync("data/oracle-action-eval-development-v10.json", "utf8"));
  const unresolved = JSON.parse(readFileSync("data/oracle-action-eval-development-v11.json", "utf8")).unresolvedCaseIds as string[];
  const catalog = await loadGoldenCatalogIndex();

  const multiface = [...NEW_MULTIFACE_CASES, ...NEW_MULTIFACE_V5_CASES];
  const multifaceById = new Map(multiface.map((c) => [c.id, c]));

  for (const id of unresolved) {
    const prior = v10.cases.find((c: { id: string }) => c.id === id);
    if (!prior) continue;
    const mf = multifaceById.get(id);
    const needles = mf
      ? [
          mf.expectedPrimitiveActions[0]?.evidenceContains ?? "",
          mf.oracleText.split("\n")[0],
        ].filter(Boolean)
      : [prior.oracleText.split("\n")[0], prior.expectedPrimitiveActions?.[0]?.evidenceContains].filter(Boolean);

    console.log(`\n=== ${id} (${prior.category}) layout=${prior.layout ?? "normal"} ===`);
    console.log(`text: ${prior.oracleText.slice(0, 100).replace(/\n/g, " | ")}`);
    for (const needle of needles.slice(0, 2)) {
      if (!needle || needle.length < 8) continue;
      const hits = searchCatalog(catalog, needle.slice(0, 40), prior.layout);
      console.log(`  needle "${needle.slice(0, 40)}": ${hits.map((h) => h.name).join(" | ") || "NONE"}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
