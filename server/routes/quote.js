const express = require("express");
const icecash = require("../services/icecashClient");
const { quotes, nextId } = require("../services/store");
const { rateComprehensive } = require("../services/rating");
const { deriveRadioTvUsage, insuranceTypes } = require("../data/enums");
const coverageOptions = require("../data/coverageOptions");
const { checkQuoteMasking } = require("../services/quoteMasking");

// A per-item Result != 1 is a genuine hard failure — not a Quote-Level Rejection Masking case —
// when IceCash didn't actually generate a priceable quote (no id assigned). Only when a real id
// came back do we mask-and-pass-through instead of discarding (R3).
function hasQuoteId(item, idField) {
  const v = item[idField];
  return v !== undefined && v !== null && v !== "";
}

// IceCash's happy-path shape is { Result: 1, Quotes: [...] }, but a top-level failure (bad/expired
// token, malformed request, etc.) comes back as just { Result, Message } with no Quotes array at
// all. Guard for that here so it surfaces as a clear upstream error instead of a raw
// "Cannot read properties of undefined" crash from blindly indexing Quotes[0].
function firstQuote(result, functionName) {
  if (!result || !Array.isArray(result.Quotes) || result.Quotes.length === 0) {
    const detail = result?.Message ? result.Message.trim() : "no quote data returned";
    throw new Error(`IceCash ${functionName} failed: ${detail}`);
  }
  return result.Quotes[0];
}

const router = express.Router();

// GET /api/v2/motor/comprehensive/coverage-options
router.get("/comprehensive/coverage-options", (req, res) => {
  res.json({ data: coverageOptions });
});

function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

// Real IceCash returns "TotalRadioTVAmt" (capital V); our mock simulator uses
// "TotalRadioTvAmt" — read either casing so this isn't silently 0 against the real API.
function radioTvAmt(obj) {
  return num(obj?.TotalRadioTVAmt ?? obj?.TotalRadioTvAmt);
}

function personName(p) {
  return [p?.firstName, p?.lastName].filter(Boolean).join(" ") || "Unnamed";
}

// ---- IceCash field builders (per recorded Postman shapes) ----

function buildLicenceVehicle(v) {
  const o = v.owner || {};
  return {
    VRN: v.vrn,
    IDNumber: o.idNumber || "",
    ClientIDType: o.idType || "1",
    LicFrequency: String(v.licFrequency || "3"),
    RadioTVUsage: v.radioTvUsage ? String(v.radioTvUsage) : "",
    RadioTVFrequency: v.radioTvFrequency ? String(v.radioTvFrequency) : "",
    FirstName: o.firstName || "",
    LastName: o.lastName || "",
    MSISDN: o.msisdn || "",
    Email: o.email || "",
    Address1: o.address1 || "",
    Address2: o.address2 || "",
    Town: o.town || "",
    BirthDate: o.birthDate || "",
    SuburbID: String(o.suburbID || "1"),
    CustomerReference: v.customerReference || "",
    AgencyID: "24",
    Currency: v.currency || "USD",
  };
}

function buildInsuranceVehicle(v) {
  const o = v.owner || {};
  return {
    VRN: v.vrn,
    EntityType: o.entityType || "Personal",
    IDNumber: o.idNumber || "",
    CompanyName: o.companyName || "",
    FirstName: o.firstName || "",
    LastName: o.lastName || "",
    MSISDN: o.msisdn || "",
    Email: o.email || "",
    Address1: o.address1 || "",
    Address2: o.address2 || "",
    Town: o.town || "",
    BirthDate: o.birthDate || "",
    Owner_FirstName: o.firstName || "",
    Owner_LastName: o.lastName || "",
    Owner_MSISDN: o.msisdn || "",
    Owner_Email: o.email || "",
    Owner_Address1: o.address1 || "",
    Owner_Address2: o.address2 || "",
    Owner_Town: o.town || "",
    Owner_BirthDate: o.birthDate || "",
    InsuranceType: String(v.insuranceType || "1"),
    VehicleType: v.vehicleType || "",
    VehicleValue: String(v.vehicleValue ?? "0"),
    DurationMonths: String(v.durationMonths || "4"),
    CustomerReference: v.customerReference || "",
    Currency: v.currency || "USD",
  };
}

