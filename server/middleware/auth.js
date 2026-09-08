const authSession = require("../services/authSession");

const COOKIE_NAME = "sid";

function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    cookies[key] = decodeURIComponent(val);
  });
  return cookies;
}

function setSessionCookie(res, sid) {
  const maxAgeSeconds = Math.floor(authSession.SESSION_TTL_MS / 1000);
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${sid}; HttpOnly; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
}

// Paths reachable with no session — the login page itself and the endpoint it posts to.
const PUBLIC_PATHS = new Set(["/login.html", "/api/v1/staff/login"]);

function requireAuth(req, res, next) {
  const cookies = parseCookies(req);
  const session = authSession.getSession(cookies[COOKIE_NAME]);
  if (session) {
    req.user = session;
    return next();
  }
  if (PUBLIC_PATHS.has(req.path) || req.path.startsWith("/assets/")) return next();
  if (req.path.startsWith("/api/")) {
    return res.status(401).json({ success: false, message: "Not authenticated" });
  }
  const next_ = req.path === "/" ? "" : `?next=${encodeURIComponent(req.path)}`;
  return res.redirect(`/login.html${next_}`);
}

module.exports = { requireAuth, parseCookies, setSessionCookie, clearSessionCookie, COOKIE_NAME };
