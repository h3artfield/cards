/**
 * Customer deck-report view-model. Presentation only — does not change COS math.
 */
import { COS_V1_PROFILE_META } from "@/lib/commander-optimization-score/v1/profile-scalars";
import { ordinalPercentile } from "@/lib/commander-optimization-score/v1/player-report";
import type { CosV1Score } from "@/lib/commander-optimization-score/v1/types";
import type { SolDirectedDeckDisplayCard, SolDirectedDeckDisplayCategory } from "./professor-sol-directed-deck-display-v1-1-1";
import { SOL_DIRECTED_DECK_DISPLAY_SECTION_LABELS } from "./professor-sol-directed-deck-display-v1-1-1";
import { isBasicLandName } from "./professor-basic-land-name-v1";

export const PROFESSOR_SOL_DIRECTED_DECK_REPORT_MODEL_V1_1_1_VERSION =
  "professor-sol-directed-deck-report-model-v1-1-1";

const ROLE_BUCKETS: Array<{ label: string; test: RegExp }> = [
  { label: "Lifegain / fuel", test: /lifegain|life_gain|life gain|soul_sister|drain/i },
  { label: "Board / tokens", test: /token|go_wide|wide_board|creature_production/i },
  { label: "Counters / scaling", test: /counter|plus_one|anthem|payoff|scale|proliferate/i },
  { label: "Card advantage", test: /card_advantage|draw|selection|clue|impulse/i },
  { label: "Tutors / access", test: /tutor|access|toolbox|recruiter/i },
  { label: "Interaction", test: /interaction|removal|exile|wipe|counterspell|bounce/i },
  { label: "Protection", test: /protection|hexproof|indestructible|ward|teferi|fog|phase/i },
  { label: "Ramp / mana", test: /ramp|mana|rock|signet|medallion|talisman|crypt/i },
  { label: "Recovery", test: /recur|reanimat|reclamation|flashback|graveyard|titan|rebuild/i },
  { label: "Finishers", test: /finisher|overrun|extra_combat|lethal|close/i },
];

export type DeckReportNonland = {
  name: string;
  primaryArchitectRequirement?: string;
  primaryRole?: string;
  typeLine?: string;
};

export type DeckReportModelV111 = {
  commanderName: string;
  subtitle: string;
  competitiveStrength: number | null;
  buildOptimization: number | null;
  buildOptimizationLabel: string;
  profileBars: Array<{ label: string; percentile: number; band: string }>;
  whatItDoes: string;
  strengths: string[];
  headroom: string[];
  flow: Array<{ title: string; cards: string[]; detail?: string }>;
  synergies: Array<{ cards: string; why: string }>;
  combos: Array<{ name: string; pieces: string; result: string; commanderRequired: string }>;
  combosNone: boolean;
  winConditions: Array<{ rank: string; title: string; detail: string }>;
  competitiveStrengthNote?: string;
  whyTheScore: string[];
  roleRows: Array<{ label: string; count: number; cards: string[] }>;
  landSummary: string;
  appendix: Array<{ label: string; cards: Array<{ copies: number; name: string }> }>;
};

function firstSentence(text: string, max = 220): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  const sentence = trimmed.split(/(?<=[.!?])\s+/)[0] ?? trimmed;
  return sentence.length <= max ? sentence : `${sentence.slice(0, max - 1)}…`;
}

function roleLabelFor(requirement?: string, fallback?: string): string {
  const hay = `${requirement ?? ""} ${fallback ?? ""}`.replace(/_/g, " ");
  const hit = ROLE_BUCKETS.find((row) => row.test.test(hay));
  if (hit) return hit.label;
  const role = (fallback ?? requirement ?? "").trim();
  if (role) return "Other";
  return "Other";
}

function uniqueNames(names: string[], limit = 8): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
    if (out.length >= limit) break;
  }
  return out;
}

