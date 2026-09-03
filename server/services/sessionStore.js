// In-memory "resume my quote" session store. A token maps to whatever wizard
// state the client wants to restore later (email/phone + step selections).
// No real email provider exists, so the "magic link" is only ever dispatched
// through the notify log (server/services/notify.js) — same pattern as the
// rest of this mock gateway.

const sessions = new Map();

function makeToken() {
  return Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 8)).join("-");
}

function save({ token, email, mobile, state }) {
  const key = token && sessions.has(token) ? token : makeToken();
  sessions.set(key, { email, mobile, state, updatedAt: new Date().toISOString() });
  return key;
}

function get(token) {
  return sessions.get(token) || null;
}

module.exports = { save, get };
