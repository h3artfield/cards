/**
 * Sol-directed retrieval — RC8 semantic-neighbor pool expansion, real catalog, no OpenAI.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadDeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { commanderLegalInIdentity } from "../semantic-visualization/filters-v1";
import { loadSemanticMapNeighbors } from "../semantic-visualization/artifact-loader";
import {
  gameChangerOracleIdSet,
  loadCommanderGameChangerSnapshot,
} from "../commander-strategy/model-c/game-changer-snapshot-v1";
import { loadPlayRateIndex } from "../deck-swap/v1/play-rate-server";
import { resolveCommanderBlueprintFromCatalogV417 } from "./professor-commander-catalog-v4-17-v1";
import { ingestArchitectResponseV11 } from "./professor-sol-directed-architect-ingestion-v1-1";
import { isProfessorSolDirectedNeighborExpansionEnabled } from "./professor-sol-directed-gui-flag-v1-1-1";
import {
  RETRIEVAL_NEIGHBOR_POOL_CAP_V11,
  runSolDirectedRetrievalV11,
} from "./professor-sol-directed-retrieval-v1-1";
import { PROFESSOR_SOL_DIRECTED_TYPES_V1_1_VERSION } from "./professor-sol-directed-types-v1-1";
import type {
  RequirementPoolV11,
  RetrievalContractV11,
} from "./professor-sol-directed-types-v1-1";

let n = 0;
function check(label: string, fn: () => void): void {
  fn();
  n += 1;
  console.log(`  ok  ${label}`);
}

function loadEnvLocal() {
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

function fixturePath(): string {
  const candidates = [
    resolve(process.cwd(), "data/milestones/deck-synthesis/sol-directed-chatterfang-v1/call-1-architect-response.json"),
    resolve(process.cwd(), "web/data/milestones/deck-synthesis/sol-directed-chatterfang-v1/call-1-architect-response.json"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error("Missing call-1-architect-response.json fixture");
}

/**
 * A requirement whose role text matches no semantic profile and no oracle token, so scored retrieval
 * contributes nothing and the pool is left underfilled with only its resolved seeds.
 */
function unmatchedProbeContract(): RetrievalContractV11 {
  return {
    version: PROFESSOR_SOL_DIRECTED_TYPES_V1_1_VERSION,
    strategicThesis: "probe",
    earlyGamePlan: [],
    midGamePlan: [],
    lateGamePlan: [],
    winLines: [],
    failureRecoveryPlan: [],
    nonlandSlotsRequired: 63,
    landSlotsRequired: 36,
    cardRequirements: [
      {
        requirementId: "unmatched_probe_requirement",
        requestedCount: 4,
        primaryRole: "qqq zzz vvv",
        naturalLanguageRequirements: [],
        preferredExamples: ["Sol Ring", "Arcane Signet"],
      },
    ],
    landPlan: { target: 36, architecture: [] },
    comboAndPowerGuardrails: { prohibitedCards: [], prohibitedPackages: [] },
    retrievalRules: [],
    tutorPolicy: null,
    manaValueTargets: null,
    preservedTopLevelFields: [],
  };
}

function poolById(pools: RequirementPoolV11[], requirementId: string): RequirementPoolV11 {
  const pool = pools.find((p) => p.requirementId === requirementId);
  assert.ok(pool, `expected a pool for ${requirementId}`);
  return pool;
}

