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

function fmtMoney(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return v ?? "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function maskMobile(m) {
  const digits = String(m || "").replace(/\D/g, "");
  if (digits.length < 4) return m || "—";
  return `****${digits.slice(-4)}`;
}

function row(label, value) {
  return `<div class="row"><span class="lbl">${label}</span><span class="val">${value ?? "—"}</span></div>`;
}

function wrap(title, bodyHtml, { printable = false } = {}) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  :root{--red:#C8102E;--text:#1a1a1a;--text2:#4a4a4a;--border:#e2e2e2;--surface:#fafafa}
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,'Segoe UI',Arial,sans-serif;color:var(--text);background:#e9e9e9;padding:24px}
  .doc-shell{max-width:560px;margin:0 auto;background:#fff;border-radius:6px;box-shadow:0 8px 30px rgba(0,0,0,.15);overflow:hidden}
  .doc-topbar{height:8px;background:var(--red)}
  .doc-body{padding:20px 26px 28px}
  h2{font-size:14px;font-weight:700;margin:18px 0 10px;padding-bottom:6px;border-bottom:1px solid var(--border)}
  h2:first-child{margin-top:0}
  .row{display:flex;justify-content:space-between;gap:16px;padding:6px 0;font-size:13px}
  .lbl{color:var(--text2);flex-shrink:0}
  .val{text-align:right;font-weight:500}
  .divider{height:1px;background:var(--border);margin:14px 0}
  .bk-row{display:flex;justify-content:space-between;padding:5px 0;font-size:13px}
  .bk-row.total{font-weight:700;border-top:1px solid var(--border);margin-top:6px;padding-top:8px}
  .print-bar{max-width:560px;margin:0 auto 14px;display:flex;justify-content:flex-end;gap:10px}
  .print-btn{background:var(--red);color:#fff;border:none;border-radius:6px;padding:10px 18px;font-size:13px;font-weight:700;cursor:pointer;min-height:44px}
  .print-btn.ghost{background:#fff;color:var(--text);border:1px solid var(--border)}
  @media print{
    body{background:#fff;padding:0}
    .print-bar{display:none}
    .doc-shell{box-shadow:none;border-radius:0;max-width:100%}
  }
</style></head><body>
${printable ? '<div class="print-bar"><button class="print-btn" onclick="window.print()">Print</button></div>' : ""}
<div class="doc-shell"><div class="doc-topbar"></div><div class="doc-body">${bodyHtml}</div></div>
</body></html>`;
}

function buildCoverNoteBody(policy) {
  const raw = policy.icecash.raw || {};
  const vt = vehicleTypes[Number(raw.VehicleType)] || {};
  const insuranceTypeLabel = insuranceTypes[Number(raw.InsuranceType)] || policy.cover.insuranceType || "—";
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
    ${row("Insurance Type", insuranceTypeLabel)}
    ${row("Vehicle Type", vt.type ? `${vt.type} - ${vt.use}` : (policy.cover.insuranceType || "—"))}
    ${row("Vehicle Value", raw.ValueAmount != null ? fmtMoney(raw.ValueAmount) : "—")}
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
    <div class="bk-row"><span>${insuranceTypeLabel}...</span><span>${fmtMoney(raw.CoverAmount)}</span></div>
    <div class="bk-row"><span>Gvt Levy ...</span><span>${fmtMoney(raw.GovernmentLevy)}</span></div>
    <div class="bk-row"><span>Stamp Duty ...</span><span>${fmtMoney(raw.StampDuty)}</span></div>
    <div class="bk-row total"><span>Premium Due</span><span>${fmtMoney(raw.PremiumAmount || raw.Amount)}</span></div>
  `;

  return insuredDetails + certificate + rateBlock + breakdown;
}

function generateDocuments(policy) {
  const coverNote = wrap("Cover Note", buildCoverNoteBody(policy), { printable: true });

  const schedule = wrap(
    "Policy Schedule",
    `<h2>Policy Schedule</h2>
    ${row("Policy Holder", policy.policyHolder.name)}
    ${row("VRN", policy.vehicle.vrn)}
    ${row("Cover Type", policy.cover.insuranceType)}
    ${row("Duration", `${policy.cover.durationMonths} months`)}
    ${row("Premium", `${policy.payment.currency} ${policy.payment.grandTotal}`)}`,
    { printable: true }
  );

  const receipt = wrap(
    "Payment Receipt",
    `<h2>Payment Receipt</h2>
    ${row("Reference", policy.payment.paymentTransactionId)}
    ${row("Source", policy.payment.paymentSource)}
    ${row("Amount", `${policy.payment.currency} ${policy.payment.grandTotal}`)}
    ${row("Date", new Date().toISOString())}`,
    { printable: true }
  );

  documents.set(policy.digitalPolicyNumber, { coverNote, schedule, receipt });
  return {
    coverNote: `/api/v2/motor/comprehensive/policy/${policy.digitalPolicyNumber}/cover-note`,
    schedule: `/api/v2/motor/comprehensive/policy/${policy.digitalPolicyNumber}/schedule`,
    receipt: `/api/v2/motor/comprehensive/policy/${policy.digitalPolicyNumber}/receipt`,
  };
}

module.exports = { generateDocuments };
