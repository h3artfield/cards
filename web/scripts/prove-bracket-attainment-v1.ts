/**
 * Offline proof of the bracket attainment pass.
 *
 * Runs against the three saved sol-directed builds whose measured bracket fell
 * short of the request, and reports whether the pass closes the gap. No model
 * calls, so this is repeatable and free.
 */
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { resolve } from "node:path";
import { attainRequestedBracketV1 } from "../src/lib/deck-synthesis/professor-sol-directed-bracket-attainment-server-v1";
import { applyBracketAttainmentV111 } from "../src/lib/deck-synthesis/professor-sol-directed-bracket-attainment-apply-v1-1-1";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { isCanonicalLandForDeckPartition } from "../src/lib/deck-synthesis/professor-canonical-deck-partition-v1";
import { resolveCanonicalCardTruthV4164 } from "../src/lib/deck-synthesis/professor-canonical-card-truth-v4-16-4-v1";
import type { BracketRubricCard } from "../src/lib/commander-bracket-rubric/v1";
import type { CommanderBracket } from "../src/lib/bracket-policy/bracket-policy-v1";
import type { BracketAttainmentNonlandV1 } from "../src/lib/deck-synthesis/professor-sol-directed-bracket-attainment-server-v1";

const ARTIFACTS: Array<{ file: string; requestedBracket: CommanderBracket }> = [
  { file: ".chatterfang-speed-test-result2.json", requestedBracket: 3 },
  { file: ".omnath-after-fix.json", requestedBracket: 4 },
  { file: ".kodama-speed-test-result3.json", requestedBracket: 4 },
];

const RC8_PATH = "data/milestones/catalog-shadow/catalog-shadow-parse-rc8-firestore-v2.jsonl.gz";

type OracleEntry = { oracleId: string; name: string; text: string };

/** The deck catalog reads from Firestore, so credentials come from .env.local. */
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

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

async function loadOracleTextByName(): Promise<Map<string, OracleEntry>> {
  const byName = new Map<string, OracleEntry>();
  const rl = createInterface({
    input: createReadStream(resolve(process.cwd(), RC8_PATH)).pipe(createGunzip()),
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line) as {
      oracleId?: string;
      canonicalName?: string;
      semantic?: { abilities?: Array<{ abilitySpan?: { text?: string } }> };
    };
    if (!rec.oracleId || !rec.canonicalName) continue;
    const text = (rec.semantic?.abilities ?? [])
      .map((ability) => ability.abilitySpan?.text ?? "")
      .filter(Boolean)
      .join(" ");
    byName.set(normalize(rec.canonicalName), { oracleId: rec.oracleId, name: rec.canonicalName, text });
  }
  return byName;
}

