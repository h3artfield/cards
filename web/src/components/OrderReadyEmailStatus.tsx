import type { BuybackOrder } from "@/lib/types";
import { orderReadyEmailStatusLabel } from "@/lib/processing/order-ready-customer-email";

export function OrderReadyEmailStatus({
  order,
  customerEmail,
}: {
  order: BuybackOrder;
  customerEmail?: string;
}) {
  const hasEmail = Boolean(customerEmail?.trim());
  const label = orderReadyEmailStatusLabel(order, hasEmail);

  return (
    <p className="text-xs text-gray-500">{label}</p>
  );
}
