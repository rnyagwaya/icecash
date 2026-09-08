# Handover — Zimnat Motor Insurance Gateway

Paste this whole file into a new chat (or point a new Claude Code session at this
project directory and reference this file) to continue where this session left off.

## What this project is

A Node/Express gateway (`server/`) + **staff-facing** portal (`public/`) that wraps
IceCash/ZINARA for Zimnat motor insurance: quote (insurance / combined / licence) →
payment (EcoCash / in-branch cash/card) → issued policy. This was originally a
customer self-service portal; it was converted to a staff portal this session (login
required, customer data entered by staff not pre-filled). `/console` is a staff debug
view showing every API call (same wizard, extra logging drawer).

Run it: `node server/index.js` (or `npm start`), serves on `http://localhost:3000`.
Login required for everything — see Auth section below.

**Git state**: local `main` is ahead of `origin/main` (not yet pushed — user pushes
manually, no git credentials configured in the dev environment). Local history was
rewritten (`git filter-branch`) earlier to scrub an IceCash partner key that had been
committed and briefly exposed on the public repo — **the key was rotated when this was
found; if pushing this history, it must be a force-push** (`git push --force-with-lease
origin main`), since commit hashes changed.

## Staff auth (new this session)

- `server/services/userStore.js` — local user store at `server/data/users.json`
  (gitignored, scrypt-hashed passwords). Add/update a user via
  `node server/scripts/create-user.js <email> <password> [name]`.
- `server/services/authSession.js` + `server/middleware/auth.js` — in-memory session
  cookie (`sid`, 12h TTL, wiped on server restart). `requireAuth` middleware is mounted
  globally in `server/index.js` before all routes, so `req.user.{email,name}` is
  available everywhere.
- `server/routes/auth.js` — `POST /api/v1/staff/login`, `POST /api/v1/staff/logout`,
  `GET /api/v1/staff/me`.
- `public/login.html` — standalone login page, Zimnat-branded.
- Settings (gear icon) moved off the header entirely — now lives inside the profile
  avatar dropdown (top-right), since staff shouldn't see it as a prominent "this is a
  mock" signal.
- Current registered user: `nyagwayar@zimnat.co.zw` (password known to the user).

## Two IceCash integration modes

Set via Settings (profile menu → Settings) or `POST /api/v1/settings`.

1. **`mock`** — local simulator (`server/services/icecashMock.js`). Fixture VRNs:
   `ADA0010`, `JAN00028`, `ZBT66223`, `TRP63631` (ZBC-expired case),
   `250507P` (invalid tax class case) — each now also carries a `vehicleType` so the
   mock returns a realistic type even though the client no longer submits one (see
   below).
2. **`real`** — direct to IceCash's test API (`server/services/icecashReal.js`),
   MAC-signed. Working, confirmed against live endpoint this session (quotes, payment
   confirm, all cover types, ZWG currency — see "Confirmed against real API" below).
   `server/data/settings.json` holds the real partner key — gitignored, never commit.
   **Bug fixed this session**: the cached auth token wasn't invalidated when the
   partner key changed via Settings, causing a confusing "MAC mismatch" until restart —
   `icecashReal.resetToken()` is now called from the settings route on key/baseUrl
   change.

Third mode `gateway` (the user's own hosted gateway for IceCash quote/policy calls,
not payments) was explored last session but never built — out of scope this session,
not touched. The **EcoCash payment gateway** (separate concern, see below) *was* built.

## EcoCash gateway (new this session, NOT YET LIVE-TESTED against the real endpoint)

