import type { OrderStatus } from "@/lib/types";
import { ORDER_STATUS_LABELS } from "@/lib/constants";

const STATUS_COLORS: Record<OrderStatus, string> = {
  draft: "bg-[var(--ink-750)] text-[var(--text)]",
  scanning: "bg-blue-100 text-blue-800",
  submitted: "bg-indigo-100 text-indigo-800",
  processing: "bg-yellow-100 text-yellow-800",
  under_review: "bg-orange-100 text-orange-800",
  offer_ready: "bg-green-100 text-green-800",
  accepted: "bg-emerald-100 text-[var(--ok)]",
  declined: "bg-red-100 text-red-800",
  paid: "bg-teal-100 text-teal-800",
  cancelled: "bg-[var(--ink-700)] text-[var(--text)]",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}
    >
      {ORDER_STATUS_LABELS[status] ?? status}
    </span>
  );
}
