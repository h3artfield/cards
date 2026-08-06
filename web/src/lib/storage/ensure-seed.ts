import { v4 as uuidv4 } from "uuid";
import { hashCustomerPassword } from "../auth/customer-password";
import { DEFAULT_STORE_SETTINGS } from "../constants";
import type { StoreSettings } from "../types";
import { dataStore } from "./data-store";

export const DEFAULT_STORE_ID = "the-game-lodge";

const PLATFORM_ADMIN_EMAIL = "h3artfield@gmail.com";
const STORE_OWNER_EMAIL = "lodge1@gmail.com";
const SEED_PASSWORD = "Password1";

let seedPromise: Promise<void> | null = null;

export function ensureSeedData(): Promise<void> {
  if (!seedPromise) {
    seedPromise = runSeed().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}

async function runSeed(): Promise<void> {
  let stores = await dataStore.listStores();

  const legacy = await dataStore.getLegacySettingsDoc();
  if (legacy) {
    const inList = stores.some((s) => s.id === legacy.id);
    if (!inList) {
      await dataStore.saveStore(legacy);
      stores = await dataStore.listStores();
    }
  }

  const gameLodgeMissing = !stores.some((s) => s.id === DEFAULT_STORE_ID);
  if (gameLodgeMissing) {
    const legacySettings = await dataStore.getLegacySettingsDoc();
    const base: StoreSettings = legacySettings ?? {
      id: DEFAULT_STORE_ID,
      ...DEFAULT_STORE_SETTINGS,
      storeName: "The Game Lodge",
      storeSlug: "the-game-lodge",
      ownerEmail: STORE_OWNER_EMAIL,
    };

    const gameLodge: StoreSettings = {
      ...base,
      id: DEFAULT_STORE_ID,
      storeName: base.storeName.includes("Card Shop")
        ? "The Game Lodge"
        : base.storeName,
      storeSlug: "the-game-lodge",
      ownerEmail: STORE_OWNER_EMAIL,
    };
    await dataStore.saveStore(gameLodge);
    stores = await dataStore.listStores();
  }

  const gameLodge = stores.find((s) => s.id === DEFAULT_STORE_ID);
  if (
    gameLodge &&
    (gameLodge.ownerEmail === "owner@example.com" ||
      !gameLodge.ownerEmail.trim())
  ) {
    await dataStore.saveStore({
      ...gameLodge,
      ownerEmail: STORE_OWNER_EMAIL,
    });
    const settings = await dataStore.getSettings(DEFAULT_STORE_ID);
    if (settings.ownerEmail.toLowerCase() !== STORE_OWNER_EMAIL) {
      await dataStore.saveSettings({
        ...settings,
        ownerEmail: STORE_OWNER_EMAIL,
      });
    }
  }

  const users = await dataStore.listAdminUsers();
  const now = new Date().toISOString();

  const platformHash = await hashCustomerPassword(SEED_PASSWORD);
  const ownerHash = await hashCustomerPassword(SEED_PASSWORD);

  const platform = users.find(
    (u) => u.email.toLowerCase() === PLATFORM_ADMIN_EMAIL,
  );
  if (!platform) {
    await dataStore.saveAdminUser({
      id: uuidv4(),
      email: PLATFORM_ADMIN_EMAIL,
      passwordHash: platformHash,
      role: "platform",
      createdAt: now,
      updatedAt: now,
    });
  }

  const owner = users.find(
    (u) => u.email.toLowerCase() === STORE_OWNER_EMAIL,
  );
  if (!owner) {
    await dataStore.saveAdminUser({
      id: uuidv4(),
      email: STORE_OWNER_EMAIL,
      passwordHash: ownerHash,
      role: "store",
      storeId: DEFAULT_STORE_ID,
      createdAt: now,
      updatedAt: now,
    });
  }
}
