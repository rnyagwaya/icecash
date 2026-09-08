const crypto = require("crypto");

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h — in-memory only, wiped on server restart

const sessions = new Map(); // sid -> { email, name, expiresAt }

function createSession(email, name) {
  const sid = crypto.randomBytes(32).toString("hex");
  sessions.set(sid, { email, name, expiresAt: Date.now() + SESSION_TTL_MS });
  return sid;
}

function getSession(sid) {
  if (!sid) return null;
  const session = sessions.get(sid);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(sid);
    return null;
  }
  return session;
}

function destroySession(sid) {
  sessions.delete(sid);
}

module.exports = { createSession, getSession, destroySession, SESSION_TTL_MS };
