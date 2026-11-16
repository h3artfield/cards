export type StaffDestination = {
  id: string;
  label: string;
  hint: string;
  href: string;
  keywords: string[];
};

export const STAFF_DESTINATIONS: StaffDestination[] = [
  {
    id: "orders",
    label: "Orders",
    hint: "Open buybacks",
    href: "/admin",
    keywords: ["order", "orders", "buyback", "buybacks", "open"],
  },
  {
    id: "register",
    label: "Register",
    hint: "Ring up a sale",
    href: "/admin/tickets",
    keywords: ["sale", "sales", "sell", "register", "ring", "ticket", "counter"],
  },
  {
    id: "inventory",
    label: "Inventory",
    hint: "On-hand sheet",
    href: "/admin/reports?section=inventory",
    keywords: ["inventory", "stock", "shelf", "on hand", "cards"],
  },
  {
    id: "add-cards",
    label: "Add cards",
    hint: "Enter one card that was not on a file",
    href: "/admin/reports?section=inventory&add=1",
    keywords: ["add card", "add cards", "add a card", "new card"],
  },
  {
    id: "sold",
    label: "Sold",
    hint: "Copies already sold",
    href: "/admin/reports?section=inventory&view=sold",
    keywords: ["sold"],
  },
  {
    id: "purchases",
    label: "Purchases",
    hint: "Buyback payouts",
    href: "/admin/reports?section=inventory&view=purchases",
    keywords: ["purchase", "purchases", "payout", "payouts"],
  },
  {
    id: "customers",
    label: "Customers",
    hint: "Accounts and trade credit",
    href: "/admin/reports?section=customers",
    keywords: ["customer", "customers", "account", "accounts", "credit"],
  },
  {
    id: "shipping",
    label: "Shipping",
    hint: "USPS labels and tracking",
    href: "/admin/reports?section=shipping",
    keywords: ["ship", "shipping", "label", "labels", "usps", "tracking"],
  },
  {
    id: "card-labels",
    label: "Card QR labels",
    hint: "Print QR labels to stick on cards",
    href: "/admin/reports?section=inventory#qr-labels",
    keywords: ["label", "labels", "qr label", "qr labels", "card label", "card labels", "dymo", "sticker", "stickers"],
  },
  {
    id: "reports",
    label: "Reports",
    hint: "Store overview",
    href: "/admin/reports",
    keywords: ["report", "reports", "overview"],
  },
  {
    id: "pricing",
    label: "Pricing",
    hint: "What the store pays for cards",
    href: "/admin/pricing",
    keywords: ["price", "pricing"],
  },
  {
    id: "buy-percent",
    label: "Buy percentages",
    hint: "Cash and trade percents",
    href: "/admin/pricing?section=buy",
    keywords: ["percent", "percentage", "buy %", "cash percent", "trade percent"],
  },
  {
    id: "rules",
    label: "Buying rules",
    hint: "Store buying rules",
    href: "/admin/pricing?section=rules",
    keywords: ["rule", "rules"],
  },
  {
    id: "conditions",
    label: "Condition multipliers",
    hint: "Near Mint through Damaged",
    href: "/admin/pricing?section=conditions",
    keywords: ["condition", "conditions", "multiplier"],
  },
  {
    id: "settings",
    label: "Settings",
    hint: "Store name, QR code, Shopify",
    href: "/admin/settings",
    keywords: ["setting", "settings", "qr", "logo", "shopify"],
  },
  {
    id: "calendar",
    label: "Event calendar",
    hint: "Events and signups",
    href: "/admin/calendar",
    keywords: ["calendar", "event", "events", "signup", "signups"],
  },
];

const EMPTY_IDS = ["register", "orders", "inventory", "customers"];

function scoreDestination(destination: StaffDestination, query: string): number {
  const label = destination.label.toLowerCase();
  if (label === query) return 100;
  if (destination.keywords.some((keyword) => keyword === query)) return 90;
  if (label.startsWith(query)) return 70;
  if (destination.keywords.some((keyword) => keyword.startsWith(query))) return 60;
  if (query.length >= 3 && destination.keywords.some((keyword) => query.includes(keyword))) {
    return 50;
  }
  if (label.includes(query)) return 30;
  if (destination.hint.toLowerCase().includes(query)) return 10;
  return 0;
}

export function matchStaffDestinations(
  query: string,
  limit = 5,
): StaffDestination[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return STAFF_DESTINATIONS.filter((destination) => EMPTY_IDS.includes(destination.id));
  }
  return STAFF_DESTINATIONS
    .map((destination) => ({ destination, score: scoreDestination(destination, q) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.destination.label.localeCompare(b.destination.label))
    .slice(0, limit)
    .map((row) => row.destination);
}

/** A how-to question, not a one-word jump like "sale". */
export function isStaffQuestion(query: string): boolean {
  const q = query.trim();
  if (q.length < 8) return false;
  if (q.includes("?")) return true;
  return /^(how|what|where|why|when|can|could|should|do|does|is)\b/i.test(q);
}
