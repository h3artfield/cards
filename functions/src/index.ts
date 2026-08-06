import { onDocumentUpdated } from "firebase-functions/v2/firestore";

/**
 * V1 processing runs via Next.js POST /api/orders/[id]/submit.
 * This trigger is a placeholder for Firebase-native deployments
 * that want Firestore-driven async processing.
 */
export const onOrderSubmitted = onDocumentUpdated(
  "orders/{orderId}",
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (before?.status !== "submitted" && after?.status === "submitted") {
      console.log(`Order ${event.params.orderId} submitted — process via API route`);
    }
  },
);
