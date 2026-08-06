import { NextRequest } from "next/server";
import { dataStore } from "@/lib/storage/data-store";
import {
  requireAdminSession,
  requireStoreScope,
} from "@/lib/admin-auth";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { normalizeStoreSlug } from "@/lib/store-slug";
import { persistStoreLogo } from "@/lib/storage/store-logo";
import { syncStoreOwnerEmail } from "@/lib/auth/sync-store-owner";
import { validateStoreOwnerEmail } from "@/lib/auth/ensure-store-owner";
import type { StoreSettings } from "@/lib/types";
import { DEFAULT_CALENDAR_SETTINGS } from "@/lib/store-calendar/types";

export async function GET(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const settings = await dataStore.getSettings(scope.storeId);
    return jsonOk({ settings });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const body = await req.json();
    const current = await dataStore.getSettings(scope.storeId);
    const storeName =
      body.storeName != null ? String(body.storeName) : current.storeName;

    let storeLogoUrl = current.storeLogoUrl;
    if ("storeLogoUrl" in body) {
      if (body.storeLogoUrl == null || body.storeLogoUrl === "") {
        storeLogoUrl = undefined;
      } else {
        storeLogoUrl = await persistStoreLogo(String(body.storeLogoUrl));
      }
    }

    const ownerEmail =
      body.ownerEmail != null
        ? String(body.ownerEmail).trim().toLowerCase()
        : current.ownerEmail;

    if (
      body.ownerEmail != null &&
      ownerEmail !== current.ownerEmail.toLowerCase()
    ) {
      try {
        await validateStoreOwnerEmail(scope.storeId, ownerEmail);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Invalid store owner email";
        return jsonError(message, 409);
      }
    }

    const settings: StoreSettings = {
      ...current,
      id: current.id,
      storeName,
      storeSlug: normalizeStoreSlug(
        body.storeSlug != null ? String(body.storeSlug) : current.storeSlug,
        storeName,
      ),
      storeLogoUrl,
      ownerEmail,
      emailNotificationsEnabled:
        body.emailNotificationsEnabled != null
          ? Boolean(body.emailNotificationsEnabled)
          : current.emailNotificationsEnabled,
      smsNotificationsEnabled:
        body.smsNotificationsEnabled != null
          ? Boolean(body.smsNotificationsEnabled)
          : current.smsNotificationsEnabled,
      defaultCashPercent:
        body.defaultCashPercent != null
          ? Number(body.defaultCashPercent)
          : current.defaultCashPercent,
      defaultTradePercent:
        body.defaultTradePercent != null
          ? Number(body.defaultTradePercent)
          : current.defaultTradePercent,
      slabCashPercent:
        body.slabCashPercent != null
          ? Number(body.slabCashPercent)
          : current.slabCashPercent,
      slabTradePercent:
        body.slabTradePercent != null
          ? Number(body.slabTradePercent)
          : current.slabTradePercent,
      manualReviewThreshold:
        body.manualReviewThreshold != null
          ? Number(body.manualReviewThreshold)
          : current.manualReviewThreshold,
      minimumOffer:
        body.minimumOffer != null
          ? Number(body.minimumOffer)
          : current.minimumOffer,
      conditionMultipliers:
        body.conditionMultipliers != null
          ? {
              ...current.conditionMultipliers,
              ...body.conditionMultipliers,
            }
          : current.conditionMultipliers,
      customerGuestModeEnabled:
        body.customerGuestModeEnabled != null
          ? Boolean(body.customerGuestModeEnabled)
          : current.customerGuestModeEnabled,
      calendarSettings:
        body.calendarSettings != null
          ? {
              ...DEFAULT_CALENDAR_SETTINGS,
              ...current.calendarSettings,
              ...body.calendarSettings,
            }
          : current.calendarSettings,
    };
    await dataStore.saveSettings(settings);
    if (
      body.ownerEmail != null &&
      ownerEmail !== current.ownerEmail.toLowerCase()
    ) {
      try {
        await syncStoreOwnerEmail(scope.storeId, ownerEmail);
      } catch (err) {
        if (err instanceof Error && err.message.includes("already used")) {
          return jsonError(err.message, 409);
        }
        throw err;
      }
    }
    await dataStore.logAdminAction({ action: "update_settings" });
    const saved = await dataStore.getSettings(scope.storeId);
    return jsonOk({ settings: saved });
  } catch (err) {
    return handleRouteError(err);
  }
}
