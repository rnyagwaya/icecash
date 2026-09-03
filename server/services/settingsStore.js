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
  };
}

function isRealConfigured() {
  const s = load();
  return Boolean(s.baseUrl && s.partnerKey && s.locationId);
}

module.exports = { get, getMasked, save, isRealConfigured, DEFAULTS };
