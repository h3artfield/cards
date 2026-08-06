/**
 * Poll Cloud Run domain mapping certs, redeploy APP_URL, run full verification.
 * Run: cd web && npx tsx scripts/domain-cert-poll-and-verify.ts
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";

const PROJECT = "trading-card-buyback-dev";
const REGION = "us-central1";
const SERVICE = "buyback-web-staging";
const APEX = "cardscanner9000.com";
const WWW = "www.cardscanner9000.com";
const CUSTOM_URL = "https://cardscanner9000.com";
const STAGING = "https://buyback-web-staging-rrogeqxyea-uc.a.run.app";
const POLL_MS = 6 * 60 * 1000;
const MAX_WAIT_MS = 2 * 60 * 60 * 1000;
const MAPPING_START = new Date("2026-07-07T04:47:34.981Z").getTime();

type Condition = { type: string; status: string; reason?: string; message?: string };

function gcloudJson(args: string): unknown {
  const out = execSync(`gcloud ${args} --format=json`, { encoding: "utf8" });
  return JSON.parse(out || "{}");
}

function mappingStatus(domain: string) {
  const data = gcloudJson(
    `beta run domain-mappings describe --domain=${domain} --region=${REGION} --project=${PROJECT}`,
  ) as { status?: { conditions?: Condition[] } };
  const conditions = data.status?.conditions ?? [];
  const get = (type: string) => conditions.find((c) => c.type === type);
  return {
    domain,
    ready: get("Ready")?.status === "True",
    cert: get("CertificateProvisioned")?.status === "True",
    readyCond: get("Ready"),
    certCond: get("CertificateProvisioned"),
    domainRoutable: get("DomainRoutable")?.status === "True",
  };
}

function bothReady() {
  const apex = mappingStatus(APEX);
  const www = mappingStatus(WWW);
  return { apex, www, ok: apex.ready && apex.cert && www.ready && www.cert };
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

function loadEnvLocal() {
  const p = resolve(__dirname, "../.env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    if (!process.env[k]?.trim()) process.env[k] = t.slice(eq + 1).trim();
  }
}

async function checkUrl(url: string) {
  try {
    const res = await fetch(url, { redirect: "manual" });
    return { url, status: res.status, location: res.headers.get("location"), ok: res.status < 400 };
  } catch (err) {
    return { url, error: err instanceof Error ? err.message : String(err), ok: false };
  }
}

async function runFullVerification() {
  loadEnvLocal();
  const pages = ["/", "/pricing", "/signup", "/login"];
  const pageResults = [];
  for (const path of pages) {
    pageResults.push(await checkUrl(`${CUSTOM_URL}${path}`));
  }
  const wwwResult = await checkUrl(`https://${WWW}/`);

  const slug = `domain-verify-${Date.now()}`;
  const email = `${slug}@example.com`;
  const password = "TestPass123!";
  const signupRes = await fetch(`${CUSTOM_URL}/api/store/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      storeName: "Domain Verify Store",
      ownerName: "Domain Verify",
      email,
      phone: "5555555555",
      address: "123 Test St",
      password,
      storeSlug: slug,
    }),
  });
  const signupJson = (await signupRes.json()) as {
    checkoutUrl?: string;
    storeId?: string;
    error?: string;
  };
  const checkoutUrl = signupJson.checkoutUrl ?? "";
  let successUrlHost: string | null = null;
  if (checkoutUrl.includes("cardscanner9000.com")) successUrlHost = "cardscanner9000.com";
  else if (checkoutUrl.includes("run.app")) successUrlHost = "run.app";

  const loginRes = await fetch(`${CUSTOM_URL}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, expectedRole: "store" }),
  });
  const cookies = (loginRes.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const meInactive = await fetch(`${CUSTOM_URL}/api/admin/me`, { headers: { Cookie: cookies } });
  const meJson = (await meInactive.json()) as { subscriptionActive?: boolean };

  const v2Route = await checkUrl(`${CUSTOM_URL}/admin/v2/knowledge`);
  const webhookProbe = await fetch(`${STAGING}/api/stripe/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });

  return {
    pages: pageResults,
    www: wwwResult,
    signup: {
      status: signupRes.status,
      hasCheckoutUrl: checkoutUrl.includes("checkout.stripe.com"),
      successUrlHost,
      storeId: signupJson.storeId ?? null,
      error: signupJson.error ?? null,
    },
    inactiveLogin: { ok: loginRes.ok, subscriptionActive: meJson.subscriptionActive },
    v2Route,
    webhookStaging: { status: webhookProbe.status, reachable: webhookProbe.status !== 404 },
    emailDns: {
      mx: execSync(`nslookup -type=MX ${APEX} 8.8.8.8`, { encoding: "utf8" }).includes("route"),
      resendSpf: execSync(`nslookup -type=TXT send.${APEX} 8.8.8.8`, { encoding: "utf8" }).includes("amazonses"),
    },
  };
}

function redeployCustomAppUrl() {
  const repoRoot = resolve(__dirname, "../..");
  const envLocal = resolve(__dirname, "../.env.local");
  const getEnv = (name: string) => {
    for (const line of readFileSync(envLocal, "utf8").split(/\r?\n/)) {
      const m = line.match(new RegExp(`^${name}=(.*)$`));
      if (m) return m[1].trim();
    }
    return "";
  };

  const fbProjectId = getEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  const fbBucket = getEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET");
  const stripePrice = getEnv("STRIPE_PRICE_ID_CARD_SCANNER_STORE_MONTHLY");
  const gradingUrl = "https://grading-service-staging-rrogeqxyea-uc.a.run.app";

  const envYaml = `
FIREBASE_PROJECT_ID: "${fbProjectId}"
NEXT_PUBLIC_FIREBASE_PROJECT_ID: "${fbProjectId}"
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "${fbBucket}"
GRADING_SERVICE_URL: "${gradingUrl}"
REQUIRE_FIRESTORE: "true"
APP_URL: "${CUSTOM_URL}"
NEXT_PUBLIC_APP_URL: "${CUSTOM_URL}"
CARD_FLOW_V2_EVIDENCE_ENABLED: "true"
CARD_FLOW_V2_IDENTITY_ENABLED: "true"
CARD_FLOW_V2_MARKET_ENABLED: "true"
CARD_FLOW_V2_AUDIT_ENABLED: "true"
CARD_FLOW_V2_STAFF_CONFIRMATION_ENABLED: "true"
CARD_FLOW_V2_OFFER_PREVIEW_ENABLED: "true"
CARD_FLOW_V2_OFFER_INFLUENCE: "true"
CARD_FLOW_V2_MARKET_MAX_SUSPECTS: "1"
CARD_FLOW_V2_MARKET_ENABLE_EBAY: "true"
CARD_FLOW_V2_MARKET_ENABLE_PRICECHARTING: "true"
CARD_FLOW_V2_MARKET_ENABLE_TCGPLAYER: "true"
EMAIL_FROM: "Card Scanner Reports <reports@cardscanner9000.com>"
PRICECHARTING_IMPORT_EMAIL_PROVIDER: "resend"
PRICECHARTING_IMPORT_EMAIL_TO: "h3artfield@gmail.com"
PRICECHARTING_IMPORT_EMAIL_FROM: "reports@cardscanner9000.com"
PRICECHARTING_IMPORT_EMAIL_FROM_NAME: "Card Scanner Reports"
ORDER_READY_CUSTOMER_EMAIL_ENABLED: "true"
ORDER_READY_CUSTOMER_EMAIL_START_AT: "2026-07-05T00:00:00.000Z"
ORDER_READY_CUSTOMER_EMAIL_FROM: "reports@cardscanner9000.com"
ORDER_READY_CUSTOMER_EMAIL_FROM_NAME: "Card Scanner Reports"
ORDER_PROCESSING_WORKER: "cloud_run_job"
CARD_PROCESSING_PIPELINE_MODE: "v2_primary"
V1_FULL_ANALYSIS_ON_SUBMIT: "false"
V1_PRICING_ON_SUBMIT: "false"
V1_ANALYSIS_ASYNC_ENABLED: "false"
CARD_PROCESSING_CONCURRENCY: "2"
ORDER_PROCESSING_JOB_NAME: "order-processing-job"
CLOUD_RUN_REGION: "us-central1"
OPENAI_REQUEST_TIMEOUT_MS: "60000"
ORDER_PROCESSING_STUCK_THRESHOLD_MS: "600000"
STRIPE_PRICE_ID_CARD_SCANNER_STORE_MONTHLY: "${stripePrice}"
`.trim();

  const envPath = resolve(__dirname, "../.domain-redeploy-env.yaml");
  writeFileSync(envPath, envYaml);

  const secretNames = [
    "OPENAI_API_KEY",
    "ADMIN_SESSION_SECRET",
    "POKEMON_TCG_API_KEY",
    "PRICECHARTING_API_KEY",
    "RESEND_API_KEY",
    "EBAY_CLIENT_ID",
    "EBAY_CLIENT_SECRET",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
  ];
  const mounts: string[] = [];
  for (const name of secretNames) {
    try {
      const enabled = execSync(
        `gcloud secrets versions list ${name} --project=${PROJECT} --filter="state=ENABLED" --format="value(name)"`,
        { encoding: "utf8" },
      ).trim();
      if (enabled) mounts.push(`${name}=${name}:latest`);
    } catch {
      /* skip */
    }
  }

  execSync(
    `gcloud run deploy ${SERVICE} --image=us-central1-docker.pkg.dev/${PROJECT}/buyback/buyback-web-staging:latest --region=${REGION} --project=${PROJECT} --allow-unauthenticated --port=8080 --memory=1Gi --cpu=1 --min-instances=1 --timeout=300 --set-secrets=${mounts.join(",")} --env-vars-file=${envPath} --quiet`,
    { cwd: repoRoot, stdio: "inherit" },
  );
}

