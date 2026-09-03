// Real IceCash partner API client. Signing algorithm and envelope are copied verbatim from the
// prerequest scripts in "ZINARA ICECASH.postman_collection.json". Requires baseUrl + partnerKey +
// locationId to be set on the Settings page (server/data/settings.json) — otherwise every call
// throws a clear configuration error instead of silently failing.

const crypto = require("crypto");
const settingsStore = require("./settingsStore");

let cachedToken = null; // { token, obtainedAt }
const TOKEN_TTL_MS = 25 * 60 * 1000; // refresh well before IceCash-side expiry

function reverseString(str) {
  return str.split("").reverse().join("");
}

function generateNumericId() {
  return String(Math.floor(1000000 + Math.random() * 9000000));
}

function pad2(n) {
  return String(n).padStart(2, "0");
}
function currentDateTime() {
  const d = new Date();
  return (
    `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}` +
    `${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
  );
}

// Exact port of the Postman prerequest script's generateMAC().
function generateMAC(key, argumentsJson) {
  const reversedJson = reverseString(argumentsJson);
  const reversedKey = reverseString(key);
  const combined = reversedJson + reversedKey;
  const base64Encoded = Buffer.from(combined, "utf8").toString("base64");
  const sha512Hash = crypto.createHash("sha512").update(base64Encoded, "utf8").digest("hex");
  const positions = [0, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96, 104, 112, 120];
  let mac = "";
  for (const pos of positions) mac += sha512Hash.charAt(pos);
  return mac.toUpperCase();
}

function requireConfig() {
  const s = settingsStore.get();
  if (!s.baseUrl || !s.partnerKey || !s.locationId) {
    throw new Error(
      "IceCash real-mode is not configured — set partner key, base URL, and LocationID on the Settings page."
    );
  }
  return s;
}

async function callIceCash(functionName, fields, { withToken = true } = {}) {
  const settings = requireConfig();
  const token = withToken ? await ensureToken() : undefined;

  const argumentsObj = {
    Version: "2.3",
    ...(withToken ? { PartnerToken: token } : {}),
    Date: currentDateTime(),
    PartnerReference: generateNumericId(),
    Request: { Function: functionName, ...fields },
  };
  const argumentsJson = JSON.stringify(argumentsObj);
  const mac = generateMAC(settings.partnerKey, argumentsJson);

  const body = { Arguments: argumentsObj, Mode: "SH", MAC: mac };
  const headers = { "Content-Type": "application/json" };
  if (withToken) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${settings.baseUrl.replace(/\/$/, "")}/request/20117846`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`IceCash HTTP ${res.status} calling ${functionName}`);
  }
  const json = await res.json();
  return json.Response;
}

async function ensureToken() {
  if (cachedToken && Date.now() - cachedToken.obtainedAt < TOKEN_TTL_MS) {
    return cachedToken.token;
  }
  const response = await callIceCash("PartnerToken", {}, { withToken: false });
  cachedToken = { token: response.PartnerToken, obtainedAt: Date.now() };
  return cachedToken.token;
}

async function getPartnerToken() {
  const token = await ensureToken();
  return { token };
}

async function tpiQuote(vehicle) {
  return callIceCash("TPIQuote", { Vehicles: [vehicle] });
}
async function tpiQuoteUpdate({ insuranceId, paymentMethod = "1", status = "1", identifier, msisdn }) {
  return callIceCash("TPIQuoteUpdate", {
    PaymentMethod: paymentMethod,
    Identifier: identifier || "",
    MSISDN: msisdn || "",
    Quotes: [{ InsuranceID: insuranceId, Status: status }],
  });
}
async function tpiPolicy(insuranceId) {
  return callIceCash("TPIPolicy", { InsuranceID: insuranceId });
}

async function licQuote(vehicle) {
  return callIceCash("LICQuote", { Vehicles: [vehicle] });
}
async function licQuoteUpdate({ licenceId, paymentMethod = "1", status = "1", identifier, msisdn, deliveryMethod = "1" }) {
  return callIceCash("LicQuoteUpdate", {
    PaymentMethod: paymentMethod,
    Identifier: identifier || "",
    MSISDN: msisdn || "",
    Quotes: [{ LicenceID: licenceId, Status: status, DeliveryMethod: deliveryMethod }],
  });
}
async function licResult(licenceId) {
  return callIceCash("LICResult", { LicenceID: licenceId });
}

async function tpilicQuote(vehicle) {
  return callIceCash("TPILICQuote", { Vehicles: [vehicle] });
}
async function tpilicUpdate({ combinedId, paymentMethod = "3", status = "1", identifier, msisdn }) {
  const settings = settingsStore.get();
  return callIceCash("TPILICUpdate", {
    PaymentMethod: paymentMethod,
    Identifier: identifier || "",
    MSISDN: msisdn || "",
    Quotes: [
      {
        CombinedID: combinedId,
        PaymentMethod: paymentMethod,
        Status: status,
        DeliveryMethod: "2",
        LicenceCert: "0",
        LocationID: settings.locationId,
      },
    ],
  });
}
async function tpilicResult(combinedId) {
  return callIceCash("TPILICResult", { CombinedID: combinedId });
}

module.exports = {
  getPartnerToken,
  tpiQuote,
  tpiQuoteUpdate,
  tpiPolicy,
  licQuote,
  licQuoteUpdate,
  licResult,
  tpilicQuote,
  tpilicUpdate,
  tpilicResult,
};
