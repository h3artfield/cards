/**
 * Professor v4.16.1 — semantic actor/owner relations (generic, not commander-specific).
 */
export const PROFESSOR_SEMANTIC_ACTOR_RELATIONS_V4_16_1_V1_VERSION =
  "professor-semantic-actor-relations-v4-16-1-v1";

export type SacrificeActorV4161 =
  | "YOU_SACRIFICE"
  | "OPPONENT_SACRIFICES"
  | "ANY_PLAYER_SACRIFICES"
  | "YOUR_PERMANENT_DIES"
  | "OPPONENT_PERMANENT_DIES"
  | "UNKNOWN";

export type ResourceActorV4161 =
  | "YOU_DISCARD"
  | "OPPONENT_DISCARDS"
  | "YOU_MILL"
  | "OPPONENT_MILLS"
  | "YOU_LOSE_LIFE"
  | "OPPONENT_LOSES_LIFE"
  | "YOU_CREATE_TOKENS"
  | "UNKNOWN";

const OPPONENT_SAC_RE = /each opponent sacrifices|target opponent sacrifices|opponents sacrifice/i;
const YOU_SAC_RE = /sacrifice a creature|sacrifice another|sacrifice a permanent|sacrifice a nonland/i;
const ANY_SAC_RE = /each player sacrifices|each player chooses and sacrifices/i;
const YOUR_DIES_RE = /whenever a creature you control dies|whenever a nontoken creature you control dies/i;
const OPPONENT_DIES_RE = /whenever a creature an opponent controls dies|whenever an opponent's creature dies/i;

export function classifySacrificeActorFromText(oracleText: string): SacrificeActorV4161 {
  const text = oracleText.toLowerCase();
  if (OPPONENT_SAC_RE.test(text)) return "OPPONENT_SACRIFICES";
  if (ANY_SAC_RE.test(text)) return "ANY_PLAYER_SACRIFICES";
  if (YOUR_DIES_RE.test(text)) return "YOUR_PERMANENT_DIES";
  if (OPPONENT_DIES_RE.test(text)) return "OPPONENT_PERMANENT_DIES";
  if (YOU_SAC_RE.test(text)) return "YOU_SACRIFICE";
  if (/sacrifice/i.test(text)) return "UNKNOWN";
  return "UNKNOWN";
}

export function sacrificeActorsCompatibleWithCommanderTrigger(args: {
  commanderTrigger: "OPPONENT_CHOICE_SAC_OR_DAMAGE" | "YOU_SAC_ARISTOCRATS" | "GENERIC";
  cardActor: SacrificeActorV4161;
}): boolean {
  if (args.commanderTrigger === "OPPONENT_CHOICE_SAC_OR_DAMAGE") {
    return (
      args.cardActor === "OPPONENT_SACRIFICES" ||
      args.cardActor === "ANY_PLAYER_SACRIFICES" ||
      args.cardActor === "OPPONENT_PERMANENT_DIES"
    );
  }
  if (args.commanderTrigger === "YOU_SAC_ARISTOCRATS") {
    return args.cardActor === "YOU_SACRIFICE" || args.cardActor === "YOUR_PERMANENT_DIES";
  }
  return true;
}

export function inferCommanderSacrificeTrigger(commanderOracleText: string): "OPPONENT_CHOICE_SAC_OR_DAMAGE" | "YOU_SAC_ARISTOCRATS" | "GENERIC" {
  const text = commanderOracleText.toLowerCase();
  if (/each opponent may sacrifice.*or.*damage/i.test(text)) return "OPPONENT_CHOICE_SAC_OR_DAMAGE";
  if (/sacrifice.*you control/i.test(text)) return "YOU_SAC_ARISTOCRATS";
  return "GENERIC";
}

export function classifyResourceActorFromText(oracleText: string): ResourceActorV4161 {
  const text = oracleText.toLowerCase();
  if (/each opponent discards|target opponent discards/i.test(text)) return "OPPONENT_DISCARDS";
  if (/you discard|discard a card/i.test(text)) return "YOU_DISCARD";
  if (/each opponent mills|target opponent mills/i.test(text)) return "OPPONENT_MILLS";
  if (/you mill/i.test(text)) return "YOU_MILL";
  if (/each opponent loses|target opponent loses.*life/i.test(text)) return "OPPONENT_LOSES_LIFE";
  if (/you lose.*life/i.test(text)) return "YOU_LOSE_LIFE";
  if (/create.*token/i.test(text)) return "YOU_CREATE_TOKENS";
  return "UNKNOWN";
}
