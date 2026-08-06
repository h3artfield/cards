import { dataStore } from "@/lib/storage/data-store";

/** Keep store owner login email and settings.ownerEmail in sync. */
export async function syncStoreOwnerEmail(
  storeId: string,
  ownerEmail: string,
): Promise<void> {
  const normalized = ownerEmail.trim().toLowerCase();
  if (!normalized) return;

  const settings = await dataStore.getSettings(storeId);
  if (settings.ownerEmail.toLowerCase() !== normalized) {
    await dataStore.saveSettings({ ...settings, ownerEmail: normalized });
  }

  const storeAdmin = await dataStore.getStoreAdminUser(storeId);
  if (storeAdmin && storeAdmin.email.toLowerCase() !== normalized) {
    const taken = await dataStore.getAdminUserByEmail(normalized);
    if (taken && taken.id !== storeAdmin.id) {
      throw new Error("That email is already used by another admin account.");
    }
    await dataStore.saveAdminUser({
      ...storeAdmin,
      email: normalized,
      updatedAt: new Date().toISOString(),
    });
  }
}
