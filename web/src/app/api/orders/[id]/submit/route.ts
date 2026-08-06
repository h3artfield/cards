import { NextRequest, NextResponse } from "next/server";
import {
  customerOwnsOrder,
  requireCustomerSession,
} from "@/lib/auth/customer-auth";
import { dataStore } from "@/lib/storage/data-store";
import { processOrderSubmission } from "@/lib/processing/process-order-submission";
import {
  dispatchOrderProcessing,
  newProcessingAttemptId,
  newProcessingJobId,
} from "@/lib/processing/invoke-order-processing-job";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { after } from "next/server";

const RETRYABLE_STATUSES = new Set([
  "draft",
  "scanning",
  "submitted",
  "processing",
]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = requireCustomerSession(req);
    if (session instanceof NextResponse) return session;

    const { id } = await params;
    const order = await dataStore.getOrder(id);
    if (!order) return jsonError("Order not found", 404);

    if (!customerOwnsOrder(session, order)) {
      return jsonError("Forbidden", 403);
    }

    if (!RETRYABLE_STATUSES.has(order.status)) {
      return jsonError("This order has already been finalized", 400);
    }

    const cards = await dataStore.getCardsByOrder(id);
    if (!cards.length) {
      return jsonError("Add at least one card before submitting");
    }

    const customer = await dataStore.getCustomer(order.customerId);
    if (!customer) return jsonError("Customer not found", 404);

    const submittedAt = order.submittedAt ?? new Date().toISOString();
    const isFirstSubmit = !order.submittedAt;
    const attemptId = newProcessingAttemptId();
    const jobId = newProcessingJobId(order);

    const submittedOrder = await dataStore.saveOrder({
      ...order,
      status: "processing",
      submittedAt,
      processingJobId: jobId,
      processingAttemptId: attemptId,
      processingStartedAt: submittedAt,
      processingHeartbeatAt: new Date().toISOString(),
      lastCompletedStep: "submit_accepted",
    });

    const worker = await dispatchOrderProcessing(id, attemptId);

    if (worker === "after") {
      after(async () => {
        try {
          await processOrderSubmission(id, {
            isFirstSubmit,
            attemptId,
            workerMode: "after",
          });
        } catch (err) {
          console.error(`[submit] background processing order ${id}:`, err);
        }
      });
    }

    return jsonOk({
      order: submittedOrder,
      cards,
      processingWorker: worker,
      processingAttemptId: attemptId,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