async function main(): Promise<void> {
  loadEnvLocal();
  const oracleByName = await loadOracleTextByName();
  console.log(`${oracleByName.size} cards indexed\n`);

  const summary: Array<{
    commander: string;
    requested: number;
    before: number;
    after: number;
    swaps: number;
    attained: boolean;
  }> = [];

  for (const artifact of ARTIFACTS) {
    const path = resolve(process.cwd(), artifact.file);
    if (!existsSync(path)) {
      console.log(`${artifact.file}: not present locally, skipping\n`);
      continue;
    }
    const deck = JSON.parse(readFileSync(path, "utf8")).result?.constructedDeck;
    if (!deck) {
      console.log(`${artifact.file}: no constructedDeck, skipping\n`);
      continue;
    }

    const cards: BracketRubricCard[] = [];
    const nonlands: BracketAttainmentNonlandV1[] = [];

    const push = (row: { name: string; copies?: number }, isCommander: boolean) => {
      const hit = oracleByName.get(normalize(row.name));
      if (!hit) return null;
      cards.push({
        oracleId: hit.oracleId,
        name: hit.name,
        typeLine: "",
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
        primaryArchitectRequirement: row.primaryArchitectRequirement ?? "unassigned",
      });
    }
    for (const row of deck.lands ?? []) push(row, false);

    const outcome = await attainRequestedBracketV1({
      cards,
      nonlands,
      commanderColorIdentity: deck.commander.colorIdentity ?? [],
      requestedBracket: artifact.requestedBracket,
      replaceableFlex: deck.replaceableFlex ?? [],
    });

    const before = outcome.measuredBefore.assignedBracket;
    const after = outcome.measuredAfter?.assignedBracket ?? before;

    console.log(`===== ${deck.commander.name} [${(deck.commander.colorIdentity ?? []).join("")}]`);
    console.log(`  requested bracket: ${artifact.requestedBracket}`);
    console.log(`  measured before:   ${before} (${outcome.measuredBefore.assignedBracketName})`);
    console.log(
      `  measured after:    ${after}${outcome.measuredAfter ? ` (${outcome.measuredAfter.assignedBracketName})` : " — no changes proposed"}`,
    );
    console.log(`  attained:          ${outcome.attained ? "YES" : "no"}`);
    console.log(
      `  plan:              target ${outcome.plan.targetGameChangerCount} Game Changer(s), shortfall ${outcome.plan.shortfall}, ${outcome.plan.swaps.length} swap(s)`,
    );
    for (const swap of outcome.plan.swaps) {
      console.log(`    - ${swap.cut.name}  ->  ${swap.add.name}${swap.roleMatched ? "" : "  [not role-matched]"}`);
      console.log(`      ${swap.reason}`);
    }
    for (const note of outcome.notes) console.log(`  note: ${note}`);
    if (outcome.measuredAfter) {
      console.log(
        `  reason after:      ${outcome.measuredAfter.determiningSignals.map((s) => `${s.label} (${s.count})`).join(" + ") || "no signal above Core"}`,
      );
    }
    console.log("");

    summary.push({
      commander: deck.commander.name,
      requested: artifact.requestedBracket,
      before,
      after,
      swaps: outcome.plan.swaps.length,
      attained: outcome.attained,
    });
  }

  // Second pass: exercise the module the build service actually calls, against
  // the real deck catalog. This is what catches a land Game Changer or an
  // oracle-id mismatch that the rubric alone would happily wave through.
  console.log("=".repeat(72));
  console.log("APPLYING TO REAL DECK OBJECTS (catalog-resolved)\n");
  const catalog = await loadDeckResolutionCatalog();
  for (const artifact of ARTIFACTS) {
    const path = resolve(process.cwd(), artifact.file);
    if (!existsSync(path)) continue;
    const deck = JSON.parse(readFileSync(path, "utf8")).result?.constructedDeck;
    if (!deck) continue;

    const applied = await applyBracketAttainmentV111({
      deck,
      catalog,
      candidateDictionary: {},
      requestedBracket: artifact.requestedBracket,
    });

    const before = deck.nonlands.length;
    const after = applied.deck.nonlands.length;
    const oracleIds = applied.deck.nonlands.map((c: { oracleId: string }) => c.oracleId);
    const landsInNonlands = applied.deck.nonlands.filter((card: { name: string }) => {
      const truth = resolveCanonicalCardTruthV4164({ name: card.name, catalog });
      return truth.oracleId ? isCanonicalLandForDeckPartition(truth) : false;
    });

    console.log(`${deck.commander.name}`);
    console.log(`  changes:            ${applied.changes.join("; ") || "none"}`);
    if (applied.skipped.length) console.log(`  skipped:            ${applied.skipped.join("; ")}`);
    console.log(`  nonland count:      ${before} -> ${after}  ${before === after ? "(preserved)" : "*** CHANGED ***"}`);
    console.log(`  duplicate oracles:  ${oracleIds.length - new Set(oracleIds).size}`);
    console.log(`  lands in nonlands:  ${landsInNonlands.length}${landsInNonlands.length ? ` *** ${landsInNonlands.map((c: { name: string }) => c.name).join(", ")} ***` : ""}`);
    console.log(`  registered facts:   ${Object.keys(applied.candidateDictionary).length}`);
    console.log("");
  }

  console.log("=".repeat(72));
  console.log("commander                       req  before  after  swaps  attained");
  for (const row of summary) {
    console.log(
      `${row.commander.slice(0, 30).padEnd(30)}  ${String(row.requested).padStart(3)}  ${String(row.before).padStart(6)}  ${String(row.after).padStart(5)}  ${String(row.swaps).padStart(5)}  ${row.attained ? "YES" : "no"}`,
    );
  }
  const shortfallBefore =
    summary.reduce((sum, r) => sum + Math.max(0, r.requested - r.before), 0) / (summary.length || 1);
  const shortfallAfter =
    summary.reduce((sum, r) => sum + Math.max(0, r.requested - r.after), 0) / (summary.length || 1);
  console.log(
    `\nmean shortfall: ${shortfallBefore.toFixed(2)} before -> ${shortfallAfter.toFixed(2)} after`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
