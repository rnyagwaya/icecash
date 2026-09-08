require("./services/loadEnv")();

const express = require("express");
const path = require("path");

const settingsRoutes = require("./routes/settings");
const enumsRoutes = require("./routes/enums");
const quoteRoutes = require("./routes/quote");
const paymentsRoutes = require("./routes/payments");
const policyRoutes = require("./routes/policy");
const notifyRoutes = require("./routes/notify");
const sessionsRoutes = require("./routes/sessions");
const icecashLogRoutes = require("./routes/icecashLog");
const authRoutes = require("./routes/auth");
const { requireAuth } = require("./middleware/auth");

const app = express();
app.use(express.json());

// requireAuth lets POST /api/v1/staff/login and /login.html through with no session;
// everything else (API and pages) needs a valid session cookie.
app.use(requireAuth);
app.use("/api/v1/staff", authRoutes);

// Public gateway layer — see Motor_Insurance_Gateway_Technical_Reference_v1.html
app.use("/api/v1", settingsRoutes);
app.use("/api/v1", enumsRoutes);
app.use("/api/v1", paymentsRoutes);
app.use("/api/v1", notifyRoutes);
app.use("/api/v1", sessionsRoutes);
app.use("/api/v1", icecashLogRoutes);
app.use("/api/v2/motor", quoteRoutes);
app.use("/api/v2/motor", policyRoutes);

// Staff/debug console — same portal, same wizard, with every API call logged
// live in a drawer (see public/console-log.js). Served by the exact same
// index.html so the two never drift apart.
app.get("/console", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.use(express.static(path.join(__dirname, "..", "public")));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, message: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Motor Insurance Gateway listening on http://localhost:${PORT}`);
});
