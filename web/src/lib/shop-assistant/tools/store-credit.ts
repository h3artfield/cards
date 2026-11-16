import { computeTradeCreditBalance } from "../../trade-credit/trade-credit-ledger";
import type { TradeCreditEntry } from "../../types";
import { formatMoney, plural, tidy } from "../format";
import type { ShopAnswer, ShopCustomerName } from "../types";

export const STORE_CREDIT_MAX_ROWS = 50;
export const UNNAMED_CUSTOMER = "Unnamed customer";

export type StoreCreditRow = {
  customerId: string;
  /** First and last name only. Never an email or a phone number. */
  name: string;
  balance: number;
};

export type StoreCreditList = {
  /** Customers holding a balance above zero, largest first. */
  rows: StoreCreditRow[];
  total: number;
};

function money(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * Customers with store credit. Balances come from the ledger's own
 * `computeTradeCreditBalance`; only entries for this store are counted.
 */
export function listStoreCredit(
  storeId: string,
  entries: TradeCreditEntry[],
  customers: ShopCustomerName[],
): StoreCreditList {
  const byCustomer = new Map<string, TradeCreditEntry[]>();
  for (const entry of entries) {
    if (entry.storeId !== storeId) continue;
    const list = byCustomer.get(entry.customerId);
    if (list) list.push(entry);
    else byCustomer.set(entry.customerId, [entry]);
  }

  const names = new Map<string, string>();
  for (const customer of customers) {
    names.set(customer.id, tidy(`${customer.firstName ?? ""} ${customer.lastName ?? ""}`));
  }

  const rows: StoreCreditRow[] = [];
  for (const [customerId, list] of byCustomer) {
    const { balance } = computeTradeCreditBalance(storeId, customerId, list);
    if (balance <= 0) continue;
    rows.push({ customerId, name: names.get(customerId) || UNNAMED_CUSTOMER, balance });
  }
  rows.sort(
    (a, b) =>
      b.balance - a.balance ||
      a.name.localeCompare(b.name) ||
      a.customerId.localeCompare(b.customerId),
  );

  return { rows, total: money(rows.reduce((sum, row) => sum + row.balance, 0)) };
}

/** "Which customers have store credit, and how much?" Name and balance only. */
export function storeCreditAnswer(
  storeId: string,
  entries: TradeCreditEntry[],
  customers: ShopCustomerName[],
  now: Date,
): ShopAnswer {
  const { rows, total } = listStoreCredit(storeId, entries, customers);
  const base = {
    title: "Store credit",
    href: "/admin/reports?section=customers",
    hrefLabel: "Open Customers",
    asOf: now.toISOString(),
  };

  if (!rows.length) {
    return { ...base, lines: ["No customers have store credit right now."] };
  }

  const shown = rows.slice(0, STORE_CREDIT_MAX_ROWS);
  return {
    ...base,
    lines: [
      `${plural(rows.length, "customer has", "customers have")} store credit, ` +
        `${formatMoney(total)} in total.`,
    ],
    columns: ["Customer", "Balance"],
    rows: shown.map((row) => [row.name, formatMoney(row.balance)]),
    note:
      rows.length > shown.length
        ? `Showing the ${shown.length} largest of ${rows.length}.`
        : undefined,
  };
}
