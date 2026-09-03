// Picks the mock or real IceCash implementation per-call based on current settings, so a
// Settings-page save takes effect immediately without a server restart.

const settingsStore = require("./settingsStore");
const icecashLog = require("./icecashLog");
const mock = require("./icecashMock");
const real = require("./icecashReal");

const METHODS = [
  "getPartnerToken",
  "tpiQuote",
  "tpiQuoteUpdate",
  "tpiPolicy",
  "licQuote",
  "licQuoteUpdate",
  "licResult",
  "tpilicQuote",
  "tpilicUpdate",
  "tpilicResult",
];

// IceCash Function name for each call, per the Postman collection / Technical Reference.
const FUNCTION_NAMES = {
  getPartnerToken: "PartnerToken",
  tpiQuote: "TPIQuote",
  tpiQuoteUpdate: "TPIQuoteUpdate",
  tpiPolicy: "TPIPolicy",
  licQuote: "LICQuote",
  licQuoteUpdate: "LicQuoteUpdate",
  licResult: "LICResult",
  tpilicQuote: "TPILICQuote",
  tpilicUpdate: "TPILICUpdate",
  tpilicResult: "TPILICResult",
};

function currentImpl() {
  const { icecashMode } = settingsStore.get();
  return icecashMode === "real" ? real : mock;
}

// The one real IceCash endpoint every function is multiplexed through — see the Postman
// collection ("{{Icecash-URL}}/request/20117846") and icecashReal.js's callIceCash(). Logged
// here (not just in icecashReal.js) so the log entry always reflects which mode actually ran.
function endpointFor(icecashMode, baseUrl) {
  if (icecashMode === "real") {
    return `${(baseUrl || "").replace(/\/$/, "")}/request/20117846`;
  }
  return `mock://icecash/${icecashMode}`;
}

const client = {};
for (const method of METHODS) {
  client[method] = async (...args) => {
    const { icecashMode, baseUrl } = settingsStore.get();
    const functionName = FUNCTION_NAMES[method] || method;
    const url = endpointFor(icecashMode, baseUrl);
    const startedAt = Date.now();
    try {
      const response = await currentImpl()[method](...args);
      icecashLog.record({
        mode: icecashMode,
        function: functionName,
        method: "POST",
        url,
        request: args[0] ?? null,
        response,
        ok: true,
        ms: Date.now() - startedAt,
      });
      return response;
    } catch (err) {
      icecashLog.record({
        mode: icecashMode,
        function: functionName,
        method: "POST",
        url,
        request: args[0] ?? null,
        response: { error: err.message },
        ok: false,
        ms: Date.now() - startedAt,
      });
      throw err;
    }
  };
}

module.exports = client;
