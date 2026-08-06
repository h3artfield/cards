import type { BuybackOrder, ScannedCard } from "@/lib/types";
import {
  computeOrderProcessingProgress,
  countOrderCardsProcessed,
  formatOrderProcessingDetail,
  isOrderProcessingWorkerStuck,
  ORDER_PROCESSING_WORKER_STUCK_MESSAGE,
} from "@/lib/order-processing-progress";
import { clerkOrderPhase } from "@/lib/processing/order-phase";
import { OpenOrderStatusBadge } from "@/components/OpenOrderStatusBadge";

function resolveProgress(input: {
  order: Pick<BuybackOrder, "status">;
  cards?: ScannedCard[];
  cardCount?: number;
  cardsProcessedCount?: number;
}): { progress: number; detail: string | null } {
  if (input.cards?.length) {
    return {
      progress: computeOrderProcessingProgress({
        order: input.order,
        cards: input.cards,
      }),
      detail: formatOrderProcessingDetail({
        order: input.order,
        cards: input.cards,
      }),
    };
  }

  const total = input.cardCount ?? 0;
  const done = input.cardsProcessedCount ?? 0;
  const building = clerkOrderPhase(input.order.status) === "building";

  if (!building || total === 0) {
    return { progress: building ? 0 : 100, detail: null };
  }

  return {
    progress: Math.round((done / total) * 100),
    detail: `${done} of ${total} card${total === 1 ? "" : "s"} processed`,
  };
}

export function OrderProcessingStatus({
  order,
  cards,
  cardCount,
  cardsProcessedCount,
  align = "end",
}: {
  order: Pick<
    BuybackOrder,
    | "status"
    | "processingStartedAt"
    | "processingHeartbeatAt"
    | "submittedAt"
  >;
  cards?: ScannedCard[];
  cardCount?: number;
  cardsProcessedCount?: number;
  align?: "start" | "end";
}) {
  const phase = clerkOrderPhase(order.status);
  const building = phase === "building";
  const total = cards?.length ?? cardCount ?? 0;
  const processed =
    cards?.length != null
      ? countOrderCardsProcessed(cards)
      : (cardsProcessedCount ?? 0);
  const { progress, detail } = resolveProgress({
    order,
    cards,
    cardCount,
    cardsProcessedCount,
  });
  const workerStuck = isOrderProcessingWorkerStuck({
    order,
    cardsProcessedCount: processed,
    cardCount: total,
  });

  return (
    <div
      className={`flex flex-col gap-1.5 ${align === "end" ? "items-end" : "items-start"} min-w-[10rem]`}
    >
      <OpenOrderStatusBadge status={order.status} />
      {building && total > 0 ? (
        <>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Order processing progress"
          >
            <div
              className={`h-full rounded-full transition-[width] duration-500 ease-out ${
                workerStuck ? "bg-red-500" : "bg-amber-500"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          {detail ? (
            <p className="text-[11px] font-medium text-slate-600">{detail}</p>
          ) : null}
          {workerStuck ? (
            <p className="text-[11px] font-semibold text-red-700">
              {ORDER_PROCESSING_WORKER_STUCK_MESSAGE}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
