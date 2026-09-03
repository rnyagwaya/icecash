// Local comprehensive rating engine, per Technical Reference §4 sequence D1/D2 and the
// KD-001-corrected statutory rates (stampDutyRate 0.05, governmentLevyRate 0.12).

const { statutoryCharges, optionalBenefits } = require("../data/coverageOptions");
const RTA_BASELINE = 30; // USD, matches the RTA cover amount seen in recorded quote examples

function money(n) {
  return Number(n.toFixed(2));
}

function rateComprehensive({ vehicleValue, durationMonths, extras = [] }) {
  const value = Number(vehicleValue);
  const months = Number(durationMonths);
  const durationFactor = months / 12;

  const basePremium = money(value * 0.05 * durationFactor);
  const stampDuty = money(basePremium * statutoryCharges.stampDutyRate);
  const subTotalPremium = money(basePremium + stampDuty);
  const governmentLevy = money(RTA_BASELINE * statutoryCharges.governmentLevyRate * durationFactor);

  const optionalBenefitsCost = {};
  let extrasTotal = 0;
  for (const code of extras) {
    const benefit = optionalBenefits[code];
    if (!benefit) continue;
    const cost = money(benefit.amount * durationFactor);
    optionalBenefitsCost[code] = cost;
    extrasTotal += cost;
  }

  const totalInsuranceAmount = money(subTotalPremium + governmentLevy + extrasTotal);

  return {
    basePremium,
    durationFactor,
    subTotalPremium,
    stampDuty,
    governmentLevy,
    optionalBenefitsCost,
    totalInsuranceAmount,
  };
}

module.exports = { rateComprehensive };
