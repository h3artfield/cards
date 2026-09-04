/**
 * Offline proof of the bracket ceiling pass.
 *
 * The nine-build measurement showed the builder no longer undershoots but does
 * overshoot: Omnath asked for Core and produced an Optimized list, driven by a
 * two-card infinite combo. This replays the saved builds against *lower*
 * bracket requests than they were built for, which is exactly the overshoot
 * case, and reports whether the pass brings them back down.
 *
 * No model calls, so it is repeatable and free.
 */
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { resolve } from "node:path";
import { containRequestedBracketV1 } from "../src/lib/deck-synthesis/professor-sol-directed-bracket-ceiling-server-v1";
import { getSemanticMapPoint } from "../src/lib/semantic-visualization/artifact-loader";
import { commanderLegalInIdentity } from "../src/lib/semantic-visualization/filters-v1";
import { isLandType } from "../src/lib/deck-swap/v1/upgrade-candidates-server";
import { playRateFor } from "../src/lib/deck-swap/v1/play-rate-server";
import type { BracketRubricCard } from "../src/lib/commander-bracket-rubric/v1";
import type { CommanderBracket } from "../src/lib/bracket-policy/bracket-policy-v1";
import type {
  BracketCeilingNonlandV1,
  BracketCeilingReplacementSourceV1,
} from "../src/lib/deck-synthesis/professor-sol-directed-bracket-ceiling-server-v1";

/** Each saved build, replayed against the brackets a user might have asked for. */
const ARTIFACTS: Array<{ file: string; requestedBrackets: CommanderBracket[] }> = [
  { file: ".chatterfang-speed-test-result2.json", requestedBrackets: [2, 3] },
  { file: ".omnath-after-fix.json", requestedBrackets: [2, 3] },
  { file: ".kodama-speed-test-result3.json", requestedBrackets: [2, 3] },
];

const RC8_PATH = "data/milestones/catalog-shadow/catalog-shadow-parse-rc8-firestore-v2.jsonl.gz";

type OracleEntry = { oracleId: string; name: string; text: string; typeLine: string };

