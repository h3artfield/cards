import assert from "node:assert/strict";
import {
  createCustomerSessionToken,
  parseCustomerSessionToken,
  readCustomerSessionFromRequest,
} from "./customer-session";

const session = {
  customerId: "cust-1",
  email: "case@example.test",
  role: "customer" as const,
};

const token = createCustomerSessionToken(session);
assert.deepEqual(parseCustomerSessionToken(token), session);

const bearerReq = new Request("https://example.test/api/customers/me", {
  headers: { authorization: `Bearer ${token}` },
});
assert.deepEqual(readCustomerSessionFromRequest(bearerReq), session);

const cookieReq = new Request("https://example.test/api/customers/me", {
  headers: { cookie: `customer_session=${token}` },
});
assert.deepEqual(readCustomerSessionFromRequest(cookieReq), session);

const missing = new Request("https://example.test/api/customers/me");
assert.equal(readCustomerSessionFromRequest(missing), null);

console.log("PASS  customer session bearer + cookie");
