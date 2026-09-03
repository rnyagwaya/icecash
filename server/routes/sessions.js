const express = require("express");
const sessionStore = require("../services/sessionStore");
const { send } = require("../services/notify");

const router = express.Router();

// POST /api/v1/sessions — save/update wizard progress, "email" a resume link.
router.post("/sessions", (req, res) => {
  const { token, email, mobile, state } = req.body || {};
  if (!email && !mobile) {
    return res.status(400).json({ success: false, message: "email or mobile is required to save progress" });
  }

  const key = sessionStore.save({ token, email, mobile, state });
  const resumeUrl = `${req.protocol}://${req.get("host")}/?resume=${key}`;

  if (email) {
    send({
      channel: "EMAIL",
      recipient: email,
      templateCode: "RESUME_QUOTE_LINK",
      referenceType: "QUOTE_SESSION",
      referenceNumber: key,
      payload: { resumeUrl },
    });
  }
  if (mobile) {
    send({
      channel: "SMS",
      recipient: mobile,
      templateCode: "RESUME_QUOTE_LINK",
      referenceType: "QUOTE_SESSION",
      referenceNumber: key,
      payload: { resumeUrl },
    });
  }

  res.json({ token: key, resumeUrl });
});

// GET /api/v1/sessions/:token — resume.
router.get("/sessions/:token", (req, res) => {
  const session = sessionStore.get(req.params.token);
  if (!session) return res.status(404).json({ success: false, message: "This resume link has expired or is invalid." });
  res.json({ data: session });
});

module.exports = router;
