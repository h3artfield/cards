/**
 * Read-only audit of the commander picker's universe against live Firestore.
 *
 * The picker once sourced its universe from the EDHREC popularity list, which
 * covers a few hundred commanders, so most legal commanders were invisible.
 * This measures the pool the picker actually exposes and asserts that the
 * commanders reported missing are reachable by searching for them.
 *
 * Run: npm run audit:professor-commander-pool-v1
 */
import { loadEnvLocal } from "./lib/script-env";
import {
  getProfessorCommanderPoolSizeV1,
  searchProfessorCommandersV1,
} from "../src/lib/deck-synthesis/professor-commander-search-service-v1";

loadEnvLocal();

/**
 * What the store owner typed, paired with the catalog name they expected. "Lord
 * Xander, the Wicked" was reported from memory; the printed card is "Lord
 * Xander, the Collector".
 */
const REPORTED_MISSING: Array<{ query: string; expect: string }> = [
  { query: "Lord Xander", expect: "Lord Xander, the Collector" },
  { query: "Perrie", expect: "Perrie, the Pulverizer" },
  { query: "Raffine", expect: "Raffine, Scheming Seer" },
  { query: "Radagast", expect: "Radagast the Brown" },
  { query: "Captain America", expect: "Captain America, First Avenger" },
  { query: "Shredder", expect: "Shredder, Unrelenting" },
  { query: "Volrath", expect: "Volrath the Fallen" },
  { query: "Atraxa", expect: "Atraxa, Grand Unifier" },
  { query: "Teysa", expect: "Teysa, Envoy of Ghosts" },
  { query: "Teysa", expect: "Teysa, Opulent Oligarch" },
  { query: "Thorin", expect: "Thorin, King of Durin's Folk" },
];

async function main() {
  const poolSize = await getProfessorCommanderPoolSizeV1();
  const browse = await searchProfessorCommandersV1("");

  console.log("Professor commander pool audit\n");
  console.log(`Pool size (paper-eligible sole commanders): ${poolSize}`);
  console.log(`Empty-query browse window returned:         ${browse.results.length}`);
  console.log(`Empty-query reported total:                 ${browse.total}`);
  const ranked = browse.results.filter((r) => r.rank !== undefined).length;
  console.log(`Browse window entries with an EDHREC rank:  ${ranked}\n`);

  let failed = 0;
  for (const { query, expect } of REPORTED_MISSING) {
    const { results, total } = await searchProfessorCommandersV1(query);
    const hit = results.find((r) => r.name === expect);
    if (!hit) {
      failed += 1;
      console.error(`FAIL  "${query}" -> ${total} matches, none named "${expect}"`);
      continue;
    }
    const position = results.indexOf(hit) + 1;
    console.log(
      `ok    "${query}" -> ${total} matches; "${expect}" at #${position}` +
        ` (${hit.rank === undefined ? "no EDHREC rank" : `EDHREC rank ${hit.rank}`})`,
    );
  }

  if (poolSize < 2000) {
    failed += 1;
    console.error(
      `\nFAIL  pool size ${poolSize} is far below the ~3,200 legal sole commanders in Magic —` +
        ` the picker is still sourcing its universe from something incomplete.`,
    );
  }

  console.log(`\n${REPORTED_MISSING.length - failed} checks passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