function buildCombinedVehicle(v) {
  const o = v.owner || {};
  const p = v.policyHolder || o;
  const radioTvUsage =
    v.radioTvUsage || (v.radioTvFrequency ? deriveRadioTvUsage({ vehicleTypeCode: v.vehicleType, hasTV: false }) : "");
  return {
    VRN: v.vrn,
    VehicleType: v.vehicleType || "",
    VehicleValue: String(v.vehicleValue ?? "0"),
    InsuranceType: String(v.insuranceType || "1"),
    DurationMonths: String(v.durationMonths || "4"),
    LicFrequency: v.licFrequency ? String(v.licFrequency) : "",
    RadioTVUsage: radioTvUsage ? String(radioTvUsage) : "",
    RadioTVFrequency: v.radioTvFrequency ? String(v.radioTvFrequency) : "",
    EntityType: o.entityType || "Personal",
    IDNumber: o.idNumber || "",
    ClientIDType: o.idType || "1",
    CompanyName: o.companyName || "",
    FirstName: o.firstName || "",
    LastName: o.lastName || "",
    MSISDN: o.msisdn || "",
    Email: o.email || "",
    BirthDate: o.birthDate || "",
    Address1: o.address1 || "",
    Address2: o.address2 || "",
    Town: o.town || "",
    SuburbID: String(o.suburbID || "1"),
    Policy_IDNumber: p.idNumber || "",
    Policy_CompanyName: p.companyName || "",
    Policy_FirstName: p.firstName || "",
    Policy_LastName: p.lastName || "",
    Policy_MSISDN: p.msisdn || "",
    Policy_Email: p.email || "",
    Policy_Address1: p.address1 || "",
    Policy_Address2: p.address2 || "",
    Policy_EntityType: p.entityType || "Personal",
    Policy_BirthDate: p.birthDate || "",
    Currency: v.currency || "USD",
    AgencyID: "24",
    CustomerReference: v.customerReference || "",
  };
}

function newQuoteId() {
  return nextId("ZQ");
}

function expiresAt() {
  return new Date(Date.now() + 48 * 3600 * 1000).toISOString();
}

