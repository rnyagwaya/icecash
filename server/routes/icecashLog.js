const express = require("express");
const icecashLog = require("../services/icecashLog");

const router = express.Router();

// GET /api/v1/icecash-log?since=<id> — every gateway -> IceCash call (mock or real), for the
// /console debug drawer. `since` returns only entries newer than that id, for polling.
router.get("/icecash-log", (req, res) => {
  res.json({ data: icecashLog.list(req.query.since) });
});

module.exports = router;
