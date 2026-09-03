// In-memory persistence for this demo gateway. Real deployment would use a database;
// per the plan, a process-lifetime Map is enough to exercise the full quote -> pay -> policy flow.

const quotes = new Map(); // quoteId -> quote record
const payments = new Map(); // quoteId -> payment record
const policies = new Map(); // digitalPolicyNumber -> policy record
const notifications = []; // append-only log of dispatched notifications
const documents = new Map(); // digitalPolicyNumber -> { coverNote, schedule, receipt }

let seq = 1000;
function nextId(prefix) {
  seq += 1;
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${seq}`;
}

module.exports = {
  quotes,
  payments,
  policies,
  notifications,
  documents,
  nextId,
};
