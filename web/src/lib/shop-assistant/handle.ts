import type { AdminSession } from "../types";
import { canUseShopTool } from "./access";
import { chooseShopTool, QUESTION_MAX_CHARS, type ShopChoiceResult } from "./choose";
import { tidy } from "./format";
import type { ShopDataLoader } from "./load";
import { getShopTool, runShopTool } from "./registry";
import type { ShopAnswer, ShopToolId } from "./types";

/**
 * Everything the shop-assistant route does after sign-in is checked. It lives
 * here, with its dependencies passed in, so it can be tested without a
 * database, a model or a web server.
 */

export const QUESTION_MIN_CHARS = 8;
export const SHOP_ASSISTANT_RATE_LIMIT = 20;
export const SHOP_ASSISTANT_RATE_WINDOW_MS = 60_000;

export type ShopAssistantResponse = {
  matched: boolean;
  tool?: ShopToolId;
  /** The tool shows customer data. Send again with `confirm: true` and this `tool`. */
  needsConfirm?: boolean;
  via?: "model" | "fallback" | "confirm";
  answer?: ShopAnswer;
};

export type ShopAssistantOutcome =
  | "answered"
  | "none"
  | "confirm_needed"
  | "not_allowed"
  | "bad_request"
  | "rate_limited"
  | "error";

/** One line per request. It never holds the question or any answer text. */
export type ShopAssistantAudit = {
  severity: "INFO" | "WARNING";
  event: "shop_assistant";
  userId: string;
  staffId: string | null;
  storeId: string;
  tool: ShopToolId | null;
  via: "model" | "fallback" | "confirm" | null;
  outcome: ShopAssistantOutcome;
  ms: number;
  ok: boolean;
};

export type ShopAssistantInput = {
  /** The parsed request body, untrusted. */
  body: unknown;
  /** From the signed-in session's store scope. Never from the body. */
  storeId: string;
  session: Pick<AdminSession, "userId" | "role">;
  /** The clerk signed in with a PIN, when there is one. */
  staff: { staffId: string } | null;
  /** The store has no staff profiles yet, so nobody can sign in with a PIN. */
  setupNeeded: boolean;
};

export type ShopAssistantDeps = {
  loader: ShopDataLoader;
  now: () => Date;
  /** False when this person has asked too often. */
  allow: (key: string) => boolean;
  audit: (line: ShopAssistantAudit) => void;
  /** Takes customer and staff names out of the question before the chooser's model sees it. */
  redact?: (storeId: string, text: string) => Promise<string>;
  choose?: (question: string, now: Date) => Promise<ShopChoiceResult>;
};

export type ShopAssistantResult =
  | { status: 200; body: ShopAssistantResponse }
  | { status: 400 | 403 | 429 | 500; body: { error: string } };

export async function handleShopAssistant(
  input: ShopAssistantInput,
  deps: ShopAssistantDeps,
): Promise<ShopAssistantResult> {
  const started = Date.now();
  let tool: ShopToolId | null = null;
  let via: ShopAssistantAudit["via"] = null;

  const done = (outcome: ShopAssistantOutcome, result: ShopAssistantResult): ShopAssistantResult => {
    const ok = outcome !== "error";
    deps.audit({
      severity: ok ? "INFO" : "WARNING",
      event: "shop_assistant",
      userId: input.session.userId,
      staffId: input.staff?.staffId ?? null,
      storeId: input.storeId,
      tool,
      via,
      outcome,
      ms: Date.now() - started,
      ok,
    });
    return result;
  };

  try {
    const body =
      input.body && typeof input.body === "object" && !Array.isArray(input.body)
        ? (input.body as Record<string, unknown>)
        : {};
    const query = typeof body.query === "string" ? tidy(body.query) : "";
    if (query.length < QUESTION_MIN_CHARS || query.length > QUESTION_MAX_CHARS) {
      return done("bad_request", { status: 400, body: { error: "Ask a full question" } });
    }
    const confirm = body.confirm === true;

    if (!deps.allow(`shop-assistant:${input.staff?.staffId ?? input.session.userId}`)) {
      return done("rate_limited", {
        status: 429,
        body: { error: "Too many questions at once. Wait a minute and try again." },
      });
    }

    const now = deps.now();
    let args: unknown = {};

    // A confirmation names the tool it confirms, so the answer is the one the
    // person agreed to see and the model is not asked a second time. Only a
    // tool that needs confirming, and takes no arguments, can come in this way.
    const confirmed = confirm ? getShopTool(body.tool) : undefined;
    if (confirmed?.sensitive && confirmed.validateArgs({}).ok) {
      tool = confirmed.id;
      via = "confirm";
    } else {
      const safeQuery = deps.redact ? await deps.redact(input.storeId, query) : query;
      const choice = await (deps.choose ?? chooseShopTool)(safeQuery, now);
      via = choice.via;
      if (!choice.tool) return done("none", { status: 200, body: { matched: false, via: choice.via } });
      tool = choice.tool;
      args = choice.args;
    }

    const picked = getShopTool(tool);
    if (!picked) return done("none", { status: 200, body: { matched: false } });

    if (!canUseShopTool(input.session, picked.id)) {
      return done("not_allowed", { status: 403, body: { error: "You don't have access to that." } });
    }

    // A display screen signs in with the store's token and has no person
    // behind it. Once the store uses staff sign-in, customer data needs one.
    if (
      picked.sensitive &&
      !input.staff &&
      !input.setupNeeded &&
      input.session.role !== "platform"
    ) {
      return done("not_allowed", {
        status: 403,
        body: { error: "Sign in with your PIN to see that." },
      });
    }

    // Customer data is not even loaded until the person has confirmed.
    if (picked.sensitive && !confirm) {
      return done("confirm_needed", {
        status: 200,
        body: { matched: true, tool: picked.id, needsConfirm: true, via },
      });
    }

    const data = await deps.loader.load(input.storeId, picked.needs);
    const ran = runShopTool(picked.id, args, data, { now });
    if (!ran.ok) return done("none", { status: 200, body: { matched: false, via } });

    return done("answered", {
      status: 200,
      body: { matched: true, tool: ran.tool, via, answer: ran.answer },
    });
  } catch {
    // Nothing from the error reaches the client or the log line: it could
    // carry model text or database detail.
    return done("error", {
      status: 500,
      body: { error: "Couldn't work that out just now. Try again in a moment." },
    });
  }
}
