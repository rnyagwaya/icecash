const express = require("express");
const { policies, documents } = require("../services/store");

const router = express.Router();

router.get("/comprehensive/policy/:digitalPolicyNumber", (req, res) => {
  const policy = policies.get(req.params.digitalPolicyNumber);
  if (!policy) return res.status(404).json({ success: false, message: "Policy not found" });
  res.json({ data: policy });
});

function docHandler(kind) {
  return (req, res) => {
    const set = documents.get(req.params.digitalPolicyNumber);
    if (!set || !set[kind]) return res.status(404).json({ success: false, message: "Document not found" });
    res.type("html").send(set[kind]);
  };
}

router.get("/comprehensive/policy/:digitalPolicyNumber/cover-note", docHandler("coverNote"));
router.get("/comprehensive/policy/:digitalPolicyNumber/schedule", docHandler("schedule"));
router.get("/comprehensive/policy/:digitalPolicyNumber/receipt", docHandler("receipt"));

module.exports = router;
