import fs from "fs/promises";
import path from "path";
import type { InventoryImportSnapshot } from "../inventory/import-snapshots";
import type {
  AdminUser,
  BuybackOrder,
  BuybackTransaction,
  CardFeedback,
  CollectionCard,
  Customer,
  InventoryItem,
  ScannedCard,
  ShopTicket,
  StoreRule,
  StoreSettings,
  TradeCreditEntry,
} from "../types";
import type { StoreEvent, StoreEventSignup } from "../store-calendar/types";
import { DEFAULT_STORE_ID } from "../firebase/collections";
import { DEFAULT_STORE_SETTINGS } from "../constants";

export interface DevMemoryState {
  customers: Customer[];
  orders: BuybackOrder[];
  cards: ScannedCard[];
  inventory: InventoryItem[];
  transactions: BuybackTransaction[];
  tradeCreditEntries: TradeCreditEntry[];
  collectionCards: CollectionCard[];
  shopTickets: ShopTicket[];
  rules: StoreRule[];
  stores: Record<string, StoreSettings>;
  adminUsers: AdminUser[];
  feedback: CardFeedback[];
  settings: StoreSettings;
  /** @deprecated use orderCounters — kept for dev-store.json migration */
  counter: number;
  orderCounters: Record<string, number>;
  ticketCounters: Record<string, number>;
  adminLogs: Record<string, unknown>[];
  storeEvents: StoreEvent[];
  storeEventSignups: StoreEventSignup[];
  inventoryImportSnapshots: InventoryImportSnapshot[];
}

const DEV_STORE_PATH = path.join(process.cwd(), ".data", "dev-store.json");

export function defaultDevMemoryState(): DevMemoryState {
  const gameLodge: StoreSettings = {
    id: DEFAULT_STORE_ID,
    ...DEFAULT_STORE_SETTINGS,
    storeName: "The Game Lodge",
    storeSlug: "the-game-lodge",
    ownerEmail: "lodge1@gmail.com",
  };
  return {
    customers: [],
    orders: [],
    cards: [],
    inventory: [],
    transactions: [],
    tradeCreditEntries: [],
    collectionCards: [],
    shopTickets: [],
    rules: [],
    stores: { [DEFAULT_STORE_ID]: gameLodge },
    adminUsers: [],
    feedback: [],
    settings: gameLodge,
    counter: 0,
    orderCounters: {},
    ticketCounters: {},
    adminLogs: [],
    storeEvents: [],
    storeEventSignups: [],
    inventoryImportSnapshots: [],
  };
}

let memoryCache: DevMemoryState | null = null;

export async function readDevMemoryState(): Promise<DevMemoryState> {
  if (memoryCache) return memoryCache;

  try {
    const raw = await fs.readFile(DEV_STORE_PATH, "utf8");
    memoryCache = { ...defaultDevMemoryState(), ...JSON.parse(raw) };
    if (!memoryCache!.stores || !Object.keys(memoryCache!.stores).length) {
      const fallback = memoryCache!.settings ?? defaultDevMemoryState().stores[DEFAULT_STORE_ID];
      memoryCache!.stores = {
        [DEFAULT_STORE_ID]: { ...fallback, id: DEFAULT_STORE_ID },
      };
    }
    if (!memoryCache!.adminUsers) memoryCache!.adminUsers = [];
    if (!memoryCache!.tradeCreditEntries) memoryCache!.tradeCreditEntries = [];
    if (!memoryCache!.collectionCards) memoryCache!.collectionCards = [];
    if (!memoryCache!.shopTickets) memoryCache!.shopTickets = [];
    if (!memoryCache!.orderCounters) memoryCache!.orderCounters = {};
    if (!memoryCache!.ticketCounters) memoryCache!.ticketCounters = {};
    if (!memoryCache!.inventoryImportSnapshots) {
      memoryCache!.inventoryImportSnapshots = [];
    }
    return memoryCache!;
  } catch {
    memoryCache = defaultDevMemoryState();
    return memoryCache;
  }
}

export async function writeDevMemoryState(state: DevMemoryState): Promise<void> {
  memoryCache = state;
  await fs.mkdir(path.dirname(DEV_STORE_PATH), { recursive: true });
  await fs.writeFile(DEV_STORE_PATH, JSON.stringify(state, null, 2), "utf8");
}

export async function mutateDevMemory(
  fn: (state: DevMemoryState) => void | Promise<void>,
): Promise<DevMemoryState> {
  const state = await readDevMemoryState();
  await fn(state);
  await writeDevMemoryState(state);
  return state;
}
