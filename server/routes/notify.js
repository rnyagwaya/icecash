const express = require("express");
const { send } = require("../services/notify");
const { notifications } = require("../services/store");

const router = express.Router();

router.post("/notify/send", (req, res) => {
  const { channel, recipient, templateCode, referenceType, referenceNumber, payload } = req.body || {};
  if (!channel || !recipient || !templateCode) {
    return res.status(400).json({ success: false, message: "channel, recipient and templateCode are required" });
  }
  const entry = send({ channel, recipient, templateCode, referenceType, referenceNumber, payload });
  res.json({ success: true, data: entry });
});

// Debug/Ops helper — lets the "Operations" tab show what has been dispatched.
router.get("/notify/log", (req, res) => {
  res.json({ data: notifications });
});

module.exports = router;
