const express = require("express");
const userStore = require("../services/userStore");
const authSession = require("../services/authSession");
const { parseCookies, setSessionCookie, clearSessionCookie } = require("../middleware/auth");

const router = express.Router();

router.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Email and password are required" });
  }
  const user = userStore.findByEmail(email);
  if (!user || !userStore.verifyPassword(password, user.salt, user.hash)) {
    return res.status(401).json({ success: false, message: "Invalid email or password" });
  }
  const sid = authSession.createSession(user.email, user.name);
  setSessionCookie(res, sid);
  res.json({ success: true, user: { email: user.email, name: user.name } });
});

router.post("/logout", (req, res) => {
  const cookies = parseCookies(req);
  authSession.destroySession(cookies.sid);
  clearSessionCookie(res);
  res.json({ success: true });
});

router.get("/me", (req, res) => {
  if (!req.user) return res.status(401).json({ success: false });
  res.json({ success: true, user: { email: req.user.email, name: req.user.name } });
});

module.exports = router;
