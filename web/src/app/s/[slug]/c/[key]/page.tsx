"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { StoreInventoryApp } from "@/components/store-inventory/StoreInventoryApp";
import {
  InventoryCardDetail,
  type InventoryCardDetailData,
} from "@/components/store-inventory/InventoryCardDetail";
import type { InventoryGridCard } from "@/components/store-inventory/InventoryBrowseUI";

/**
 * Where a shelf label's QR code lands: the store's inventory page with that
 * card's detail open in the middle, exactly as if the shopper had clicked it.
 */
export default function CardLinkPage() {
  const { slug, key } = useParams<{ slug: string; key: string }>();
  const router = useRouter();
  const [card, setCard] = useState<InventoryGridCard | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!slug || !key) return;
    let cancelled = false;
    fetch(`/api/store/${encodeURIComponent(slug)}/inventory/card?key=${encodeURIComponent(key)}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("not found");
        return (await res.json()) as InventoryCardDetailData;
      })
      .then((d) => {
        if (cancelled || !d.inventoryItemId) return;
        setCard({
          inventoryItemId: d.inventoryItemId,
          name: d.name,
          imageProxyUrl: d.imageProxyUrl,
          qty: d.qty ?? 0,
          listPrice: d.listPrice,
          setName: d.setName,
          cardNumber: d.collectorNumber,
          condition: d.condition,
          rarity: d.rarity,
          manaCost: d.manaCost,
          typeLine: d.typeLine,
          oracleText: d.oracleText,
          colorIdentity: d.colorIdentity ?? [],
          finishLabel: d.finishLabel ?? undefined,
        });
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, key]);

  if (!slug) return null;

  return (
    <>
      <StoreInventoryApp slug={slug} />
      {card ? (
        <InventoryCardDetail
          slug={slug}
          card={card}
          onClose={() => router.replace(`/s/${encodeURIComponent(slug)}/inventory`)}        />
      ) : null}
      {missing ? (
        <div className="fixed inset-x-0 top-4 z-50 mx-auto w-fit rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm text-neutral-200 shadow-xl">
          That card isn&apos;t in stock anymore. Here&apos;s everything else we have.
        </div>
      ) : null}
    </>
  );
}
