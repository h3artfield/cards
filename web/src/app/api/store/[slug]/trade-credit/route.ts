import { NextRequest, NextResponse } from "next/server";
import { jsonOk, handleRouteError } from "@/lib/api-utils";
import { requireCustomerAtStore } from "@/lib/auth/customer-store-binding";
import { getTradeCreditLedger } from "@/lib/trade-credit/trade-credit-ledger";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const context = await requireCustomerAtStore(req, slug);
    if (context instanceof NextResponse) return context;

    const { balance, entries } = await getTradeCreditLedger(
      context.store.id,
      context.customer.id,
    );

    return jsonOk({ balance, entries });
  } catch (err) {
    return handleRouteError(err);
  }
}
