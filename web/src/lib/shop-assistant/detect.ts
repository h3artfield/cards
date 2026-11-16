/**
 * Decides, in the browser, whether typed text is worth sending to the shop
 * assistant. It only has to be roughly right: the server's chooser makes the
 * real decision and answers "none" for anything no tool covers. Its job is to
 * keep one-word page jumps and bare customer names from costing a request.
 *
 * Nothing here may import server code; the search box bundles this file.
 */

export const SHOP_QUESTION_MIN_CHARS = 8;
export const SHOP_QUESTION_MAX_CHARS = 400;

const ASKING_START =
  /^(how|what|what's|whats|where|why|when|can|could|should|do|does|did|is|are|was|were|have|has|got|any|who|who's|which|list|show|tell|give me|top|slowest|fastest|best|worst|sales|sold|revenue|buy price|cards to move|store credit|trade credit)\b/i;

const SHOP_WORDS =
  /\b(in stock|store credit|trade credit|sales|sold|sell-through|slowest|fastest|best[- ]selling|to move|reshelve|re-shelve|buy price|pay for|offer for|offer on|worth to us|(?:we|i) (?:pay|offer|give))\b/i;

export function isShopQuestion(query: string): boolean {
  const q = query.trim();
  if (q.length < SHOP_QUESTION_MIN_CHARS || q.length > SHOP_QUESTION_MAX_CHARS) return false;
  if (!/\s/.test(q)) return false;
  return q.includes("?") || ASKING_START.test(q) || SHOP_WORDS.test(q);
}

/** The answer the route sends back. Plain strings only. */
export type ShopAnswerView = {
  title: string;
  lines: string[];
  columns?: string[];
  rows?: string[][];
  note?: string;
  href?: string;
  hrefLabel?: string;
  asOf: string;
};

export type ShopReply =
  | { kind: "none" }
  | { kind: "confirm"; tool: string }
  | { kind: "answer"; tool: string; answer: ShopAnswerView }
  | { kind: "error"; message: string };

const isText = (value: unknown): value is string => typeof value === "string";

function readAnswer(raw: unknown): ShopAnswerView | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  if (!isText(a.title) || !Array.isArray(a.lines) || !a.lines.every(isText) || !isText(a.asOf)) {
    return null;
  }
  const columns = Array.isArray(a.columns) && a.columns.every(isText) ? a.columns : undefined;
  const rows =
    columns && Array.isArray(a.rows) && a.rows.every((r) => Array.isArray(r) && r.every(isText))
      ? (a.rows as string[][])
      : undefined;
  // Only links into the admin are followed; anything else is dropped.
  const href = isText(a.href) && /^\/admin(\/|\?|$)/.test(a.href) ? a.href : undefined;
  return {
    title: a.title,
    lines: a.lines,
    columns: rows ? columns : undefined,
    rows,
    note: isText(a.note) ? a.note : undefined,
    href,
    hrefLabel: href && isText(a.hrefLabel) ? a.hrefLabel : undefined,
    asOf: a.asOf,
  };
}

/** Turns the route's response into what the box shows. Never throws. */
export function readShopReply(ok: boolean, status: number, data: unknown): ShopReply {
  const body = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  if (!ok) {
    // 400 means the text was not a full question: show nothing, as if unmatched.
    if (status === 400) return { kind: "none" };
    return {
      kind: "error",
      message: isText(body.error) ? body.error : "Couldn't work that out just now. Try again in a moment.",
    };
  }
  if (body.matched !== true || !isText(body.tool)) return { kind: "none" };
  if (body.needsConfirm === true) return { kind: "confirm", tool: body.tool };
  const answer = readAnswer(body.answer);
  return answer ? { kind: "answer", tool: body.tool, answer } : { kind: "none" };
}

/** "2:41 PM", in the browser's own time zone. Empty when the time is unreadable. */
export function asOfLabel(asOf: string): string {
  const at = new Date(asOf);
  if (!Number.isFinite(at.getTime())) return "";
  return at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
