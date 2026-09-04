/**
 * Live confirmation that the terminal validator accepts a post-attainment deck.
 *
 * The offline proof checks the invariants the validator cares about — additions
 * registered in the candidate dictionary, no land in the nonland list, identity
 * and legality, architect counts preserved — but it cannot run
 * validateSolDirectedDeckV111 itself, which needs the retrieval contract and
 * identity ledger produced by a real build. So this runs one real build with
 * PROFESSOR_SOL_DIRECTED_BRACKET_ATTAINMENT_ENABLED on and reports the
 * validation verdict alongside the bracket the rubric measures.
 *
 * Chatterfang at bracket 3 is the cheapest useful case: it measured 2 before,
 * and needs exactly one swap to reach the request.
 *
 * Costs real OpenAI calls.
 */
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { resolve } from "node:path";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { resolveCommanderBlueprintFromCatalogV417 } from "../src/lib/deck-synthesis/professor-commander-catalog-v4-17-v1";
import { runSolDirectedCommanderBuild } from "../src/lib/deck-synthesis/professor-sol-directed-commander-build-service-v1-1-1";
import {
  gameChangerOracleIdSet,
  loadCommanderGameChangerSnapshot,
} from "../src/lib/commander-strategy/model-c/game-changer-snapshot-v1";
import { classifyCommanderBracketV1 } from "../src/lib/commander-bracket-rubric/v1";
import { comboSummaryForDeck } from "../src/lib/commander-bracket-rubric/v1/combos-server";
import type { BracketRubricCard } from "../src/lib/commander-bracket-rubric/v1";

const RC8_PATH = "data/milestones/catalog-shadow/catalog-shadow-parse-rc8-firestore-v2.jsonl.gz";
const OUT_DIR = "data/milestones/deck-synthesis/bracket-attainment-v1";
const STORE_SLUG = "the-game-lodge";

const SPECS = {
  chatterfang: {
    commanderName: "Chatterfang, Squirrel General",
    bracket: 3,
    playstyle: "tokens and sacrifice value",
    commanderStyle: "lean into what makes this commander unique",
  },
  // Measured bracket 2 against a request of 4, so the pass has to find four
  // Game Changers. This is the case that actually exercises the swap path.
  kodama: {
    commanderName: "Kodama of the West Tree",
    bracket: 4,
    playstyle: "balanced value with meaningful interaction",
    commanderStyle: "lean into what makes this commander unique",
  },
} as const;

const SPEC =
  SPECS[(process.env.ATTAINMENT_VERIFY_SPEC?.trim() as keyof typeof SPECS) || "chatterfang"] ??
  SPECS.chatterfang;

type OracleEntry = { oracleId: string; name: string; text: string };

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

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

