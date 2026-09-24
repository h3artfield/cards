import { dataStore } from "@/lib/storage/data-store";
import { jsonOk, jsonError } from "@/lib/api-utils";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const cleaned = slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const store = await dataStore.getStoreBySlug(cleaned);

  if (!store) {
    return jsonError("Store not found", 404);
  }

  return jsonOk({
    store: {
      id: store.id,
      name: store.storeName,
      slug: store.storeSlug,
      logoUrl: store.storeLogoUrl ?? null,
      customerGuestModeEnabled:
        store.customerGuestModeEnabled === true &&
        process.env.CUSTOMER_GUEST_MODE_ENABLED === "true",
      customerEmailVerificationMode:
        store.customerEmailVerificationMode ?? "required_before_submit",
    },
    calendar: {
      /**
       * Whether there is a calendar worth linking to. Same gate the calendar
       * page and its API apply, so the dashboard cannot offer an Events link
       * that lands on "Calendar not available".
       */
      available:
        store.calendarSettings?.enabled !== false &&
        store.calendarSettings?.published === true,
    },
    auth: {
      googleEnabled:
        process.env.AUTH_GOOGLE_ENABLED !== "false" &&
        Boolean(process.env.GOOGLE_CLIENT_ID?.trim()) &&
        Boolean(process.env.GOOGLE_CLIENT_SECRET?.trim()),
      appleEnabled:
        process.env.AUTH_APPLE_ENABLED === "true" &&
        Boolean(process.env.APPLE_CLIENT_ID?.trim()),
    },
  });
}
