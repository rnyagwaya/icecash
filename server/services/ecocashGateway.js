// Client for the Zimnat-hosted payments gateway's EcoCash endpoints (separate from the
// IceCash real-API client in icecashReal.js — different base URL, different auth token).
// Auth: POST /api/v1/auth/login {apiKey, partnerCode} -> {success, data:{access_token, expires_in}}.

const settingsStore = require("./settingsStore");

let cachedToken = null; // { token, obtainedAt, expiresInMs }

function resetToken() {
  cachedToken = null;
}

function requireConfig() {
  const s = settingsStore.get();
  if (!s.ecocashGatewayBaseUrl || !s.ecocashGatewayApiKey || !s.ecocashGatewayPartnerCode) {
    throw new Error(
      "EcoCash gateway is not configured — set the gateway base URL, API key, and partner code on the Settings page."
    );
  }
  return s;
}

async function ensureToken() {
  const settings = requireConfig();
  if (cachedToken && Date.now() - cachedToken.obtainedAt < cachedToken.expiresInMs - 60_000) {
    return cachedToken.token;
  }

  const res = await fetch(`${settings.ecocashGatewayBaseUrl.replace(/\/$/, "")}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: settings.ecocashGatewayApiKey, partnerCode: settings.ecocashGatewayPartnerCode }),
  });
  if (!res.ok) {
    throw new Error(`EcoCash gateway auth failed: HTTP ${res.status}`);
  }
  const json = await res.json();
  if (!json.success || !json.data?.access_token) {
    throw new Error(`EcoCash gateway auth failed: ${json.message || "no access_token returned"}`);
  }
  cachedToken = {
    token: json.data.access_token,
    obtainedAt: Date.now(),
    expiresInMs: (json.data.expires_in || 3600) * 1000,
  };
  return cachedToken.token;
}

async function call(path, body) {
  const settings = requireConfig();
  const token = await ensureToken();
  const res = await fetch(`${settings.ecocashGatewayBaseUrl.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`EcoCash gateway HTTP ${res.status} calling ${path}`);
  }
  return res.json();
}

// Local MSISDN format the gateway expects, e.g. "775461117" — strips a leading 263 or 0.
function toLocalMsisdn(msisdn) {
  const digits = String(msisdn || "").replace(/\D/g, "");
  if (digits.startsWith("263")) return digits.slice(3);
  if (digits.startsWith("0")) return digits.slice(1);
  return digits;
}

async function initiate({ transactionReference, currency, amount, customerMsisdn, customerName, customerReference, policyNumber }) {
  const json = await call("/api/v1/payments/ecocash/initiate", {
    transactionReference,
    currency,
    amount,
    customerMsisdn: toLocalMsisdn(customerMsisdn),
    customerName,
    productType: "MOTOR_INSURANCE",
    customerReference,
    policyNumber,
  });
  if (!json.success) {
    throw new Error(json.message || "EcoCash initiate failed");
  }
  return json.data;
}

async function query(transactionReference) {
  const json = await call("/api/v1/payments/ecocash/query", { transactionReference });
  if (!json.success) {
    throw new Error(json.message || "EcoCash query failed");
  }
  return json.data;
}

// The gateway's terminal status vocabulary isn't fully confirmed yet — every observed response
// so far has been "PENDING SUBSCRIBER VALIDATION". Treat anything still starting with "PENDING"
// as in-flight; once it isn't, infer success/failure from keywords rather than assuming a fixed
// enum, so this doesn't silently hang or misfire if the real wording differs from expectations.
function isPending(status) {
  return /^PENDING/i.test(String(status || ""));
}
function isFailure(status, message) {
  const text = `${status || ""} ${message || ""}`.toUpperCase();
  return /(FAIL|CANCEL|DECLINE|TIMEOUT|TIMED OUT|REJECT|EXPIRE|ERROR)/.test(text);
}

module.exports = { initiate, query, isPending, isFailure, resetToken, toLocalMsisdn };
