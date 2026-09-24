import { loadProjectEnvLocal } from "./lib/script-env";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { resolveBenchmarkCommanderName } from "../src/lib/deck-synthesis/benchmark-commander-resolver-v1";

loadProjectEnvLocal();

const names = [
  "Fíli the Pathfinder",
  "Grand Marshal Macie",
  "Golos, Tireless Pilgrim",
  "Mr. Wiggles, Helpful Butterfly",
  "Amy Pond",
  "Auntie Flint",
];

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  for (const name of names) {
    const r = resolveBenchmarkCommanderName(catalog, name);
    const card = r.oracleId ? catalog.byOracleId.get(r.oracleId) : null;
    const paper = r.oracleId ? catalog.paperByOracleId.get(r.oracleId) : null;
    console.log(
      JSON.stringify({
        name,
        oracleId: r.oracleId,
        legalities: card?.legalities,
        releaseInformation: card?.releaseInformation,
        paper,
        nonCompetitive: catalog.nonCompetitiveOracleReasons.get(r.oracleId ?? ""),
      }),
    );
  }
}

main().catch(console.error);
