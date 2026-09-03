// In-memory ring buffer of every gateway -> IceCash call (mock or real), so the /console debug
// drawer can show what actually went over the wire to IceCash — not just the browser -> gateway
// call that triggered it. See server/services/icecashClient.js, which records into this.

const MAX_ENTRIES = 200;
const log = [];
let seq = 0;

function record(entry) {
  log.unshift({ id: ++seq, at: new Date().toISOString(), ...entry });
  if (log.length > MAX_ENTRIES) log.pop();
}

function list(sinceId) {
  if (!sinceId) return log;
  return log.filter((e) => e.id > Number(sinceId));
}

module.exports = { record, list };
