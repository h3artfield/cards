import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { jsonError, jsonOk } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import {
  SHOP_ASSISTANT_RATE_LIMIT,
  SHOP_ASSISTANT_RATE_WINDOW_MS,
  handleShopAssistant,
} from "@/lib/shop-assistant/handle";
import { createShopDataLoader } from "@/lib/shop-assistant/load";
import { createShopRedaction } from "@/lib/shop-assistant/redact-load";
import { getStaffContext } from "@/lib/staff/owner-access";
import { listStaffMembers } from "@/lib/staff/staff-members";
import { dataStore } from "@/lib/storage/data-store";

// The store id is always passed explicitly: the data store's own default
// store must never be what a question is answered from.
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

/**
 * Answers a staff question about the store from the store's own data.
 * Body: `{ query: string, confirm?: boolean, tool?: string }`.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;
    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    // Who is asking. A missing staff sign-in is not refused outright (display
    // screens have none); the handler refuses it for customer data only.
    const { staff, setupNeeded } = await getStaffContext(req, scope.storeId);
    const body: unknown = await req.json().catch(() => null);

    const result = await handleShopAssistant(
      { body, storeId: scope.storeId, session: auth, staff, setupNeeded },
      {
        loader,
        now: () => new Date(),
        allow: (key) => checkRateLimit(key, SHOP_ASSISTANT_RATE_LIMIT, SHOP_ASSISTANT_RATE_WINDOW_MS),
        audit: (line) => console.info(JSON.stringify(line)),
        redact: async (storeId, text) => (await redaction.forStore(storeId)).redact(text, []).text,
      },
    );
    return result.status === 200
      ? jsonOk(result.body)
      : jsonError(result.body.error, result.status);
  } catch {
    console.warn("[shop-assistant] request failed before it could be answered");
    return jsonError("Couldn't work that out just now. Try again in a moment.", 500);
  }
}
