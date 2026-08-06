import { v4 as uuidv4 } from "uuid";
import {
  hashCustomerPassword,
  validateCustomerPassword,
} from "./customer-password";
import { dataStore } from "../storage/data-store";
import type { AdminUser } from "../types";

/** Ensure owner email is not a platform account or tied to another store. */
export async function validateStoreOwnerEmail(
  storeId: string,
  ownerEmail: string,
): Promise<string> {
  const normalized = ownerEmail.trim().toLowerCase();
  if (!normalized) {
    throw new Error("Owner email is required");
  }

  const existing = await dataStore.getAdminUserByEmail(normalized);
  if (existing) {
    if (existing.role === "platform") {
      throw new Error(
        "Use a dedicated store owner email — platform admin accounts are separate.",
      );
    }
    if (existing.role === "store" && existing.storeId !== storeId) {
      throw new Error("That email already manages another store.");
    }
  }

  return normalized;
}

/** Create or validate the store-owner admin login for a store. */
export async function ensureStoreOwnerAccount(
  storeId: string,
  ownerEmail: string,
  password: string,
): Promise<void> {
  const normalized = await validateStoreOwnerEmail(storeId, ownerEmail);

  const passwordError = validateCustomerPassword(password);
  if (passwordError) {
    throw new Error(passwordError);
  }

  const existing = await dataStore.getAdminUserByEmail(normalized);
  if (existing?.role === "store" && existing.storeId === storeId) {
    await dataStore.saveAdminUser({
      ...existing,
      passwordHash: await hashCustomerPassword(password),
      updatedAt: new Date().toISOString(),
    });
    return;
  }

  const now = new Date().toISOString();
  const user: AdminUser = {
    id: existing?.id ?? uuidv4(),
    email: normalized,
    passwordHash: await hashCustomerPassword(password),
    role: "store",
    storeId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await dataStore.saveAdminUser(user);
}

/** Set or reset the store owner password (platform handoff or owner email sync). */
export async function setStoreOwnerPassword(
  storeId: string,
  password: string,
): Promise<void> {
  const passwordError = validateCustomerPassword(password);
  if (passwordError) {
    throw new Error(passwordError);
  }

  const settings = await dataStore.getSettings(storeId);
  const ownerEmail = await validateStoreOwnerEmail(storeId, settings.ownerEmail);

  const existing = await dataStore.getStoreAdminUser(storeId);
  const now = new Date().toISOString();
  const passwordHash = await hashCustomerPassword(password);

  if (existing) {
    await dataStore.saveAdminUser({
      ...existing,
      email: ownerEmail,
      passwordHash,
      updatedAt: now,
    });
    return;
  }

  const byEmail = await dataStore.getAdminUserByEmail(ownerEmail);

  await dataStore.saveAdminUser({
    id: byEmail?.id ?? uuidv4(),
    email: ownerEmail,
    passwordHash,
    role: "store",
    storeId,
    createdAt: byEmail?.createdAt ?? now,
    updatedAt: now,
  });
}
