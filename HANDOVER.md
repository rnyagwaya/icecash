# Handover — Zimnat Motor Insurance Gateway

Paste this whole file into a new chat (or point a new Claude Code session at this
project directory and reference this file) to continue where this session left off.

## What this project is

A Node/Express gateway (`server/`) + customer self-service portal (`public/`) that
wraps IceCash/ZINARA for Zimnat motor insurance: quote (licence / insurance /
combined / comprehensive) → payment (mobile money or in-branch cash/card) → issued
policy, with a customer-facing wizard and a `/console` staff debug view.

Git: initial commit `55952dd` on `main`, "Build Zimnat Motor Insurance gateway:
quote/payment/policy flow over IceCash". Working tree was clean as of that commit;
check `git status` for anything since.

Run it: `node server/index.js` (or `npm start`), serves on `http://localhost:3000`.
Customer portal at `/`, staff debug console (logs every API call, both
browser→gateway and gateway→IceCash) at `/console`.

## Three IceCash integration modes

Set via the Settings modal (gear icon in the portal header) or `POST /api/v1/settings`.

1. **`mock`** — local simulator (`server/services/icecashMock.js`). Fully working,
   safe to hammer for testing. Has fixture VRNs for edge cases (see below).
2. **`real`** — direct to IceCash's actual test API (`server/services/icecashReal.js`),
   MAC-signed per the recorded Postman collection. **Already working**, user has live
   credentials configured. `server/data/settings.json` holds the real partner key —
   this file is gitignored, never commit it.
3. **`gateway`** — NOT YET BUILT. The user's own hosted gateway, which itself handles
   IceCash auth (no partner key/MAC needed from us — just the gateway's own
   credentials). This is the in-progress work — see below.

Routing between mock/real happens centrally in `server/services/icecashClient.js`,
which also logs every call (see next section) — a future `icecashGateway.js` should
plug into this same dispatch table.

## Debug/logging infrastructure (done)

- `server/services/icecashLog.js` — in-memory ring buffer of every gateway→IceCash
  call (mock or real), recorded centrally in `icecashClient.js`.
- `GET /api/v1/icecash-log` exposes it.
- `public/console-log.js` — wraps `window.fetch` on `/console` to log browser→gateway
  calls, AND polls `/api/v1/icecash-log` to show the IceCash leg too, tagged with a
  distinct "ICECASH · <Function> (mode)" badge. Both shown in a slide-out drawer
  (bottom-right toggle button).
- **Known-fixed bug pattern to watch for**: inline `style.transform`/`style.display`
  set via JS always beats a CSS class rule, even `!important`-free class selectors
  inside media queries — this bit us twice (mobile summary sheet, debug drawer slide
  animation). Always toggle via `classList` + a dedicated CSS class, not inline styles,
  when something needs to react to both a CSS media query AND JS state.

## Quote-Level Rejection Masking (done, mock+real)

Per `Quote-Level Rejection Masking.html` (project root) — a shared helper
(`server/services/quoteMasking.js`) catches IceCash quotes that are "successful" at
the top level (`Response.Result: 1`) but individually blocked
(`Quotes[0].Result != 1`), and masks (flags) rather than discards them: the quote is
still fully returned with pricing/vehicle/client data, plus `blocked: true` and the
verbatim `blockedMessage`. Server-side enforcement in `orchestration.js` and
`payments.js` rejects any accept/pay attempt on a blocked quote with `409
QUOTE_BLOCKED`, before any IceCash call. Frontend shows the block notice on the Quote
step and disables Accept & Pay, but still renders full quote details.

**This is directly relevant to gateway mode**: the real gateway already implements
this natively (see below) — response shape is `data.blocked` + per-quote
`blocked`/`blockedReason`/`errorDetails.iceCashErrorCode`, and blocked quotes still
carry a real `insuranceId`. Our masking helper's "has-a-real-id-vs-hard-failure"
heuristic maps directly onto this.

## Cover note / documents (done)