function loadEnvLocal(): void {
  for (const rel of [".env.local", "web/.env.local"]) {
    const path = resolve(process.cwd(), rel);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

const normalize = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

async function loadOracleIndex(): Promise<{
  byName: Map<string, OracleEntry>;
  byOracleId: Map<string, OracleEntry>;
}> {
  const byName = new Map<string, OracleEntry>();
  const byOracleId = new Map<string, OracleEntry>();
  const rl = createInterface({
    input: createReadStream(resolve(process.cwd(), RC8_PATH)).pipe(createGunzip()),
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line) as {
      oracleId?: string;
      canonicalName?: string;
      typeLine?: string;
      semantic?: { abilities?: Array<{ abilitySpan?: { text?: string } }> };
    };
    if (!rec.oracleId || !rec.canonicalName) continue;
    const entry: OracleEntry = {
      oracleId: rec.oracleId,
      name: rec.canonicalName,
      typeLine: rec.typeLine ?? "",
      text: (rec.semantic?.abilities ?? [])
        .map((ability) => ability.abilitySpan?.text ?? "")
        .filter(Boolean)
        .join(" "),
    };
    byName.set(normalize(rec.canonicalName), entry);
    byOracleId.set(rec.oracleId, entry);
  }
  return { byName, byOracleId };
}

async function main(): Promise<void> {
  loadEnvLocal();
  const { byName, byOracleId } = await loadOracleIndex();
  console.log(`${byName.size} cards indexed\n`);

  const summary: Array<{
    commander: string;
    requested: number;
    before: number;
    after: number;
    cuts: number;
    contained: boolean;
  }> = [];

  for (const artifact of ARTIFACTS) {
    const path = resolve(process.cwd(), artifact.file);
    if (!existsSync(path)) {
      console.log(`${artifact.file}: not present locally, skipping\n`);
      continue;
    }
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    const deck = parsed.result?.constructedDeck;
    if (!deck) {
      console.log(`${artifact.file}: no constructedDeck, skipping\n`);
      continue;
    }

    // Live, the pass draws replacements from the candidate dictionary: cards the
    // Constructor retrieved but did not use, already registered for validation.
    // These saved artifacts only kept a hash of that universe, so the proof
    // stands in an equivalent pool — in-identity, commander-legal, non-land —
    // which exercises the same selection logic on a comparable set.
    const usedNames = new Set<string>(
      [...(deck.nonlands ?? []), ...(deck.lands ?? [])].map((row: { name: string }) =>
        normalize(row.name),
      ),
    );
    const commanderIdentity: string[] = deck.commander?.colorIdentity ?? [];
    const replacementPool: BracketCeilingReplacementSourceV1[] = [];
    for (const entry of byOracleId.values()) {
      if (usedNames.has(normalize(entry.name))) continue;
      const point = getSemanticMapPoint(entry.oracleId);
      if (!point) continue;
      if (isLandType(point.types)) continue;
      if (!commanderLegalInIdentity(point.colorIdentity, commanderIdentity)) continue;
      replacementPool.push({
        oracleId: entry.oracleId,
        name: entry.name,
        oracleText: entry.text,
        typeLine: entry.typeLine,
      });
    }
    replacementPool.sort(
      (a, b) => (playRateFor(b.oracleId)?.rate ?? 0) - (playRateFor(a.oracleId)?.rate ?? 0),
    );
    replacementPool.length = Math.min(replacementPool.length, 400);

    for (const requestedBracket of artifact.requestedBrackets) {
      const cards: BracketRubricCard[] = [];
      const nonlands: BracketCeilingNonlandV1[] = [];
      const push = (row: { name: string; copies?: number }, isCommander: boolean) => {
        const hit = byName.get(normalize(row.name));
        if (!hit) return null;
        cards.push({
          oracleId: hit.oracleId,
          name: hit.name,
          typeLine: hit.typeLine,
          oracleText: hit.text,
          quantity: row.copies ?? 1,
          isCommander,
        });
        return hit;
      };

      push({ name: deck.commander.name }, true);
      for (const row of deck.nonlands ?? []) {
        const hit = push(row, false);
        if (!hit) continue;
        nonlands.push({
          oracleId: hit.oracleId,
          name: hit.name,
          primaryArchitectRequirement: row.primaryArchitectRequirement ?? "",
        });
      }
      for (const row of deck.lands ?? []) push(row, false);

      // A basic the deck already runs, so replacing a land with it cannot
      // introduce a colour the mana base was not already producing.
      const basicRow = (deck.lands ?? []).find((row: { name: string }) =>
        ["Forest", "Island", "Swamp", "Mountain", "Plains"].includes(row.name),
      );
      const basicEntry = basicRow ? byName.get(normalize(basicRow.name)) : undefined;

      const outcome = await containRequestedBracketV1({
        cards,
        nonlands,
        requestedBracket,
        replacementPool,
        basicLandReplacement: basicEntry
          ? { oracleId: basicEntry.oracleId, name: basicEntry.name }
          : null,
      });

      const before = outcome.measuredBefore.assignedBracket;
      const after = outcome.measuredAfter?.assignedBracket ?? before;
      console.log(`${deck.commander.name} — requested ${requestedBracket}`);
      console.log(`  measured before: ${before}  after: ${after}  contained: ${outcome.contained}`);
      console.log(`  pool available: ${replacementPool.length} unused candidates`);
      if (outcome.plan.swaps.length > 0) {
        for (const swap of outcome.plan.swaps) {
          const replacement = swap.isLandSwap
            ? `${swap.basicLand?.name ?? "(no basic)"} (land)`
            : `${swap.add?.name ?? "(no replacement)"}${swap.roleMatched ? "" : " (role mismatch)"}`;
          console.log(`  cut ${swap.cut.name} [${swap.cut.reasons.join(",")}] -> ${replacement}`);
        }
      } else {
        console.log("  no swaps planned");
      }
      for (const shortfall of outcome.plan.unresolved) {
        console.log(`  UNRESOLVED ${shortfall.signalId}: ${shortfall.reason}`);
      }
      for (const note of outcome.notes) console.log(`  note: ${note}`);
      console.log("");

      summary.push({
        commander: deck.commander.name,
        requested: requestedBracket,
        before,
        after,
        cuts: outcome.appliedSwaps.length,
        contained: outcome.contained,
      });
    }
  }

  console.log("=".repeat(88));
  console.log("commander                  req  before  after  cuts  contained");
  for (const row of summary) {
    console.log(
      `${row.commander.slice(0, 24).padEnd(24)}  ${String(row.requested).padStart(3)}  ${String(row.before).padStart(6)}  ${String(row.after).padStart(5)}  ${String(row.cuts).padStart(4)}  ${row.contained}`,
    );
  }
  const contained = summary.filter((r) => r.contained).length;
  console.log(`\ncontained ${contained}/${summary.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