function diagnosticsAfterTimeout() {
  const apexYaml = execSync(
    `gcloud beta run domain-mappings describe --domain=${APEX} --region=${REGION} --project=${PROJECT} --format=yaml`,
    { encoding: "utf8" },
  );
  const wwwYaml = execSync(
    `gcloud beta run domain-mappings describe --domain=${WWW} --region=${REGION} --project=${PROJECT} --format=yaml`,
    { encoding: "utf8" },
  );
  const resolve = (q: string) => {
    try {
      return execSync(q, { encoding: "utf8" });
    } catch (e) {
      return String(e);
    }
  };
  return {
    apexMappingYaml: apexYaml,
    wwwMappingYaml: wwwYaml,
    dnsApexA_8888: resolve(`nslookup -type=A ${APEX} 8.8.8.8`),
    dnsApexA_1111: resolve(`nslookup -type=A ${APEX} 1.1.1.1`),
    dnsWww_8888: resolve(`nslookup -type=CNAME ${WWW} 8.8.8.8`),
    dnsWww_1111: resolve(`nslookup -type=CNAME ${WWW} 1.1.1.1`),
    dnsCaa: resolve(`nslookup -type=CAA ${APEX} 8.8.8.8`),
    note: "Cloudflare proxy status requires CLOUDFLARE_API_TOKEN; not queried to avoid DNS changes.",
  };
}

async function main() {
  const start = Date.now();
  console.log("==> Polling certificate status every 6 minutes...");

  while (Date.now() - start < MAX_WAIT_MS) {
    const { apex, www, ok } = bothReady();
    console.log(
      new Date().toISOString(),
      `apex cert=${apex.certCond?.status} ready=${apex.readyCond?.status}`,
      `www cert=${www.certCond?.status} ready=${www.readyCond?.status}`,
    );
    if (apex.certCond?.message) console.log("  apex:", apex.certCond.message);
    if (ok) {
      console.log("\n==> Certificates ready. Redeploying APP_URL...");
      redeployCustomAppUrl();
      console.log("\n==> Running full verification suite...");
      const results = await runFullVerification();
      console.log("\n========== VERIFICATION RESULT ==========");
      console.log(JSON.stringify(results, null, 2));
      return;
    }
    if (Date.now() - MAPPING_START >= MAX_WAIT_MS) break;
    await sleep(POLL_MS);
  }

  console.log("\n==> 2-hour timeout — returning diagnostics");
  console.log(JSON.stringify(diagnosticsAfterTimeout(), null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