`server/services/ecocashGateway.js` — real client for the user's own gateway
(`http://196.29.38.218:3000`, separate from IceCash's gateway/API). Gated by a new
`ecocashMode` setting (`"simulated"` default | `"real"`) in Settings — until real mode
is explicitly turned on with credentials, EcoCash behaves exactly as before (4s
simulated auto-success via `setTimeout`, no external call at all).

Confirmed contract (user-provided Postman examples):
- Auth: `POST /api/v1/auth/login` `{apiKey, partnerCode}` → `{success, data:
  {access_token, expires_in}}`.
- Initiate: `POST /api/v1/payments/ecocash/initiate` `{transactionReference, currency,
  amount, customerMsisdn (local format, no 263), customerName, productType:
  "MOTOR_INSURANCE", customerReference, policyNumber}` → `{success, data:
  {transactionReference, ecocashReference, status, message, currency, amount}}`.
- Query: `POST /api/v1/payments/ecocash/query` `{transactionReference}` → same shape
  plus `completedAt`.
- **Unconfirmed**: terminal success/failure status strings — every example seen so far
  returned `"PENDING SUBSCRIBER VALIDATION"` (transaction never resolved in testing).
  Built defensively: anything still matching `/^PENDING/i` is treated as in-flight;
  once it isn't, keyword-matched against FAIL/CANCEL/DECLINE/TIMEOUT/REJECT/EXPIRE/ERROR
  for failure, otherwise treated as success and the normal accept+poll orchestration
  runs. **If real terminal values turn out different from this guess, only
  `ecocashGateway.isPending`/`isFailure` need adjusting** — everything else is built
  around those two functions.
- `policyNumber` in the initiate payload is the quote's own IceCash reference id
  (combined/insurance/licence id) — NOT a final issued policy number, which doesn't
  exist yet at payment-initiation time.
- Wired into `server/routes/payments.js`: `/payments/ecocash/status/quote/:quoteId`
  live-queries the real gateway on each poll (frontend already polls this every 1.5s)
  and drives `confirmPayment()` the same way cash/card does, with a
  `quote.paymentStatus='CONFIRMING'` guard against double-firing on overlapping polls.

**Next step for EcoCash**: get real gateway credentials into Settings, flip
`ecocashMode` to `real`, and do one real end-to-end test — in particular to learn the
actual terminal status strings and confirm the `isPending`/`isFailure` heuristic holds.

## Vehicle type — removed from staff intake (new this session)

Confirmed via a real IceCash TPIQuote call that `VehicleType` can be submitted blank —
IceCash returns the real vehicle type in the response's `Vehicle.VehicleType` (plus
Make/Model/TaxClass). So Step 1 no longer asks for vehicle type/use at all — just VRN +
a USD/ZWG currency toggle. The quote step's "Vehicle type" line now reads it back from
the response via the server's complete `vehicleTypes` enum (`GET /api/v1/enums`,
fetched client-side into `VEH_TYPE_LABELS`).

**One dependent feature needed a workaround**: the "+ ZBC radio" bundle needs to know
private-vs-commercial usage to price the radio/TV licence correctly, but that's only
known from IceCash's response — too late, since radio pricing has to be *submitted*
with the quote request. Solved with a standalone toggle shown only when ZBC radio is
selected (`S.usageCategory`), independent of the removed vehicle-type picker.

## Customer details — optional, entity-type gated (new this session)

All customer-detail fields (name, ID, address, email, mobile) are optional by default.
The one exception: a Personal/Company toggle on the Details step — Company requires
`companyName` + `idNumber`. (This replaced an earlier attempt at gating ID-mandatory on
vehicle type, abandoned once vehicle type was removed from intake — see git history if
curious about that dead end.)

## Cover types — Comprehensive hidden, FTPF added (new this session)

Only RTA / FTP / FTPF are visible now. Comprehensive's card is `display:none` in
`index.html` but nothing else about it was touched (`INS.COMP`, `applyExtrasVis()`,
comprehensive endpoint routing) — trivial to re-enable by removing that one style.
`INS.FTPF = {code:3, label:'Full Third Party, Fire & Theft'}` added; the old `cc-FTP`
card had FTPF's copy despite driving code 2 — fixed to accurate FTP wording.

## Payment methods (rebuilt this session)

- **EcoCash**: see gateway section above.
- **Cash**: amount tendered + live change-due calculation (blocks payment if
  underpaid, shows exact change otherwise). Both values now appear on the printed
  receipt.
- **Card**: amount paid + POS terminal dropdown (`POS_TERMINALS` array in
  `public/app.js` — currently `NMB-66756`, `STANBIC-334265`, easy to extend) + RRN
  (kept per explicit user request). All three required, all three appear on the
  receipt.
- Cash/card confirmation UI simplified: no longer exposes the internal "accept quote"
  / "poll for confirmation" two-step process to the cashier — single "Confirming with
  IceCash…" status, then a result folded into the Payment Summary table (receipt #,
  digital policy #, licence receipt # as rows) instead of a separate note banner.

## Staff identity + documents (new this session)

`req.user` (from the session) is threaded through `payments.js` →
`orchestration.confirmPayment()` → the policy record (`policy.processedBy`) → shown
on-screen on the Policy step and inside all three printable documents' shared footer.

Document branding: **Cover Note and Policy Schedule stay plain** (red top bar, no
logo — explicit user preference, "just a plain document like before"). **Only the
Payment Receipt gets the Zimnat letterhead** (`public/assets/zimnat-logo.png`, served
same-origin so plain `<img src="/assets/zimnat-logo.png">` works) plus VRN (added for
reconciliation) and the processed-by footer. `server/services/documents.js`'s `wrap()`
takes a `branded` option controlling this.

