/**
 * Bracket Power Decision v4.10 — Council agreement on where to spend bracket power budget.
 */
import type { CouncilDecisionV45, CouncilTurnV45 } from "./professor-council-state-v4-5-v1";
import type { BracketPowerPlanV410 } from "./professor-bracket-power-plan-v4-10-v1";
import { isHighPriority, powerLeverLabel, type PowerLeverKeyV410 } from "./professor-bracket-power-plan-v4-10-v1";

export const PROFESSOR_BRACKET_POWER_DECISION_V4_10_V1_VERSION = "professor-bracket-power-decision-v4-10-v1";

export type BracketPowerDecisionV410 = {
  version: typeof PROFESSOR_BRACKET_POWER_DECISION_V4_10_V1_VERSION;
  targetBracket: number;
  spendOn: string[];
  doNotSpendOn: string[];
  highPriorityLevers: PowerLeverKeyV410[];
  councilDecisionId: string;
};

export function buildBracketPowerDecisionCouncilV410(args: {
  plan: BracketPowerPlanV410;
  commanderShort: string;
  playStyle: string;
}): {
  turns: Omit<CouncilTurnV45, "turnId">[];
  decision: Omit<CouncilDecisionV45, "decisionId">;
  powerDecision: BracketPowerDecisionV410;
} {
  const b = args.plan.targetBracket;
  const highLevers = (Object.entries(args.plan.powerLevers) as [PowerLeverKeyV410, typeof args.plan.powerLevers.acceleration][])
    .filter(([, p]) => isHighPriority(p))
    .map(([k]) => k);

  const spendOn = highLevers.map(powerLeverLabel);
  const doNotSpendOn = args.plan.avoid.slice(0, 4);

  const sacrificeKorvold =
    b >= 4 && /sacrifice/i.test(args.playStyle) && /korvold/i.test(args.commanderShort.toLowerCase());

  const creative = sacrificeKorvold
    ? `For B${b} ${args.commanderShort}, I don't want to spend our power budget on simply adding more giant finishers. ${args.commanderShort} already turns sacrifice into cards and size. We need the deck to reach that state faster and more reliably.`
    : b >= 4
      ? `For B${b}, every slot must buy speed, consistency, or resilience for ${args.playStyle.toLowerCase()} — not incremental goodstuff.`
      : `For B${b}, spend power on synergy and solid efficiency within ${args.playStyle.toLowerCase()} — not raw cEDH tools.`;

  const research = sacrificeKorvold
    ? "Then I'll prioritize premium sacrifice fuel, acceleration, efficient tutors, and compact payoffs."
    : `I'll prioritize ${spendOn.slice(0, 4).join(", ").toLowerCase()} in catalog search.`;

  const critic = sacrificeKorvold
    ? "And I'll reject expensive or cute cards that don't increase speed, consistency, or resilience enough for B4."
    : `I'll reject cards that fill a role inefficiently for B${b} or drift from the charter.`;

  const turns: Omit<CouncilTurnV45, "turnId">[] = [
    { phase: "PRE_BUILD", speaker: "CREATIVE", intent: "DECIDE", respondsToTurnIds: [], message: creative },
    { phase: "PRE_BUILD", speaker: "RESEARCH", intent: "SEARCH", respondsToTurnIds: [], message: research },
    { phase: "PRE_BUILD", speaker: "CRITIC", intent: "DECIDE", respondsToTurnIds: [], message: critic },
  ];

  const decision: Omit<CouncilDecisionV45, "decisionId"> = {
    phase: "PRE_BUILD",
    decision: `Spend B${b} power on: ${spendOn.join(", ")}. Do not spend on: ${doNotSpendOn.slice(0, 2).join("; ")}.`,
    reasoning: args.plan.spendSummary.join(" "),
    supportingTurnIds: [],
    designRulesAdded: [`Power plan B${b}: ${spendOn.slice(0, 3).join(" + ")}`],
    reconsiderable: false,
  };

  return {
    turns,
    decision,
    powerDecision: {
      version: PROFESSOR_BRACKET_POWER_DECISION_V4_10_V1_VERSION,
      targetBracket: b,
      spendOn,
      doNotSpendOn,
      highPriorityLevers: highLevers,
      councilDecisionId: "dec-bracket-power-v410",
    },
  };
}
