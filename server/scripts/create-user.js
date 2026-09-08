#!/usr/bin/env node
// Registers or updates a staff login. Usage:
//   node server/scripts/create-user.js <email> <password> [display name]
const userStore = require("../services/userStore");

const [, , email, password, ...nameParts] = process.argv;

if (!email || !password) {
  console.error("Usage: node server/scripts/create-user.js <email> <password> [display name]");
  process.exit(1);
}

const name = nameParts.join(" ") || undefined;
const user = userStore.upsertUser(email, password, name);
console.log(`Saved staff login for ${user.email} (${user.name}).`);
