// IceCash reference data, per Motor_Insurance_Gateway_Technical_Reference_v1.html Appendices.
// Faithfully reproduces KD-009 (vehicleTypes codes 2,3,4 return the wrong `use` label upstream) —
// the portal is documented to ignore `use` and rely on its own mapping, which lives here too.

const vehicleTypes = {
  1: { type: "Private Car", use: "Private Use" },
  2: { type: "Private Car", use: "Private Use" }, // KD-009: IceCash wrongly returns "Private Use" (should be "Business use")
  3: { type: "Private Car", use: "Private Use" }, // KD-009: IceCash wrongly returns "Private Use" (should be "Fleet")
  4: { type: "Private Car", use: "Private Use" }, // KD-009: IceCash wrongly returns "Private Use" (should be "Private Hire")
  5: { type: "Private Car", use: "Driving School" },
  6: { type: "Trailer", use: "Domestic Trailers" },
  7: { type: "Trailer", use: "Caravans" },
  8: { type: "Commercial Vehicle", use: "Own use" },
  9: { type: "Commercial Vehicle", use: "Hire and Reward" },
  10: { type: "Commercial Vehicle", use: "Fleet-Own" },
  11: { type: "Commercial Vehicle", use: "Fleet-Hire&Reward" },
  12: { type: "Commercial Vehicle", use: "Driving School" },
  13: { type: "Taxis", use: "Public Hire" },
  14: { type: "Commercial Trailers", use: "Own use" },
  15: { type: "Commercial Trailers", use: "Hire and Reward" },
  16: { type: "Commercial Trailers", use: "Fleet-Own use" },
  17: { type: "Commercial Trailers", use: "Fleet-Hire&Reward" },
  18: { type: "Commercial Trailers", use: "Agriculture" },
  19: { type: "Motor Cycles", use: "SD&P use" },
  20: { type: "Motor Cycles", use: "Business use" },
  21: { type: "Motor Cycles", use: "Fleet" },
  22: { type: "Omnibus and Commuters", use: "Up to 30 seats" },
  23: { type: "Omnibus and Commuters", use: "31-60 seats" },
  24: { type: "Omnibus and Commuters", use: "60+ seats" },
  25: { type: "School Bus", use: "Up to 30 seats" },
  26: { type: "School Bus", use: "31-60 seats" },
  27: { type: "School Bus", use: "60+ seats" },
  28: { type: "Staff Bus", use: "Up to 30 seats" },
  29: { type: "Staff Bus", use: "31-60 seats" },
  30: { type: "Staff Bus", use: "60+ seats" },
  31: { type: "Tractors/Fork Lifts", use: "Own use" },
  32: { type: "Tractors", use: "Hire and Reward" },
  33: { type: "Tractors/Combines", use: "Agriculture — Own use" },
  34: { type: "Tractors/Combines", use: "Agriculture — Hire & Reward" },
  35: { type: "Ambulance, Fire Engine, Hearse", use: "Various" },
  36: { type: "Agricultural Implements", use: "Various" },
  37: { type: "Special Types", use: "Contractors Plant & Equipment" },
};

// Appendix a.2 — Insurance Types
const insuranceTypes = {
  1: "Road Traffic Act (RTA)",
  2: "Full Third Party",
  3: "Full Third Party, Fire & Theft", // KD-007: unconfirmed — a recorded IceCash sample returned 3 for a high-value comprehensive-looking vehicle
  4: "Comprehensive Cover (FTPFT)",
};

// Appendix a.1 — Payment Methods
const paymentMethods = {
  1: { label: "Cash", customerFacing: true },
  2: { label: "ICEcash", customerFacing: false },
  3: { label: "EcoCash", customerFacing: true },
  5: { label: "Netone (OneMoney)", customerFacing: true },
  6: { label: "Telecel (Telecash)", customerFacing: true },
  7: { label: "Card", customerFacing: true },
  // KD-008: InnBucks code unconfirmed — needs IceCash confirmation
};

// Appendix a.3 — Delivery Methods
const deliveryMethods = {
  1: "Courier",
  2: "Office Collection",
  3: "ALM (required for LicenceCert=1)",
  4: "SMS",
};

// Appendix c.3 — RadioTVUsage
const radioTvUsage = {
  1: "Private",
  2: "Company",
  3: "TV fitted",
};
const PRIVATE_VEHICLE_TYPE_CODES = new Set([1, 2, 3, 4, 5, 6, 7, 19, 20, 21]);

// Appendix c.1 — LicFrequency (duration months -> IceCash code)
const licFrequencyByDurationMonths = {
  4: 1,
  5: 4,
  6: 2,
  7: 5,
  8: 6,
  9: 7,
  10: 8,
  11: 9,
  12: 3,
};

const insuranceCompanies = {
  24: "ZIMNAT LION INSURANCE COMPANY",
  21: "OLD MUTUAL",
  17: "NICOZ DIAMOND",
};

const suburbsTowns = {
  1: "Harare CBD",
  28: "Borrowdale Harare",
};

function deriveRadioTvUsage({ vehicleTypeCode, hasTV }) {
  if (hasTV) return 3;
  return PRIVATE_VEHICLE_TYPE_CODES.has(Number(vehicleTypeCode)) ? 1 : 2;
}

module.exports = {
  vehicleTypes,
  insuranceTypes,
  paymentMethods,
  deliveryMethods,
  radioTvUsage,
  licFrequencyByDurationMonths,
  insuranceCompanies,
  suburbsTowns,
  deriveRadioTvUsage,
};
