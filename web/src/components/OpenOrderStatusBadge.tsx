import type { OrderStatus } from "@/lib/types";
import {
  clerkOrderPhase,
  isOrderReadyForReview,
  type ClerkOrderPhase,
} from "@/lib/processing/order-phase";

export type { ClerkOrderPhase };
export { clerkOrderPhase, isOrderReadyForReview };

const PHASE_LABELS: Record<ClerkOrderPhase, string> = {
  building: "Building",
  ready_for_review: "Ready for review",
};

const PHASE_COLORS: Record<ClerkOrderPhase, string> = {
  building: "bg-amber-100 text-amber-900 ring-1 ring-amber-200",
  ready_for_review: "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200",
};

export function OpenOrderStatusBadge({ status }: { status: OrderStatus }) {
  const phase = clerkOrderPhase(status);
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${PHASE_COLORS[phase]}`}
    >
      {PHASE_LABELS[phase]}
    </span>
  );
}
