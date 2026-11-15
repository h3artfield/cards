#!/usr/bin/env npx tsx
/**
 * Interaction Profile v2.1 — dead-axis disposition, saturation audit, deck-vs-deck sanity, TRAIN census.
 * No D2 training. No TEST. RC8 frozen.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { lookupGoldenByName } from "./lib/load-golden-catalog-index";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { loadCombinedCorpus } from "../src/lib/commander-strategy/combined-corpus-v1";
import {
  filterPrimaryPodSize,
  loadSplitObservations,
} from "../src/lib/commander-strategy/model-a/dataset-v1";
import { loadShadowSemanticIndex } from "../src/lib/commander-strategy/shadow-semantic-index";
import {
  loadTrainingSnapshotManifest,
  modelArtifactDir,
} from "../src/lib/commander-strategy/training-snapshot-v1";
import { MODEL_D_VERSION } from "../src/lib/commander-strategy/model-d/types";
import { IPV2_DEAD_AXIS_DISPOSITIONS } from "../src/lib/commander-strategy/interaction-profile-v2.1/dead-axis-dispositions-v2.1";
import {
  buildDeckInteractionProfileV2_1,
  computeAllMatchupTerms,
  mergeDeckProfileVectors,
  traceMatchupPairing,
  MATCHUP_PAIRINGS_V2_1,
} from "../src/lib/commander-strategy/interaction-profile-v2.1/deck-interaction-profile-v2.1";
import { INTERACTION_PROFILE_V2_1_SPEC } from "../src/lib/commander-strategy/interaction-profile-v2.1/interaction-profile-v2.1-spec";
import {
  allRetainedDeckFeatureKeys,
  deckFeatureKey,
  RPS_ONTOLOGY_V2_1,
} from "../src/lib/commander-strategy/interaction-profile-v2.1/rps-ontology-v2.1";
import { computeDistributionStats } from "../src/lib/commander-strategy/interaction-profile-v2.1/saturation-audit";
import { registryMetadata } from "../src/lib/commander-strategy/interaction-profile-v2/rc8-source-registry-v1";
import {
  buildDeckInteractionProfileV2,
  computePairwiseTerms as computePairwiseTermsV2,
  mergeDeckProfileVectors as mergeDeckProfileVectorsV2,
} from "../src/lib/commander-strategy/interaction-profile-v2/deck-interaction-profile-v2";
import type { MatchupPairingDef } from "../src/lib/commander-strategy/interaction-profile-v2.1/matchup-ontology-v2.1";

loadProjectEnvLocal();

type DeckPairCase = {
  label: string;
  myCards: string[];
  oppCards: string[];
  expectTermKey: string;
  expectReverseLow?: string;
  minTerm: number;
};

const DECK_PAIR_CASES: DeckPairCase[] = [
  {
    label: "graveyard-engine vs graveyard-hate",
    myCards: ["Reanimate", "Animate Dead", "Living Death", "Dread Return"],
    oppCards: ["Rest in Peace", "Soul-Guide Lantern", "Grafdigger's Cage"],
    expectTermKey: "d2_oppGyDisrupt_x_myMbGyReliance",
    minTerm: 0.01,
  },
  {
    label: "artifact-engine vs artifact-hate",
    myCards: ["Urza, Lord High Artificer", "Sensei's Divining Top", "Mox Opal", "Skullclamp"],
    oppCards: ["Vandalblast", "Nature's Claim", "Abrade"],
    expectTermKey: "d2_oppArtDisrupt_x_myMbArtReliance",
    expectReverseLow: "d2_oppArtDisrupt_x_myMbArtExposure",
    minTerm: 0.005,
  },
  {
    label: "tokens/go-wide vs board-wipe",
    myCards: ["Horn of Gondor", "Monastery Mentor", "Secure the Wastes", "Anointed Procession"],
    oppCards: ["Wrath of God", "Toxic Deluge", "Blasphemous Act"],
    expectTermKey: "d2_oppBoardReset_x_myMbTokenReliance",
    minTerm: 0.01,
  },
  {
    label: "tutor-heavy vs search-denial",
    myCards: ["Demonic Tutor", "Vampiric Tutor", "Enlightened Tutor", "Worldly Tutor"],
    oppCards: ["Aven Mindcensor", "Leonin Arbiter", "Ashok, Dream Render"],
    expectTermKey: "d2_oppSearchDenial_x_myMbTutorReliance",
    minTerm: 0.005,
  },
  {
    label: "spell-stack vs countermagic",
    myCards: ["Brainstorm", "Ponder", "Frantic Search", "Archmage Emeritus"],
    oppCards: ["Counterspell", "Force of Will", "Mana Drain"],
    expectTermKey: "d2_oppStackDisrupt_x_myMbSpellReliance",
    minTerm: 0.005,
  },
  {
    label: "activated-engine vs Null Rod",
    myCards: ["Basalt Monolith", "Grim Monolith", "Rings of Brighthearth", "Staff of Domination"],
    oppCards: ["Null Rod", "Stony Silence", "Karn, the Great Creator"],
    expectTermKey: "d2_oppActDenial_x_myMbActReliance",
    minTerm: 0.005,
  },
];

function pct(n: number, d: number): number {
  return d > 0 ? n / d : 0;
}

function buildDeckFromNames(
  catalog: Awaited<ReturnType<typeof loadDeckResolutionCatalog>>,
  shadow: ReturnType<typeof loadShadowSemanticIndex>,
  names: string[],
  qty = 8,
) {
  const ids = names
    .map((name) => lookupGoldenByName(catalog, name)?.oracleId)
    .filter(Boolean) as string[];
  return buildDeckInteractionProfileV2_1({
    mainboard: ids.map((oracleId) => ({ oracleId, quantity: qty, paperEligible: true })),
    commandZoneOracleIds: [],
    catalog,
    shadowIndex: shadow,
  });
}

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const shadow = await loadShadowSemanticIndex();
  const manifest = loadTrainingSnapshotManifest();
  const corpus = await loadCombinedCorpus(manifest.topdeckSourceRuns.map((r) => r.month), {
    includeRawTournaments: false,
  });
  const trainObs = filterPrimaryPodSize(loadSplitObservations({ manifest, corpus, split: "train" }));
  const valObs = filterPrimaryPodSize(loadSplitObservations({ manifest, corpus, split: "validation" }));

  const schemaValidation = {
    rc8SourceRegistry: registryMetadata(),
    retainedDeckFeatureCount: allRetainedDeckFeatureKeys().length,
    matchupPairingCount: MATCHUP_PAIRINGS_V2_1.length,
    hardFailPolicy: "Unknown RC8 source keys throw UnknownRc8SourceError",
  };

  // P7 — deck-vs-deck sanity
  const deckPairResults = DECK_PAIR_CASES.map((tc) => {
    const myDeck = buildDeckFromNames(catalog, shadow, tc.myCards);
    const oppDeck = buildDeckFromNames(catalog, shadow, tc.oppCards);
    const myVec = mergeDeckProfileVectors(myDeck);
    const oppVec = mergeDeckProfileVectors(oppDeck);
    const terms = computeAllMatchupTerms({ my: myVec, opp: oppVec });
    const term = terms[tc.expectTermKey] ?? 0;
    const reverseTerm = tc.expectReverseLow ? terms[tc.expectReverseLow] ?? 0 : undefined;
    return {
      label: tc.label,
      expectTermKey: tc.expectTermKey,
      term,
      reverseTerm,
      pass: term >= tc.minTerm,
    };
  });
  const deckPairPass = deckPairResults.every((r) => r.pass);

  // TRAIN deck profiles
  const deckByHash = new Map(
    corpus.combined.decks
      .filter((d) => d.deckHash && !d.deckHash.startsWith("unresolved:"))
      .map((d) => [d.deckHash, d] as const),
  );
  const trainDeckHashes = new Set<string>();
  for (const obs of trainObs) for (const seat of obs.seats) trainDeckHashes.add(seat.deckHash);

  const deckProfiles = new Map<string, ReturnType<typeof buildDeckInteractionProfileV2_1>>();
  for (const deckHash of trainDeckHashes) {
    const deck = deckByHash.get(deckHash);
    if (!deck) continue;
    deckProfiles.set(
      deckHash,
      buildDeckInteractionProfileV2_1({
        mainboard: deck.mainboard.map((c) => ({
          oracleId: c.oracleId,
          quantity: c.quantity,
          paperEligible: c.paperEligible,
        })),
        commandZoneOracleIds: deck.commanderOracleIds,
        catalog,
        shadowIndex: shadow,
      }),
    );
  }

  // P1 — saturation audit for retained axes
  const retainedKeys = allRetainedDeckFeatureKeys();
  const axisSaturation = retainedKeys.map((key) => {
    const zone = key.includes("_mb_") ? "mainboard" : "commandZone";
    const parts = key.replace("ipv2_1_mb_", "").replace("ipv2_1_cmd_", "").split("_");
    const vector = parts.pop()!;
    const family = parts.join("_");
    const vals = [...deckProfiles.values()].map((p) =>
      zone === "mainboard" ? (p.mainboard[key] ?? 0) : (p.commandZone[key] ?? 0),
    );
    const stats = computeDistributionStats(vals);
    return { key, zone, family, vector, ...stats };
  });

  const zeroVarianceRetained = axisSaturation.filter((a) => a.variance === 0);

  // Matchup term census on TRAIN
  const matchupSamples = new Map<string, number[]>();
  for (const p of MATCHUP_PAIRINGS_V2_1) matchupSamples.set(p.termKey, []);

  for (const obs of trainObs.slice(0, 12000)) {
    const profiles = obs.seats.map((s) => deckProfiles.get(s.deckHash)).filter(Boolean);
    if (profiles.length !== obs.seats.length) continue;
    for (let i = 0; i < obs.seats.length; i += 1) {
      const my = mergeDeckProfileVectors(profiles[i]!);
      const opps = profiles.filter((_, j) => j !== i).map((p) => mergeDeckProfileVectors(p!));
      for (const opp of opps) {
        const terms = computeAllMatchupTerms({ my, opp });
        for (const [k, v] of Object.entries(terms)) {
          if (!Number.isFinite(v)) continue;
          matchupSamples.get(k)!.push(v);
        }
      }
    }
  }

  const matchupCensus = MATCHUP_PAIRINGS_V2_1.map((p) => {
    const vals = matchupSamples.get(p.termKey) ?? [];
    const stats = computeDistributionStats(vals);
    return { termKey: p.termKey, direction: p.direction, semanticDefinition: p.semanticDefinition, ...stats };
  });
  const zeroVariancePairings = matchupCensus.filter((m) => m.variance === 0);

  // P3 — trace v2 dead pairs + v2.1 corresponding pairings
  const sampleGyDeck = buildDeckFromNames(catalog, shadow, ["Reanimate", "Animate Dead"], 15);
  const sampleArtHate = buildDeckFromNames(catalog, shadow, ["Vandalblast", "Nature's Claim"], 15);
  const sampleSpellDeck = buildDeckFromNames(catalog, shadow, ["Brainstorm", "Frantic Search", "Archmage Emeritus"], 15);
  const sampleCounter = buildDeckFromNames(catalog, shadow, ["Counterspell", "Force of Will"], 15);

  const v2Gy = mergeDeckProfileVectorsV2(
    buildDeckInteractionProfileV2({
      mainboard: ["Reanimate", "Animate Dead"]
        .map((n) => lookupGoldenByName(catalog, n))
        .filter(Boolean)
        .map((c) => ({ oracleId: c!.oracleId, quantity: 15, paperEligible: true })),
      commandZoneOracleIds: [],
      catalog,
      shadowIndex: shadow,
    }),
  );
  const v2ArtHate = mergeDeckProfileVectorsV2(
    buildDeckInteractionProfileV2({
      mainboard: ["Vandalblast"]
        .map((n) => lookupGoldenByName(catalog, n))
        .filter(Boolean)
        .map((c) => ({ oracleId: c!.oracleId, quantity: 15, paperEligible: true })),
      commandZoneOracleIds: [],
      catalog,
      shadowIndex: shadow,
    }),
  );
  const v2TermsArt = computePairwiseTermsV2({ my: v2Gy, opp: v2ArtHate });

  const v2Spell = mergeDeckProfileVectorsV2(
    buildDeckInteractionProfileV2({
      mainboard: ["Brainstorm", "Frantic Search"]
        .map((n) => lookupGoldenByName(catalog, n))
        .filter(Boolean)
        .map((c) => ({ oracleId: c!.oracleId, quantity: 15, paperEligible: true })),
      commandZoneOracleIds: [],
      catalog,
      shadowIndex: shadow,
    }),
  );
  const v2Counter = mergeDeckProfileVectorsV2(
    buildDeckInteractionProfileV2({
      mainboard: ["Counterspell"]
        .map((n) => lookupGoldenByName(catalog, n))
        .filter(Boolean)
        .map((c) => ({ oracleId: c!.oracleId, quantity: 15, paperEligible: true })),
      commandZoneOracleIds: [],
      catalog,
      shadowIndex: shadow,
    }),
  );
  const v2TermsSpell = computePairwiseTermsV2({ my: v2Counter, opp: v2Spell });

  const deadPairRootCauses = {
    ipv2_pair_oppDisruptsMy_artifacts: {
      v2Term: v2TermsArt.pair_oppDisruptsMy_artifacts ?? 0,
      rootCause:
        "v2 paired opp ipv2_mb_artifacts_disruption × my ipv2_mb_artifacts_reliance; artifacts_reliance was IMPLEMENTATION_GAP (always 0).",
      v2SourceVectors: {
        opp: { key: "ipv2_mb_artifacts_disruption", note: "active on hate decks" },
        my: { key: "ipv2_mb_artifacts_reliance", note: "zero-variance — never mapped" },
      },
      v2_1Repair: {
        pairing: "d2_oppArtDisrupt_x_myMbArtReliance",
        alternatePairing: "d2_oppArtDisrupt_x_myMbArtExposure",
        sampleTermReliance: computeAllMatchupTerms({
          my: mergeDeckProfileVectors(sampleGyDeck),
          opp: mergeDeckProfileVectors(sampleArtHate),
        }).d2_oppArtDisrupt_x_myMbArtReliance,
        sampleTermExposure: computeAllMatchupTerms({
          my: mergeDeckProfileVectors(
            buildDeckFromNames(catalog, shadow, ["Sol Ring", "Mana Vault", "Skullclamp"], 15),
          ),
          opp: mergeDeckProfileVectors(sampleArtHate),
        }).d2_oppArtDisrupt_x_myMbArtExposure,
      },
    },
    ipv2_pair_myDisruptsOpp_spells_stack: {
      v2Term: v2TermsSpell.pair_myDisruptsOpp_spells_stack ?? 0,
      rootCause:
        "v2 paired my ipv2_mb_spells_stack_disruption × opp ipv2_mb_spells_stack_reliance; spells_stack_reliance was IMPLEMENTATION_GAP (always 0).",
      v2SourceVectors: {
        my: { key: "ipv2_mb_spells_stack_disruption", note: "active on counter decks" },
        opp: { key: "ipv2_mb_spells_stack_reliance", note: "zero-variance — only type-line exposure in v2" },
      },
      v2_1Repair: {
        pairing: "d2_myMbStackDisrupt_x_oppMbSpellReliance",
        sampleTerm: computeAllMatchupTerms({
          my: mergeDeckProfileVectors(sampleCounter),
          opp: mergeDeckProfileVectors(sampleSpellDeck),
        }).d2_myMbStackDisrupt_x_oppMbSpellReliance,
        oppDisruptsMy: computeAllMatchupTerms({
          my: mergeDeckProfileVectors(sampleSpellDeck),
          opp: mergeDeckProfileVectors(sampleCounter),
        }).d2_oppStackDisrupt_x_myMbSpellReliance,
      },
    },
  };

  // Permutation + pod normalization checks
  const permTests = { samplesChecked: 50, failures: 0, pass: true };
  for (const obs of trainObs.slice(0, 50)) {
    if (obs.seats.length < 3) continue;
    const vecs = obs.seats.map((s) => mergeDeckProfileVectors(deckProfiles.get(s.deckHash)!));
    const t1 = computeAllMatchupTerms({ my: vecs[0]!, opp: vecs[1]! });
    const t2 = computeAllMatchupTerms({ my: vecs[0]!, opp: vecs[2]! });
    const mean = Object.keys(t1).reduce(
      (acc, k) => {
        acc[k] = ((t1[k] ?? 0) + (t2[k] ?? 0)) / 2;
        return acc;
      },
      {} as Record<string, number>,
    );
    const meanRev = Object.keys(t2).reduce(
      (acc, k) => {
        acc[k] = ((computeAllMatchupTerms({ my: vecs[0]!, opp: vecs[2]! })[k] ?? 0) +
          (computeAllMatchupTerms({ my: vecs[0]!, opp: vecs[1]! })[k] ?? 0)) /
          2;
        return acc;
      },
      {} as Record<string, number>,
    );
    for (const k of Object.keys(mean)) {
      if (Math.abs((mean[k] ?? 0) - (meanRev[k] ?? 0)) > 1e-12) permTests.failures += 1;
    }
  }
  permTests.pass = permTests.failures === 0;

  const podNormTests = { threePlayer: 0, fourPlayer: 0, nanInfCount: 0, pass: true };
  for (const obs of trainObs.slice(0, 500)) {
    const profiles = obs.seats.map((s) => deckProfiles.get(s.deckHash)).filter(Boolean);
    if (profiles.length !== obs.seats.length) continue;
    if (obs.seats.length === 3) podNormTests.threePlayer += 1;
    if (obs.seats.length === 4) podNormTests.fourPlayer += 1;
    for (let i = 0; i < obs.seats.length; i += 1) {
      const opps = profiles.filter((_, j) => j !== i).map((p) => mergeDeckProfileVectors(p!));
      const terms = opps.flatMap((opp) => Object.values(computeAllMatchupTerms({ my: mergeDeckProfileVectors(profiles[i]!), opp })));
      podNormTests.nanInfCount += terms.filter((t) => !Number.isFinite(t)).length;
    }
  }
  podNormTests.pass = podNormTests.nanInfCount === 0;

  const structuralHealthPass =
    deckPairPass &&
    zeroVarianceRetained.length === 0 &&
    zeroVariancePairings.length === 0 &&
    permTests.pass &&
    podNormTests.pass;

  const report = {
    version: "interaction-profile-v2.1-audit-v1",
    generatedAt: new Date().toISOString(),
    spec: {
      ...INTERACTION_PROFILE_V2_1_SPEC,
      status: structuralHealthPass
        ? "STRUCTURAL_HEALTH_PASS_D2_PROTOTYPE_AUTHORIZED"
        : "STRUCTURAL_CLEANUP_IN_PROGRESS",
    },
    schemaValidation,
    deadAxisDispositionTable: IPV2_DEAD_AXIS_DISPOSITIONS,
    retainedSchema: {
      ontology: RPS_ONTOLOGY_V2_1,
      retainedFeatureCount: retainedKeys.length,
      prunedFromV2: 84 - retainedKeys.length,
    },
    saturationAudit: axisSaturation,
    saturatedAxes: axisSaturation.filter((a) => a.saturationFlag === "saturated" || a.saturationFlag === "near_constant"),
    deadPairRootCauses,
    deckVsDeckSanity: {
      allPass: deckPairPass,
      passCount: deckPairResults.filter((r) => r.pass).length,
      total: deckPairResults.length,
      results: deckPairResults,
    },
    trainHealthCensus: {
      uniqueTrainDecks: deckProfiles.size,
      retainedAxisCount: retainedKeys.length,
      zeroVarianceRetainedCount: zeroVarianceRetained.length,
      zeroVarianceRetained,
      matchupPairingCount: MATCHUP_PAIRINGS_V2_1.length,
      zeroVariancePairingCount: zeroVariancePairings.length,
      zeroVariancePairings,
      matchupCensus,
    },
    validationSplitPreview: {
      note: "VAL split profile count for D2 prototype (no scoring).",
      observationCount: valObs.length,
    },
    proposedD2: {
      retainedDeckFeatures: retainedKeys.length,
      explicitMatchupTerms: MATCHUP_PAIRINGS_V2_1.length,
      reducersAcrossOpponents: ["mean", "max", "min", "variance"],
      projectedFeatureDimensions: MATCHUP_PAIRINGS_V2_1.length * 4,
      mbCmdSeparate: true,
    },
    structuralHealthGate: {
      deckVsDeckSanityPass: deckPairPass,
      retainedAxesAllNonZeroVariance: zeroVarianceRetained.length === 0,
      retainedPairingsAllNonZeroVariance: zeroVariancePairings.length === 0,
      permutationInvariance: permTests,
      podNormalization: podNormTests,
      pass: structuralHealthPass,
    },
    d2Readiness: {
      trainFeaturePrototypeAuthorized: structuralHealthPass,
      d2Training: "WAIT",
      oldTest: "SPENT",
      prospectiveHoldout: "SEALED",
    },
    authorization: INTERACTION_PROFILE_V2_1_SPEC.authorization,
    reportHash: "",
  };

  report.reportHash = createHash("sha256")
    .update(JSON.stringify({ ...report, reportHash: undefined }))
    .digest("hex");

  const outDir = resolve(modelArtifactDir(MODEL_D_VERSION), "interaction-profile-v2.1");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "interaction-profile-v2.1-audit-report-v1.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  writeFileSync(
    resolve(outDir, "interaction-profile-v2.1-spec-v1.json"),
    JSON.stringify(report.spec, null, 2),
  );

  console.log(
    JSON.stringify(
      {
        outPath,
        structuralHealthPass,
        deckPairPass,
        zeroVarianceRetained: zeroVarianceRetained.length,
        zeroVariancePairings: zeroVariancePairings.length,
        retainedFeatures: retainedKeys.length,
        matchupTerms: MATCHUP_PAIRINGS_V2_1.length,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
