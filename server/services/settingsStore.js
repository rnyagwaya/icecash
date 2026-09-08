const fs = require("fs");
const path = require("path");

const SETTINGS_FILE = path.join(__dirname, "..", "data", "settings.json");

// Defaults fall back to project .env vars (see server/services/loadEnv.js) when
// server/data/settings.json hasn't been written yet or omits a field.
const DEFAULTS = {
  icecashMode: process.env.ICECASH_MODE || "mock", // "mock" | "real"
  baseUrl: process.env.ICECASH_BASE_URL || "https://test-api.icecash.mobi",
  partnerKey: process.env.ICECASH_PARTNER_KEY || "",
  locationId: process.env.ICECASH_LOCATION_ID || "",
  insuranceCompanyId: process.env.INSURANCE_COMPANY_ID || "24",
  ecocashMode: process.env.ECOCASH_MODE || "simulated", // "simulated" | "real"
  ecocashGatewayBaseUrl: process.env.ECOCASH_GATEWAY_BASE_URL || "http://196.29.38.218:3000",
  ecocashGatewayApiKey: process.env.ECOCASH_GATEWAY_API_KEY || "",
  ecocashGatewayPartnerCode: process.env.ECOCASH_GATEWAY_PARTNER_CODE || "",
};

let cache = null;

function load() {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, "utf8");
    cache = { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (err) {
    cache = { ...DEFAULTS };
  }
  return cache;
}

function save(partial) {
  const current = load();
  cache = { ...current, ...partial };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(cache, null, 2));
  return cache;
}

function get() {
  return { ...load() };
}

// Version of settings safe to send to the browser (partner key masked, never echoed raw).
function getMasked() {
  const s = load();
  return {
    ...s,
    partnerKey: s.partnerKey ? "••••••••" : "",
    partnerKeySet: Boolean(s.partnerKey),
    ecocashGatewayApiKey: s.ecocashGatewayApiKey ? "••••••••" : "",
    ecocashGatewayApiKeySet: Boolean(s.ecocashGatewayApiKey),
  };
}

function isRealConfigured() {
  const s = load();
  return Boolean(s.baseUrl && s.partnerKey && s.locationId);
}

function isEcocashGatewayConfigured() {
  const s = load();
  return Boolean(s.ecocashGatewayBaseUrl && s.ecocashGatewayApiKey && s.ecocashGatewayPartnerCode);
}

module.exports = { get, getMasked, save, isRealConfigured, isEcocashGatewayConfigured, DEFAULTS };
