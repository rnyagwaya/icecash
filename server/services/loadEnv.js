// Minimal .env loader (no dotenv dependency). Reads KEY=VALUE lines from the
// project root .env into process.env, without overriding anything already set.
const fs = require("fs");
const path = require("path");

function loadEnv() {
  const envPath = path.join(__dirname, "..", "..", ".env");
  let raw;
  try {
    raw = fs.readFileSync(envPath, "utf8");
  } catch (err) {
    return; // no .env file — nothing to do
  }

  raw.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eq = trimmed.indexOf("=");
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  });
}

module.exports = loadEnv;
