"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { CartPanel } from "@/components/store-inventory/CartPanel";

/**
 * The shop cart, docked on the right of the deck editor.
 *
 * The same panel the inventory page uses, so checkout and pickup behave the
 * same wherever the cart is opened. No backdrop: the point of docking it is to
 * keep editing the deck with the cart in view.
 */
export function DeckCartDrawerV1({
  slug,
  open,
  onClose,
}: {
  slug: string;
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <aside
      className={`deck-cart-drawer${open ? " deck-cart-drawer--open" : ""}`}
      aria-label="Cart"
      aria-hidden={!open}
    >
      <button
        type="button"
        className="deck-cart-drawer__collapse"
        onClick={onClose}
        aria-label="Collapse cart"
        title="Collapse cart"
        tabIndex={open ? 0 : -1}
      >
        ›
      </button>
      <div className="deck-cart-drawer__body">{open ? <CartPanel slug={slug} /> : null}</div>
    </aside>,
    document.body,
  );
}
