const express = require("express");
const { quotes, payments, policies, nextId } = require("../services/store");
const { confirmPayment } = require("../services/orchestration");

const router = express.Router();

// EcoCash is simulated: no real gateway access. initiate() marks PENDING and, after a short
// delay, fires the same post-payment orchestration a real EcoCash SUCCESS callback would.
const ECOCASH_AUTO_SUCCESS_MS = 4000;

router.post("/payments/ecocash/initiate", (req, res) => {
  const { quoteId, customerMsisdn, amount } = req.body || {};
  const quote = quotes.get(quoteId);
  if (!quote) return res.status(404).json({ success: false, message: "Quote not found" });

  // Quote-Level Rejection Masking R5 — reject before initiating payment, no IceCash call made.
  if (quote.blocked) {
    return res.status(409).json({
      success: false,
      code: "QUOTE_BLOCKED",
      message: quote.blockedMessage || "This quote was declined by IceCash and cannot be paid.",
    });
  }

  quote.paymentStatus = "PENDING";
  quote.policyStatus = "NOT_CREATED";
  payments.set(quoteId, {
    quoteId,
    paymentSource: "ECOCASH",
    customerMsisdn,
    amount: amount ?? quote.grandTotal,
    status: "PENDING",
  });

  setTimeout(async () => {
    try {
      await confirmPayment(quoteId, {
        paymentSource: "ECOCASH",
        paymentTransactionId: nextId("TC"),
        customerMsisdn,
      });
    } catch (err) {
      quote.policyStatus = "ISSUANCE_FAILED";
      quote.opsAlert = { reason: "ORCHESTRATION_ERROR", detail: err.message, at: new Date().toISOString() };
    }
  }, ECOCASH_AUTO_SUCCESS_MS);

  res.json({ status: "PENDING", clientCorrelator: quoteId });
});

router.get("/payments/ecocash/status/quote/:quoteId", (req, res) => {
  const quote = quotes.get(req.params.quoteId);
  if (!quote) return res.status(404).json({ success: false, message: "Quote not found" });

  if (quote.policyStatus === "ACTIVE") {
    const policy = policies.get(quote.digitalPolicyNumber);
    return res.json({
      paymentStatus: "SUCCESS",
      policyStatus: "ACTIVE",
      digitalPolicyNumber: quote.digitalPolicyNumber,
      licenceReceiptId: policy.icecash.licenceReceiptId,
      documents: policy.documents,
    });
  }

  if (quote.policyStatus === "ISSUANCE_FAILED") {
    // Per spec §12: ops alert raised, customer-facing status stays "processing".
    return res.json({
      paymentStatus: quote.paymentStatus,
      policyStatus: "PROCESSING",
      digitalPolicyNumber: null,
    });
  }

  res.json({
    paymentStatus: quote.paymentStatus || "PENDING",
    policyStatus: quote.paymentStatus === "SUCCESS" ? "PROCESSING" : "NOT_CREATED",
    digitalPolicyNumber: null,
  });
});

// CASH / CARD_SWIPE — branch-confirmed, synchronous orchestration.
router.post("/motor/payments/confirm", async (req, res) => {
  const { quoteId, paymentSource } = req.body || {};
  const quote = quotes.get(quoteId);
  if (!quote) return res.status(404).json({ success: false, message: "Quote not found" });

  // Quote-Level Rejection Masking R5 — reject before contacting IceCash.
  if (quote.blocked) {
    return res.status(409).json({
      success: false,
      code: "QUOTE_BLOCKED",
      message: quote.blockedMessage || "This quote was declined by IceCash and cannot be paid.",
    });
  }

  const paymentTransactionId = nextId("RCT");

  try {
    const { policy, opsAlert } = await confirmPayment(quoteId, {
      paymentSource: paymentSource || "CASH",
      paymentTransactionId,
      ...req.body,
    });

    if (!policy) {
      return res.status(202).json({
        success: false,
        message: "Payment received, policy activation in progress.",
        paymentTransactionId,
        opsAlert,
      });
    }

    res.json({
      success: true,
      paymentTransactionId,
      digitalPolicyNumber: policy.digitalPolicyNumber,
      licenceReceiptId: policy.icecash.licenceReceiptId,
      documents: policy.documents,
    });
  } catch (err) {
    if (err.code === "QUOTE_BLOCKED") {
      return res.status(409).json({ success: false, code: err.code, message: err.message });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
