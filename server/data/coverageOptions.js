// GET /api/v2/motor/comprehensive/coverage-options payload.
// KD-001 (BLOCKING) is fixed here: stampDutyRate 0.05 (5%), governmentLevyRate 0.12 (12%) —
// the spec explicitly calls out the swapped/wrong values (0.03 / 0.05) as not to be used.

module.exports = {
  insuranceTypes: [
    { code: "1", label: "Road Traffic Act (RTA)", pricingType: "ICECASH_RATED" },
    { code: "2", label: "Full Third Party", pricingType: "ICECASH_RATED" },
    { code: "4", label: "Comprehensive Cover", pricingType: "LOCALLY_RATED" },
  ],
  allowedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12],
  bundleOptions: [
    { code: "INSURANCE_ONLY", label: "Insurance only" },
    { code: "INSURANCE_LICENCE", label: "Insurance + ZINARA licence" },
    { code: "INSURANCE_LICENCE_RADIO", label: "Insurance + ZINARA licence + ZBC radio" },
  ],
  optionalBenefits: {
    WINDSCREEN: { label: "Windscreen", type: "flat_annual", amount: 35 },
    ACCESSORIES: { label: "Accessories", type: "flat_annual", amount: 50 },
    EXCESS_BUYDOWN: { label: "Excess buy-down", type: "flat_annual", amount: 80 },
    CAR_HIRE: { label: "Car hire", type: "flat_annual", amount: 120 },
    ROADSIDE_ASSISTANCE: { label: "Roadside assistance", type: "flat_annual", amount: 40 },
  },
  paymentMethods: [
    { code: "1", label: "Cash", customerFacing: true },
    { code: "3", label: "EcoCash", customerFacing: true },
    { code: "5", label: "Netone (OneMoney)", customerFacing: true },
    { code: "6", label: "Telecel (Telecash)", customerFacing: true },
    { code: "7", label: "Card", customerFacing: true },
  ],
  deliveryMethods: [
    { code: "2", label: "Office Collection" },
    { code: "3", label: "EMAIL" },
    { code: "4", label: "SMS" },
  ],
  statutoryCharges: {
    stampDutyRate: 0.05,
    governmentLevyRate: 0.12,
  },
};
