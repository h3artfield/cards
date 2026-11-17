import { readShopAnswer, type ShopAnswerView } from "./detect";

/**
 * Browser-side helpers for the chat drawer. Nothing here may import server
 * code; the admin bundles this file.
 */

export const CHAT_MESSAGE_MAX_CHARS = 600;
export const CHAT_HISTORY_TURNS = 10;
/** The server cuts each history turn to this many characters. */
export const CHAT_HISTORY_TURN_MAX_CHARS = 1200;
/** The question route wants a full question; a confirmation names its tool, so this text is never routed. */
export const CONFIRM_QUERY = "show the list I asked for";

export type ChatPanel = { tool: string; answer: ShopAnswerView };

/** A report as the browser holds it: the same shape the server sends, re-validated. */
export type ShopReportView = {
  kind: string;
  title: string;
  period?: { from: string; to: string };
  summary: string;
  sections: Array<{ heading: string; answer: ShopAnswerView; comment?: string }>;
  cautions: string[];
  asOf: string;
};

/** The one place a report waits for the report page. A report never holds customer data. */
export const REPORT_STORAGE_KEY = "shop-assistant:report";
export const REPORT_PAGE_PATH = "/admin/reports/assistant";
export const REPORT_GONE_MESSAGE = "This report is no longer available. Ask the assistant again.";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Reads a report from untrusted JSON (the chat response, or storage). Null when it is not one. */
export function readShopReport(raw: unknown): ShopReportView | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!isText(r.kind) || !isText(r.title) || !isText(r.summary) || !isText(r.asOf) || !Array.isArray(r.sections)) {
    return null;
  }
  const sections: ShopReportView["sections"] = [];
  for (const rawSection of r.sections) {
    const section = rawSection as { heading?: unknown; answer?: unknown; comment?: unknown } | null;
    const answer = readShopAnswer(section?.answer);
    if (!section || !isText(section.heading) || !answer) return null;
    sections.push({
      heading: section.heading,
      answer,
      comment: isText(section.comment) && section.comment.trim() ? section.comment : undefined,
    });
  }
  if (!sections.length) return null;
  const p = r.period as { from?: unknown; to?: unknown } | undefined;
  const period = p && isText(p.from) && isText(p.to) && DAY.test(p.from) && DAY.test(p.to) ? { from: p.from, to: p.to } : undefined;
  return {
    kind: r.kind,
    title: r.title,
    period,
    summary: r.summary,
    sections,
    cautions: (Array.isArray(r.cautions) ? r.cautions : []).filter(isText),
    asOf: r.asOf,
  };
}

/** The report from stored text, or null when there is none or it is not readable. */
export function parseStoredReport(stored: string | null): ShopReportView | null {
  if (!stored) return null;
  try {
    return readShopReport(JSON.parse(stored));
  } catch {
    return null;
  }
}

/**
 * A report as a few lines of text, appended to the reply that produced it when
 * that reply is sent back as history. It lets the assistant answer "what stood
 * out?" without building the report again. Words the person already saw; no
 * table rows.
 */
export function reportDigest(report: Pick<ShopReportView, "title" | "summary" | "sections">): string {
  const sections = report.sections
    .map((section) => `${section.heading}: ${section.answer.lines[0] ?? "nothing to show"}`)
    .join(" | ");
  return `[Report shown: ${report.title}. Summary: ${report.summary} Sections: ${sections}]`;
}

/** The text of an assistant turn as it goes back in history, within the server's per-turn cap. */
export function assistantHistoryText(text: string, report?: Pick<ShopReportView, "title" | "summary" | "sections">): string {
  return (report ? `${text} ${reportDigest(report)}` : text).slice(0, CHAT_HISTORY_TURN_MAX_CHARS);
}

export type ChatReply =
  | { kind: "reply"; text: string; panels: ChatPanel[]; confirms: string[]; caution?: string; report?: ShopReportView }
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
    report: readShopReport(body.report) ?? undefined,
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
  | { id: number; kind: "assistant"; text: string; caution?: string; panels: ChatPanel[]; confirms: ChatConfirm[]; report?: ShopReportView }
  | { id: number; kind: "error"; text: string };

/**
 * What is sent back as context: the words each side said, most recent last,
 * plus a short digest of any report. Tables and anything opened behind a
 * confirm card are never sent.
 */
export function historyFor(items: ChatItem[]): Array<{ role: "user" | "assistant"; text: string }> {
  const turns: Array<{ role: "user" | "assistant"; text: string }> = [];
  for (const item of items) {
    if (item.kind === "user") turns.push({ role: "user", text: item.text });
    else if (item.kind === "assistant") turns.push({ role: "assistant", text: assistantHistoryText(item.text, item.report) });
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
