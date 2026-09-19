import { NextRequest, NextResponse } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { requireCustomerAtStore } from "@/lib/auth/customer-store-binding";
import { importCollectionText } from "@/lib/collection/collection-import";

async function readImportText(req: NextRequest): Promise<string> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (file instanceof File) return file.text();
    const text = form.get("text");
    return typeof text === "string" ? text : "";
  }
  const body = (await req.json().catch(() => ({}))) as { text?: string };
  return body.text ?? "";
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const context = await requireCustomerAtStore(req, slug);
    if (context instanceof NextResponse) return context;

    const text = (await readImportText(req)).trim();
    if (!text) return jsonError("Paste a list or upload a collection file");

    const summary = await importCollectionText({
      storeId: context.store.id,
      customerId: context.customer.id,
      text,
    });

    return jsonOk({
      locked: summary.locked,
      needsReview: summary.needsReview,
      unmatched: summary.unmatched,
      cards: summary.cards,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
