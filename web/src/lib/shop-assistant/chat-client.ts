import { readShopAnswer, type ShopAnswerView } from "./detect";

/**
 * Browser-side helpers for the chat drawer. Nothing here may import server
 * code; the admin bundles this file.
 */

export const CHAT_MESSAGE_MAX_CHARS = 600;
export const CHAT_HISTORY_TURNS = 10;
/** The question route wants a full question; a confirmation names its tool, so this text is never routed. */
export const CONFIRM_QUERY = "show the list I asked for";

export type ChatPanel = { tool: string; answer: ShopAnswerView };

export type ChatReply =
  | { kind: "reply"; text: string; panels: ChatPanel[]; confirms: string[]; caution?: string }
  | { kind: "error"; message: string };

const isText = (value: unknown): value is string => typeof value === "string";
const FALLBACK = "Couldn't work that out just now. Try again in a moment.";

/** Turns the chat route's response into what the drawer shows. Never throws. */
export function readAgentReply(ok: boolean, data: unknown): ChatReply {
  const body = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  if (!ok) return { kind: "error", message: isText(body.error) ? body.error : FALLBACK };
  if (!isText(body.text) || !body.text.trim()) return { kind: "error", message: FALLBACK };

  const panels: ChatPanel[] = [];
  for (const raw of Array.isArray(body.panels) ? body.panels : []) {
    const panel = raw as { tool?: unknown; answer?: unknown } | null;
    const answer = readShopAnswer(panel?.answer);
    if (panel && isText(panel.tool) && answer) panels.push({ tool: panel.tool, answer });
  }
  return {
    kind: "reply",
    text: body.text,
    panels,
    confirms: (Array.isArray(body.confirms) ? body.confirms : []).filter(isText),
    caution: isText(body.caution) && body.caution.trim() ? body.caution : undefined,
  };
}

export type ChatConfirm = {
  tool: string;
  state: "locked" | "loading" | "shown" | "failed";
  answer?: ShopAnswerView;
  message?: string;
};

export type ChatItem =
  | { id: number; kind: "user"; text: string }
  | { id: number; kind: "assistant"; text: string; caution?: string; panels: ChatPanel[]; confirms: ChatConfirm[] }
  | { id: number; kind: "error"; text: string };

/**
 * What is sent back as context: the words each side said, most recent last.
 * Tables and anything opened behind a confirm card are never sent.
 */
export function historyFor(items: ChatItem[]): Array<{ role: "user" | "assistant"; text: string }> {
  const turns: Array<{ role: "user" | "assistant"; text: string }> = [];
  for (const item of items) {
    if (item.kind === "user") turns.push({ role: "user", text: item.text });
    else if (item.kind === "assistant") turns.push({ role: "assistant", text: item.text });
  }
  return turns.slice(-CHAT_HISTORY_TURNS);
}

/** Puts every opened customer list back behind its confirm card. */
export function relockItems(items: ChatItem[]): ChatItem[] {
  return items.map((item) =>
    item.kind === "assistant" && item.confirms.some((c) => c.state !== "locked")
      ? { ...item, confirms: item.confirms.map((c): ChatConfirm => ({ tool: c.tool, state: "locked" })) }
      : item,
  );
}

/** What a confirm card is called, by tool. */
export function confirmLabel(tool: string): string {
  return tool === "store_credit" ? "Store credit list" : "Customer details";
}