async function loadOracleTextIndex(): Promise<Map<string, OracleEntry>> {
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
  process.env.PROFESSOR_SOL_DIRECTED_LIVE = process.env.PROFESSOR_SOL_DIRECTED_LIVE ?? "1";
  process.env.PROFESSOR_SOL_DIRECTED_GUI_ENABLED =
    process.env.PROFESSOR_SOL_DIRECTED_GUI_ENABLED ?? "true";
  process.env.PROFESSOR_SOL_DIRECTED_BRACKET_ATTAINMENT_ENABLED = "true";

  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY required — this verification runs a real build.");
  }

  const { resolveStoreBySlug } = await import("../src/lib/deck-builder/deck-builder-service");
  const store = await resolveStoreBySlug(STORE_SLUG);
  if (!store) throw new Error(`Store ${STORE_SLUG} not found`);

  const [catalog, oracleByName] = await Promise.all([
    loadDeckResolutionCatalog(),
    loadOracleTextIndex(),
  ]);
  const gcSet = gameChangerOracleIdSet(loadCommanderGameChangerSnapshot());

  const blueprint = resolveCommanderBlueprintFromCatalogV417({
    catalog,
    commanderName: SPEC.commanderName,
  });

  console.log(`Building ${SPEC.commanderName} at bracket ${SPEC.bracket} with attainment ON...\n`);
  const startedAt = Date.now();
  const result = await runSolDirectedCommanderBuild({
    commanderOracleId: blueprint.oracleId,
    commanderName: SPEC.commanderName,
    bracket: SPEC.bracket,
    playstyle: SPEC.playstyle,
    commanderStyle: SPEC.commanderStyle,
    storeId: store.id,
    storeSlug: STORE_SLUG,
    userId: null,
    catalog,
    p0TruthPass: true,
  });
  const elapsedMs = Date.now() - startedAt;

  console.log(`status:            ${result.status}`);
  console.log(`failureCode:       ${result.failureCode ?? "none"}`);
  console.log(`validation.pass:   ${result.validation?.pass ?? "n/a"}`);
  const violations = result.validation?.violations ?? [];
  console.log(`violations:        ${violations.length === 0 ? "none" : violations.join("; ")}`);
  console.log(`candidateTrace:    ${result.validation?.candidateTracePass ?? "n/a"}`);
  console.log(
    `architectCounts:   ${result.validation?.architectRequirementRealization?.pass ?? "n/a"}`,
  );
  console.log(`elapsed:           ${(elapsedMs / 1000).toFixed(1)}s`);

  let assignedBracket: number | null = null;
  let gameChangerNames: string[] = [];
  if (result.constructedDeck) {
    const cards: BracketRubricCard[] = [];
    const push = (row: { name: string; copies?: number }, isCommander: boolean) => {
      const hit = oracleByName.get(normalize(row.name));
      if (!hit) return;
      cards.push({
        oracleId: hit.oracleId,
        name: hit.name,
        typeLine: "",
        oracleText: hit.text,
        quantity: row.copies ?? 1,
        isCommander,
      });
    };
    push({ name: result.constructedDeck.commander.name }, true);
    for (const row of result.constructedDeck.nonlands) push(row, false);
    for (const row of result.constructedDeck.lands) push(row, false);

    const combos = await comboSummaryForDeck({ cards });
    const classified = classifyCommanderBracketV1({
      cards,
      gameChangerOracleIds: gcSet,
      combos,
    });
    assignedBracket = classified.assignedBracket;
    gameChangerNames =
      classified.signals
        .find((signal) => signal.id === "game_changers")
        ?.evidence.map((entry) => entry.name) ?? [];

    console.log(`\nrequested bracket: ${SPEC.bracket}`);
    console.log(`measured bracket:  ${assignedBracket} (${classified.assignedBracketName})`);
    console.log(`game changers:     ${gameChangerNames.join(", ") || "none"}`);
    console.log(
      `reason:            ${classified.determiningSignals.map((s) => s.label).join(" + ") || "no signal above Core"}`,
    );
    console.log(`nonlands:          ${result.constructedDeck.nonlands.length}`);
    console.log(
      `lands:             ${result.constructedDeck.lands.reduce((sum, land) => sum + land.copies, 0)}`,
    );
  }

  const verdict =
    result.validation?.pass === true && assignedBracket !== null && assignedBracket >= SPEC.bracket
      ? "PASS — validator accepted the deck and it measures at the requested bracket"
      : "REVIEW — see above";
  console.log(`\n${verdict}`);

  mkdirSync(resolve(process.cwd(), OUT_DIR), { recursive: true });
  const outName = `attainment-live-verification-${SPEC.commanderName
    .split(",")[0]!
    .toLowerCase()
    .replace(/\s+/g, "-")}-v1.json`;
  writeFileSync(
    resolve(process.cwd(), OUT_DIR, outName),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        spec: SPEC,
        status: result.status,
        failureCode: result.failureCode ?? null,
        validationPass: result.validation?.pass ?? null,
        violations,
        assignedBracket,
        gameChangerNames,
        elapsedMs,
        constructedDeck: result.constructedDeck ?? null,
      },
      null,
      2,
    ),
  );
  console.log(`\nwrote ${OUT_DIR}/${outName}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
