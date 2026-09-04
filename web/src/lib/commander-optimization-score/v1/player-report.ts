import { COS_V1_ENAB_BUCKETS, COS_V1_TERM_BUCKETS } from "./constants";
import { COS_V1_PROFILE_META } from "./profile-scalars";
import type { CosV1ComboRow, CosV1CompleteHit } from "./architecture-from-hits";
import type {
  CosV1ArchitectureFingerprint,
  CosV1KnownCombo,
  CosV1PlayerReport,
  CosV1PlayerReportAxis,
  CosV1Score,
  CosV1WinCondition,
} from "./types";

const TERM_LABEL: Record<(typeof COS_V1_TERM_BUCKETS)[number], string> = {
  WIN_THE_GAME: "Win the game",
  OPPONENT_LOSES_THE_GAME: "Opponent loses",
  DRAW_THE_GAME: "Draw the game",
  INFINITE_DAMAGE: "Infinite damage",
  INFINITE_LIFELOSS: "Infinite life loss",
  INFINITE_MILL: "Infinite mill",
  EXILE_LIBRARIES: "Exile libraries",
  LIFE_TOTAL_MANIPULATION: "Life-total manipulation",
};

const ENAB_LABEL: Record<(typeof COS_V1_ENAB_BUCKETS)[number], string> = {
  MANA: "mana",
  DRAW: "draw",
  TOKENS: "tokens",
  ETB: "enters",
  LTB: "leaves",
  COUNTERS: "counters",
  STORM: "storm",
  UNTAP: "untap",
  SELF_MILL: "self-mill",
  CASTS: "casts",
  LANDFALL: "landfall",
  MAGECRAFT: "magecraft",
  SACRIFICE: "sacrifice",
  OTHER_ENABLING: "other enabling loops",
};

const MAX_COMBOS_SHOWN = 10;
const MAX_SYNERGIES = 6;

