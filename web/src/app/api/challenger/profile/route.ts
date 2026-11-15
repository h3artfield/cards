import { NextRequest } from "next/server";
import { jsonError, jsonOk, handleRouteError } from "@/lib/api-utils";
import { getCustomerSession, loadCustomer } from "@/lib/auth/customer-auth";
import { normalizeCustomer } from "@/lib/auth/normalize-customer";
import { validateDisplayName } from "@/lib/challenger/display-name";
import { challengerDisplayNameTaken } from "@/lib/challenger/display-name-store";
import { dataStore } from "@/lib/storage/data-store";

export async function GET(req: NextRequest) {
  try {
    const session = getCustomerSession(req);
    if (!session) return jsonError("Unauthorized", 401);
    const customer = await loadCustomer(session.customerId);
    if (!customer || customer.email !== session.email) return jsonError("Unauthorized", 401);
    return jsonOk({
      displayName: customer.challengerDisplayName ?? null,
      emailVerified: customer.emailVerified,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

/** Rename the public name. The stream PC learns the new name on the next hand-off. */
export async function POST(req: NextRequest) {
  try {
    const session = getCustomerSession(req);
    if (!session) return jsonError("Unauthorized", 401);
    const customer = await loadCustomer(session.customerId);
    if (!customer || customer.email !== session.email || customer.isGuest) {
      return jsonError("Unauthorized", 401);
    }

    const body = (await req.json()) as {
      displayName?: unknown;
      consent?: unknown;
      age13?: unknown;
    };
    if (body.age13 !== true) return jsonError("Confirm you are 13 or older.");
    if (body.consent !== true) {
      return jsonError(
        "Confirm your display name may be shown on the stream and the Hall of Champions.",
      );
    }

    const display = validateDisplayName(body.displayName);
    if (!display.ok) return jsonError(display.error);
    if (await challengerDisplayNameTaken(display.key, customer.id)) {
      return jsonError("That display name is already taken.");
    }

    const now = new Date().toISOString();
    const saved = normalizeCustomer({
      ...customer,
      challengerDisplayName: display.name,
      challengerDisplayNameKey: display.key,
      challengerConsentAt: now,
      challengerAgeConfirmedAt: customer.challengerAgeConfirmedAt ?? now,
      updatedAt: now,
    });
    await dataStore.upsertCustomer(saved);
    return jsonOk({ displayName: saved.challengerDisplayName, emailVerified: saved.emailVerified });
  } catch (err) {
    return handleRouteError(err);
  }
}
