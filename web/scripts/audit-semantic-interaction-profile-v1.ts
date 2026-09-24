#!/usr/bin/env npx tsx
/**
 * Semantic interaction-profile structural audit — TRAIN/catalog only.
 * No TEST outcomes, no Model D coefficient tuning.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { lookupGoldenByName } from "./lib/load-golden-catalog-index";
import { normalizeOracleName } from "../src/lib/deck-builder/golden-catalog/normalize-name";
import { loadCombinedCorpus } from "../src/lib/commander-strategy/combined-corpus-v1";
import {
  filterPrimaryPodSize,
  loadSplitObservations,
} from "../src/lib/commander-strategy/model-a/dataset-v1";
import { buildDeckFeatureBundle } from "../src/lib/commander-strategy/model-c/deck-features-v1";
import { loadCommanderGameChangerSnapshot } from "../src/lib/commander-strategy/model-c/game-changer-snapshot-v1";
import { loadFeatureNames as loadC0FeatureNames } from "../src/lib/commander-strategy/model-c/feature-matrix-io-v1";
import { loadShadowSemanticIndex } from "../src/lib/commander-strategy/shadow-semantic-index";
import {
  buildCardInteractionProfile,
  scoredDimensionsToVector,
} from "../src/lib/commander-strategy/card-interaction-profile-v1";
import { SEMANTIC_MATCHUP_CHANNELS } from "../src/lib/commander-strategy/model-d/matchup-interaction-features-v1";
import {
  loadTrainingSnapshotManifest,
  modelArtifactDir,
} from "../src/lib/commander-strategy/training-snapshot-v1";
import { MODEL_D_VERSION } from "../src/lib/commander-strategy/model-d/types";
import { buildCardFeatureBundle as buildVisualizationCardBundle } from "@/lib/semantic-visualization/feature-vector-v1";

loadProjectEnvLocal();

type RootCause =
  | "A_source_never_populated"
  | "B_mapping_incomplete"
  | "C_aggregation_dropped"
  | "D_key_mismatch"
  | "E_construction_forces_zero"
  | "F_genuine_absence"
  | "mixed";

const CHANNELS = SEMANTIC_MATCHUP_CHANNELS.filter((c) => !("dotProduct" in c && c.dotProduct)) as Array<{
  name: string;
  myKey: string;
  oppKey: string;
}>;

function pct(n: number, d: number): number {
  return d > 0 ? n / d : 0;
}

function lookupOracleId(catalog: Awaited<ReturnType<typeof loadDeckResolutionCatalog>>, name: string): string | null {
  const card = lookupGoldenByName(catalog, name);
  if (card?.oracleId) return card.oracleId;
  const matches = catalog.byNormalizedName.get(normalizeOracleName(name));
  return matches?.[0]?.oracleId ?? null;
}

async function main() {
  const manifest = loadTrainingSnapshotManifest();
  const corpus = await loadCombinedCorpus(manifest.topdeckSourceRuns.map((r) => r.month), {
    includeRawTournaments: false,
  });
  const catalog = await loadDeckResolutionCatalog();
  const shadow = await loadShadowSemanticIndex();
  const gcSnapshot = loadCommanderGameChangerSnapshot();
  const basicColumns = loadC0FeatureNames("C0").basicColumns;

  const trainObs = filterPrimaryPodSize(loadSplitObservations({ manifest, corpus, split: "train" }));

  const deckByHash = new Map(
    corpus.combined.decks
      .filter((d) => d.deckHash && !d.deckHash.startsWith("unresolved:"))
      .map((d) => [d.deckHash, d] as const),
  );

  const bundleCache = new Map<string, Record<string, number>>();
  const trainDeckHashes = new Set<string>();
  for (const obs of trainObs) {
    for (const seat of obs.seats) trainDeckHashes.add(seat.deckHash);
  }

  for (const deckHash of trainDeckHashes) {
    const deck = deckByHash.get(deckHash);
    if (!deck) continue;
    const bundle = buildDeckFeatureBundle({
      deck,
      catalog,
      shadowIndex: shadow,
      gameChangerSnapshot: gcSnapshot,
      basicColumns,
    });
    bundleCache.set(deckHash, bundle.semantic);
  }

  // Card-level prevalence across paper catalog + shadow
  const cardLevel: Record<string, { cardsWithMy: number; cardsWithOpp: number; total: number }> = {};
  for (const ch of CHANNELS) {
    cardLevel[ch.name] = { cardsWithMy: 0, cardsWithOpp: 0, total: 0 };
  }

  let cardAuditTotal = 0;
  for (const [oracleId, card] of catalog.byOracleId.entries()) {
    const paper = catalog.paperByOracleId.get(oracleId);
    if (!paper?.paperEligible) continue;
    const sh = shadow.byOracleId.get(oracleId);
    if (!sh) continue;
    cardAuditTotal += 1;

    const profile = buildCardInteractionProfile({
      oracleId,
      card,
      actions: sh.semantic.actions,
      abilities: sh.semantic.abilities,
      semanticVersion: shadow.semanticVersion,
      parserVersion: shadow.parserVersion,
      parserBlobClosure: shadow.parserBlobClosure,
    });
    const dep = scoredDimensionsToVector(profile.dependencies);
    const attack = scoredDimensionsToVector(profile.answerCapabilities);
    const threat = scoredDimensionsToVector(profile.threatCapabilities);
    const roles = new Set<string>(); // filled per deck, not card - skip

    for (const ch of CHANNELS) {
      const myDim = ch.myKey.replace(/^rc8_(dep|attack|role)_/, "");
      let myCard = 0;
      if (ch.myKey.startsWith("rc8_dep_")) myCard = dep[myDim] ?? 0;
      else if (ch.myKey.startsWith("rc8_attack_")) myCard = (attack[myDim] ?? 0) || (threat[myDim] ?? 0);
      else if (ch.myKey.startsWith("rc8_role_")) myCard = 0; // role is deck-level

      const oppDim = ch.oppKey.replace(/^rc8_attack_/, "");
      const oppCard = attack[oppDim] ?? 0;

      if (myCard > 0) cardLevel[ch.name]!.cardsWithMy += 1;
      if (oppCard > 0) cardLevel[ch.name]!.cardsWithOpp += 1;
      cardLevel[ch.name]!.total += 1;
    }
  }

  // Deck-level prevalence on TRAIN unique decks
  const deckLevel: Record<string, { myNonzero: number; oppNonzero: number; bothNonzero: number; total: number }> = {};
  for (const ch of CHANNELS) {
    deckLevel[ch.name] = { myNonzero: 0, oppNonzero: 0, bothNonzero: 0, total: 0 };
  }

  for (const [, sem] of bundleCache) {
    for (const ch of CHANNELS) {
      const my = sem[ch.myKey] ?? 0;
      const opp = sem[ch.oppKey] ?? 0;
      deckLevel[ch.name]!.total += 1;
      if (my > 0) deckLevel[ch.name]!.myNonzero += 1;
      if (opp > 0) deckLevel[ch.name]!.oppNonzero += 1;
      if (my > 0 && opp > 0) deckLevel[ch.name]!.bothNonzero += 1;
    }
  }

  // Pod seat cross-product on TRAIN
  const podStats: Record<string, { seats: number; myNonzero: number; oppNonzero: number; productNonzero: number }> = {};
  for (const ch of CHANNELS) {
    podStats[ch.name] = { seats: 0, myNonzero: 0, oppNonzero: 0, productNonzero: 0 };
  }

  for (const obs of trainObs) {
    const oppBundles = obs.seats.map((s) => bundleCache.get(s.deckHash) ?? {});
    for (let i = 0; i < obs.seats.length; i += 1) {
      const mySem = oppBundles[i] ?? {};
      const opponents = oppBundles.filter((_, j) => j !== i);
      for (const ch of CHANNELS) {
        const my = mySem[ch.myKey] ?? 0;
        podStats[ch.name]!.seats += 1;
        if (my > 0) podStats[ch.name]!.myNonzero += 1;
        let anyOpp = false;
        let anyProduct = false;
        for (const oppSem of opponents) {
          const opp = oppSem[ch.oppKey] ?? 0;
          if (opp > 0) anyOpp = true;
          if (my * opp > 0) anyProduct = true;
        }
        if (anyOpp) podStats[ch.name]!.oppNonzero += 1;
        if (anyProduct) podStats[ch.name]!.productNonzero += 1;
      }
    }
  }

  function diagnoseChannel(ch: (typeof CHANNELS)[number]): {
    rootCause: RootCause;
    explanation: string;
  } {
    const dl = deckLevel[ch.name]!;
    const ps = podStats[ch.name]!;
    const myKey = ch.myKey;
    const oppKey = ch.oppKey;

    // Key mismatches (D)
    if (myKey === "rc8_dep_spell_chain_dependent" || myKey === "rc8_dep_battlefield_dependent") {
      return {
        rootCause: "A_source_never_populated",
        explanation: `${myKey} is referenced in D1 but never assigned in buildCardInteractionProfile() — dimension does not exist at card level.`,
      };
    }
    if (myKey === "rc8_attack_recursion" || myKey === "rc8_attack_card_engine") {
      return {
        rootCause: "D_key_mismatch",
        explanation: `${myKey} uses rc8_attack_ prefix but recursion/card_engine live in threatCapabilities, not answerCapabilities aggregated to rc8_attack_*.`,
      };
    }
    if (myKey === "rc8_role_token") {
      return {
        rootCause: "D_key_mismatch",
        explanation: `D1 expects rc8_role_token but deck features emit rc8_role_token_generation (DERIVED_ROLE_NAMES).`,
      };
    }

    const myDeckPct = pct(dl.myNonzero, dl.total);
    const oppDeckPct = pct(dl.oppNonzero, dl.total);
    const prodSeatPct = pct(ps.productNonzero, ps.seats);

    if (myDeckPct < 0.01 && oppDeckPct < 0.01) {
      return {
        rootCause: "A_source_never_populated",
        explanation: `Both deck-side (${myKey}, ${(myDeckPct * 100).toFixed(1)}%) and opponent-side (${oppKey}, ${(oppDeckPct * 100).toFixed(1)}%) are near-zero on TRAIN decks.`,
      };
    }
    if (myDeckPct < 0.01) {
      return {
        rootCause: "A_source_never_populated",
        explanation: `Deck-side ${myKey} is near-zero (${(myDeckPct * 100).toFixed(1)}% decks) while opponent-side ${oppKey} has ${(oppDeckPct * 100).toFixed(1)}% coverage — cross-product blocked by missing dependency axis.`,
      };
    }
    if (oppDeckPct < 0.01) {
      return {
        rootCause: "B_mapping_incomplete",
        explanation: `Opponent-side ${oppKey} is near-zero (${(oppDeckPct * 100).toFixed(1)}% decks) despite deck-side coverage ${(myDeckPct * 100).toFixed(1)}% — attack/disruption mapping may be too narrow (e.g. requires specific destroy+objectTypes pattern).`,
      };
    }
    if (prodSeatPct < 0.01) {
      return {
        rootCause: "E_construction_forces_zero",
        explanation: `Both sides have deck coverage (my ${(myDeckPct * 100).toFixed(1)}%, opp ${(oppDeckPct * 100).toFixed(1)}%) but seat cross-product nonzero only ${(prodSeatPct * 100).toFixed(2)}% — likely mismatched decks in pods or multiplicative sparsity.`,
      };
    }
    return {
      rootCause: "mixed",
      explanation: `Channel active: my ${(myDeckPct * 100).toFixed(1)}%, opp ${(oppDeckPct * 100).toFixed(1)}%, cross-product ${(prodSeatPct * 100).toFixed(1)}%.`,
    };
  }

  const channelTable = CHANNELS.map((ch) => {
    const cl = cardLevel[ch.name]!;
    const dl = deckLevel[ch.name]!;
    const ps = podStats[ch.name]!;
    const diag = diagnoseChannel(ch);
    return {
      channel: ch.name,
      deckSideFeatures: ch.myKey,
      opponentSideFeatures: ch.oppKey,
      cardLevelPrevalence: {
        mySide: pct(cl.cardsWithMy, cl.total),
        oppSide: pct(cl.cardsWithOpp, cl.total),
        paperCardsAudited: cl.total,
      },
      deckLevelPrevalenceTrain: {
        mySideNonzero: pct(dl.myNonzero, dl.total),
        oppSideNonzero: pct(dl.oppNonzero, dl.total),
        bothNonzero: pct(dl.bothNonzero, dl.total),
        uniqueDecks: dl.total,
      },
      trainPodSeat: {
        mySideNonzero: pct(ps.myNonzero, ps.seats),
        oppSideNonzero: pct(ps.oppNonzero, ps.seats),
        crossProductNonzero: pct(ps.productNonzero, ps.seats),
        seatCount: ps.seats,
      },
      rootCause: diag.rootCause,
      rootCauseExplanation: diag.explanation,
    };
  });

  // attack_vuln dot channel
  const attackKeys = new Set<string>();
  const vulnKeys = new Set<string>();
  for (const sem of bundleCache.values()) {
    for (const k of Object.keys(sem)) {
      if (k.startsWith("rc8_attack_")) attackKeys.add(k);
      if (k.startsWith("rc8_vuln_")) vulnKeys.add(k);
    }
  }
  let dotNonzero = 0;
  let dotSeats = 0;
  for (const obs of trainObs) {
    const bundles = obs.seats.map((s) => bundleCache.get(s.deckHash) ?? {});
    for (let i = 0; i < obs.seats.length; i += 1) {
      dotSeats += 1;
      const my = bundles[i] ?? {};
      let sum = 0;
      for (const ak of attackKeys) {
        const suffix = ak.slice("rc8_attack_".length);
        const myVal = my[ak] ?? 0;
        for (let j = 0; j < bundles.length; j += 1) {
          if (j === i) continue;
          const opp = bundles[j] ?? {};
          sum += myVal * (opp[`rc8_vuln_${suffix}`] ?? 0);
        }
      }
      if (sum > 0) dotNonzero += 1;
    }
  }

  // rc8_dep_* collapse analysis
  const depKeys = new Set<string>();
  for (const sem of bundleCache.values()) {
    for (const k of Object.keys(sem)) {
      if (k.startsWith("rc8_dep_")) depKeys.add(k);
    }
  }
  const depDeckPrevalence = [...depKeys].sort().map((k) => {
    let nz = 0;
    for (const sem of bundleCache.values()) {
      if ((sem[k] ?? 0) > 0) nz += 1;
    }
    return { key: k, trainDeckNonzeroPct: pct(nz, bundleCache.size) };
  });

  // Sanity cases
  const SANITY_CASES: Array<{ label: string; cardNames: string[]; expect: Record<string, "gt0" | "zero"> }> = [
    {
      label: "graveyard-heavy (reanimation)",
      cardNames: ["Reanimate", "Animate Dead", "Living Death"],
      expect: { "dep:graveyard_dependent": "gt0", "attack:graveyard_disruption": "zero" },
    },
    {
      label: "graveyard hate",
      cardNames: ["Rest in Peace", "Grafdigger's Cage", "Soul-Guide Lantern"],
      expect: { "attack:graveyard_disruption": "gt0", "dep:graveyard_dependent": "zero" },
    },
    {
      label: "artifact-heavy",
      cardNames: ["Sol Ring", "Mana Vault", "Grim Monolith"],
      expect: { "dep:artifact_dependent": "gt0" },
    },
    {
      label: "artifact removal",
      cardNames: ["Vandalblast", "Abrade", "Nature's Claim"],
      expect: { "attack:artifact_interaction": "gt0" },
    },
    {
      label: "token/go-wide",
      cardNames: ["Ad nauseam", "Horn of Gondor"],
      expect: { "role:token_generation": "gt0" },
    },
    {
      label: "board wipes",
      cardNames: ["Wrath of God", "Toxic Deluge", "Cyclonic Rift"],
      expect: { "attack:board_reset": "gt0" },
    },
    {
      label: "spell-heavy / draw",
      cardNames: ["Rhystic Study", "Mystic Remora", "Brainstorm"],
      expect: { "threat:card_engine": "gt0", "dep:spell_chain_dependent": "zero" },
    },
    {
      label: "countermagic",
      cardNames: ["Counterspell", "Mana Drain", "Force of Will"],
      expect: { "attack:counterspell": "gt0" },
    },
    {
      label: "tutoring",
      cardNames: ["Demonic Tutor", "Vampiric Tutor", "Enlightened Tutor"],
      expect: { "dep:library_search_dependent": "gt0" },
    },
    {
      label: "land denial",
      cardNames: ["Strip Mine", "Wasteland", "Blood Moon"],
      expect: { "attack:resource_denial": "gt0" },
    },
  ];

  const sanityResults = SANITY_CASES.map((tc) => {
    const cards = tc.cardNames.map((name) => {
      const oid = lookupOracleId(catalog, name);
      if (!oid) return { name, oracleId: null, status: "NOT_FOUND" as const };
      const card = catalog.byOracleId.get(oid)!;
      const sh = shadow.byOracleId.get(oid);
      if (!sh) return { name, oracleId: oid, status: "NO_SHADOW" as const };
      const profile = buildCardInteractionProfile({
        oracleId: oid,
        card,
        actions: sh.semantic.actions,
        abilities: sh.semantic.abilities,
        semanticVersion: shadow.semanticVersion,
        parserVersion: shadow.parserVersion,
        parserBlobClosure: shadow.parserBlobClosure,
      });
      const cardBundle = buildVisualizationCardBundle({ shadow: sh, card });
      const dep = scoredDimensionsToVector(profile.dependencies);
      const attack = scoredDimensionsToVector(profile.answerCapabilities);
      const threat = scoredDimensionsToVector(profile.threatCapabilities);
      return {
        name,
        oracleId: oid,
        status: "OK" as const,
        cardDep: dep,
        cardAttack: attack,
        cardThreat: threat,
        derivedRoles: cardBundle.derivedRoles,
        rc8ActionTypes: [...new Set(sh.semantic.actions.map((a) => a.actionType))],
      };
    });

    const checks = Object.entries(tc.expect).map(([key, expect]) => {
      let actual = 0;
      for (const c of cards) {
        if (c.status !== "OK") continue;
        if (key.startsWith("dep:")) {
          actual = Math.max(actual, c.cardDep[key.slice(4)] ?? 0);
        } else if (key.startsWith("attack:")) {
          actual = Math.max(actual, c.cardAttack[key.slice(7)] ?? 0);
        } else if (key.startsWith("threat:")) {
          actual = Math.max(actual, c.cardThreat[key.slice(7)] ?? 0);
        } else if (key.startsWith("role:")) {
          actual = Math.max(actual, c.derivedRoles.includes(key.slice(5) as never) ? 1 : 0);
        }
      }
      const pass = expect === "gt0" ? actual > 0 : actual === 0;
      return { key, expect, actual, pass };
    });

    return {
      label: tc.label,
      cards,
      checks,
      pass: checks.every((c) => c.pass) && cards.some((c) => c.status === "OK"),
    };
  });

  // Proposed generalized representation + TRAIN variance simulation
  const CAPABILITY_DIMS = [
    "creature_removal", "exile_removal", "graveyard_disruption", "counterspell",
    "artifact_interaction", "board_reset", "resource_denial", "ability_denial",
    "recursion", "card_engine", "token_production", "direct_damage",
  ];
  const DEPENDENCY_DIMS = [
    "graveyard_dependent", "library_search_dependent", "artifact_dependent",
    "creature_dependent", "activated_ability_dependent", "enchantment_dependent",
  ];
  const VULNERABILITY_DIMS = DEPENDENCY_DIMS.map((d) => d.replace("_dependent", "_vulnerable"));

  const proposedTensorDims = [
    ...CAPABILITY_DIMS.map((d) => `cap_${d}`),
    ...DEPENDENCY_DIMS.map((d) => `dep_${d}`),
    ...VULNERABILITY_DIMS.map((d) => `vuln_${d}`),
  ];

  // Simulate interaction features on TRAIN sample
  const sampleSeats: number[] = [];
  const tensorValues: Record<string, number[]> = Object.fromEntries(
    proposedTensorDims.flatMap((d) => [
      [`myAttack_x_oppVuln_${d}`, [] as number[]],
    ]).concat(
      DEPENDENCY_DIMS.map((d) => [`myDep_x_oppAttack_${d}`, [] as number[]]),
    ),
  );

  // Simpler simulation: count variance of proposed interaction terms
  const simTerms: Record<string, number[]> = {};
  const initTerm = (k: string) => { if (!simTerms[k]) simTerms[k] = []; };

  let simSeats = 0;
  for (const obs of trainObs.slice(0, 5000)) {
    const bundles = obs.seats.map((s) => bundleCache.get(s.deckHash) ?? {});
    for (let i = 0; i < obs.seats.length; i += 1) {
      simSeats += 1;
      const my = bundles[i] ?? {};
      const opps = bundles.filter((_, j) => j !== i);
      for (const opp of opps) {
        for (const cap of CAPABILITY_DIMS) {
          initTerm(`myCap_${cap}`);
          simTerms[`myCap_${cap}`]!.push(my[`rc8_attack_${cap}`] ?? 0);
          initTerm(`oppVuln_${cap.replace(/_.*/, "_vulnerable")}`);
        }
        for (const dep of DEPENDENCY_DIMS) {
          const term = `myDep_${dep}_x_oppAttack`;
          initTerm(term);
          const disruptionMap: Record<string, string> = {
            graveyard_dependent: "graveyard_disruption",
            library_search_dependent: "resource_denial",
            artifact_dependent: "artifact_interaction",
            creature_dependent: "creature_removal",
            activated_ability_dependent: "ability_denial",
            enchantment_dependent: "enchantment_interaction",
          };
          const oppAttack = opp[`rc8_attack_${disruptionMap[dep] ?? "creature_removal"}`] ?? 0;
          simTerms[term]!.push((my[`rc8_dep_${dep}`] ?? 0) * oppAttack);
        }
        for (const cap of CAPABILITY_DIMS) {
          const term = `myAttack_${cap}_x_oppVuln`;
          initTerm(term);
          const vulnKey = `rc8_vuln_${cap.replace(/_.*/, "_vulnerable")}`;
          simTerms[term]!.push((my[`rc8_attack_${cap}`] ?? 0) * (opp[vulnKey] ?? 0));
        }
      }
    }
  }

  const varianceSim = Object.entries(simTerms).map(([term, vals]) => {
    const n = vals.length;
    const mean = vals.reduce((a, b) => a + b, 0) / Math.max(n, 1);
    const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(n - 1, 1);
    const nonzero = vals.filter((v) => v > 0).length;
    return { term, sampleCount: n, variance, prevalenceNonZero: pct(nonzero, n) };
  }).sort((a, b) => b.variance - a.variance);

  const report = {
    version: "semantic-interaction-profile-audit-v1",
    generatedAt: new Date().toISOString(),
    authorization: {
      modelD1: "ACCEPTED_FROZEN_NEGATIVE",
      interactionProfileStructuralAudit: "COMPLETE",
      d2Training: "WAIT",
      oldTestScoringForD2: "NOT_AUTHORIZED",
      prospectiveHoldout: "SEALED",
      rc8: "FROZEN",
    },
    frozenD1Diagnosis: {
      d1vsD0Delta: 0.000039,
      d1vsD0Ci95: [-0.000084, 0.00017],
      conclusion: "no stable incremental signal from frozen D1",
      structuralQualification:
        "33/36 D1 features had zero TRAIN variance; 11/12 channels identically zero; only creature_dependent × creature_removal active. Does NOT prove matchup effects absent.",
    },
    channelRootCauseTable: channelTable,
    attackVulnDotChannel: {
      attackKeysFound: [...attackKeys].sort(),
      vulnKeysFound: [...vulnKeys].sort(),
      trainSeatCrossProductNonzeroPct: pct(dotNonzero, dotSeats),
      rootCause: vulnKeys.size === 0 ? "D_key_mismatch_or_zero_vuln_aggregation" : "E_construction_forces_zero",
      note: "rc8_vuln_* keys may exist but dot product requires matching attack/vuln suffix alignment.",
    },
    rc8DepCollapseAnalysis: {
      depKeysObservedOnTrainDecks: depDeckPrevalence,
      neverPopulatedInCardProfile: [
        "spell_chain_dependent",
        "battlefield_dependent",
        "triggered_ability_dependent (populated but often pruned/low)",
      ],
      typeLineOnlyDependencies: [
        "artifact_dependent (+0.2 if type line contains Artifact — measures presence not reliance)",
        "creature_dependent (+0.2 if type line contains Creature)",
        "enchantment_dependent (+0.2 if type line contains Enchantment)",
      ],
      actionPopulatedDependencies: [
        "graveyard_dependent (return_from_graveyard/reanimate actions)",
        "library_search_dependent (search actions)",
        "activated_ability_dependent (activated abilities)",
      ],
      explanation:
        "rc8_dep_* collapses because (1) two D1 dimensions never exist at card level, (2) type-line deps fire on ~all creatures/artifacts making them near-constants not RPS axes, (3) graveyard/search deps require specific RC8 actions often absent from deck aggregates, (4) D1 keys mismatch threat vs attack prefixes and role naming.",
    },
    capabilityVsDependencyDefinitions: {
      distinction: [
        "capability = what the deck can do to opponents (answers, disruption, engines)",
        "dependency = what the deck's plan requires to function",
        "vulnerability = exposed axis if that dependency is attacked",
        "presence ≠ reliance — type-line artifact_dependent is presence not plan reliance",
      ],
      currentCollapses: [
        "artifact_dependent conflates 'runs artifacts' with 'relies on artifacts'",
        "creature_dependent conflates 'has creatures' with 'creature-based strategy'",
        "rc8_attack_* only aggregates answerCapabilities, dropping threat/recursion/token engines",
        "can interact with X (attack) vs vulnerable to X (vuln) partially separated but vuln mirrors dep score not independent vulnerability audit",
      ],
    },
    proposedGeneralizedRepresentation: {
      version: "interaction-tensor-v2-draft",
      vectors: {
        capability: "quantity-weighted mean of answerCapabilities + threatCapabilities per semantic dimension",
        dependency: "plan-reliance scores from actions/plans, NOT type-line presence alone",
        vulnerability: "explicit vulnerability axes independent of dependency mirror",
      },
      pairwiseTerms: [
        "myCapability[k] × opponentVulnerability[k]",
        "opponentCapability[k] × myVulnerability[k]",
        "myDependency[k] × opponentCapability[disrupts(k)]",
        "myCapability[k] − opponentCapability[k] (relative advantage)",
      ],
      opponentAggregation: ["meanAcrossOpponents", "maxAcrossOpponents", "minAcrossOpponents", "varianceAcrossOpponents"],
      note: "Design from frozen semantic axes only — not tuned on TEST or D1 coefficients.",
    },
    trainOnlyVarianceSimulation: {
      samplePodSeats: simSeats,
      topVarianceTerms: varianceSim.slice(0, 15),
      zeroVarianceTermCount: varianceSim.filter((t) => t.variance === 0).length,
      totalTermsSimulated: varianceSim.length,
      d2HealthCriteriaPreview: {
        zeroVarianceDimensionsThreshold: "near zero, not 90%+",
        requiresBroadChannelCoverage: true,
        sanityTestsMustPass: true,
        permutationInvariance: true,
        podSizeNormalization: true,
        nanInf: 0,
      },
    },
    sanityTestResults: sanityResults,
    sanitySummary: {
      passCount: sanityResults.filter((s) => s.pass).length,
      total: sanityResults.length,
      failures: sanityResults.filter((s) => !s.pass).map((s) => ({
        label: s.label,
        failedChecks: s.checks.filter((c) => !c.pass),
      })),
    },
    reportHash: "",
  };

  report.reportHash = createHash("sha256")
    .update(JSON.stringify({ ...report, reportHash: undefined }))
    .digest("hex");

  const outDir = modelArtifactDir(MODEL_D_VERSION);
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "semantic-interaction-profile-audit-v1.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Wrote ${outPath}`);
  console.log(JSON.stringify(report.sanitySummary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