// ---- POST /quote/licence ----
router.post("/quote/licence", async (req, res) => {
  try {
    const v = req.body.vehicle || {};
    const icVehicle = buildLicenceVehicle(v);
    const result = await icecash.licQuote(icVehicle);
    const q = firstQuote(result, "LICQuote");
    const masking = checkQuoteMasking(q);
    if (masking.blocked && !hasQuoteId(q, "LicenceID")) {
      // Hard failure — IceCash never generated a priceable quote. Out of scope for masking (R3).
      return res.status(422).json({ success: false, message: masking.message });
    }

    const quoteId = newQuoteId();
    quotes.set(quoteId, {
      quoteId,
      path: "licence",
      customerReference: req.body.customerReference || v.customerReference,
      currency: v.currency || "USD",
      grandTotal: num(q.TotalAmount),
      durationMonths: null,
      insuranceTypeLabel: "LICENCE",
      icecashIds: { licenceId: q.LicenceID },
      vehicleSummary: { vrn: v.vrn, make: "-", model: "-" },
      policyHolder: {
        name: personName(v.owner),
        email: v.owner?.email,
        msisdn: v.owner?.msisdn,
      },
      paymentStatus: "NOT_INITIATED",
      policyStatus: "NOT_CREATED",
      blocked: masking.blocked,
      blockedMessage: masking.message,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt(),
    });

    res.json({
      data: {
        quotes: [
          {
            quoteId,
            vrn: v.vrn,
            referenceId: String(q.LicenceID),
            currency: v.currency || "USD",
            licenseFee: num(q.TotalLicAmt),
            radioFee: radioTvAmt(q),
            totalAmount: num(q.TotalAmount),
            status: "success",
            expiresAt: expiresAt(),
            blocked: masking.blocked,
            blockedMessage: masking.message,
            policy: {
              insuranceType: "LICENSE",
              licenseExpiryDate: q.LicExpiryDate,
              arrearsAmt: num(q.ArrearsAmt),
              penaltiesAmt: num(q.PenaltiesAmt),
              administrationAmt: num(q.AdministrationAmt),
              totalLicAmt: num(q.TotalLicAmt),
              totalRadioTvAmt: radioTvAmt(q),
            },
            icecashRaw: { Licence: q },
          },
        ],
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---- POST /quote/insurance ----
router.post("/quote/insurance", async (req, res) => {
  try {
    const v = req.body.vehicle || {};
    const icVehicle = buildInsuranceVehicle(v);
    const result = await icecash.tpiQuote(icVehicle);
    const q = firstQuote(result, "TPIQuote");
    const masking = checkQuoteMasking(q);
    if (masking.blocked && !hasQuoteId(q, "InsuranceID")) {
      return res.status(422).json({ success: false, message: masking.message });
    }

    const quoteId = newQuoteId();
    const grandTotal = num(q.Policy.PremiumAmount);
    quotes.set(quoteId, {
      quoteId,
      path: "insurance",
      customerReference: req.body.customerReference || v.customerReference,
      currency: q.Policy.Currency,
      grandTotal,
      durationMonths: num(q.Policy.DurationMonths),
      insuranceTypeLabel: insuranceTypes[q.Policy.InsuranceType] || q.Policy.InsuranceType,
      icecashIds: { insuranceId: q.InsuranceID },
      vehicleSummary: { vrn: v.vrn, make: q.Vehicle.Make, model: q.Vehicle.Model },
      policyHolder: { name: personName(v.owner), email: v.owner?.email, msisdn: v.owner?.msisdn },
      paymentStatus: "NOT_INITIATED",
      policyStatus: "NOT_CREATED",
      blocked: masking.blocked,
      blockedMessage: masking.message,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt(),
    });

    res.json({
      data: {
        quotes: [
          {
            quoteId,
            vrn: v.vrn,
            referenceId: String(q.InsuranceID),
            currency: q.Policy.Currency,
            insurancePremium: grandTotal,
            licenseFee: 0,
            radioFee: 0,
            totalAmount: grandTotal,
            status: "pending",
            expiresAt: expiresAt(),
            blocked: masking.blocked,
            blockedMessage: masking.message,
            vehicle: { make: q.Vehicle.Make, model: q.Vehicle.Model, vehicleValue: num(q.Vehicle.VehicleValue) },
            policy: {
              insuranceType: q.Policy.InsuranceType,
              startDate: q.Policy.StartDate,
              endDate: q.Policy.EndDate,
              durationMonths: q.Policy.DurationMonths,
              stampDuty: num(q.Policy.StampDuty),
              governmentLevy: num(q.Policy.GovernmentLevy),
              premiumAmount: grandTotal,
            },
            customerReference: q.CustomerReference,
            icecashRaw: { Policy: q.Policy, Vehicle: q.Vehicle, Client: q.Client },
          },
        ],
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---- POST /quote/combined ----
router.post("/quote/combined", async (req, res) => {
  try {
    const v = req.body.vehicle || {};
    const icVehicle = buildCombinedVehicle(v);
    const result = await icecash.tpilicQuote(icVehicle);
    const q = firstQuote(result, "TPILICQuote");
    const masking = checkQuoteMasking(q);
    if (masking.blocked && !hasQuoteId(q, "CombinedID")) {
      return res.status(422).json({ success: false, message: masking.message });
    }

    const insurancePremium = num(q.Policy.PremiumAmount);
    const licenceAndRadioTotal = num(q.Licence.TotalAmount);
    const grandTotal = insurancePremium + licenceAndRadioTotal;

    const quoteId = newQuoteId();
    quotes.set(quoteId, {
      quoteId,
      path: "combined",
      customerReference: req.body.customerReference || v.customerReference,
      currency: q.Policy.Currency,
      grandTotal,
      durationMonths: num(q.Policy.DurationMonths),
      insuranceTypeLabel: insuranceTypes[q.Policy.InsuranceType] || q.Policy.InsuranceType,
      icecashIds: { combinedId: q.CombinedID, insuranceId: q.InsuranceID, licenceId: q.LicenceID },
      vehicleSummary: { vrn: v.vrn, make: q.Vehicle.Make, model: q.Vehicle.Model },
      policyHolder: {
        name: personName(v.policyHolder || v.owner),
        email: (v.policyHolder || v.owner)?.email,
        msisdn: (v.policyHolder || v.owner)?.msisdn,
      },
      paymentStatus: "NOT_INITIATED",
      policyStatus: "NOT_CREATED",
      blocked: masking.blocked,
      blockedMessage: masking.message,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt(),
    });

    res.json({
      data: {
        quotes: [
          {
            quoteId,
            referenceId: String(q.CombinedID),
            currency: q.Policy.Currency,
            insurancePremium,
            licenseFee: num(q.Licence.TotalLicAmt),
            radioFee: radioTvAmt(q.Licence),
            totalAmount: licenceAndRadioTotal,
            grandTotal,
            status: "success",
            blocked: masking.blocked,
            blockedMessage: masking.message,
            policy: {
              insuranceType: q.Policy.InsuranceType,
              arrearsAmt: num(q.Licence.ArrearsAmt),
              penaltiesAmt: num(q.Licence.PenaltiesAmt),
              transactionAmt: num(q.Licence.TransactionAmt),
              totalLicAmt: num(q.Licence.TotalLicAmt),
              totalRadioTvAmt: radioTvAmt(q.Licence),
              licenseExpiryDate: q.Licence.LicExpiryDate,
            },
            icecash: { combinedId: q.CombinedID, insuranceId: q.InsuranceID, licenceId: q.LicenceID },
            icecashRaw: { Policy: q.Policy, Vehicle: q.Vehicle, Licence: q.Licence, Client: q.Client },
          },
        ],
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---- POST /comprehensive/quote ----
router.post("/comprehensive/quote", async (req, res) => {
  try {
    const v = req.body.vehicle || {};
    const extras = req.body.extras || [];
    const local = rateComprehensive({
      vehicleValue: v.vehicleValue,
      durationMonths: v.durationMonths || 4,
      extras,
    });

    const icVehicle = buildCombinedVehicle({ ...v, insuranceType: "1" });
    const result = await icecash.tpilicQuote(icVehicle);
    const q = firstQuote(result, "TPILICQuote");
    const masking = checkQuoteMasking(q);
    if (masking.blocked && !hasQuoteId(q, "CombinedID")) {
      return res.status(422).json({ success: false, message: masking.message });
    }

    const licenceAndRadioTotal = num(q.Licence.TotalAmount);
    const grandTotal = local.totalInsuranceAmount + licenceAndRadioTotal;

    const quoteId = newQuoteId();
    quotes.set(quoteId, {
      quoteId,
      path: "comprehensive",
      customerReference: req.body.customerReference || v.customerReference,
      currency: v.currency || "USD",
      grandTotal,
      durationMonths: num(v.durationMonths || 4),
      insuranceTypeLabel: "Comprehensive Cover (FTPFT)",
      icecashIds: { combinedId: q.CombinedID, insuranceId: q.InsuranceID, licenceId: q.LicenceID },
      vehicleSummary: { vrn: v.vrn, make: q.Vehicle.Make, model: q.Vehicle.Model },
      policyHolder: {
        name: personName(v.policyHolder || v.owner),
        email: (v.policyHolder || v.owner)?.email,
        msisdn: (v.policyHolder || v.owner)?.msisdn,
      },
      paymentStatus: "NOT_INITIATED",
      policyStatus: "NOT_CREATED",
      blocked: masking.blocked,
      blockedMessage: masking.message,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt(),
    });

    res.json({
      data: {
        quoteId,
        referenceId: `CMP-${quoteId}`,
        currency: v.currency || "USD",
        customerReference: req.body.customerReference,
        blocked: masking.blocked,
        blockedMessage: masking.message,
        premiumBreakdown: local,
        icecash: {
          combinedId: q.CombinedID,
          licenceId: q.LicenceID,
          insuranceId: q.InsuranceID,
          vehicle: q.Vehicle,
          licence: q.Licence,
        },
        totals: {
          insuranceTotal: local.totalInsuranceAmount,
          licenceTotal: num(q.Licence.TotalLicAmt),
          radioTotal: radioTvAmt(q.Licence),
          grandTotal,
        },
        policy: {
          insuranceType: "4",
          insuranceTypeDescription: "Comprehensive Cover (FTPFT)",
          startDate: q.Policy.StartDate,
          endDate: q.Policy.EndDate,
          durationMonths: q.Policy.DurationMonths,
        },
        riskAssessment: { requiresManualUnderwriting: false, underwritingFlags: [] },
        status: "success",
        expiresAt: expiresAt(),
        icecashRaw: {
          Policy: {
            ...q.Policy,
            InsuranceType: "4",
            Amount: local.totalInsuranceAmount.toFixed(2),
            PremiumAmount: local.totalInsuranceAmount.toFixed(2),
            StampDuty: local.stampDuty.toFixed(2),
            GovernmentLevy: local.governmentLevy.toFixed(2),
            CoverAmount: local.basePremium.toFixed(2),
          },
          Vehicle: q.Vehicle,
          Licence: q.Licence,
        },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---- GET /quote/:quoteId ----
router.get("/quote/:quoteId", (req, res) => {
  const quote = quotes.get(req.params.quoteId);
  if (!quote) return res.status(404).json({ success: false, message: "Quote not found" });
  res.json({ data: quote });
});

// ---- POST /quote/:quoteId/decline ----
router.post("/quote/:quoteId/decline", (req, res) => {
  const quote = quotes.get(req.params.quoteId);
  if (!quote) return res.status(404).json({ success: false, message: "Quote not found" });
  quote.policyStatus = "DECLINED";
  res.json({ data: quote });
});

module.exports = router;
