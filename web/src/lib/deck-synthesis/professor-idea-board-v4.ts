/**
 * IdeaBoard v4 — CORE / VERIFY / EXPLORE / WEIRD / REJECTED lanes with rejection memory.
 */
import type { EvidenceRef } from "./professor-planning-evidence-v3";
import type { ProvenanceRefV4 } from "./professor-provenance-v4";

export const PROFESSOR_IDEA_BOARD_V4_VERSION = "professor-idea-board-v4";

export const IDEA_BOARD_LANE_V4 = ["CORE", "VERIFY", "EXPLORE", "WEIRD", "REJECTED"] as const;
export type IdeaBoardLaneV4 = (typeof IDEA_BOARD_LANE_V4)[number];

export type IdeaBoardItemV4 = {
  ideaId: string;
  title: string;
  description: string;
  lane: IdeaBoardLaneV4;
  origin: ProvenanceRefV4;
  mechanicalBasis: string[];
  relatedPackages: string[];
  evidenceRefs: EvidenceRef[];
  discoveryScore?: number;
  statusReason?: string;
  createdRevision: number;
};

export type IdeaBoardV4 = {
  version: typeof PROFESSOR_IDEA_BOARD_V4_VERSION;
  items: IdeaBoardItemV4[];
};

export function createEmptyIdeaBoardV4(): IdeaBoardV4 {
  return { version: PROFESSOR_IDEA_BOARD_V4_VERSION, items: [] };
}

export function addIdeaToBoardV4(args: {
  board: IdeaBoardV4;
  idea: Omit<IdeaBoardItemV4, "ideaId"> & { ideaId?: string };
}): IdeaBoardV4 {
  const ideaId = args.idea.ideaId ?? `idea-${args.board.items.length + 1}`;
  return {
    ...args.board,
    items: [...args.board.items, { ...args.idea, ideaId }],
  };
}

export function moveIdeaLaneV4(args: {
  board: IdeaBoardV4;
  ideaId: string;
  lane: IdeaBoardLaneV4;
  statusReason?: string;
}): IdeaBoardV4 {
  return {
    ...args.board,
    items: args.board.items.map((item) =>
      item.ideaId === args.ideaId ? { ...item, lane: args.lane, statusReason: args.statusReason ?? item.statusReason } : item,
    ),
  };
}

export function rejectIdeaV4(args: {
  board: IdeaBoardV4;
  ideaId: string;
  rejectionReason: string;
}): IdeaBoardV4 {
  return moveIdeaLaneV4({
    board: args.board,
    ideaId: args.ideaId,
    lane: "REJECTED",
    statusReason: args.rejectionReason,
  });
}

export function ideasInLaneV4(board: IdeaBoardV4, lane: IdeaBoardLaneV4): IdeaBoardItemV4[] {
  return board.items.filter((i) => i.lane === lane);
}

export function isIdeaRejectedV4(board: IdeaBoardV4, title: string): boolean {
  const lower = title.toLowerCase();
  return board.items.some((i) => i.lane === "REJECTED" && i.title.toLowerCase() === lower);
}
