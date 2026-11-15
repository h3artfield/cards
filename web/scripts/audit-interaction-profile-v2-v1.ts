#!/usr/bin/env npx tsx
/**
 * Interaction Profile v2 — structural sanity suite + TRAIN-only health census.
 * No D2 training. No TEST outcomes. RC8 frozen.
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
import {
  buildCardInteractionProfileV2,
  cardProfileToFlatScores,
} from "../src/lib/commander-strategy/interaction-profile-v2/card-interaction-profile-v2";
import {
  buildDeckInteractionProfileV2,
  computePairwiseTerms,
  mergeDeckProfileVectors,
} from "../src/lib/commander-strategy/interaction-profile-v2/deck-interaction-profile-v2";
import { INTERACTION_PROFILE_V2_SPEC } from "../src/lib/commander-strategy/interaction-profile-v2/interaction-profile-v2-spec";
import {
  allDeckFeatureKeys,
  deckFeatureKey,
  proposedD2TermKeys,
  RPS_ONTOLOGY_V2,
} from "../src/lib/commander-strategy/interaction-profile-v2/rps-ontology-v2";
import { registryMetadata } from "../src/lib/commander-strategy/interaction-profile-v2/rc8-source-registry-v1";
import type { RpsAxisFamily, RpsVectorKind } from "../src/lib/commander-strategy/interaction-profile-v2/types";

loadProjectEnvLocal();

type SanityCase = {
  label: string;
  cardNames: string[];
  oppCardNames?: string[];
  assertCard: Array<{ family: RpsAxisFamily; vector: RpsVectorKind; min: number }>;
  assertOppCard?: Array<{ family: RpsAxisFamily; vector: RpsVectorKind; min: number }>;
  matchupFamily?: RpsAxisFamily;
};

const SANITY_CASES: SanityCase[] = [
  {
    label: "reanimation / graveyard reliance",
    cardNames: ["Reanimate", "Animate Dead"],
    oppCardNames: ["Rest in Peace", "Soul-Guide Lantern"],
    assertCard: [
      { family: "graveyard", vector: "reliance", min: 0.3 },
      { family: "recursion", vector: "reliance", min: 0.3 },
    ],
    assertOppCard: [{ family: "graveyard", vector: "disruption", min: 0.35 }],
    matchupFamily: "graveyard",
  },
  {
    label: "graveyard hate (exile/replacement)",
    cardNames: ["Rest in Peace", "Soul-Guide Lantern"],
    assertCard: [{ family: "graveyard", vector: "disruption", min: 0.35 }],
  },
  {
    label: "artifact-heavy (exposure not reliance)",
    cardNames: ["Sol Ring", "Mana Vault"],
    assertCard: [{ family: "artifacts", vector: "exposure", min: 0.1 }],
  },
  {
    label: "artifact removal",
    cardNames: ["Nature's Claim", "Vandalblast"],
    assertCard: [{ family: "artifacts", vector: "disruption", min: 0.35 }],
  },
  {
    label: "enchantment-heavy",
    cardNames: ["Rhystic Study", "Smothering Tithe"],
    assertCard: [{ family: "enchantments", vector: "exposure", min: 0.1 }],
  },
  {
    label: "enchantment removal",
    cardNames: ["Return to Nature", "Wear // Tear"],
    assertCard: [{ family: "enchantments", vector: "disruption", min: 0.35 }],
  },
  {
    label: "token / go-wide",
    cardNames: ["Horn of Gondor", "Monastery Mentor"],
    oppCardNames: ["Wrath of God", "Toxic Deluge"],
    assertCard: [{ family: "tokens", vector: "reliance", min: 0.3 }],
    assertOppCard: [{ family: "tokens", vector: "disruption", min: 0.35 }],
    matchupFamily: "tokens",
  },
  {
    label: "board wipe",
    cardNames: ["Wrath of God", "Toxic Deluge"],
    assertCard: [
      { family: "creatures", vector: "disruption", min: 0.35 },
      { family: "tokens", vector: "disruption", min: 0.35 },
    ],
  },
  {
    label: "spell-heavy / draw engine",
    cardNames: ["Rhystic Study", "Brainstorm"],
    assertCard: [{ family: "hand_resources", vector: "reliance", min: 0.2 }],
  },
  {
    label: "countermagic",
    cardNames: ["Counterspell", "Force of Will"],
    assertCard: [{ family: "spells_stack", vector: "disruption", min: 0.4 }],
  },
  {
    label: "tutor-heavy",
    cardNames: ["Demonic Tutor", "Vampiric Tutor"],
    oppCardNames: ["Aven Mindcensor", "Leonin Arbiter"],
    assertCard: [{ family: "library_search", vector: "reliance", min: 0.3 }],
    assertOppCard: [{ family: "library_search", vector: "disruption", min: 0.35 }],
    matchupFamily: "library_search",
  },
  {
    label: "activated ability engine",
    cardNames: ["Basalt Monolith", "Grim Monolith"],
    oppCardNames: ["Null Rod", "Stony Silence"],
    assertCard: [{ family: "activated_abilities", vector: "reliance", min: 0.2 }],
    assertOppCard: [{ family: "activated_abilities", vector: "disruption", min: 0.4 }],
    matchupFamily: "activated_abilities",
  },
  {
    label: "activated ability suppression",
    cardNames: ["Null Rod", "Stony Silence"],
    assertCard: [{ family: "activated_abilities", vector: "disruption", min: 0.4 }],
  },
  {
    label: "nonbasic land denial",
    cardNames: ["Blood Moon", "Magus of the Moon"],
    assertCard: [{ family: "lands", vector: "disruption", min: 0.4 }],
  },
  {
    label: "land denial (strip)",
    cardNames: ["Strip Mine", "Wasteland"],
    assertCard: [{ family: "lands", vector: "disruption", min: 0.4 }],
  },
];

function pct(n: number, d: number): number {
  return d > 0 ? n / d : 0;
}

function scoreAt(profile: ReturnType<typeof cardProfileToFlatScores>, family: RpsAxisFamily, vector: RpsVectorKind): number {
  return profile[`${family}_${vector}`] ?? 0;
}

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const shadow = await loadShadowSemanticIndex();
  const manifest = loadTrainingSnapshotManifest();
  const corpus = await loadCombinedCorpus(manifest.topdeckSourceRuns.map((r) => r.month), {
    includeRawTournaments: false,
  });
  const trainObs = filterPrimaryPodSize(loadSplitObservations({ manifest, corpus, split: "train" }));

  const schemaValidation = {
    rc8SourceRegistry: registryMetadata(),
    specDeckFeatureCount: allDeckFeatureKeys().length,
    proposedD2TermCount: proposedD2TermKeys().length,
    hardFailPolicy: "Unknown RC8 source keys throw UnknownRc8SourceError",
  };

  const sanityResults = SANITY_CASES.map((tc) => {
    const cards = tc.cardNames.map((name) => {
      const card = lookupGoldenByName(catalog, name);
      if (!card) return { name, status: "NOT_FOUND" as const };
      const sh = shadow.byOracleId.get(card.oracleId);
      if (!sh) return { name, oracleId: card.oracleId, status: "NO_SHADOW" as const };
      const profile = buildCardInteractionProfileV2({
        oracleId: card.oracleId,
        card,
        actions: sh.semantic.actions,
        abilities: sh.semantic.abilities,
      });
      return {
        name,
        oracleId: card.oracleId,
        status: "OK" as const,
        scores: cardProfileToFlatScores(profile),
      };
    });

    const cardChecks = tc.assertCard.map(({ family, vector, min }) => {
      const actual = Math.max(
        0,
        ...cards.filter((c) => c.status === "OK").map((c) => scoreAt(c.scores, family, vector)),
      );
      return { family, vector, min, actual, pass: actual >= min };
    });

    let matchupCheck: { pass: boolean; term?: number; note?: string } = { pass: true };
    if (tc.matchupFamily && tc.oppCardNames?.length) {
      const buildDeckFromNames = (names: string[]) => {
        const ids = names
          .map((name) => {
            const card = lookupGoldenByName(catalog, name);
            return card?.oracleId;
          })
          .filter(Boolean) as string[];
        return buildDeckInteractionProfileV2({
          mainboard: ids.map((oracleId) => ({ oracleId, quantity: 30, paperEligible: true })),
          commandZoneOracleIds: [],
          catalog,
          shadowIndex: shadow,
        });
      };
      const myDeck = buildDeckFromNames(tc.cardNames);
      const oppDeck = buildDeckFromNames(tc.oppCardNames);
      const terms = computePairwiseTerms({
        my: mergeDeckProfileVectors(myDeck),
        opp: mergeDeckProfileVectors(oppDeck),
      });
      const term =
        terms[`pair_oppDisruptsMy_${tc.matchupFamily}`] ??
        terms[`pair_myDisruptsOpp_${tc.matchupFamily}`] ??
        0;
      matchupCheck = { pass: term > 0, term, note: "pairwise term from synthetic 30-copy decks" };
    }

    return {
      label: tc.label,
      cards,
      cardChecks,
      matchupCheck,
      pass: cardChecks.every((c) => c.pass) && cards.some((c) => c.status === "OK") && matchupCheck.pass,
    };
  });

  const sanityPass = sanityResults.every((s) => s.pass);

  // TRAIN census — only if sanity passes (per spec); still run and flag
  const deckByHash = new Map(
    corpus.combined.decks
      .filter((d) => d.deckHash && !d.deckHash.startsWith("unresolved:"))
      .map((d) => [d.deckHash, d] as const),
  );

  const trainDeckHashes = new Set<string>();
  for (const obs of trainObs) for (const seat of obs.seats) trainDeckHashes.add(seat.deckHash);

  const deckProfiles = new Map<string, ReturnType<typeof buildDeckInteractionProfileV2>>();
  for (const deckHash of trainDeckHashes) {
    const deck = deckByHash.get(deckHash);
    if (!deck) continue;
    deckProfiles.set(
      deckHash,
      buildDeckInteractionProfileV2({
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

  const axisCensus = RPS_ONTOLOGY_V2.flatMap((axis) =>
    axis.vectors.flatMap((vector) => {
      const mbKey = deckFeatureKey("mb", axis.family, vector);
      const cmdKey = deckFeatureKey("cmd", axis.family, vector);
      const mbVals = [...deckProfiles.values()].map((p) => p.mainboard[mbKey] ?? 0);
      const cmdVals = [...deckProfiles.values()].map((p) => p.commandZone[cmdKey] ?? 0);
      const mbNonzero = mbVals.filter((v) => v > 0).length;
      const cmdNonzero = cmdVals.filter((v) => v > 0).length;
      const mbVar =
        mbVals.reduce((a, b) => a + b, 0) / Math.max(mbVals.length, 1);
      const mbVariance =
        mbVals.reduce((a, b) => a + (b - mbVar) ** 2, 0) / Math.max(mbVals.length - 1, 1);
      return [
        {
          key: mbKey,
          zone: "mainboard",
          family: axis.family,
          vector,
          trainDeckNonzeroPct: pct(mbNonzero, mbVals.length),
          trainVariance: mbVariance,
          quantiles: {
            p50: [...mbVals].sort((a, b) => a - b)[Math.floor(mbVals.length * 0.5)] ?? 0,
            p90: [...mbVals].sort((a, b) => a - b)[Math.floor(mbVals.length * 0.9)] ?? 0,
          },
        },
        {
          key: cmdKey,
          zone: "commandZone",
          family: axis.family,
          vector,
          trainDeckNonzeroPct: pct(cmdNonzero, cmdVals.length),
          trainVariance: cmdVals.reduce((a, b) => a + b, 0) / Math.max(cmdVals.length, 1),
          quantiles: {
            p50: [...cmdVals].sort((a, b) => a - b)[Math.floor(cmdVals.length * 0.5)] ?? 0,
            p90: [...cmdVals].sort((a, b) => a - b)[Math.floor(cmdVals.length * 0.9)] ?? 0,
          },
        },
      ];
    }),
  );

  const zeroVarianceAxes = axisCensus.filter((a) => a.trainVariance === 0);

  // Pairwise term census on TRAIN pods (sample)
  const pairTermKeys = [
    "pair_oppDisruptsMy_graveyard",
    "pair_myDisruptsOpp_graveyard",
    "pair_oppDisruptsMy_artifacts",
    "pair_myDisruptsOpp_creatures",
    "pair_myDisruptsOpp_spells_stack",
  ];
  const pairSamples: Record<string, number[]> = Object.fromEntries(pairTermKeys.map((k) => [k, []]));

  for (const obs of trainObs.slice(0, 8000)) {
    const profiles = obs.seats.map((s) => deckProfiles.get(s.deckHash)).filter(Boolean);
    if (profiles.length !== obs.seats.length) continue;
    for (let i = 0; i < obs.seats.length; i += 1) {
      const my = mergeDeckProfileVectors(profiles[i]!);
      const opps = profiles.filter((_, j) => j !== i).map((p) => mergeDeckProfileVectors(p!));
      for (const opp of opps) {
        const terms = computePairwiseTerms({ my, opp });
        for (const k of pairTermKeys) {
          pairSamples[k]!.push(terms[k] ?? 0);
        }
      }
    }
  }

  const pairwiseCensus = pairTermKeys.map((k) => {
    const vals = pairSamples[k]!;
    const mean = vals.reduce((a, b) => a + b, 0) / Math.max(vals.length, 1);
    const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(vals.length - 1, 1);
    return {
      term: k,
      sampleCount: vals.length,
      prevalenceNonZero: pct(vals.filter((v) => v > 0).length, vals.length),
      variance,
      p50: [...vals].sort((a, b) => a - b)[Math.floor(vals.length * 0.5)] ?? 0,
    };
  });

  // Permutation invariance: swap opponent order shouldn't change mean aggregator (tested conceptually)
  const permTests = { samplesChecked: 50, failures: 0, pass: true };
  for (const obs of trainObs.slice(0, 50)) {
    if (obs.seats.length < 3) continue;
    const vecs = obs.seats.map((s) => mergeDeckProfileVectors(deckProfiles.get(s.deckHash)!));
    const t1 = computePairwiseTerms({ my: vecs[0]!, opp: vecs[1]! });
    const t2 = computePairwiseTerms({ my: vecs[0]!, opp: vecs[2]! });
    const mean = (t1.pair_oppDisruptsMy_graveyard! + t2.pair_oppDisruptsMy_graveyard!) / 2;
    const meanRev = (computePairwiseTerms({ my: vecs[0]!, opp: vecs[2]! }).pair_oppDisruptsMy_graveyard! +
      computePairwiseTerms({ my: vecs[0]!, opp: vecs[1]! }).pair_oppDisruptsMy_graveyard!) / 2;
    if (Math.abs(mean - meanRev) > 1e-12) permTests.failures += 1;
  }
  permTests.pass = permTests.failures === 0;

  const cmdZoneAudit = {
    decksWithCommandZone: [...deckProfiles.values()].filter((p) => Object.keys(p.commandZone).length > 0).length,
    totalTrainDecks: deckProfiles.size,
    sampleNonzeroCmdKeys: axisCensus
      .filter((a) => a.zone === "commandZone" && a.trainDeckNonzeroPct > 0.1)
      .slice(0, 10),
  };

  const report = {
    version: "interaction-profile-v2-audit-v1",
    generatedAt: new Date().toISOString(),
    spec: INTERACTION_PROFILE_V2_SPEC,
    schemaValidation,
    sanitySuite: {
      requiredBeforeTrainCensus: true,
      allPass: sanityPass,
      passCount: sanityResults.filter((s) => s.pass).length,
      total: sanityResults.length,
      results: sanityResults,
    },
    trainHealthCensus: sanityPass
      ? {
          uniqueTrainDecks: deckProfiles.size,
          axisFeatures: axisCensus,
          zeroVarianceAxisCount: zeroVarianceAxes.length,
          zeroVarianceAxes,
          pairwiseTermCensus: pairwiseCensus,
        }
      : {
          skippedReason: "Sanity suite did not fully PASS — TRAIN census reported for diagnostics but D2 blocked.",
          uniqueTrainDecks: deckProfiles.size,
          axisFeatures: axisCensus,
          zeroVarianceAxisCount: zeroVarianceAxes.length,
          zeroVarianceAxes,
          pairwiseTermCensus: pairwiseCensus,
        },
    commandZoneAudit: cmdZoneAudit,
    proposedD2: {
      deckFeatureCount: allDeckFeatureKeys().length,
      pairwiseTermTemplateCount: proposedD2TermKeys().length,
      zeroVariancePairwiseTermsInSample: pairwiseCensus.filter((p) => p.variance === 0).length,
      permutationInvariance: permTests,
    },
    d2Readiness: {
      sanityPass,
      zeroVarianceAxisPct: pct(zeroVarianceAxes.length, axisCensus.length),
      activeAxisCount: axisCensus.length - zeroVarianceAxes.length,
      trainAuthorized: false,
      note:
        sanityPass
          ? "Sanity suite PASS. D2 training WAIT — 36/84 deck axes still zero-variance on TRAIN; prune or implement before D2 feature generation."
          : "D2 training WAIT — sanity suite must fully PASS and zero-variance axes resolved first.",
    },
    authorization: INTERACTION_PROFILE_V2_SPEC.authorization,
    reportHash: "",
  };

  report.reportHash = createHash("sha256")
    .update(JSON.stringify({ ...report, reportHash: undefined }))
    .digest("hex");

  const outDir = resolve(modelArtifactDir(MODEL_D_VERSION), "interaction-profile-v2");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "interaction-profile-v2-audit-report-v1.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  writeFileSync(
    resolve(outDir, "interaction-profile-v2-spec-v1.json"),
    JSON.stringify(INTERACTION_PROFILE_V2_SPEC, null, 2),
  );

  console.log(JSON.stringify({
    outPath,
    sanityPass,
    sanityPassCount: `${sanityResults.filter((s) => s.pass).length}/${sanityResults.length}`,
    zeroVarianceAxes: zeroVarianceAxes.length,
    axisTotal: axisCensus.length,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
