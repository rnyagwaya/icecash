// Local IceCash simulator. Response shapes are copied from the recorded pairs in
// "ZINARA ICECASH.postman_collection.json" (TPIQuote, TPIQuoteUpdate, TPIPolicy, LICQuote,
// LicQuoteUpdate, LICResult, TPILICQuote, TPILICUpdate, TPILICResult) so the gateway exercises
// real multi-step polling behavior (Loaded -> Approved) instead of instant success.

const { insuranceCompanies } = require("../data/enums");

// Known VRNs from the collection get their recorded vehicle details; unknown VRNs fall back
// to plausible generated ones so any input can be quoted.
const VRN_FIXTURES = {
  ADA0010: { make: "CHANA", model: "CLUB CAB", vehicleValue: 25000, taxClass: 1, vehicleType: 8 },
  JAN00028: { make: "ADMIRAL", model: "LY 125 T 15", vehicleValue: 5000, taxClass: 4, vehicleType: 19 },
  ZBT66223: { make: "ALFA ROMEO", model: "145", vehicleValue: 25000, taxClass: 1, vehicleType: 1 },
  TRP63631: { make: "TOYOTA", model: "HILUX", vehicleValue: 18000, taxClass: 1, zbcExpired: true, vehicleType: 8 },
  "250507P": { make: "NISSAN", model: "NP200", vehicleValue: 12000, taxClass: 99, invalidTaxClass: true, vehicleType: 8 },
};

function fixtureFor(vrn) {
  return (
    VRN_FIXTURES[vrn] || {
      make: "GENERIC MAKE",
      model: "GENERIC MODEL",
      vehicleValue: 15000,
      taxClass: 1,
      vehicleType: 1,
    }
  );
}

let idSeq = 130000;
function nextId() {
  idSeq += 1;
  return idSeq;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}
