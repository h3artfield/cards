import type { OrderStatus } from "@/lib/types";
import { ORDER_STATUS_LABELS } from "@/lib/constants";

/**
 * Light pills, deliberately, on both light and dark grounds. This badge also
 * renders in admin, which is a light surface, and a light fill with dark type
 * stays legible either way — so it is one of the few places that should not
 * follow the page theme. (An earlier pass converted only some of these rows,
 * which left `accepted` as light green on light green.)
 */
const STATUS_COLORS: Record<OrderStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  scanning: "bg-blue-100 text-blue-800",
  submitted: "bg-indigo-100 text-indigo-800",
  processing: "bg-yellow-100 text-yellow-800",
  under_review: "bg-orange-100 text-orange-800",
  offer_ready: "bg-green-100 text-green-800",
  accepted: "bg-emerald-100 text-emerald-800",
  declined: "bg-red-100 text-red-800",
  paid: "bg-teal-100 text-teal-800",
  cancelled: "bg-gray-200 text-gray-600",
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
