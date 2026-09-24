#!/usr/bin/env npx tsx
/** Build PROVISIONAL DeckSemanticProfile v1 for resolved paper-eligible TopDeck decks. */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { loadShadowSemanticIndex } from "../src/lib/commander-strategy/shadow-semantic-index";
import { buildDeckSemanticProfile } from "../src/lib/commander-strategy/deck-semantic-profile-v1";
import {
  topdeckArtifactPath,
  topdeckRawRunDir,
  TOPDECK_DATA_DIR,
} from "../src/lib/commander-strategy/topdeck/artifact-paths";
import type { NormalizedDeckInstance } from "../src/lib/commander-strategy/types";

function parseArgs() {
  const args = process.argv.slice(2);
  const runIdx = args.indexOf("--run");
  return { runId: runIdx >= 0 ? args[runIdx + 1] : undefined };
}

function findLatestRunId(): string | undefined {
  const runsDir = `${TOPDECK_DATA_DIR}/topdeckImportRuns`;
  if (!existsSync(runsDir)) return undefined;
  return readdirSync(runsDir).sort().pop();
}

async function main() {
  const { runId: argRunId } = parseArgs();
  const runId = argRunId ?? findLatestRunId();
  if (!runId) throw new Error("No import run found.");

  const decksPath = `${topdeckRawRunDir(runId)}/normalized-decks.json`;
  if (!existsSync(decksPath)) throw new Error(`Missing ${decksPath}`);

  const catalog = await loadDeckResolutionCatalog();
  const shadow = await loadShadowSemanticIndex();
  const decks = JSON.parse(readFileSync(decksPath, "utf8")) as NormalizedDeckInstance[];

  const paperEligibleOracleIds = new Set<string>();
  for (const [oracleId, meta] of catalog.paperByOracleId) {
    if (meta.paperEligible) paperEligibleOracleIds.add(oracleId);
  }

  const profiles = [];
  for (const deck of decks) {
    if (deck.commanderResolutionStatus !== "resolved") continue;
    if (deck.deckHash.startsWith("unresolved:")) continue;
    const mainboardOracleIds = deck.mainboard
      .filter((c) => c.oracleId && c.paperEligible)
      .map((c) => c.oracleId!);
    if (mainboardOracleIds.length < 30) continue;

    const profile = buildDeckSemanticProfile({
      deckHash: deck.deckHash,
      commanderOracleIds: deck.commanderOracleIds.filter((id) => paperEligibleOracleIds.has(id)),
      mainboardOracleIds,
      shadowIndex: shadow,
      catalogByOracleId: catalog.byOracleId,
      paperEligibleOracleIds,
    });
    if (profile) profiles.push(profile);
  }

  const sample = profiles
    .sort(() => Math.random() - 0.5)
    .slice(0, 25)
    .map((p) => ({
      deckHash: p.deckHash,
      status: p.provenance.status,
      provenance: p.provenance,
      commanders: p.commanderOracleIds.map((id) => catalog.byOracleId.get(id)?.canonicalName ?? id),
      archetypes: p.strategyAssignment.archetypeDistribution,
      themes: p.strategyAssignment.themeDistribution,
      assignmentSource: p.strategyAssignment.assignmentSource,
      evidence: p.strategyAssignment.evidence,
      synergyEdges: p.deckInteractionStructure.internalSynergyEdgeCount,
    }));

  const archetypeCensus: Record<string, number> = {};
  const themeCensus: Record<string, number> = {};
  for (const p of profiles) {
    const topArchetype = Object.entries(p.strategyAssignment.archetypeDistribution).sort((a, b) => b[1] - a[1])[0];
    const topTheme = Object.entries(p.strategyAssignment.themeDistribution).sort((a, b) => b[1] - a[1])[0];
    if (topArchetype) archetypeCensus[topArchetype[0]] = (archetypeCensus[topArchetype[0]] ?? 0) + 1;
    if (topTheme) themeCensus[topTheme[0]] = (themeCensus[topTheme[0]] ?? 0) + 1;
  }

  writeFileSync(
    topdeckArtifactPath("deckProfilesManifest"),
    JSON.stringify(
      {
        version: "deck-semantic-profiles-v1",
        status: "PROVISIONAL_DERIVED_PROFILE",
        runId,
        generatedAt: new Date().toISOString(),
        profileCount: profiles.length,
        paperPopulationHash: catalog.catalogUniverse.paperPopulationHash,
        parserBlobClosure: shadow.parserBlobClosure,
        archetypeCensus,
        themeCensus,
      },
      null,
      2,
    ),
  );
  writeFileSync(topdeckArtifactPath("deckProfilesSample"), JSON.stringify(sample, null, 2));

  console.log(`DeckSemanticProfile v1 (PROVISIONAL): ${profiles.length} profiles`);
  console.log(`Paper population hash: ${catalog.catalogUniverse.paperPopulationHash}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
