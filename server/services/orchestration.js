// Post-payment orchestration, per Technical Reference §9. Triggered by an EcoCash SUCCESS
// (simulated) or a branch CASH/CARD_SWIPE confirm. Idempotent on quoteId: replaying a payment
// confirm for an already-active quote just returns the existing policy.
//
// Poll cadence is 1s x 5 attempts here (not the spec's 5s x 5) purely so this is testable
// interactively without long waits; the retry/timeout *behavior* matches the spec exactly.

const icecash = require("./icecashClient");
const { quotes, payments, policies, nextId } = require("./store");
const { generateDocuments } = require("./documents");
const { dispatchPolicyNotifications } = require("./notify");

const POLL_INTERVAL_MS = 1000;
const POLL_MAX_ATTEMPTS = 5;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isApproved(result) {
  if (!result) return false;
  const status = result.Status;
  return status === "Approved" || Boolean(result.PolicyNo || result.PolicyNumber);
}

async function pollUntilApproved(pollFn) {
  let last = null;
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt += 1) {
    last = await pollFn();
    if (isApproved(last)) return { approved: true, result: last };
    await sleep(POLL_INTERVAL_MS);
  }
  return { approved: false, result: last };
}

async function submitAndPoll(quote) {
  const { path, icecashIds } = quote;

  if (path === "licence") {
    const approveRes = await icecash.licQuoteUpdate({ licenceId: icecashIds.licenceId, status: "1" });
    if (Number(approveRes.Result) !== 1) {
      return { ok: false, reason: "ICECASH_APPROVAL_FAILED", detail: approveRes.Message };
    }
    const { approved, result } = await pollUntilApproved(() => icecash.licResult(icecashIds.licenceId));
    if (!approved) return { ok: false, reason: "ICECASH_RESULT_TIMEOUT", detail: result?.Message };
    return {
      ok: true,
      policyNumber: result.ReceiptID,
      licenceReceiptId: result.ReceiptID,
      startDate: null,
      endDate: result.LicExpiryDate,
      raw: result,
    };
  }

  if (path === "insurance") {
    const approveRes = await icecash.tpiQuoteUpdate({ insuranceId: icecashIds.insuranceId, status: "1" });
    if (Number(approveRes.Result) !== 1) {
      return { ok: false, reason: "ICECASH_APPROVAL_FAILED", detail: approveRes.Message };
    }
    const { approved, result } = await pollUntilApproved(() => icecash.tpiPolicy(icecashIds.insuranceId));
    if (!approved) return { ok: false, reason: "ICECASH_RESULT_TIMEOUT", detail: result?.Message };
    return {
      ok: true,
      policyNumber: result.PolicyNo,
      licenceReceiptId: null,
      startDate: result.StartDate,
      endDate: result.EndDate,
      raw: result,
    };
  }

  // combined / comprehensive
  const approveRes = await icecash.tpilicUpdate({ combinedId: icecashIds.combinedId, status: "1" });
  if (Number(approveRes.Result) !== 1) {
    return { ok: false, reason: "ICECASH_APPROVAL_FAILED", detail: approveRes.Message };
  }
  const { approved, result } = await pollUntilApproved(() => icecash.tpilicResult(icecashIds.combinedId));
  if (!approved) return { ok: false, reason: "ICECASH_RESULT_TIMEOUT", detail: result?.Message };
  return {
    ok: true,
    policyNumber: result.PolicyNumber,
    licenceReceiptId: result.ReceiptID,
    startDate: result.StartDate,
    endDate: result.EndDate,
    raw: result,
  };
}

async function confirmPayment(quoteId, paymentInfo) {
  const quote = quotes.get(quoteId);
  if (!quote) throw new Error("Quote not found");

  // Quote-Level Rejection Masking R5 — reject a blocked quote id before any IceCash call,
  // quoting IceCash's own message verbatim. Belt-and-braces alongside the route-level checks.
  if (quote.blocked) {
    const err = new Error(quote.blockedMessage || "This quote was declined by IceCash and cannot be paid.");
    err.code = "QUOTE_BLOCKED";
    throw err;
  }

  // Idempotency guard — same quoteId already fully processed.
  if (quote.digitalPolicyNumber && quote.policyStatus === "ACTIVE") {
    return { quote, policy: policies.get(quote.digitalPolicyNumber) };
  }

  payments.set(quoteId, {
    quoteId,
    ...paymentInfo,
    status: "SUCCESS",
    confirmedAt: new Date().toISOString(),
  });
  quote.paymentStatus = "SUCCESS";
  quote.policyStatus = "PROCESSING";

  const outcome = await submitAndPoll(quote);

  if (!outcome.ok) {
    quote.policyStatus = "ISSUANCE_FAILED";
    quote.opsAlert = { reason: outcome.reason, detail: outcome.detail, at: new Date().toISOString() };
    return { quote, policy: null, opsAlert: quote.opsAlert };
  }

  const digitalPolicyNumber = nextId("ZDG");
  const policy = {
    digitalPolicyNumber,
    quotationNumber: quoteId,
    policyType: quote.path.toUpperCase(),
    masterId: quote.customerReference,
    status: "ACTIVE",
    vehicle: quote.vehicleSummary,
    policyHolder: quote.policyHolder,
    cover: {
      insuranceType: quote.insuranceTypeLabel,
      startDate: outcome.startDate,
      endDate: outcome.endDate,
      durationMonths: quote.durationMonths,
    },
    icecash: {
      policyNumber: outcome.policyNumber,
      licenceReceiptId: outcome.licenceReceiptId,
      // Full raw response from the confirmation poll (TPIPolicy / TPILICResult / LICResult) —
      // the cover note is rendered directly from this, not from quote-time data.
      raw: outcome.raw,
    },
    payment: {
      paymentSource: paymentInfo.paymentSource,
      paymentTransactionId: paymentInfo.paymentTransactionId,
      currency: quote.currency,
      grandTotal: quote.grandTotal,
    },
  };

  const documents = generateDocuments(policy);
  policy.documents = documents;
  policies.set(digitalPolicyNumber, policy);

  quote.digitalPolicyNumber = digitalPolicyNumber;
  quote.policyStatus = "ACTIVE";

  dispatchPolicyNotifications(policy);

  return { quote, policy };
}

module.exports = { confirmPayment };
