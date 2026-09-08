const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const USERS_FILE = path.join(__dirname, "..", "data", "users.json");

function load() {
  try {
    const raw = fs.readFileSync(USERS_FILE, "utf8");
    return JSON.parse(raw).users || [];
  } catch (err) {
    return [];
  }
}

function persist(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify({ users }, null, 2));
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const check = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(check, "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function findByEmail(email) {
  return load().find((u) => u.email === email.trim().toLowerCase()) || null;
}

// Used only by the CLI (server/scripts/create-user.js) to register/update staff logins.
function upsertUser(email, password, name) {
  const normalized = email.trim().toLowerCase();
  const users = load();
  const { salt, hash } = hashPassword(password);
  const existing = users.find((u) => u.email === normalized);
  if (existing) {
    existing.salt = salt;
    existing.hash = hash;
    existing.name = name || existing.name;
  } else {
    users.push({ email: normalized, name: name || normalized.split("@")[0], salt, hash });
  }
  persist(users);
  return findByEmail(normalized);
}

module.exports = { findByEmail, upsertUser, verifyPassword };
