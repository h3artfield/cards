import { NextRequest, NextResponse } from "next/server";
import { jsonOk, handleRouteError } from "@/lib/api-utils";
import { requireCustomerAtStore } from "@/lib/auth/customer-store-binding";
import { dataStore } from "@/lib/storage/data-store";

const MAX_PURCHASES = 50;

/** What this customer has bought at the counter, newest first. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const context = await requireCustomerAtStore(req, slug);
    if (context instanceof NextResponse) return context;

    const tickets = await dataStore.getShopTickets(context.store.id);
    const purchases = tickets
      .filter(
        (t) =>
          t.status === "completed" && t.customerId === context.customer.id,
      )
      .slice(0, MAX_PURCHASES)
      .map((t) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        completedAt: t.completedAt ?? t.createdAt,
        subtotal: t.subtotal,
        tradeCreditApplied: t.tradeCreditApplied,
        cashDue: t.cashDue,
        lines: t.lines.map((l) => ({
          displayName: l.displayName,
          setName: l.setName,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
      }));

    return jsonOk({ purchases });
  } catch (err) {
    return handleRouteError(err);
  }
}
