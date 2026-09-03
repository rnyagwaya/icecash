const express = require("express");
const settingsStore = require("../services/settingsStore");

const router = express.Router();

router.get("/settings", (req, res) => {
  res.json(settingsStore.getMasked());
});

router.post("/settings", (req, res) => {
  const { icecashMode, baseUrl, partnerKey, locationId, insuranceCompanyId } = req.body || {};

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

  const saved = settingsStore.save(update);
  res.json({
    ...saved,
    partnerKey: saved.partnerKey ? "••••••••" : "",
    partnerKeySet: Boolean(saved.partnerKey),
  });
});

module.exports = router;
