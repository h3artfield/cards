import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { jsonError, jsonOk } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { storeDay } from "@/lib/reports/daily-reports";
import {
  SHOP_AGENT_RATE_LIMIT,
  SHOP_AGENT_RATE_WINDOW_MS,
  agentAvailableTo,
  createDailyCounter,
  handleShopAgent,
  staffAgentDailyTurns,
  staffAgentModel,
} from "@/lib/shop-assistant/agent-handle";
import { createShopDataLoader } from "@/lib/shop-assistant/load";
import { createOpenAiAgentModel } from "@/lib/shop-assistant/openai-tools";
import { createShopRedaction } from "@/lib/shop-assistant/redact-load";
import { getStaffContext } from "@/lib/staff/owner-access";
import { listStaffMembers } from "@/lib/staff/staff-members";
import { dataStore } from "@/lib/storage/data-store";

// The store id is always passed explicitly, as in the question route.
const loader = createShopDataLoader({
  getInventory: (storeId) => dataStore.getInventory(storeId),
  getCustomers: (storeId) => dataStore.getCustomers(storeId),
  getTradeCreditEntries: (storeId) => dataStore.getTradeCreditEntries(storeId),
  getSettings: (storeId) => dataStore.getSettings(storeId),
  getActiveRules: (storeId) => dataStore.getActiveRules(storeId),
});

// Names are taken out of typed text before any model sees it.
const redaction = createShopRedaction(loader, async (storeId) =>
  (await listStaffMembers(storeId)).map((member) => member.name),
);

const dailyTurns = createDailyCounter(staffAgentDailyTurns);

/**
 * Whether the assistant is available to whoever is asking. The admin uses this
 * to decide whether to show it at all: `{ enabled: false }` until a model is
 * set, and for a screen with no person signed in.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;
    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;
    if (!staffAgentModel()) return jsonOk({ enabled: false });
    const { staff, setupNeeded } = await getStaffContext(req, scope.storeId);
    return jsonOk({ enabled: agentAvailableTo({ session: auth, staff, setupNeeded }) });
  } catch {
    return jsonOk({ enabled: false });
  }
}

/**
 * One turn of a conversation with the store agent.
 * Body: `{ message: string, history?: { role: "user" | "assistant", text: string }[] }`.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;
    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const { staff, setupNeeded } = await getStaffContext(req, scope.storeId);
    const body: unknown = await req.json().catch(() => null);
    const modelName = staffAgentModel();

    const result = await handleShopAgent(
      { body, storeId: scope.storeId, session: auth, staff, setupNeeded },
      {
        model: modelName ? createOpenAiAgentModel({ model: modelName }) : null,
        loader,
        redaction,
        now: () => new Date(),
        today: storeDay,
        allow: (key) => checkRateLimit(key, SHOP_AGENT_RATE_LIMIT, SHOP_AGENT_RATE_WINDOW_MS),
        takeDailyTurn: (person, today) => dailyTurns.take(`${scope.storeId}:${person}`, today),
        audit: (line) => console.info(JSON.stringify(line)),
      },
    );
    return result.status === 200 ? jsonOk(result.body) : jsonError(result.body.error, result.status);
  } catch {
    console.warn("[shop-agent] request failed before it could be answered");
    return jsonError("Couldn't work that out just now. Try again in a moment.", 500);
  }
}
