import { NextRequest } from "next/server";
import { jsonOk, handleRouteError } from "@/lib/api-utils";
import { requireCustomerSession } from "@/lib/auth/customer-auth";
import { listCustomerSavedDecks } from "@/lib/customer-saved-decks/customer-saved-deck-store";

export async function GET(req: NextRequest) {
  try {
    const session = requireCustomerSession(req);
    if (session instanceof Response) return session;

    const storeSlug = req.nextUrl.searchParams.get("store") ?? undefined;
    const decks = await listCustomerSavedDecks({
      customerId: session.customerId,
      storeSlug,
    });
    return jsonOk({ decks });
  } catch (err) {
    return handleRouteError(err);
  }
}