`server/services/documents.js` builds the cover note HTML from the **raw poll
response** (`policy.icecash.raw`, captured in `orchestration.js`'s `submitAndPoll`),
not from quote-time data — matches a reference screenshot format (red top bar,
"Insured Details" / "Certificate of Motor Insurance" sections, Policy Rate,
breakdown table). Embedded inline on the Policy step via iframe, with a print button.
Had to enrich `icecashMock.js`'s `tpiPolicy`/`tpilicResult` to include Insured
Details fields (IDNumber, FirstName, etc.) that the real IceCash API includes but our
mock originally didn't.

## Payment methods (done)

Unified into one list on the Payment step — EcoCash / InnBucks / OneMoney / Cash /
Card, no more separate "customer vs cashier" mode toggle (that was tried and
explicitly reverted per user feedback). Cash prompts for "Amount tendered", Card
prompts for RRN (POS transaction reference) — both go through the same 2-step
accept+poll orchestration (`POST /api/v1/motor/payments/confirm`) as the mobile-money
path, and a receipt number (`RCT-...`) is generated and shown.

## Known small fixes landed this session (for reference, don't re-break)

- Vehicle "use" was lost on save/resume — `onTypeChange()` resets `S.use`/`S.vehCode`
  as a side effect; `tryResume()` was calling it AFTER restoring state, wiping the
  restore. Fixed by capturing `vehCode` before calling `onTypeChange()`, then calling
  `onUseChange()` explicitly after (setting `.value` alone doesn't fire the handler).
- Cover-step back button could become completely unreachable mid-flow (both the
  standalone back button and the one bundled with Continue were conditionally hidden
  in a way that had a gap). Fixed.
- Defaults changed to 4 months / RTA (were 8 months / no default cover type).
- `.gitignore` added for `.env`, `.DS_Store`, `server/data/settings.json` (real
  partner key), `.claude/settings.local.json`.

## Gateway mode — what's confirmed so far (IN PROGRESS, not built)

**User's explicit workflow requirement: always plan and get explicit approval before
making changes.** Don't just start implementing `icecashGateway.js` — confirm the
plan first, especially since endpoints are still being discovered/are currently
broken on the user's server.

Confirmed pieces:

- **Base URL**: `http://196.29.38.218:3000`
- **Auth**: `POST /api/v1/auth/login`, body `{partnerCode: "ROPFA", apiKey: "..."}` →
  `{success, data: {access_token (JWT), token_type: "Bearer", expires_in: 86400,
  scope}}`. Cache the token, refresh well before 86400s (24h), same pattern as
  `icecashReal.js`'s existing `ensureToken()`.
- **Enums**: `GET /api/v1/enums` (Bearer auth) — richer than our local
  `server/data/enums.js`: real `taxClasses` table (per vehicle-type), 384-entry
  `suburbsTowns`, 21 `insuranceCompanies`, `paymentMethods` with an `approval` field
  (None/Client OTP/Third Party/Payment Gateway), plus `clientIdTypes`,
  `radioTvUsage`, `frequencies` we don't have locally at all.
- **Comprehensive coverage options**: `GET /api/v2/motor/comprehensive/coverage-options`
  — structurally different rating model than our local `rating.js`: per-vehicle-type
  multipliers (e.g. Business use ×1.3), `minimumPremium: 200`, `minimumVehicleValue:
  1000`, `defaultStandardExcess: 250`, only `allowedDurations: [4,6,12]`,
  formula-based extras (windscreen = rate×cover-value capped, car hire = daily rate
  capped days/month, roadside = flat annual fee), `supportedCurrencies: ["USD",
  "ZWG"]`. **Flagged, unresolved**: this endpoint currently returns
  `statutoryCharges: {stampDutyRate: 0.03, governmentLevyRate: 0.05}` — which matches
  exactly the swapped/wrong values our local `coverageOptions.js` explicitly
  documents as the known KD-001 defect (correct values 0.05/0.12 per the Technical
  Reference). Need to decide with user: trust gateway's numbers as-is, or apply the
  KD-001 correction client-side.
- **Insurance quote**: `POST /api/v2/motor/quote/insurance` (Bearer auth). Request:
  `{externalReference, currency, customerReference (number), vehicles: [{vrn,
  vehicleType, insuranceType, vehicleValue, durationMonths, owner: {idNumber, idType,
  firstName, lastName, msisdn, email, address1, town, suburbID}, policyHolder: {same
  shape}}]}`. Response: `{success, data: {externalReference, blocked, quotes: [{vrn,
  referenceId, insuranceId, licenceId, combinedId, insurancePremium, licenseFee,
  radioFee, totalAmount, currency, status, blocked, blockedReason, expiresAt,
  errorDetails: {iceCashErrorCode, iceCashMessage, errorCategory, userMessage,
  suggestedAction, occurredAt} | null, owner: {masked PII}, policyHolder: {masked
  PII}, vehicle: {make, model, taxClass, yearManufacture, vehicleType, vehicleValue},
  policy: {insuranceType, startDate (ISO), endDate (ISO), durationMonths, amount,
  stampDuty, governmentLevy, coverAmount, premiumAmount, currency}, licence: null,
  customerReference}]}, meta: {requestId, generatedAt}}`.
  **Note the shape differences from raw IceCash**: camelCase not PascalCase, real
  JSON numbers not stringified, ISO 8601 dates not `YYYYMMDD`, PII masked by default
  in the response.
- **Accept/confirm attempt**: `POST /api/v2/motor/quote/insurance/process` — path
  NOT CONFIRMED working. Body shape attempted: `{externalReference, quotes: [{
  referenceID, paymentMethod, status}], currency, policyType, idNumber, msisdn}`.
  User has hit repeated JSON syntax errors in their own manual curl/Postman testing
  (missing values before commas, "string" placeholder left in for msisdn) — those
  were client-side typos, not gateway bugs, and were walked through/fixed inline in
  chat but not yet confirmed with a real successful response.
  **Endpoint currently reported broken on the user's gateway server — user is
  getting it fixed on their end.**
- **NOT YET OBTAINED AT ALL**: poll/retrieve-issued-policy endpoint, licence-only
  quote request shape, combined quote request shape, comprehensive quote request
  shape (only coverage-options was shared for comprehensive, not the actual quote
  call).

Two design decisions already locked in with the user for whenever gateway mode is
built:
1. **PII display**: show exactly what the API returns, masked or not. No fallback to
   locally-submitted values to "unmask" it.
2. **Multi-vehicle quotes**: the gateway's request format natively accepts multiple
   vehicles per quote (`vehicles: []` array) — noted as a real capability gap versus
   our current single-vehicle-only UI, not necessarily to be built in the first pass.

## Immediate next step when resuming

Wait for the user to confirm their gateway's accept/confirm endpoint is fixed and
share a working example, then get the poll/retrieve-policy endpoint and the other
quote-type request shapes, THEN propose an implementation plan (new
`server/services/icecashGateway.js`, Settings UI additions for gateway credentials,
wiring into `icecashClient.js`'s mode dispatch) and get explicit approval before
writing code.
