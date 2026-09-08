const express = require("express");
const settingsStore = require("../services/settingsStore");
const icecashReal = require("../services/icecashReal");
const ecocashGateway = require("../services/ecocashGateway");

const router = express.Router();

router.get("/settings", (req, res) => {
  res.json(settingsStore.getMasked());
});

router.post("/settings", (req, res) => {
  const {
    icecashMode,
    baseUrl,
    partnerKey,
    locationId,
    insuranceCompanyId,
    ecocashMode,
    ecocashGatewayBaseUrl,
    ecocashGatewayApiKey,
    ecocashGatewayPartnerCode,
  } = req.body || {};

  const before = settingsStore.get();
  const update = {};
  if (icecashMode === "mock" || icecashMode === "real") update.icecashMode = icecashMode;
  if (typeof baseUrl === "string" && baseUrl.trim()) update.baseUrl = baseUrl.trim();
  if (typeof locationId === "string") update.locationId = locationId.trim();
  if (typeof insuranceCompanyId === "string" && insuranceCompanyId.trim()) {
    update.insuranceCompanyId = insuranceCompanyId.trim();
  }
  // Only overwrite the stored partner key if a non-empty value was actually submitted —
  // the browser never receives the real key back, so an empty field must not erase it.
  if (typeof partnerKey === "string" && partnerKey.trim()) update.partnerKey = partnerKey.trim();

  if (ecocashMode === "simulated" || ecocashMode === "real") update.ecocashMode = ecocashMode;
  if (typeof ecocashGatewayBaseUrl === "string" && ecocashGatewayBaseUrl.trim()) {
    update.ecocashGatewayBaseUrl = ecocashGatewayBaseUrl.trim();
  }
  if (typeof ecocashGatewayPartnerCode === "string") update.ecocashGatewayPartnerCode = ecocashGatewayPartnerCode.trim();
  // Same masked-field rule as partnerKey above.
  if (typeof ecocashGatewayApiKey === "string" && ecocashGatewayApiKey.trim()) {
    update.ecocashGatewayApiKey = ecocashGatewayApiKey.trim();
  }

  const saved = settingsStore.save(update);

  // A cached IceCash auth token issued under the old key/base URL is invalid once either
  // changes — without this, real-mode calls keep failing with a confusing "MAC mismatch"
  // until the server happens to restart or the token's own TTL expires.
  if (
    (update.partnerKey && update.partnerKey !== before.partnerKey) ||
    (update.baseUrl && update.baseUrl !== before.baseUrl)
  ) {
    icecashReal.resetToken();
  }
  if (
    (update.ecocashGatewayApiKey && update.ecocashGatewayApiKey !== before.ecocashGatewayApiKey) ||
    (update.ecocashGatewayBaseUrl && update.ecocashGatewayBaseUrl !== before.ecocashGatewayBaseUrl) ||
    (update.ecocashGatewayPartnerCode && update.ecocashGatewayPartnerCode !== before.ecocashGatewayPartnerCode)
  ) {
    ecocashGateway.resetToken();
  }

  res.json({
    ...saved,
    partnerKey: saved.partnerKey ? "••••••••" : "",
    partnerKeySet: Boolean(saved.partnerKey),
    ecocashGatewayApiKey: saved.ecocashGatewayApiKey ? "••••••••" : "",
    ecocashGatewayApiKeySet: Boolean(saved.ecocashGatewayApiKey),
  });
});

module.exports = router;
