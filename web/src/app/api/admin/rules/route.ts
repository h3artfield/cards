import { NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { dataStore } from "@/lib/storage/data-store";
import {
  requireAdminSession,
  requireStoreScope,
} from "@/lib/admin-auth";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import type { StoreRule } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    await dataStore.ensureDefaultStoreRules(scope.storeId);
    const rules = await dataStore.getRules(scope.storeId);
    return jsonOk({ rules });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const body = await req.json();
    const now = new Date().toISOString();

    const rule: StoreRule = {
      id: body.id ?? uuidv4(),
      storeId: scope.storeId,
      title: body.title,
      active: body.active ?? true,
      priority: body.priority ?? 0,
      appliesToCategories: body.appliesToCategories ?? [],
      ruleType: body.ruleType,
      ruleText: body.ruleText,
      structuredFilters: body.structuredFilters,
      cashPercentOverride: body.cashPercentOverride,
      tradePercentOverride: body.tradePercentOverride,
      ownerNote: body.ownerNote,
      createdAt: body.createdAt ?? now,
      updatedAt: now,
    };

    if (!rule.title || !rule.ruleType || !rule.ruleText) {
      return jsonError("title, ruleType, and ruleText are required");
    }

    await dataStore.saveRule(rule);
    await dataStore.logAdminAction({ action: "save_rule", ruleId: rule.id });
    return jsonOk({ rule });
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
    const id = body.id as string | undefined;
    if (!id) return jsonError("id required");

    const rules = await dataStore.getRules(scope.storeId);
    const existing = rules.find((r) => r.id === id);
    if (!existing) return jsonError("Rule not found", 404);

    const now = new Date().toISOString();
    const rule: StoreRule = {
      ...existing,
      ...body,
      id,
      storeId: scope.storeId,
      updatedAt: now,
    };

    await dataStore.saveRule(rule);
    await dataStore.logAdminAction({
      action:
        body.active === false
          ? "pause_rule"
          : body.active === true
            ? "resume_rule"
            : "update_rule",
      ruleId: rule.id,
    });
    return jsonOk({ rule });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return jsonError("id required");

    const rules = await dataStore.getRules(scope.storeId);
    if (!rules.some((r) => r.id === id)) {
      return jsonError("Rule not found", 404);
    }

    await dataStore.deleteRule(id);
    return jsonOk({ success: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
