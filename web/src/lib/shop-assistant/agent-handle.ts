import type { AdminSession } from "../types";
import { readAgentRequest, runAgentTurn, type AgentToolName, type AgentTurnResult } from "./agent";
import { readCustomerRefs } from "./redact";
import type { ShopDataLoader } from "./load";
import type { AgentModel } from "./openai-tools";
import { attachPicked, type AmbiguousName, type CustomerRef } from "./redact";
import type { ShopRedaction } from "./redact-load";

/**
 * Everything the chat route does after sign-in is checked, with its
 * dependencies passed in so it can be tested without a database, a model or a
 * web server.
 */

export const SHOP_AGENT_RATE_LIMIT = 20;
export const SHOP_AGENT_RATE_WINDOW_MS = 60_000;
export const DEFAULT_AGENT_DAILY_TURNS = 200;

/** The conversation model's name, or null when the agent is not switched on. */
export function staffAgentModel(): string | null {
  return process.env.STAFF_AGENT_MODEL?.trim() || null;
}

export function staffAgentDailyTurns(): number {
  const raw = Number.parseInt(process.env.STAFF_AGENT_DAILY_TURNS ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_AGENT_DAILY_TURNS;
}

/** Counts turns per person per shop day, in memory, like the rate limiter. */
export function createDailyCounter(limit: () => number) {
  const counts = new Map<string, number>();
  let day = "";
  return {
    /** False when this person has used today's turns. Counts the turn when true. */
    take(person: string, today: string): boolean {
      if (today !== day) {
        day = today;
        counts.clear();
      }
      const used = counts.get(person) ?? 0;
      if (used >= limit()) return false;
      counts.set(person, used + 1);
      return true;
    },
  };
}

/** A conversation is with a person. A display screen has none behind it. */
export function agentAvailableTo(input: {
  session: Pick<AdminSession, "role">;
  staff: unknown | null;
  setupNeeded: boolean;
}): boolean {
  return Boolean(input.staff) || input.setupNeeded || input.session.role === "platform";
}

export type ShopAgentOutcome =
  | "answered"
  | "off"
  | "sign_in_needed"
  | "bad_request"
  | "bad_customer"
  | "rate_limited"
  | "daily_limit"
  | "error";

/** One line per turn. It never holds what was said, by either side. */
export type ShopAgentAudit = {
  severity: "INFO" | "WARNING";
  event: "shop_agent";
  userId: string;
  staffId: string | null;
  storeId: string;
  tools: AgentToolName[];
  modelCalls: number;
  historyTurns: number;
  flagged: boolean;
  /** How many names, emails and phones were taken out before the model saw the text. */
  redactions: number;
  /** How many customers the person picked. Never which. */
  customersPicked: number;
  outcome: ShopAgentOutcome;
  ms: number;
  ok: boolean;
};

export type ShopAgentInput = {
  body: unknown;
  storeId: string;
  session: Pick<AdminSession, "userId" | "role">;
  staff: { staffId: string } | null;
  setupNeeded: boolean;
};

export type ShopAgentDeps = {
  /** Null when `STAFF_AGENT_MODEL` is not set. */
  model: AgentModel | null;
  loader: ShopDataLoader;
  /** Takes customer and staff names out of typed text before any model sees it. */
  redaction: ShopRedaction;
  now: () => Date;
  /** The shop's calendar day for `now`, for the daily count. */
  today: (now: Date) => string;
  allow: (key: string) => boolean;
  takeDailyTurn: (person: string, today: string) => boolean;
  audit: (line: ShopAgentAudit) => void;
};

export type ShopAgentResponse = Pick<AgentTurnResult, "text" | "panels" | "confirms" | "caution" | "report"> & {
  /** The person's message as the model was shown it. The browser sends this back as history. */
  sent: string;
  /** Which token is which customer in this conversation. The browser shows the names. */
  refs: CustomerRef[];
  /** Names that fit several customers; the browser asks which. */
  ambiguous: AmbiguousName[];
};

export type ShopAgentResult =
  | { status: 200; body: ShopAgentResponse }
  | { status: 400 | 403 | 429 | 500 | 503; body: { error: string } };

export async function handleShopAgent(input: ShopAgentInput, deps: ShopAgentDeps): Promise<ShopAgentResult> {
  const started = Date.now();
  let tools: AgentToolName[] = [];
  let modelCalls = 0;
  let historyTurns = 0;
  let flagged = false;
  let redactions = 0;
  let customersPicked = 0;

  const done = (outcome: ShopAgentOutcome, result: ShopAgentResult): ShopAgentResult => {
    const ok = outcome !== "error";
    deps.audit({
      severity: ok ? "INFO" : "WARNING",
      event: "shop_agent",
      userId: input.session.userId,
      staffId: input.staff?.staffId ?? null,
      storeId: input.storeId,
      tools,
      modelCalls,
      historyTurns,
      flagged,
      redactions,
      customersPicked,
      outcome,
      ms: Date.now() - started,
      ok,
    });
    return result;
  };

  try {
    if (!deps.model) {
      return done("off", { status: 503, body: { error: "The assistant isn't switched on yet." } });
    }
    if (!agentAvailableTo(input)) {
      return done("sign_in_needed", { status: 403, body: { error: "Sign in with your PIN to use the assistant." } });
    }
    const request = readAgentRequest(input.body);
    if (!request) return done("bad_request", { status: 400, body: { error: "Type a question first." } });
    historyTurns = request.history.length;

    const person = input.staff?.staffId ?? input.session.userId;
    if (!deps.allow(`shop-agent:${person}`)) {
      return done("rate_limited", {
        status: 429,
        body: { error: "Too many questions at once. Wait a minute and try again." },
      });
    }
    const now = deps.now();
    if (!deps.takeDailyTurn(person, deps.today(now))) {
      return done("daily_limit", {
        status: 429,
        body: { error: "You've reached today's limit for the assistant. It resets tomorrow." },
      });
    }

    // Redaction at the door. Nothing typed reaches a model before this.
    const redactor = await deps.redaction.forStore(input.storeId);
    const given = readCustomerRefs(input.body as Record<string, unknown>, redactor);
    if (!given.ok) {
      return done("bad_customer", {
        status: 400,
        body: { error: "That customer isn't on file for this store. Pick them again." },
      });
    }
    customersPicked = given.picked.length;
    let refs = given.refs;
    const ambiguous: AmbiguousName[] = [];
    // History comes from the browser, so it is cleaned again here.
    const history = request.history.map((turn) => {
      const cleaned = redactor.redact(turn.text, refs);
      refs = cleaned.refs;
      redactions += cleaned.count;
      return { role: turn.role, text: cleaned.text };
    });
    const cleaned = redactor.redact(request.message, refs);
    redactions += cleaned.count;
    ambiguous.push(...cleaned.ambiguous);
    const attached = attachPicked(cleaned.text, given.picked, cleaned.refs);
    refs = attached.refs;

    const turn = await runAgentTurn(
      { message: attached.text, history, storeId: input.storeId, session: input.session },
      { model: deps.model, loader: deps.loader, now },
    );
    tools = turn.tools;
    modelCalls = turn.modelCalls;
    flagged = Boolean(turn.caution);
    return done("answered", {
      status: 200,
      body: {
        text: turn.text,
        panels: turn.panels,
        confirms: turn.confirms,
        caution: turn.caution,
        report: turn.report,
        sent: attached.text,
        refs,
        ambiguous,
      },
    });
  } catch {
    return done("error", {
      status: 500,
      body: { error: "Couldn't work that out just now. Try again in a moment." },
    });
  }
}