## Policy step + Quote step layout (redesigned this session)

- Quote, Payment, and Policy steps are now full-width (no sticky "Your quote" sidebar
  recap on those three — it still builds up on Vehicle/Cover/Duration/Details). Toggled
  via `#wizardLayout`'s `.full-width` class in `renderSummary()`.
- Quote step: internal IceCash reference-ID chips (Combined/Licence/Insurance ID) are
  hidden from the customer-facing view (`display:none` on that `.quote-card`, data
  still populated, trivial to re-enable). Owner info (Entity Type / Last Name / ID
  Number, masked exactly as IceCash returns it) now shown instead, from the response's
  `Client` object — this had to be added server-side to `icecashRaw` in `quote.js`
  since it wasn't being forwarded to the client before.
- Policy step: cover-note iframe preview now has its own headed card; a print
  stylesheet (`@media print` scoped to `#v-policy`) was added as a fallback for
  printing the page directly.

## Known-fixed bugs this session (don't re-break)

- **`TotalRadioTVAmt` vs `TotalRadioTvAmt` casing**: real IceCash returns
  `TotalRadioTVAmt` (capital V); the mock simulator (and all our code) used
  `TotalRadioTvAmt`. This silently zeroed the ZBC radio/TV fee — both on-screen
  (`q-radio`) and server-side (`radioFee`/`totalRadioTvAmt` in 5 places in
  `server/routes/quote.js`, now behind a shared `radioTvAmt()` helper that reads either
  casing). Real IceCash's own data has a further quirk where `TotalRadioTVAmt` doesn't
  equal `RadioTVAmt + RadioTVArrearsAmt` — that's IceCash's own inconsistency, not ours
  to reconcile; we just display `TotalRadioTVAmt` as given (grand total is correct).
- **"Select suburb…" placeholder leaking into API payloads**: `checkDetails()` was
  reading `selectedOptions[0].textContent` even when nothing was selected (defaults to
  the placeholder option). Fixed to send `''` when `suburbSel.value` is falsy.
- **Browser autofill leaking staff's own email into customer fields**: none of the
  customer-detail inputs had `autocomplete` set, so browsers were suggesting/filling
  the logged-in staff member's own saved email. Added `autocomplete="off"` to all of
  them.
- Older known-fixed patterns from prior sessions (still valid, not re-litigated): inline
  `style.transform`/`style.display` beats CSS class rules — always toggle via
  `classList`, not inline styles, for anything reacting to both a media query and JS
  state (bit us in the debug drawer and mobile summary sheet originally, and again this
  session in a payment-button flex-layout dead end before the actual root cause — an
  always-visible "Back to quote" button — was found).

## Confirmed working against the real IceCash API this session

Read-only quote checks (safe, non-destructive) plus one full payment confirmation, all
against `https://dev-test-api.icecash.mobi`:
- RTA/FTP/FTPF quotes (real premiums returned, all three price differently)
- ZWG currency — IceCash computes genuinely different real pricing for ZWG vs USD
  (not just relabeled), confirming currency is safe to pass through as-is (per user:
  "there is no currency conversion, you either pay in USD or you pay in ZWG")
- Blank `VehicleType` submission → real vehicle type/make/model returned correctly
- Blank/optional owner fields accepted without error
- Full cash payment confirmation → real IceCash policy issued, documents generated
  correctly with real masked `Client` data

## Debug/logging infrastructure (from prior sessions, unchanged)

- `server/services/icecashLog.js` — in-memory ring buffer of every gateway→IceCash
  call, recorded centrally in `icecashClient.js`. `GET /api/v1/icecash-log` exposes it.
- `public/console-log.js` — wraps `window.fetch` on `/console` to log browser→gateway
  calls too, shown in a slide-out drawer.

## Quote-Level Rejection Masking (from prior sessions, unchanged)

`server/services/quoteMasking.js` — catches IceCash quotes that are "successful" at
the top level but individually blocked, masks (flags) rather than discards them.
Server-side enforcement in `orchestration.js`/`payments.js` rejects accept/pay on a
blocked quote with `409 QUOTE_BLOCKED` before any IceCash call.

## Immediate next steps when resuming

1. Push this session's work to GitHub (user pushing manually — remember it needs
   `--force-with-lease` due to the rewritten history, see Git state above).
2. If picking EcoCash back up: get real gateway credentials, flip `ecocashMode` to
   `real` in Settings, run one real end-to-end payment, and adjust
   `ecocashGateway.isPending`/`isFailure` once actual terminal status strings are known.
3. Comprehensive cover and the `gateway` IceCash mode are both still dormant
   (intentionally hidden / never built) — pick up per user request, not proactively.