export function ordinalPercentile(value: number): string {
  const n = Math.round(value);
  const m = n % 100;
  if (m >= 11 && m <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function bucketLabel(id: string): string {
  if (id in TERM_LABEL) return TERM_LABEL[id as keyof typeof TERM_LABEL];
  if (id in ENAB_LABEL) return ENAB_LABEL[id as keyof typeof ENAB_LABEL];
  return id
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function peerPhrase(mapping: "within_commander" | "global" | "blended"): string {
  if (mapping === "within_commander") return "other builds of this commander";
  if (mapping === "blended") return "this commander plus the broader COS reference";
  return "comparable decks in the global reference";
}

function axisExplanation(axis: CosV1Score["profile"][number]): string {
  const p = Math.round(axis.percentile);
  const peer = peerPhrase(axis.mapping);
  const associated =
    axis.role === "load_bearing"
      ? "This is one of the dimensions associated with the frozen strength model."
      : "This is a descriptive characteristic. It is not averaged into Competitive Strength.";

  // Reporting a percentile here would describe the reference population rather
  // than the deck: every deck without a verified line sits at the same floor.
  if (!axis.measurable) {
    return `${axis.label} is not measurable for this 99. It is derived entirely from verified CommanderSpellbook lines, and this list has none, so there is no basis to place it against ${peer}. This is not a finding that the deck is weak on ${axis.label.toLowerCase()}. ${associated}`;
  }

  let standing: string;
  if (p >= 80) standing = `This build uses an unusually high ${axis.label.toLowerCase()} profile relative to ${peer}.`;
  else if (p >= 60) standing = `This build sits above typical ${peer} on ${axis.label.toLowerCase()}.`;
  else if (p >= 40) standing = `This build is near typical ${peer} on ${axis.label.toLowerCase()}.`;
  else standing = `This build is below typical ${peer} on ${axis.label.toLowerCase()}.`;
  return `${standing} ${associated}`;
}

function competitiveStrengthBlurb(score: CosV1Score): string {
  if (score.failure) {
    return score.failure.unresolvedNames?.length
      ? `Competitive Strength could not be scored because these cards could not be resolved: ${score.failure.unresolvedNames.join(", ")}.`
      : "Competitive Strength could not be scored for this list. The frozen model will not invent a number from an incomplete or unresolvable deck.";
  }
  if (score.commanderBaselineStatus === "COMMANDER_BASELINE_UNCALIBRATED") {
    return "Competitive Strength is withheld because this commander has no calibrated baseline. COS will not invent a 0–100 grade from a missing intercept. The ten profile axes and Build Optimization still describe this 99.";
  }
  if (score.competitiveStrength == null) {
    return "Competitive Strength is unavailable for this list.";
  }
  const p = ordinalPercentile(score.competitiveStrength);
  return `Competitive Strength is the ${p} percentile on the frozen global grid: commander baseline plus this 99's architecture and construction. Full scoring coverage. It is not an expected win rate, and the ten profile numbers below are not added to produce it.`;
}

function buildOptimizationBlurb(score: CosV1Score): string {
  if (score.buildOptimization == null) {
    return "Build Optimization was not scored. When present, it answers how optimized this 99 appears relative to reference lists — not an expected win percentile.";
  }
  const p = ordinalPercentile(score.buildOptimization);
  const n = score.commanderReferenceCount;
  if (score.buildOptimizationReferenceDepth === "STRONG") {
    return `Build Optimization is the ${p} percentile among other observed builds of the same commander (${n} lists). That is relative 99 quality — not an expected win percentile.`;
  }
  if (score.buildOptimizationReferenceDepth === "NEW_COMMANDER") {
    return `Build Optimization is the ${p} percentile on the broader COS build reference. This commander has no same-commander history yet, so the comparison uses the global residual distribution.`;
  }
  return `Build Optimization is the ${p} percentile. COS compares your 99 primarily with builds of the same commander; with ${n} observed list${n === 1 ? "" : "s"}, it also blends in the broader build reference. Not an expected win percentile.`;
}

function howThisDeckWorks(architecture: CosV1ArchitectureFingerprint | null, zeroCombo: boolean): string {
  if (!architecture || zeroCombo || architecture.nNormalizedCombos === 0) {
    return "This 99 has no complete CommanderSpellbook lines under the frozen CARD_COMPLETE detector. The strength model still scores construction and access; it does not invent a combo identity.";
  }
  const n = architecture.nNormalizedCombos;
  const term = architecture.nTerminalRoutes;
  const loops = architecture.nResourceOnlyLoops;
  const min = architecture.minComboCardCount;
  const dep =
    architecture.commanderDependence === "COMMANDER_DEPENDENT"
      ? "These lines require the commander."
      : architecture.commanderDependence === "COMMANDER_INDEPENDENT"
        ? "The commander is not required for these lines."
        : architecture.commanderDependence === "MIXED"
          ? "Some lines need the commander and some do not."
          : "";
  const shortest = min != null ? ` The shortest complete line is ${min} cards.` : "";
  return `This 99 has ${n} complete CommanderSpellbook line${n === 1 ? "" : "s"} (unique card-sets). ${term} ${term === 1 ? "is a" : "are"} terminal win route${term === 1 ? "" : "s"}; ${loops} ${loops === 1 ? "is a" : "are"} resource loop${loops === 1 ? "" : "s"}.${shortest} ${dep}`.trim();
}

function resolveName(oid: string, names: Map<string, string>): string {
  return names.get(oid) || oid.slice(0, 8);
}

function knownCombos(
  hits: CosV1CompleteHit[],
  comboIndex: Map<string, CosV1ComboRow>,
  names: Map<string, string>,
): CosV1KnownCombo[] {
  const seen = new Set<string>();
  const rows: CosV1KnownCombo[] = [];
  for (const hit of hits) {
    if (!hit.cardSetSignature || seen.has(hit.cardSetSignature)) continue;
    seen.add(hit.cardSetSignature);
    const meta = comboIndex.get(hit.cardSetSignature);
    const oids = hit.cardSetSignature.split("|").filter(Boolean);
    const kind: CosV1KnownCombo["kind"] = meta?.isTerminalRoute
      ? "terminal"
      : meta?.isResourceOnlyLoop
        ? "resource"
        : "other";
    const buckets = [...(meta?.terminalBuckets ?? []), ...(meta?.enablingBuckets ?? [])];
    rows.push({
      pieces: oids.map((oid) => resolveName(oid, names)),
      cardCount: meta?.comboCardCount ?? oids.length,
      commanderInvolved: hit.commanderInvolved,
      kind,
      buckets: buckets.map(bucketLabel),
    });
  }
  rows.sort((a, b) => {
    const kindRank = { terminal: 0, resource: 1, other: 2 };
    if (kindRank[a.kind] !== kindRank[b.kind]) return kindRank[a.kind] - kindRank[b.kind];
    if (a.cardCount !== b.cardCount) return a.cardCount - b.cardCount;
    return a.pieces.join(" + ").localeCompare(b.pieces.join(" + "));
  });
  return rows;
}

function keySynergies(
  hits: CosV1CompleteHit[],
  combos: CosV1KnownCombo[],
  names: Map<string, string>,
  architecture: CosV1ArchitectureFingerprint | null,
): string[] {
  if (!combos.length) return [];
  const cardHits = new Map<string, number>();
  const seen = new Set<string>();
  for (const hit of hits) {
    if (!hit.cardSetSignature || seen.has(hit.cardSetSignature)) continue;
    seen.add(hit.cardSetSignature);
    for (const oid of hit.cardSetSignature.split("|").filter(Boolean)) {
      cardHits.set(oid, (cardHits.get(oid) ?? 0) + 1);
    }
  }
  const shared = [...cardHits.entries()]
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1] || resolveName(a[0], names).localeCompare(resolveName(b[0], names)));
  const lines: string[] = [];
  if (architecture && architecture.nCommanderInvolved > 0) {
    lines.push(
      `The commander is a piece in ${architecture.nCommanderInvolved} of ${architecture.nNormalizedCombos} verified lines.`,
    );
  }
  for (const [oid, n] of shared.slice(0, MAX_SYNERGIES)) {
    lines.push(`${resolveName(oid, names)} appears in ${n} complete Spellbook lines.`);
  }
  if (!shared.length && combos[0]) {
    const first = combos.slice(0, 3).map((c) => c.pieces.join(" + "));
    lines.push(`Verified overlapping lines start with ${first.join("; ")}.`);
  }
  return lines.slice(0, MAX_SYNERGIES);
}

function winConditions(
  architecture: CosV1ArchitectureFingerprint | null,
  combos: CosV1KnownCombo[],
): CosV1WinCondition[] {
  const out: CosV1WinCondition[] = [];
  if (!architecture || architecture.nNormalizedCombos === 0) {
    out.push({
      rank: "Backup",
      title: "No verified Spellbook terminal",
      detail:
        "This list has no CARD_COMPLETE CommanderSpellbook line. Any win path here is outside that verified catalog — not a combo score of zero out of ten.",
    });
    return out;
  }

  const termCounts = new Map<string, number>();
  for (const combo of combos.filter((c) => c.kind === "terminal")) {
    for (const bucket of combo.buckets) {
      termCounts.set(bucket, (termCounts.get(bucket) ?? 0) + 1);
    }
  }
  const ranked = [...termCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (ranked[0]) {
    out.push({
      rank: "Primary",
      title: ranked[0][0],
      detail: `${ranked[0][1]} verified terminal line${ranked[0][1] === 1 ? "" : "s"} close this way.`,
    });
  }
  for (const [title, n] of ranked.slice(1, 3)) {
    out.push({
      rank: "Secondary",
      title,
      detail: `${n} additional verified terminal line${n === 1 ? "" : "s"} close this way.`,
    });
  }
  const resources = combos.filter((c) => c.kind === "resource").length;
  if (resources > 0) {
    const engines = architecture.enablingBuckets.slice(0, 4).map(bucketLabel);
    out.push({
      rank: "Backup",
      title: "Resource loops",
      detail: `${resources} verified resource loop${resources === 1 ? "" : "s"}${
        engines.length ? ` (${engines.join(", ")})` : ""
      }. These are engines, not automatic wins.`,
    });
  } else if (!ranked.length) {
    out.push({
      rank: "Backup",
      title: "Non-terminal lines only",
      detail: "Complete Spellbook lines are present, but none are classified as a terminal win route.",
    });
  }
  return out;
}

function whyTheScore(score: CosV1Score): string[] {
  // Unmeasurable axes are excluded: citing Win architecture as a dimension
  // that "sits lower" reads as a verdict on the deck when it only reflects the
  // absence of a verified combo line, which the combo section already states.
  const drivers = score.profile.filter((a) => a.role === "load_bearing" && a.measurable);
  const high = [...drivers].sort((a, b) => b.percentile - a.percentile).filter((a) => a.percentile >= 70).slice(0, 3);
  const low = [...drivers].sort((a, b) => a.percentile - b.percentile).filter((a) => a.percentile < 40).slice(0, 2);
  const lines: string[] = [];
  if (high.length) {
    lines.push(
      `Strength-associated dimensions that stand out high: ${high
        .map((a) => `${a.label} (${ordinalPercentile(a.percentile)} percentile)`)
        .join("; ")}.`,
    );
  }
  if (low.length) {
    lines.push(
      `Strength-associated dimensions that sit lower: ${low
        .map((a) => `${a.label} (${ordinalPercentile(a.percentile)} percentile)`)
        .join("; ")}.`,
    );
  }
  if (!high.length && !low.length && drivers.length) {
    lines.push("The strength-associated dimensions for this list sit near the middle of their reference sets.");
  }
  lines.push(
    "These percentiles describe the deck relative to comparable lists. They are not additive contributions to Competitive Strength.",
  );
  if (score.commanderBaselineStatus === "COMMANDER_BASELINE_UNCALIBRATED") {
    lines.push(
      "Competitive Strength is not published for this commander. The intercept is uncalibrated, and COS will not substitute S=0 as if it were a real baseline.",
    );
  }
  return lines;
}

function optimizationHeadroom(score: CosV1Score, architecture: CosV1ArchitectureFingerprint | null): string[] {
  const lines: string[] = [];
  // Naming an unmeasurable axis as the deck's biggest opportunity sends the
  // player after something that cannot be improved by construction: Redundancy
  // at the 0th percentile means "no verified combo line", not "add backups".
  const ranked = [...score.profile].filter((a) => a.measurable).sort((a, b) => a.percentile - b.percentile);
  const weak = ranked.filter((a) => a.percentile < 45).slice(0, 3);
  if (weak.length) {
    lines.push(
      `The most room on the profile is ${weak
        .map((a) => `${a.label} (${ordinalPercentile(a.percentile)} percentile versus ${peerPhrase(a.mapping)})`)
        .join("; ")}. That is a description of this 99, not a Constructor instruction.`,
    );
  }
  if (score.buildOptimizationStatus === "ok" && score.buildOptimization != null && score.buildOptimization < 40) {
    lines.push(
      `Build Optimization is the ${ordinalPercentile(score.buildOptimization)} percentile versus other builds of this commander. That is relative 99 quality, not a forecast that the deck will lose.`,
    );
  }
  if (architecture && architecture.nNormalizedCombos === 0) {
    lines.push(
      "There is no verified Spellbook terminal. A complete line would change Win Architecture; it would not add a fixed number of Competitive Strength points.",
    );
  }
  if (!lines.length) {
    lines.push(
      "No profile axis is a clear outlier low. Headroom, if any, is modest on these descriptive and strength-associated dimensions — Constructor still decides what to change.",
    );
  }
  return lines;
}

export function buildCosV1PlayerReport(args: {
  score: CosV1Score;
  architecture: CosV1ArchitectureFingerprint | null;
  hits: CosV1CompleteHit[];
  comboIndex: Map<string, CosV1ComboRow>;
  names: Map<string, string>;
}): CosV1PlayerReport {
  const combos = knownCombos(args.hits, args.comboIndex, args.names);
  const profile: CosV1PlayerReportAxis[] = args.score.profile.map((axis) => ({
    id: axis.id,
    label: COS_V1_PROFILE_META.find((m) => m.id === axis.id)?.label ?? axis.label,
    measures: COS_V1_PROFILE_META.find((m) => m.id === axis.id)?.measures ?? axis.measures,
    band: axis.role === "load_bearing" ? "Strength drivers" : "Deck characteristics",
    percentile: axis.percentile,
    mapping: axis.mapping,
    explanation: axisExplanation(axis),
    measurable: axis.measurable,
    ...(axis.unmeasurableReason ? { unmeasurableReason: axis.unmeasurableReason } : {}),
  }));
  return {
    competitiveStrengthBlurb: competitiveStrengthBlurb(args.score),
    buildOptimizationBlurb: buildOptimizationBlurb(args.score),
    profile,
    howThisDeckWorks: howThisDeckWorks(args.architecture, args.score.zeroCombo),
    keySynergies: keySynergies(args.hits, combos, args.names, args.architecture),
    knownCombos: combos.slice(0, MAX_COMBOS_SHOWN),
    knownComboCount: combos.length,
    winConditions: winConditions(args.architecture, combos),
    whyTheScore: whyTheScore(args.score),
    optimizationHeadroom: optimizationHeadroom(args.score, args.architecture),
  };
}

export function cardNameMap(args: {
  commanderOracleIds: string[];
  mainboard: Array<{ oracleId?: string; name?: string }>;
  points?: Map<string, { name?: string }>;
}): Map<string, string> {
  const names = new Map<string, string>();
  for (const [oid, point] of args.points ?? []) {
    if (point.name) names.set(oid, point.name);
  }
  for (const card of args.mainboard) {
    if (card.oracleId && card.name) names.set(card.oracleId, card.name);
  }
  return names;
}