async function main() {
  loadEnvLocal();
  const catalog = await loadDeckResolutionCatalog();
  const commander = resolveCommanderBlueprintFromCatalogV417({
    catalog,
    commanderName: "Chatterfang, Squirrel General",
  });
  const semanticNeighbors = await loadSemanticMapNeighbors();
  const ingested = ingestArchitectResponseV11(JSON.parse(readFileSync(fixturePath(), "utf8")));
  const probeContract = unmatchedProbeContract();

  console.log("professor-sol-directed-retrieval-v1-1 selftest");

  check("the rc8 neighbor artifact is present, so the enabled path is really exercised", () => {
    assert.ok(semanticNeighbors.size > 0, "loadSemanticMapNeighbors returned no rows");
  });

  check("the pipeline feature flag reads as disabled unless the environment opts in", () => {
    delete process.env.PROFESSOR_SOL_DIRECTED_NEIGHBOR_EXPANSION_ENABLED;
    assert.equal(isProfessorSolDirectedNeighborExpansionEnabled(), false);
    process.env.PROFESSOR_SOL_DIRECTED_NEIGHBOR_EXPANSION_ENABLED = "1";
    assert.equal(isProfessorSolDirectedNeighborExpansionEnabled(), false, "only the literal true enables it");
    process.env.PROFESSOR_SOL_DIRECTED_NEIGHBOR_EXPANSION_ENABLED = "true";
    assert.equal(isProfessorSolDirectedNeighborExpansionEnabled(), true);
    delete process.env.PROFESSOR_SOL_DIRECTED_NEIGHBOR_EXPANSION_ENABLED;
  });

  const fixtureOmitted = runSolDirectedRetrievalV11({
    contract: ingested.retrievalContract,
    catalog,
    commander,
  });
  const fixtureDisabled = runSolDirectedRetrievalV11({
    contract: ingested.retrievalContract,
    catalog,
    commander,
    semanticNeighborExpansionEnabled: false,
    semanticNeighbors,
  });
  const fixtureEnabled = runSolDirectedRetrievalV11({
    contract: ingested.retrievalContract,
    catalog,
    commander,
    semanticNeighborExpansionEnabled: true,
    semanticNeighbors,
  });

  check("neighbor expansion is off by default and off when the flag is false", () => {
    assert.equal(
      JSON.stringify(fixtureDisabled.requirementPools),
      JSON.stringify(fixtureOmitted.requirementPools),
      "supplying neighbors without the flag must not change pools",
    );
    assert.equal(
      JSON.stringify(fixtureOmitted.requirementPools).includes("neighborOracleIds"),
      false,
      "the disabled path serializes no neighbor attribution field",
    );
    assert.equal(
      JSON.stringify(fixtureDisabled.candidateDictionary),
      JSON.stringify(fixtureOmitted.candidateDictionary),
      "no extra cards are hydrated into the dictionary while disabled",
    );
  });

  check("enabling expansion never removes or reorders an already-retrieved candidate", () => {
    for (const before of fixtureOmitted.requirementPools) {
      const after = poolById(fixtureEnabled.requirementPools, before.requirementId);
      assert.deepEqual(after.seedOracleIds, before.seedOracleIds);
      assert.deepEqual(after.semanticOracleIds, before.semanticOracleIds);
      assert.deepEqual(
        after.oracleIds.slice(0, before.oracleIds.length),
        before.oracleIds,
        `${before.requirementId} keeps its scored candidates in front`,
      );
      assert.deepEqual(
        after.oracleIds.slice(before.oracleIds.length),
        after.neighborOracleIds ?? [],
        `${before.requirementId} appends only neighbor-sourced ids`,
      );
    }
  });

  check("a pool already filled to its target gains no neighbor-sourced candidates", () => {
    let filledPools = 0;
    for (const pool of fixtureEnabled.requirementPools) {
      if (pool.seedOracleIds.length + pool.semanticOracleIds.length < pool.targetPoolSize) continue;
      filledPools += 1;
      assert.equal(pool.neighborOracleIds, undefined, `${pool.requirementId} was not underfilled`);
    }
    assert.ok(filledPools > 0, "the fixture contract must produce at least one filled pool");
  });

  const probeDisabled = runSolDirectedRetrievalV11({
    contract: probeContract,
    catalog,
    commander,
  });
  const probeEnabled = runSolDirectedRetrievalV11({
    contract: probeContract,
    catalog,
    commander,
    semanticNeighborExpansionEnabled: true,
    semanticNeighbors,
  });
  const probeBefore = poolById(probeDisabled.requirementPools, "unmatched_probe_requirement");
  const probeAfter = poolById(probeEnabled.requirementPools, "unmatched_probe_requirement");

  check("an underfilled pool gains neighbor-sourced candidates once expansion is enabled", () => {
    assert.ok(
      probeBefore.seedOracleIds.length + probeBefore.semanticOracleIds.length < probeBefore.targetPoolSize,
      "the probe requirement must be underfilled without expansion",
    );
    assert.equal(probeBefore.neighborOracleIds, undefined);
    assert.ok((probeAfter.neighborOracleIds ?? []).length > 0, "expansion added nothing");
    assert.equal(
      probeAfter.oracleIds.length,
      probeBefore.oracleIds.length + (probeAfter.neighborOracleIds ?? []).length,
    );
  });

  check("neighbor-sourced candidates per pool never exceed the documented cap", () => {
    for (const pool of [...fixtureEnabled.requirementPools, probeAfter]) {
      const added = pool.neighborOracleIds ?? [];
      assert.ok(
        added.length <= RETRIEVAL_NEIGHBOR_POOL_CAP_V11,
        `${pool.requirementId} added ${added.length} neighbor ids`,
      );
      assert.ok(
        pool.seedOracleIds.length + pool.semanticOracleIds.length + added.length <= pool.targetPoolSize,
        `${pool.requirementId} overshot its target pool size`,
      );
    }
  });

  check("every neighbor-sourced candidate is commander legal, in identity, and not a land", () => {
    const inspected: string[] = [];
    for (const pool of [...fixtureEnabled.requirementPools, probeAfter]) {
      for (const oracleId of pool.neighborOracleIds ?? []) {
        const card = catalog.byOracleId.get(oracleId);
        assert.ok(card, `${oracleId} is not in the resolution catalog`);
        assert.equal(
          commanderLegalInIdentity(card.colorIdentity ?? [], commander.colorIdentity),
          true,
          `${card.canonicalName} breaks ${commander.colorIdentity.join("")} color identity`,
        );
        const facts = probeEnabled.candidateDictionary[oracleId] ?? fixtureEnabled.candidateDictionary[oracleId];
        assert.ok(facts, `${card.canonicalName} was not hydrated into the candidate dictionary`);
        assert.equal(facts.commanderLegal, true, `${card.canonicalName} is not commander legal`);
        assert.equal(facts.isLand, false, `${card.canonicalName} is a land`);
        inspected.push(oracleId);
      }
    }
    assert.ok(inspected.length > 0, "no neighbor-sourced candidates were produced to inspect");
  });

  check("neighbor-sourced candidates are distinct from the scored candidates they supplement", () => {
    for (const pool of [...fixtureEnabled.requirementPools, probeAfter]) {
      const added = pool.neighborOracleIds ?? [];
      assert.equal(new Set(added).size, added.length, `${pool.requirementId} added a duplicate`);
      const scored = new Set([...pool.seedOracleIds, ...pool.semanticOracleIds]);
      for (const oracleId of added) {
        assert.equal(scored.has(oracleId), false, `${oracleId} was already retrieved by scoring`);
      }
      assert.ok(!added.includes(commander.oracleId), "the commander is never added to a pool");
    }
  });

  check("expansion is deterministic for the same seeds and neighbor artifact", () => {
    const again = runSolDirectedRetrievalV11({
      contract: probeContract,
      catalog,
      commander,
      semanticNeighborExpansionEnabled: true,
      semanticNeighbors,
    });
    assert.equal(
      JSON.stringify(again.requirementPools),
      JSON.stringify(probeEnabled.requirementPools),
    );
  });

  check("expansion stays off when the neighbor artifact is unavailable", () => {
    const withoutArtifact = runSolDirectedRetrievalV11({
      contract: probeContract,
      catalog,
      commander,
      semanticNeighborExpansionEnabled: true,
      semanticNeighbors: new Map(),
    });
    assert.equal(
      JSON.stringify(withoutArtifact.requirementPools),
      JSON.stringify(probeDisabled.requirementPools),
    );
  });

  // ---- bracket-aware power ranking -------------------------------------
  const gameChangers = gameChangerOracleIdSet(loadCommanderGameChangerSnapshot());
  const playRateByOracleId = new Map<string, number>(
    Object.entries(loadPlayRateIndex().cards).map(([oracleId, stat]) => [oracleId, stat.rate]),
  );

  const pooledIds = (pools: RequirementPoolV11[]): string[] =>
    pools.flatMap((pool) => pool.oracleIds);

  const gameChangersIn = (pools: RequirementPoolV11[]): string[] =>
    [...new Set(pooledIds(pools))].filter((id) => gameChangers.has(id));

  const meanPlayRate = (pools: RequirementPoolV11[]): number => {
    const rates = [...new Set(pooledIds(pools))]
      .map((id) => playRateByOracleId.get(id))
      .filter((rate): rate is number => rate != null);
    if (rates.length === 0) return 0;
    return rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
  };

  const powerInputs = {
    contract: ingested.retrievalContract,
    catalog,
    commander,
    gameChangerOracleIds: gameChangers,
    playRateByOracleId,
  };

  const powerFlagOff = runSolDirectedRetrievalV11({
    ...powerInputs,
    bracketPowerRankingEnabled: false,
    requestedBracket: 4,
  });
  const powerAtTwo = runSolDirectedRetrievalV11({
    ...powerInputs,
    bracketPowerRankingEnabled: true,
    requestedBracket: 2,
  });
  const powerAtFour = runSolDirectedRetrievalV11({
    ...powerInputs,
    bracketPowerRankingEnabled: true,
    requestedBracket: 4,
  });

  check("the play-rate and Game Changer artifacts are present, so the checks below are real", () => {
    assert.ok(gameChangers.size > 0, "no Game Changer oracle ids loaded");
    assert.ok(playRateByOracleId.size > 0, "no play rates loaded");
  });

  check("power ranking is inert without the flag, even with a bracket supplied", () => {
    assert.equal(
      JSON.stringify(powerFlagOff.requirementPools),
      JSON.stringify(fixtureOmitted.requirementPools),
      "supplying a bracket without the flag must not change pools",
    );
  });

  check("power ranking needs a bracket, so the flag alone changes nothing", () => {
    const flagWithoutBracket = runSolDirectedRetrievalV11({
      ...powerInputs,
      bracketPowerRankingEnabled: true,
    });
    assert.equal(
      JSON.stringify(flagWithoutBracket.requirementPools),
      JSON.stringify(fixtureOmitted.requirementPools),
    );
  });

  check("a bracket that allows no Game Changer offers none, though the default pools do", () => {
    const baseline = gameChangersIn(fixtureOmitted.requirementPools);
    assert.ok(
      baseline.length > 0,
      "the default pools must contain a Game Changer or this check proves nothing",
    );
    assert.deepEqual(
      gameChangersIn(powerAtTwo.requirementPools),
      [],
      `bracket 2 pools still offer ${gameChangersIn(powerAtTwo.requirementPools)
        .map((id) => catalog.byOracleId.get(id)?.canonicalName ?? id)
        .join(", ")}`,
    );
  });

  check("a bracket that allows Game Changers keeps offering them", () => {
    assert.ok(
      gameChangersIn(powerAtFour.requirementPools).length > 0,
      "bracket 4 pools dropped every Game Changer",
    );
  });

  check("raising the requested bracket raises the measured play rate of what pools offer", () => {
    const atTwo = meanPlayRate(powerAtTwo.requirementPools);
    const atFour = meanPlayRate(powerAtFour.requirementPools);
    assert.ok(
      atFour > atTwo,
      `expected bracket 4 pools to be more played than bracket 2 (${atFour.toFixed(4)} vs ${atTwo.toFixed(4)})`,
    );
  });

  check("power ranking is deterministic for the same bracket and artifacts", () => {
    const again = runSolDirectedRetrievalV11({
      ...powerInputs,
      bracketPowerRankingEnabled: true,
      requestedBracket: 4,
    });
    assert.equal(
      JSON.stringify(again.requirementPools),
      JSON.stringify(powerAtFour.requirementPools),
    );
  });

  check("power ranking never lets a pool exceed its target size", () => {
    for (const pool of [...powerAtTwo.requirementPools, ...powerAtFour.requirementPools]) {
      assert.ok(
        pool.oracleIds.length <= pool.targetPoolSize,
        `${pool.requirementId} holds ${pool.oracleIds.length} of ${pool.targetPoolSize}`,
      );
    }
  });

  const addedNames = (probeAfter.neighborOracleIds ?? []).map(
    (id) => catalog.byOracleId.get(id)?.canonicalName ?? id,
  );
  console.log(`\n  probe seeds: ${probeBefore.seedOracleIds.length}, target ${probeBefore.targetPoolSize}`);
  console.log(`  probe neighbor additions: ${addedNames.join(", ")}`);
  console.log(
    `  game changers offered — default: ${gameChangersIn(fixtureOmitted.requirementPools).length}, ` +
      `bracket 2: ${gameChangersIn(powerAtTwo.requirementPools).length}, ` +
      `bracket 4: ${gameChangersIn(powerAtFour.requirementPools).length}`,
  );
  console.log(
    `  mean play rate offered — bracket 2: ${meanPlayRate(powerAtTwo.requirementPools).toFixed(4)}, ` +
      `bracket 4: ${meanPlayRate(powerAtFour.requirementPools).toFixed(4)}`,
  );
  console.log(`\nprofessor-sol-directed-retrieval-v1-1 selftest passed (${n} checks)`);
}

void main();
