const express = require("express");
const enums = require("../data/enums");

const router = express.Router();

// Mounted at /api/v1 -> GET /api/v1/enums
router.get("/enums", (req, res) => {
  res.json({ data: enums });
});

module.exports = router;
