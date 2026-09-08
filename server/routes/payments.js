const express = require("express");
const { quotes, payments, policies, nextId } = require("../services/store");
const { confirmPayment } = require("../services/orchestration");
const settingsStore = require("../services/settingsStore");
const ecocashGateway = require("../services/ecocashGateway");

const router = express.Router();

// Fallback when no real EcoCash gateway is configured (settingsStore's ecocashMode):
// marks PENDING and, after a short delay, fires the same post-payment orchestration a real
// EcoCash SUCCESS callback would — unchanged from the original simulated-only behavior.
const ECOCASH_SIMULATED_SUCCESS_MS = 4000;

router.post("/payments/ecocash/initiate", async (req, res) => {
  const { quoteId, customerMsisdn, amount } = req.body || {};
  const quote = quotes.get(quoteId);
  if (!quote) return res.status(404).json({ success: false, message: "Quote not found" });
  const processedBy = req.user ? { name: req.user.name, email: req.user.email } : null;

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

  const settings = settingsStore.get();
  if (settings.ecocashMode !== "real") {
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
          processedBy,
        });
      } catch (err) {
        quote.policyStatus = "ISSUANCE_FAILED";
        quote.opsAlert = { reason: "ORCHESTRATION_ERROR", detail: err.message, at: new Date().toISOString() };
      }
    }, ECOCASH_SIMULATED_SUCCESS_MS);
    return res.json({ status: "PENDING", clientCorrelator: quoteId });
  }

  // Real gateway — the quote's own IceCash reference (combined/insurance/licence id) is what
  // this gateway calls "policyNumber", per the recorded example (a quote-time reference, not a
  // final issued policy number, which doesn't exist yet at this point in the flow).
  const transactionReference = `ECOCASH-INS-${Date.now()}`;
  const policyNumber =
    quote.icecashIds?.combinedId || quote.icecashIds?.insuranceId || quote.icecashIds?.licenceId || "";

  payments.set(quoteId, {
    quoteId,
    paymentSource: "ECOCASH",
    customerMsisdn,
    amount: amount ?? quote.grandTotal,
    status: "PENDING",
    gatewayMode: "real",
    transactionReference,
    processedBy,
  });

  try {
    const data = await ecocashGateway.initiate({
      transactionReference,
      currency: quote.currency || "USD",
      amount: amount ?? quote.grandTotal,
      customerMsisdn,
      customerName: quote.policyHolder?.name,
      customerReference: quote.customerReference,
      policyNumber,
    });
    const payment = payments.get(quoteId);
    payment.ecocashReference = data.ecocashReference;
    payment.lastStatus = data.status;
    res.json({ status: "PENDING", clientCorrelator: quoteId });
  } catch (err) {
    console.error("EcoCash gateway initiate failed:", err.message);
    quote.paymentStatus = "FAILED";
    quote.opsAlert = { reason: "ECOCASH_INITIATE_ERROR", detail: err.message, at: new Date().toISOString() };
    res.status(502).json({ success: false, message: err.message });
  }
});

router.get("/payments/ecocash/status/quote/:quoteId", async (req, res) => {
  const quoteId = req.params.quoteId;
  const quote = quotes.get(quoteId);
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

  const payment = payments.get(quoteId);

  // Real gateway, still PENDING our side — live-query the gateway for the latest status.
  // "PENDING" is set optimistically to "CONFIRMING" the moment a terminal result is found,
  // before the (async) orchestration call, so a second poll landing mid-confirmation doesn't
  // re-trigger it — confirmPayment's own idempotency guard only covers the ACTIVE end state.
  if (payment?.gatewayMode === "real" && quote.paymentStatus === "PENDING") {
    try {
      const data = await ecocashGateway.query(payment.transactionReference);
      payment.lastStatus = data.status;

      if (ecocashGateway.isFailure(data.status, data.message)) {
        quote.paymentStatus = "FAILED";
        return res.json({
          paymentStatus: "FAILED",
          policyStatus: "NOT_CREATED",
          digitalPolicyNumber: null,
          message: data.message || data.status,
        });
      }

      if (!ecocashGateway.isPending(data.status) && quote.paymentStatus === "PENDING") {
        quote.paymentStatus = "CONFIRMING";
        try {
          const { policy } = await confirmPayment(quoteId, {
            paymentSource: "ECOCASH",
            paymentTransactionId: payment.ecocashReference || nextId("TC"),
            customerMsisdn: payment.customerMsisdn,
            processedBy: payment.processedBy,
          });
          if (policy) {
            return res.json({
              paymentStatus: "SUCCESS",
              policyStatus: "ACTIVE",
              digitalPolicyNumber: policy.digitalPolicyNumber,
              licenceReceiptId: policy.icecash.licenceReceiptId,
              documents: policy.documents,
            });
          }
        } catch (err) {
          quote.policyStatus = "ISSUANCE_FAILED";
          quote.opsAlert = { reason: "ORCHESTRATION_ERROR", detail: err.message, at: new Date().toISOString() };
        }
      }
    } catch (err) {
      // Gateway query itself failed (network/auth blip) — don't fail the payment outright,
      // report still-pending and let this same poll loop retry, up to its own timeout.
      console.error("EcoCash gateway query failed:", err.message);
    }
  }

  res.json({
    paymentStatus: quote.paymentStatus === "CONFIRMING" ? "SUCCESS" : quote.paymentStatus || "PENDING",
    policyStatus: quote.paymentStatus === "SUCCESS" || quote.paymentStatus === "CONFIRMING" ? "PROCESSING" : "NOT_CREATED",
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
      processedBy: req.user ? { name: req.user.name, email: req.user.email } : null,
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
