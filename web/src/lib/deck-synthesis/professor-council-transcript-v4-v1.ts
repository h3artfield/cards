/**
 * Professor Council Transcript v4 — collaborative council dialogue for the UI.
 */
import type { BrewProfessorLineV42 } from "./professor-brew-session-types-v4-2-v1";
import type { ProfessorV41ConversationLoopResultV1, ResearchModeV4 } from "./professor-v4-1-conversation-loop-v1";
import type { ResearchMessageV4 } from "./professor-research-message-v4";
import type { WorkingDeckTheoryV4 } from "./professor-working-deck-theory-v4";
import {
  buildCouncilTranscriptFromStateV45,
  type CouncilTranscriptEntryV45,
} from "./professor-council-orchestrator-v4-5-v1";
import type { ProfessorCouncilStateV45 } from "./professor-council-state-v4-5-v1";

export const PROFESSOR_COUNCIL_TRANSCRIPT_V4_V1_VERSION = "professor-council-transcript-v4-v1";

export type CouncilSpeakerV4 = "CREATIVE" | "RESEARCH" | "CRITIC" | "SYSTEM" | "TO_PLAYER";

export type CouncilTranscriptEntryV4 = {
  id: string;
  order: number;
  speaker: CouncilSpeakerV4;
  label: string;
  badge?: string;
  body: string;
  detail?: string;
  kind?: "TURN" | "DECISION" | "MUTATION" | "LEGACY";
  intent?: string;
  respondsToTurnIds?: string[];
  developerDetail?: string;
};

const MODE_LABELS: Record<ResearchModeV4, string> = {
  MECHANIC: "Mechanic",
  EXPLORER: "Explorer",
  ENGINEER: "Engineer",
  SKEPTIC: "Skeptic",
  CONTRARIAN: "Contrarian",
};

function researchModeFromMessageId(messageId: string): ResearchModeV4 | null {
  const match = messageId.match(/msg-(mechanic|explorer|engineer|skeptic|contrarian)/i);
  if (!match?.[1]) return null;
  return match[1].toUpperCase() as ResearchModeV4;
}

function messageToEntry(msg: ResearchMessageV4, order: number): CouncilTranscriptEntryV4 {
  const mode = researchModeFromMessageId(msg.messageId);
  return {
    id: msg.messageId,
    order,
    speaker: "RESEARCH",
    label: mode ? `Research · ${MODE_LABELS[mode]}` : "Research Professor",
    badge: msg.intent,
    body: msg.body,
    detail: msg.conceptProbe,
    kind: "LEGACY",
  };
}

function mapV45Entry(entry: CouncilTranscriptEntryV45): CouncilTranscriptEntryV4 {
  if (entry.kind === "MUTATION") {
    return {
      id: entry.id,
      order: entry.order,
      speaker: "SYSTEM",
      label: "Deck change",
      badge: entry.mutationAction ?? "MUTATION",
      body: entry.body,
      detail: entry.detail,
      kind: "MUTATION",
      developerDetail: entry.developerDetail,
    };
  }

  const speaker: CouncilSpeakerV4 =
    entry.kind === "DECISION"
      ? "SYSTEM"
      : entry.speaker.includes("Creative")
        ? "CREATIVE"
        : entry.speaker.includes("Research")
          ? "RESEARCH"
          : entry.speaker.includes("Critic")
            ? "CRITIC"
            : "SYSTEM";

  return {
    id: entry.id,
    order: entry.order,
    speaker,
    label: entry.speaker,
    badge: entry.kind === "DECISION" ? "DECISION" : entry.intent,
    body: entry.body,
    detail: entry.detail,
    kind: entry.kind,
    intent: entry.intent,
    respondsToTurnIds: entry.respondsToTurnIds,
    developerDetail: entry.developerDetail,
  };
}

function buildLegacyCouncilTranscriptV4(args: {
  loopResult: ProfessorV41ConversationLoopResultV1 | null;
  theory: WorkingDeckTheoryV4 | null;
  professorLines?: BrewProfessorLineV42[];
}): CouncilTranscriptEntryV4[] {
  const entries: CouncilTranscriptEntryV4[] = [];
  let order = 0;
  const push = (entry: Omit<CouncilTranscriptEntryV4, "order">) => {
    entries.push({ ...entry, order: order++, kind: entry.kind ?? "LEGACY" });
  };

  const loopResult = args.loopResult;
  const theory = args.theory ?? loopResult?.workingDeckTheory ?? null;

  if (loopResult?.creativePass1) {
    push({
      id: "creative-thesis",
      speaker: "CREATIVE",
      label: "Creative Professor",
      badge: "THESIS",
      body: loopResult.creativePass1.strategicThesis,
    });
  }

  if (loopResult?.selectedResearchModes?.length) {
    push({
      id: "research-modes",
      speaker: "SYSTEM",
      label: "Council",
      badge: "RESEARCH MODES",
      body: loopResult.selectedResearchModes.map((mode) => MODE_LABELS[mode]).join(" · "),
    });
  }

  const seenMessageIds = new Set<string>();
  for (const message of loopResult?.researchMessages ?? []) {
    seenMessageIds.add(message.messageId);
    push(messageToEntry(message, order));
  }
  for (const message of theory?.researchMessages ?? []) {
    if (seenMessageIds.has(message.messageId)) continue;
    push(messageToEntry(message, order));
  }

  if (loopResult?.criticAnnotations?.length) {
    const verifiedCount = loopResult.criticAnnotations.filter((item) => item.annotation === "VERIFIED").length;
    if (verifiedCount > 0) {
      push({
        id: "critic-verified-batch",
        speaker: "CRITIC",
        label: "Critic Professor",
        badge: "VERIFIED",
        body: `Verified ${verifiedCount} Creative claims against mechanism facts and oracle text.`,
      });
    }
  }

  for (const [index, line] of (args.professorLines ?? []).entries()) {
    push({
      id: line.lineId || `player-line-${index}`,
      speaker: "TO_PLAYER",
      label: "Professor (to you)",
      badge: line.intent,
      body: line.body,
    });
  }

  return entries;
}

export function buildProfessorCouncilTranscriptV4(args: {
  councilState?: ProfessorCouncilStateV45 | null;
  loopResult: ProfessorV41ConversationLoopResultV1 | null;
  theory: WorkingDeckTheoryV4 | null;
  professorLines?: BrewProfessorLineV42[];
}): CouncilTranscriptEntryV4[] {
  if (args.councilState?.conversation.length) {
    const councilEntries = buildCouncilTranscriptFromStateV45(args.councilState).map(mapV45Entry);
    const playerEntries: CouncilTranscriptEntryV4[] = (args.professorLines ?? []).map((line, index) => ({
      id: line.lineId || `player-line-${index}`,
      order: councilEntries.length + index,
      speaker: "TO_PLAYER" as const,
      label: "Professor (to you)",
      badge: line.intent,
      body: line.body,
      kind: "LEGACY" as const,
    }));
    return [...councilEntries, ...playerEntries];
  }

  return buildLegacyCouncilTranscriptV4(args);
}
