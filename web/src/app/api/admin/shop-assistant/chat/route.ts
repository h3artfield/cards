import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { jsonError, jsonOk } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { storeDay } from "@/lib/reports/daily-reports";
import {
  SHOP_AGENT_RATE_LIMIT,
  SHOP_AGENT_RATE_WINDOW_MS,
  createDailyCounter,
  handleShopAgent,
  staffAgentDailyTurns,
  staffAgentModel,
} from "@/lib/shop-assistant/agent-handle";
import { createShopDataLoader } from "@/lib/shop-assistant/load";
import { createOpenAiAgentModel } from "@/lib/shop-assistant/openai-tools";
import { getStaffContext } from "@/lib/staff/owner-access";
import { dataStore } from "@/lib/storage/data-store";

// The store id is always passed explicitly, as in the question route.
const loader = createShopDataLoader({
  getInventory: (storeId) => dataStore.getInventory(storeId),
  getCustomers: (storeId) => dataStore.getCustomers(storeId),
  getTradeCreditEntries: (storeId) => dataStore.getTradeCreditEntries(storeId),
  getSettings: (storeId) => dataStore.getSettings(storeId),
  getActiveRules: (storeId) => dataStore.getActiveRules(storeId),
});

const dailyTurns = createDailyCounter(staffAgentDailyTurns);

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