function nowStamp() {
  const d = new Date();
  return (
    `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}` +
    `${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
  );
}
function ymd(d) {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}
function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + Number(months));
  return d;
}

function money(n) {
  return Number(n.toFixed(2));
}

// insuranceId -> { status: 'submitted'|'polled', vrn, policy, client, vehicle, pollCount }
const insuranceRecords = new Map();
// licenceId -> { ... }
const licenceRecords = new Map();
// combinedId -> { ... }
const combinedRecords = new Map();

async function getPartnerToken() {
  return { token: `MOCK-TOKEN-${nowStamp()}` };
}

function buildInsurancePolicy(vehicle) {
  const fx = fixtureFor(vehicle.VRN || vehicle.vrn);
  const durationMonths = Number(vehicle.DurationMonths || vehicle.durationMonths || 4);
  const value = Number(vehicle.VehicleValue || vehicle.vehicleValue) || fx.vehicleValue;
  const basePremium = value * 0.05 * (durationMonths / 12);
  const stampDuty = money(basePremium * 0.05);
  const governmentLevy = money(30 * 0.12 * (durationMonths / 12));
  const premiumAmount = money(basePremium + stampDuty + governmentLevy);
  const start = new Date();
  const end = addMonths(start, durationMonths);
  return {
    fx,
    durationMonths,
    value,
    policy: {
      InsuranceType: String(vehicle.InsuranceType || vehicle.insuranceType || "1"),
      StartDate: ymd(start),
      EndDate: ymd(end),
      DurationMonths: String(durationMonths),
      Amount: premiumAmount.toFixed(2),
      StampDuty: stampDuty.toFixed(2),
      GovernmentLevy: governmentLevy.toFixed(2),
      CoverAmount: money(basePremium).toFixed(2),
      PremiumAmount: premiumAmount.toFixed(2),
      Currency: vehicle.Currency || vehicle.currency || "USD",
    },
  };
}

// ---- Insurance-only path: TPIQuote / TPIQuoteUpdate / TPIPolicy ----

async function tpiQuote(vehicle) {
  const vrn = vehicle.VRN || vehicle.vrn;
  const { fx, policy } = buildInsurancePolicy(vehicle);
  const insuranceId = nextId();

  insuranceRecords.set(insuranceId, {
    vrn,
    status: "quoted",
    pollCount: 0,
    policy,
    vehicle: fx,
    client: vehicle,
  });

  // Quote-Level Rejection Masking demo case: IceCash returns overall success (Result: 1) but
  // this individual quote is blocked (Result: 102) — fully priced and otherwise normal. See
  // "Quote-Level Rejection Masking.html" §01 for the real captured shape this reproduces.
  const perQuoteResult = fx.zbcExpired ? 102 : 1;
  const perQuoteMessage = fx.zbcExpired
    ? "ZBC license has expired. Insurance may not be issued without a valid ZBC license, please take out a ZBC license first."
    : "Quote generated. ";

  return {
    Result: 1,
    Message: "1 quotes generated. 0 failed",
    Quotes: [
      {
        VRN: vrn,
        InsuranceID: insuranceId,
        Result: perQuoteResult,
        Message: perQuoteMessage,
        CustomerReference: vehicle.CustomerReference || vehicle.customerReference || "",
        Policy: policy,
        Client: { ...vehicle },
        Vehicle: {
          Make: fx.make,
          Model: fx.model,
          TaxClass: fx.taxClass,
          YearManufacture: "",
          VehicleType: String(vehicle.VehicleType || vehicle.vehicleType || fx.vehicleType || "1"),
          VehicleValue: String(fx.vehicleValue),
        },
      },
    ],
  };
}

async function tpiQuoteUpdate({ insuranceId, status = "1" }) {
  const rec = insuranceRecords.get(Number(insuranceId));
  if (!rec) {
    return { Result: 0, Payment_ID: "", Currency: "", Message: "InsuranceID not found." };
  }
  rec.status = status === "1" ? "submitted" : "rejected";
  rec.pollCount = 0;
  return {
    Result: 1,
    Payment_ID: "",
    Currency: "",
    Message: "Request submitted successfully. Poll Insurance ID for further details.",
  };
}

async function tpiPolicy(insuranceId) {
  const rec = insuranceRecords.get(Number(insuranceId));
  if (!rec) {
    return { Result: "0", Message: "InsuranceID not found." };
  }
  rec.pollCount += 1;
  if (rec.status !== "submitted" || rec.pollCount < 2) {
    return {
      Function: "TPIPolicy",
      Result: "1",
      Message: "Policy Retrieved",
      VRN: rec.vrn,
      Status: "Loaded",
    };
  }
  rec.status = "approved";
  const policyNo = `ICZIM${new Date().getFullYear().toString().slice(2)}${insuranceId}`;
  const c = rec.client;
  return {
    Function: "TPIPolicy",
    Result: "1",
    Message: "Policy Retrieved",
    PolicyNo: policyNo,
    VRN: rec.vrn,
    IssuerCompany: insuranceCompanies[24],
    Status: "Approved",
    InsuranceType: rec.policy.InsuranceType,
    LoadedBy: " Zimnat Lion Insurance",
    LoadedDate: nowStamp(),
    ApprovedBy: " Zimnat Lion Insurance",
    ApprovedDate: nowStamp(),
    IDNumber: c.IDNumber || c.idNumber || "",
    FirstName: c.FirstName || c.firstName || "",
    LastName: c.LastName || c.lastName || "",
    MSISDN: c.MSISDN || c.msisdn || "",
    Email: c.Email || c.email || "",
    Address1: c.Address1 || c.address1 || "",
    Address2: c.Address2 || c.address2 || "",
    Town: c.Town || c.town || "",
    EntityType: c.EntityType || c.entityType || "Personal",
    CompanyName: c.CompanyName || c.companyName || "",
    BirthDate: c.BirthDate || c.birthDate || "",
    ...rec.policy,
    Make: rec.vehicle.make,
    Model: rec.vehicle.model,
    TaxClass: String(rec.vehicle.taxClass),
    YearManufacture: "2024",
    VehicleType: String(c.VehicleType || c.vehicleType || rec.vehicle.vehicleType || "1"),
    ValueAmount: String(rec.vehicle.vehicleValue),
    Rate: "0.0500",
    Customer_Reference: c.CustomerReference || c.customerReference || "",
  };
}

// ---- Licence-only path: LICQuote / LicQuoteUpdate / LICResult ----

function buildLicence(vehicle) {
  const fx = fixtureFor(vehicle.VRN || vehicle.vrn);
  const licenceFee = 1800 + (fx.taxClass || 1) * 50;
  const arrears = fx.zbcExpired ? 150 : 0;
  const penalties = fx.zbcExpired ? 40 : 0;
  const admin = 10;
  const totalLicAmt = money(licenceFee + arrears + penalties + admin);
  const radioTvFreq = vehicle.RadioTVFrequency || vehicle.radioTvFrequency;
  const radioTvAmt = radioTvFreq ? 35 : 0;
  const totalRadioTvAmt = radioTvAmt;
  const totalAmount = money(totalLicAmt + totalRadioTvAmt);
  const expiry = addMonths(new Date(), 3);
  return {
    fx,
    licence: {
      LicFrequency: Number(vehicle.LicFrequency || vehicle.licFrequency || 3),
      RadioTVUsage: String(vehicle.RadioTVUsage || vehicle.radioTvUsage || ""),
      RadioTVFrequency: String(radioTvFreq || ""),
      NettMass: 1500,
      LicExpiryDate: ymd(expiry),
      TransactionAmt: licenceFee.toFixed(2),
      ArrearsAmt: arrears.toFixed(2),
      PenaltiesAmt: penalties.toFixed(2),
      AdministrationAmt: admin.toFixed(2),
      TotalLicAmt: totalLicAmt.toFixed(2),
      RadioTVAmt: radioTvAmt.toFixed(2),
      RadioTVArrearsAmt: "0.00",
      TotalRadioTvAmt: totalRadioTvAmt.toFixed(2),
      TotalAmount: totalAmount.toFixed(2),
    },
  };
}

async function licQuote(vehicle) {
  const vrn = vehicle.VRN || vehicle.vrn;
  const { licence } = buildLicence(vehicle);
  const licenceId = nextId();

  licenceRecords.set(licenceId, {
    vrn,
    status: "quoted",
    pollCount: 0,
    licence,
    client: vehicle,
  });

  return {
    Result: 1,
    Message: "1 quotes generated. 0 failed",
    Quotes: [
      {
        VRN: vrn,
        IDNumber: vehicle.IDNumber || vehicle.idNumber || "",
        ClientIDType: vehicle.ClientIDType || vehicle.idType || "1",
        FirstName: vehicle.FirstName || vehicle.firstName || "",
        LastName: vehicle.LastName || vehicle.lastName || "",
        Address1: vehicle.Address1 || vehicle.address1 || "",
        Address2: vehicle.Address2 || vehicle.address2 || "",
        SuburbID: String(vehicle.SuburbID || vehicle.suburbID || "1"),
        ...licence,
        MSISDN: vehicle.MSISDN || vehicle.msisdn || "",
        Email: vehicle.Email || vehicle.email || "",
        LicenceID: licenceId,
        Result: 1,
        Message: "Success",
      },
    ],
  };
}

async function licQuoteUpdate({ licenceId, status = "1" }) {
  const rec = licenceRecords.get(Number(licenceId));
  if (!rec) {
    return { Result: 0, Payment_ID: "", Currency: "ZWG", Message: "LicenceID not found." };
  }
  rec.status = status === "1" ? "submitted" : "rejected";
  rec.pollCount = 0;
  return {
    Result: 1,
    Payment_ID: "",
    Currency: "ZWG",
    Message: "Request submitted successfully. Poll Licence ID for further details.",
  };
}

async function licResult(licenceId) {
  const rec = licenceRecords.get(Number(licenceId));
  if (!rec) return { Result: "0", Message: "LicenceID not found." };
  rec.pollCount += 1;
  if (rec.status !== "submitted" || rec.pollCount < 2) {
    return {
      Function: "LICResult",
      Result: "1",
      Message: "Licence Retrieved",
      VRN: rec.vrn,
      Status: "Loaded",
      LoadedBy: " Zimnat Lion Insurance",
      LoadedDate: nowStamp(),
    };
  }
  rec.status = "approved";
  return {
    Function: "LICResult",
    Result: "1",
    Message: "Licence Retrieved",
    ReceiptID: `R${String(licenceId).padStart(9, "0")}`,
    VRN: rec.vrn,
    Status: "Approved",
    LoadedBy: " Zimnat Lion Insurance",
    LoadedDate: nowStamp(),
    ApprovedBy: " Zimnat Lion Insurance",
    ApprovedDate: nowStamp(),
    ...rec.licence,
    IssuerCompany: insuranceCompanies[24],
  };
}

// ---- Combined / Comprehensive component path: TPILICQuote / TPILICUpdate / TPILICResult ----

async function tpilicQuote(vehicle) {
  const vrn = vehicle.VRN || vehicle.vrn;
  const fx = fixtureFor(vrn);

  // Quote-Level Rejection Masking demo case (uniform with tpiQuote, per R4): overall success,
  // this individual quote blocked but fully priced. See "Quote-Level Rejection Masking.html".
  if (fx.invalidTaxClass) {
    return {
      Result: 0,
      Message: "0 quotes generated. 1 failed",
      Quotes: [
        {
          VRN: vrn,
          CombinedID: "",
          InsuranceID: "",
          LicenceID: "",
          Result: 40,
          Message: "Invalid Tax Class for this Vehicle Type",
        },
      ],
    };
  }

  const { policy } = buildInsurancePolicy(vehicle);
  const { licence } = buildLicence(vehicle);
  const combinedId = nextId();
  const insuranceId = nextId();
  const licenceId = vehicle.LicFrequency || vehicle.licFrequency ? nextId() : "";

  combinedRecords.set(combinedId, {
    vrn,
    status: "quoted",
    pollCount: 0,
    policy,
    licence,
    vehicle: fx,
    client: vehicle,
    insuranceId,
    licenceId,
  });

  const perQuoteResult = fx.zbcExpired ? 102 : 1;
  const perQuoteMessage = fx.zbcExpired
    ? "ZBC license has expired. Insurance may not be issued without a valid ZBC license, please take out a ZBC license first."
    : "Quote generated";

  return {
    Result: 1,
    Message: "1 quotes generated. 0 failed",
    Quotes: [
      {
        VRN: vrn,
        CombinedID: combinedId,
        LicenceID: licenceId,
        InsuranceID: insuranceId,
        Result: perQuoteResult,
        Message: perQuoteMessage,
        Amount: money(Number(policy.PremiumAmount) + Number(licence.TotalAmount)),
        Policy: policy,
        Client: { ...vehicle },
        Vehicle: {
          Make: fx.make,
          Model: fx.model,
          TaxClass: fx.taxClass,
          YearManufacture: "",
          VehicleType: String(vehicle.VehicleType || vehicle.vehicleType || fx.vehicleType || "1"),
          VehicleValue: String(fx.vehicleValue),
        },
        Licence: licence,
      },
    ],
  };
}

async function tpilicUpdate({ combinedId, status = "1" }) {
  const rec = combinedRecords.get(Number(combinedId));
  if (!rec) {
    return { Result: 0, Payment_ID: "", Currency: "", Message: "CombinedID not found." };
  }
  rec.status = status === "1" ? "submitted" : "rejected";
  rec.pollCount = 0;
  return {
    Result: 1,
    Payment_ID: "",
    Currency: "",
    Message: "Request submitted successfully. Poll for further details.",
  };
}

async function tpilicResult(combinedId) {
  const rec = combinedRecords.get(Number(combinedId));
  if (!rec) return { Result: "0", Message: "CombinedID not found." };
  rec.pollCount += 1;
  if (rec.status !== "submitted" || rec.pollCount < 2) {
    return {
      Function: "TPILICResult",
      Result: "1",
      Message: "Licence Retrieved",
      VRN: rec.vrn,
      Status: "Loaded",
    };
  }
  rec.status = "approved";
  const policyNo = `ICZIM${new Date().getFullYear().toString().slice(2)}${combinedId}`;
  const c = rec.client;
  return {
    Function: "TPILICResult",
    Result: "1",
    Message: "Licence Retrieved",
    PolicyNumber: policyNo,
    ReceiptID: `R${String(combinedId).padStart(9, "0")}`,
    VRN: rec.vrn,
    IssuerCompany: insuranceCompanies[24],
    Status: "Approved",
    LoadedBy: " Zimnat Lion Insurance",
    LoadedDate: nowStamp(),
    ApprovedBy: " Zimnat Lion Insurance",
    ApprovedDate: nowStamp(),
    IDNumber: c.IDNumber || c.idNumber || "",
    FirstName: c.FirstName || c.firstName || "",
    LastName: c.LastName || c.lastName || "",
    MSISDN: c.MSISDN || c.msisdn || "",
    Email: c.Email || c.email || "",
    Address1: c.Address1 || c.address1 || "",
    Address2: c.Address2 || c.address2 || "",
    Town: c.Town || c.town || "",
    EntityType: c.EntityType || c.entityType || "Personal",
    CompanyName: c.CompanyName || c.companyName || "",
    BirthDate: c.BirthDate || c.birthDate || "",
    ...rec.policy,
    Make: rec.vehicle.make,
    Model: rec.vehicle.model,
    TaxClass: String(rec.vehicle.taxClass),
    YearManufacture: "2024",
    VehicleType: String(c.VehicleType || c.vehicleType || rec.vehicle.vehicleType || "1"),
    ValueAmount: String(rec.vehicle.vehicleValue),
    Rate: "0.0500",
    Customer_Reference: c.CustomerReference || c.customerReference || "",
    dateSource: "ICECASH_CONFIRMED",
    Licence: rec.licence,
  };
}

module.exports = {
  getPartnerToken,
  tpiQuote,
  tpiQuoteUpdate,
  tpiPolicy,
  licQuote,
  licQuoteUpdate,
  licResult,
  tpilicQuote,
  tpilicUpdate,
  tpilicResult,
};