export function buildSolDirectedDeckReportModelV111(args: {
  commanderName: string;
  bracket: number;
  playstyle: string;
  thesis?: string;
  gamePlan?: { earlyGame?: string[]; midGame?: string[]; lateGame?: string[] };
  winPaths?: { primary?: string[]; secondary?: string[] };
  cos?: CosV1Score | null;
  nonlands?: DeckReportNonland[];
  lands?: Array<{ name: string; copies: number }>;
  grouped?: Record<SolDirectedDeckDisplayCategory, SolDirectedDeckDisplayCard[]>;
}): DeckReportModelV111 {
  const report = args.cos?.playerReport;
  const profile = args.cos?.profile ?? [];
  const metaOrder = COS_V1_PROFILE_META.map((m) => m.id);
  const profileBars = metaOrder
    .map((id) => profile.find((axis) => axis.id === id))
    .filter((axis): axis is NonNullable<typeof axis> => Boolean(axis))
    .map((axis) => ({
      label: axis.label,
      percentile: Math.round(axis.percentile),
      band: axis.role === "load_bearing" ? "Strength drivers" : "Deck characteristics",
    }));

  const rankedHigh = [...profile].sort((a, b) => b.percentile - a.percentile);
  const rankedLow = [...profile].sort((a, b) => a.percentile - b.percentile);
  const strengths = rankedHigh.slice(0, 3).map((axis) => axis.label);
  const headroom = rankedLow.slice(0, 3).map((axis) => axis.label);

  const whatItDoes =
    firstSentence(args.winPaths?.primary?.[0] ?? "") ||
    firstSentence(args.thesis ?? "") ||
    firstSentence(report?.howThisDeckWorks ?? "") ||
    "This list advances the commander's existing game plan.";

  const byRole = new Map<string, string[]>();
  for (const card of args.nonlands ?? []) {
    const label = roleLabelFor(card.primaryArchitectRequirement, card.primaryRole);
    const list = byRole.get(label) ?? [];
    list.push(card.name);
    byRole.set(label, list);
  }
  const roleRows = [...byRole.entries()]
    .map(([label, cards]) => ({ label, count: cards.length, cards: uniqueNames(cards, 12) }))
    .sort((a, b) => {
      if (a.label === "Other") return 1;
      if (b.label === "Other") return -1;
      return b.count - a.count || a.label.localeCompare(b.label);
    });

  const cardsIn = (label: string) => roleRows.find((row) => row.label === label)?.cards ?? [];
  const flow: Array<{ title: string; cards: string[]; detail?: string }> = [];
  const fuel = uniqueNames([...cardsIn("Lifegain / fuel"), ...cardsIn("Board / tokens")], 6);
  const scale = uniqueNames(cardsIn("Counters / scaling"), 6);
  const finish = uniqueNames(cardsIn("Finishers"), 5);
  const recover = uniqueNames(cardsIn("Recovery"), 4);
  if (fuel.length) {
    flow.push({
      title: "Build resources",
      cards: fuel,
      detail: args.gamePlan?.earlyGame?.[0] ? firstSentence(args.gamePlan.earlyGame[0], 160) : "Functional options, not a required sequence.",
    });
  }
  if (scale.length) {
    flow.push({
      title: "Scale the board",
      cards: scale,
      detail: args.gamePlan?.midGame?.[0] ? firstSentence(args.gamePlan.midGame[0], 160) : "These multiply or preserve an established board.",
    });
  }
  if (finish.length) {
    flow.push({
      title: "Convert to a win",
      cards: finish,
      detail: args.gamePlan?.lateGame?.[0] ? firstSentence(args.gamePlan.lateGame[0], 160) : "Separate finishers — not steps in one chain.",
    });
  }
  if (recover.length) {
    flow.push({
      title: "Recovery",
      cards: recover,
      detail: "Rebuilds after interaction. This is an engine, not a win condition.",
    });
  }
  if (!flow.length && (args.gamePlan?.earlyGame?.length || args.gamePlan?.midGame?.length || args.gamePlan?.lateGame?.length)) {
    if (args.gamePlan.earlyGame?.[0]) flow.push({ title: "Early", cards: [], detail: firstSentence(args.gamePlan.earlyGame[0], 200) });
    if (args.gamePlan.midGame?.[0]) flow.push({ title: "Mid", cards: [], detail: firstSentence(args.gamePlan.midGame[0], 200) });
    if (args.gamePlan.lateGame?.[0]) flow.push({ title: "Late", cards: [], detail: firstSentence(args.gamePlan.lateGame[0], 200) });
  }

  const synergies: Array<{ cards: string; why: string }> = [];
  for (const combo of report?.knownCombos ?? []) {
    if (synergies.length >= 8 || combo.pieces.length < 2) continue;
    synergies.push({
      cards: combo.pieces.slice(0, 3).join(" + "),
      why: combo.buckets[0]
        ? `Verified CommanderSpellbook ${combo.kind} line (${combo.buckets[0]}).`
        : `Verified CommanderSpellbook ${combo.kind} line.`,
    });
  }

  const combos = (report?.knownCombos ?? []).slice(0, 8).map((combo) => ({
    name: combo.kind === "terminal" ? "Terminal line" : combo.kind === "resource" ? "Resource loop" : "Spellbook line",
    pieces: combo.pieces.join(" + "),
    result: combo.buckets[0] ?? combo.kind,
    commanderRequired: combo.commanderInvolved ? "Yes" : "No",
  }));

  const lands = args.lands ?? [];
  const basicCopies = lands.filter((land) => isBasicLandName(land.name)).reduce((sum, land) => sum + land.copies, 0);
  const utilityNames = lands.filter((land) => !isBasicLandName(land.name)).map((land) => land.name);
  const landCount = lands.reduce((sum, land) => sum + land.copies, 0);
  const landSummary =
    landCount > 0
      ? `${landCount} lands${basicCopies ? ` · ${basicCopies} basics` : ""}${
          utilityNames.length ? ` · ${utilityNames.length} utility` : ""
        }`
      : "";

  const appendix = args.grouped
    ? (Object.entries(args.grouped) as Array<[SolDirectedDeckDisplayCategory, SolDirectedDeckDisplayCard[]]>)
        .filter(([, cards]) => cards.length > 0)
        .map(([category, cards]) => ({
          label: SOL_DIRECTED_DECK_DISPLAY_SECTION_LABELS[category],
          cards: cards.map((card) => ({ copies: card.copies, name: card.name })),
        }))
    : [];

  const buildOpt = args.cos?.buildOptimization;
  const buildOptimizationLabel =
    buildOpt != null
      ? `${ordinalPercentile(buildOpt)} percentile`
      : "Unavailable";

  return {
    commanderName: args.commanderName,
    subtitle: `Bracket ${args.bracket} · ${args.playstyle}`,
    competitiveStrength: args.cos?.competitiveStrength != null ? Math.round(args.cos.competitiveStrength) : null,
    competitiveStrengthNote:
      args.cos?.commanderBaselineStatus === "COMMANDER_BASELINE_UNCALIBRATED"
        ? "Uncalibrated — no commander intercept"
        : undefined,
    buildOptimization: buildOpt != null ? Math.round(buildOpt) : null,
    buildOptimizationLabel,
    profileBars,
    whatItDoes,
    strengths,
    headroom,
    flow,
    synergies: synergies.slice(0, 8),
    combos,
    combosNone: !combos.length,
    winConditions: (() => {
      const out: DeckReportModelV111["winConditions"] = [];
      const looksLikeEngine = (text: string) =>
        /draw|cards and mana|rebuild|value|engine|triggers generate/i.test(text) &&
        !/lethal|win the game|combat close|overrun|finisher/i.test(text);
      if (args.winPaths?.primary?.[0]) {
        out.push({
          rank: "Primary win",
          title: "Closes the game",
          detail: firstSentence(args.winPaths.primary[0], 280),
        });
      }
      if (args.winPaths?.secondary?.[0]) {
        const secondary = args.winPaths.secondary[0];
        out.push({
          rank: looksLikeEngine(secondary) ? "Engine" : "Secondary win",
          title: looksLikeEngine(secondary) ? "Produces resources" : "Alternate close",
          detail: firstSentence(secondary, 280),
        });
      }
      if (recover.length) {
        out.push({
          rank: "Recovery",
          title: "Rebuilds after disruption",
          detail: `${recover.slice(0, 3).join(", ")} recur important pieces. This is not a win condition.`,
        });
      }
      return out;
    })(),
    whyTheScore: report?.whyTheScore ?? [],
    roleRows: landCount > 0
      ? [
          ...roleRows,
          {
            label: "Lands",
            count: landCount,
            cards: [
              basicCopies ? `${basicCopies} basics` : "",
              ...uniqueNames(utilityNames, 8),
            ].filter(Boolean),
          },
        ]
      : roleRows,
    landSummary,
    appendix,
  };
}
