// Generates stored HTML "documents" for an issued policy. The Cover Note is built directly
// from the raw IceCash confirmation-poll response (TPIPolicy / TPILICResult) attached at
// policy.icecash.raw — not from quote-time data — so it reflects exactly what IceCash approved.

const { documents } = require("./store");
const { vehicleTypes, insuranceTypes } = require("../data/enums");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDateStamp(s) {
  // "YYYYMMDD" or "YYYYMMDDHHMMSS" -> "DD Mon YYYY[ HH:MM]"
  if (!s || String(s).length < 8) return s || "—";
  const str = String(s);
  const y = str.slice(0, 4);
  const mo = Number(str.slice(4, 6));
  const d = Number(str.slice(6, 8));
  let out = `${String(d).padStart(2, "0")} ${MONTHS[mo - 1] || ""} ${y}`;
  if (str.length >= 12) {
    out += ` ${str.slice(8, 10)}:${str.slice(10, 12)}`;
  }
  return out;
}

function fmtMoney(v, currency = "USD") {
  const n = Number(v);
  if (!Number.isFinite(n)) return v ?? "—";
  return `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function maskMobile(m) {
  const digits = String(m || "").replace(/\D/g, "");
  if (digits.length < 4) return m || "—";
  return `****${digits.slice(-4)}`;
}

function row(label, value) {
  return `<div class="row"><span class="lbl">${label}</span><span class="val">${value ?? "—"}</span></div>`;
}

// Cash shows amount tendered + change given; card shows the POS terminal and RRN — whichever
// applies to how this specific payment was taken.
function paymentMethodRows(payment, currency) {
  if (payment.paymentSource === "CASH" && payment.amountTendered != null) {
    return [row("Amount Tendered", fmtMoney(payment.amountTendered, currency)), row("Change Given", fmtMoney(payment.changeDue, currency))].join(
      ""
    );
  }
  if (payment.paymentSource === "CARD_SWIPE") {
    return [
      payment.posTerminal ? row("POS Terminal", payment.posTerminal) : "",
      payment.cardReference ? row("RRN", payment.cardReference) : "",
    ].join("");
  }
  return "";
}

function wrap(title, reference, bodyHtml, { printable = false, processedBy = null, branded = false } = {}) {
  const generatedAt = fmtDateStamp(nowStampForFooter());
  const header = branded
    ? `<div class="doc-letterhead">
        <img src="/assets/zimnat-logo.png" alt="Zimnat General Insurance">
        <div class="doc-letterhead-ref"><div class="doc-letterhead-title">${title}</div><div class="doc-letterhead-num">${reference || "—"}</div></div>
      </div>`
    : "";
  const footer = branded
    ? `<div class="doc-footer"><span>Processed by ${processedBy?.name || "—"}</span><span>Generated ${generatedAt}</span></div>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  :root{--red:#C8102E;--green:#00622F;--text:#1a1a1a;--text2:#4a4a4a;--text3:#8a8a8a;--border:#e2e2e2;--surface:#fafafa}
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,'Segoe UI',Arial,sans-serif;color:var(--text);background:#e9e9e9;padding:24px}
  .doc-shell{max-width:560px;margin:0 auto;background:#fff;border-radius:6px;box-shadow:0 8px 30px rgba(0,0,0,.15);overflow:hidden}
  .doc-topbar{height:${branded ? "6px" : "8px"};background:${branded ? "var(--green)" : "var(--red)"}}
  .doc-letterhead{display:flex;align-items:center;justify-content:space-between;padding:20px 26px 16px;border-bottom:2px solid var(--surface)}
  .doc-letterhead img{height:28px;width:auto;display:block}
  .doc-letterhead-ref{text-align:right}
  .doc-letterhead-title{font-size:13px;font-weight:700;color:var(--text);margin:0 0 2px}
  .doc-letterhead-num{font-family:'SF Mono',Consolas,monospace;font-size:13px;font-weight:800;color:var(--green)}
  .doc-body{padding:${branded ? "20px 26px 8px" : "20px 26px 28px"}}
  .doc-footer{padding:14px 26px;border-top:1px solid var(--border);background:var(--surface);font-size:11px;color:var(--text3);display:flex;justify-content:space-between}
  h2{font-size:14px;font-weight:700;margin:18px 0 10px;padding-bottom:6px;border-bottom:1px solid var(--border)}
  h2:first-child{margin-top:0}
  .row{display:flex;justify-content:space-between;gap:16px;padding:6px 0;font-size:13px}
  .lbl{color:var(--text2);flex-shrink:0}
  .val{text-align:right;font-weight:500}
  .divider{height:1px;background:var(--border);margin:14px 0}
  .bk-row{display:flex;justify-content:space-between;padding:5px 0;font-size:13px}
  .bk-row.total{font-weight:700;border-top:1px solid var(--border);margin-top:6px;padding-top:8px}
  .print-bar{max-width:560px;margin:0 auto 14px;display:flex;justify-content:flex-end;gap:10px}
  .print-btn{background:${branded ? "var(--green)" : "var(--red)"};color:#fff;border:none;border-radius:6px;padding:10px 18px;font-size:13px;font-weight:700;cursor:pointer;min-height:44px}
  .print-btn.ghost{background:#fff;color:var(--text);border:1px solid var(--border)}
  @media print{
    body{background:#fff;padding:0}
    .print-bar{display:none}
    .doc-shell{box-shadow:none;border-radius:0;max-width:100%}
  }
</style></head><body>
${printable ? '<div class="print-bar"><button class="print-btn" onclick="window.print()">Print</button></div>' : ""}
<div class="doc-shell">
  <div class="doc-topbar"></div>
  ${header}
  <div class="doc-body">${bodyHtml}</div>
  ${footer}
</div>
</body></html>`;
}

function nowStampForFooter() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` + `${pad(d.getHours())}${pad(d.getMinutes())}`
  );
}

function buildCoverNoteBody(policy) {
  const raw = policy.icecash.raw || {};
  const vt = vehicleTypes[Number(raw.VehicleType)] || {};
  const insuranceTypeLabel = insuranceTypes[Number(raw.InsuranceType)] || policy.cover.insuranceType || "—";
  const currency = policy.payment?.currency || "USD";
  const name = raw.EntityType === "Company" && raw.CompanyName
    ? raw.CompanyName
    : [raw.FirstName, raw.LastName].filter(Boolean).join(" ") || policy.policyHolder?.name || "—";

  const insuredDetails = `
    <h2>Insured Details</h2>
    ${row("Cover Note #", policy.icecash.policyNumber)}
    ${row("Transaction Date", fmtDateStamp(raw.ApprovedDate || raw.LoadedDate))}
    ${row("Status", raw.Status || "Approved")}
    ${row("ID Number", raw.IDNumber)}
    ${row("Name", name)}
    ${row("Birth Date", raw.BirthDate || "—")}
    ${row("Mobile", maskMobile(raw.MSISDN))}
    ${row("Address1", raw.Address1)}
    ${row("Address2", raw.Address2)}
    ${row("Town", raw.Town)}
    ${row("Entity Type", raw.EntityType || "Personal")}
    ${row("VRN", raw.VRN || policy.vehicle?.vrn)}
    ${row("Make", raw.Make || policy.vehicle?.make)}
    ${row("Model", raw.Model || policy.vehicle?.model)}
    ${row("Tax Class", raw.TaxClass ? `Class ${raw.TaxClass}` : "—")}
    ${row("Year Manufacture", raw.YearManufacture || "—")}
  `;

  const certificate = `
    <h2>Certificate of Motor Insurance</h2>
    ${row("Agent", (raw.ApprovedBy || raw.LoadedBy || "Zimnat").trim())}
    ${row("Processed By", policy.processedBy?.name || "—")}
    ${row("Insurance Type", insuranceTypeLabel)}
    ${row("Vehicle Type", vt.type ? `${vt.type} - ${vt.use}` : (policy.cover.insuranceType || "—"))}
    ${row("Vehicle Value", raw.ValueAmount != null ? fmtMoney(raw.ValueAmount, currency) : "—")}
  `;

  const rateBlock = `
    <div class="divider"></div>
    ${row("Policy Rate", raw.Rate ? `${(Number(raw.Rate) * 100).toFixed(1)}% per annum` : "—")}
    ${row("Start Date", fmtDateStamp(raw.StartDate || policy.cover.startDate))}
    ${row("End Date", fmtDateStamp(raw.EndDate || policy.cover.endDate))}
    ${row("Period", `${raw.DurationMonths || policy.cover.durationMonths || "—"} Months`)}
    <div class="divider"></div>
  `;

  const breakdown = `
    <div class="bk-row"><span>${insuranceTypeLabel}...</span><span>${fmtMoney(raw.CoverAmount, currency)}</span></div>
    <div class="bk-row"><span>Gvt Levy ...</span><span>${fmtMoney(raw.GovernmentLevy, currency)}</span></div>
    <div class="bk-row"><span>Stamp Duty ...</span><span>${fmtMoney(raw.StampDuty, currency)}</span></div>
    <div class="bk-row total"><span>Premium Due</span><span>${fmtMoney(raw.PremiumAmount || raw.Amount, currency)}</span></div>
  `;

  return insuredDetails + certificate + rateBlock + breakdown;
}

function generateDocuments(policy) {
  const currency = policy.payment?.currency || "USD";
  const plainOpts = { printable: true };
  const brandedOpts = { printable: true, processedBy: policy.processedBy, branded: true };

  const coverNote = wrap("Cover Note", policy.icecash.policyNumber, buildCoverNoteBody(policy), plainOpts);

  const schedule = wrap(
    "Policy Schedule",
    policy.icecash.policyNumber,
    `<h2>Policy Schedule</h2>
    ${row("Policy Holder", policy.policyHolder.name)}
    ${row("VRN", policy.vehicle.vrn)}
    ${row("Make / Model", `${policy.vehicle.make} ${policy.vehicle.model}`)}
    ${row("IceCash Policy #", policy.icecash.policyNumber || "—")}
    ${row("Cover Type", policy.cover.insuranceType)}
    ${row("Cover Period", `${fmtDateStamp(policy.cover.startDate)} — ${fmtDateStamp(policy.cover.endDate)}`)}
    ${row("Duration", `${policy.cover.durationMonths} months`)}
    ${row("Processed By", policy.processedBy?.name || "—")}
    <div class="divider"></div>
    ${row("Premium", fmtMoney(policy.payment.grandTotal, currency))}`,
    plainOpts
  );

  // Only the customer-facing receipt gets the Zimnat letterhead/branding treatment.
  const receipt = wrap(
    "Payment Receipt",
    policy.payment.paymentTransactionId,
    `<h2>Payment Receipt</h2>
    ${row("VRN", policy.vehicle.vrn)}
    ${row("Policy Holder", policy.policyHolder.name)}
    ${row("Payment Source", policy.payment.paymentSource)}
    ${row("Date", fmtDateStamp(nowStampForFooter()))}
    ${paymentMethodRows(policy.payment, currency)}
    <div class="divider"></div>
    ${row("IceCash Policy #", policy.icecash.policyNumber || "—")}
    ${row("Digital Policy #", policy.digitalPolicyNumber)}
    <div class="divider"></div>
    <div class="bk-row total"><span>Amount Paid</span><span>${fmtMoney(policy.payment.grandTotal, currency)}</span></div>`,
    brandedOpts
  );

  documents.set(policy.digitalPolicyNumber, { coverNote, schedule, receipt });
  return {
    coverNote: `/api/v2/motor/comprehensive/policy/${policy.digitalPolicyNumber}/cover-note`,
    schedule: `/api/v2/motor/comprehensive/policy/${policy.digitalPolicyNumber}/schedule`,
    receipt: `/api/v2/motor/comprehensive/policy/${policy.digitalPolicyNumber}/receipt`,
  };
}

module.exports = { generateDocuments };
