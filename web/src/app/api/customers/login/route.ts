import { NextRequest } from "next/server";
import {
  verifyCustomerPassword,
} from "@/lib/auth/customer-password";
import {
  customerSessionResponse,
  touchCustomerLogin,
} from "@/lib/auth/customer-auth";
import { normalizeCustomer } from "@/lib/auth/normalize-customer";
import { jsonError, handleRouteError } from "@/lib/api-utils";
import { dataStore } from "@/lib/storage/data-store";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");

    if (!email || !password) {
      return jsonError("Email and password are required");
    }

    const raw = await dataStore.getCustomerByEmail(email);
    if (!raw?.passwordHash) {
      return jsonError("Invalid email or password", 401);
    }

    const customer = normalizeCustomer(raw);
    const valid = await verifyCustomerPassword(password, customer.passwordHash!);
    if (!valid) {
      return jsonError("Invalid email or password", 401);
    }

    const loggedIn = await touchCustomerLogin(customer);
    return customerSessionResponse(loggedIn);
  } catch (err) {
    return handleRouteError(err);
  }
}
