// Quote-Level Rejection Masking — shared helper used by every product's quote parser
// (LICQuote, TPIQuote, TPILICQuote). See "Quote-Level Rejection Masking.html" (engineering
// requirement) at the project root.
//
// IceCash's quote functions can return an overall success (top-level Response.Result: 1) while
// the individual quote inside Quotes[0] carries its own Result code that isn't 1, plus a Message
// explaining a business rule that blocks the sale — with the quote still fully priced (VRN, ID,
// premium breakdown, vehicle, client all present). A caller that only checks the top-level result
// reads this as an ordinary, payable quote. This helper catches that per-item state independently
// of the top-level result, so it can be masked (flagged) instead of silently trusted.
//
// R1 Detect: read Result on the individual quote record. Present and != 1 (string or numeric
//    compare) => blocked. Absent => NOT blocked (absence is not rejection).
// R2 Capture the reason: the record's own Message, verbatim.
// R3 Mask, don't discard: callers decide what to do with { blocked, message } — this helper
//    never drops or rewrites the quote itself.

/**
 * @param {object} item - the per-quote record (Quotes[0], or the equivalent per-item record).
 * @returns {{blocked: boolean, message: string|null}}
 */
function checkQuoteMasking(item) {
  if (!item) return { blocked: false, message: null };

  const result = item.Result;
  if (result === undefined || result === null || result === "") {
    return { blocked: false, message: null };
  }

  // Compare as string so both "1" and 1 count as success (R1).
  if (String(result) === "1") {
    return { blocked: false, message: null };
  }

  return {
    blocked: true,
    message: item.Message != null ? String(item.Message) : "IceCash declined this quote — no reason provided.",
  };
}

module.exports = { checkQuoteMasking };
