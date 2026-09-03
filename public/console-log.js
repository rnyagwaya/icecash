// Staff/debug console overlay. Served at the SAME index.html as the customer
// portal (see /console route in server/index.js) — this file just wraps
// fetch() to log every request/response the page makes, and only renders the
// log drawer when the page was loaded at /console. The wizard itself
// (app.js) is completely unaware this exists; it runs identically either way.
(function () {
  const IS_DEBUG = location.pathname.replace(/\/+$/, "") === "/console";
  const MAX_ENTRIES = 300;
  const log = [];
  let seq = 0;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const method = (init && init.method) || "GET";
    const url = typeof input === "string" ? input : input.url;
    const reqBody = init && init.body ? safeParse(init.body) : null;
    const startedAt = performance.now();
    const entry = { id: ++seq, method, url, reqBody, status: null, resBody: null, ms: null, ok: null, at: new Date(), error: null };
    log.unshift(entry);
    if (log.length > MAX_ENTRIES) log.pop();
    if (IS_DEBUG) renderLog();

    try {
      const res = await nativeFetch(input, init);
      const clone = res.clone();
      entry.status = res.status;
      entry.ok = res.ok;
      entry.ms = Math.round(performance.now() - startedAt);
      clone
        .text()
        .then((text) => {
          entry.resBody = safeParse(text);
          if (IS_DEBUG) renderLog();
        })
        .catch(() => {});
      if (IS_DEBUG) renderLog();
      return res;
    } catch (err) {
      entry.error = err.message;
      entry.ms = Math.round(performance.now() - startedAt);
      if (IS_DEBUG) renderLog();
      throw err;
    }
  };

  function safeParse(v) {
    if (typeof v !== "string") return v;
    try {
      return JSON.parse(v);
    } catch (err) {
      return v;
    }
  }

  if (!IS_DEBUG) return;

  // Gateway -> IceCash calls happen entirely server-side (a different process from this page),
  // so they can't be seen by wrapping fetch() here. The server logs them itself (see
  // server/services/icecashClient.js -> icecashLog.js) and we poll that back in, tagged
  // distinctly so it's clear which leg of the call each entry represents.
  let lastIcecashId = 0;
  async function pollIcecashLog() {
    try {
      const res = await nativeFetch(`/api/v1/icecash-log?since=${lastIcecashId}`);
      const json = await res.json();
      const entries = json.data || [];
      if (entries.length) {
        for (const e of entries) {
          if (e.id > lastIcecashId) lastIcecashId = e.id;
          log.unshift({
            id: `ic-${e.id}`,
            source: "icecash",
            method: e.method,
            url: e.url,
            reqBody: e.request,
            status: e.ok ? 200 : "ERR",
            resBody: e.response,
            ms: e.ms,
            ok: e.ok,
            at: new Date(e.at),
            error: null,
            functionName: e.function,
            mode: e.mode,
          });
        }
        if (log.length > MAX_ENTRIES) log.length = MAX_ENTRIES;
        log.sort((a, b) => new Date(b.at) - new Date(a.at));
        renderLog();
      }
    } catch (err) {
      /* best-effort polling only */
    }
  }

  document.addEventListener("DOMContentLoaded", init);
  if (document.readyState !== "loading") init();

  function init() {
    injectDebugChrome();
    renderLog();
    pollIcecashLog();
    setInterval(pollIcecashLog, 1500);
  }

  function injectDebugChrome() {
    // Header badge + exit link
    const actions = document.querySelector(".head-actions");
    if (actions) {
      const pill = document.createElement("span");
      pill.className = "hdr-pill warn";
      pill.textContent = "DEBUG CONSOLE";
      pill.style.cssText =
        "background:#FFF0F0;color:#A32D2D;border:1px solid #F09595;font-size:11px;font-weight:800;padding:5px 10px;border-radius:999px;";
      actions.insertBefore(pill, actions.firstChild);

      const exitLink = document.createElement("a");
      exitLink.href = "/";
      exitLink.textContent = "Exit console";
      exitLink.className = "help-link";
      actions.insertBefore(exitLink, actions.firstChild);
    }

    // Toggle button (floating, bottom-right)
    const toggle = document.createElement("button");
    toggle.id = "dbgToggle";
    toggle.type = "button";
    toggle.setAttribute(
      "style",
      "position:fixed;right:20px;bottom:20px;z-index:900;background:#141A17;color:#fff;border:none;border-radius:999px;padding:12px 18px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 10px 30px rgba(0,0,0,.3);display:flex;align-items:center;gap:8px;min-height:48px;"
    );
    toggle.innerHTML = '<span id="dbgCount">0</span> API calls · toggle log';
    toggle.onclick = () => {
      const drawer = document.getElementById("dbgDrawer");
      const isOpen = drawer.classList.toggle("open");
      // transform is set inline below (needed for the initial off-screen position before any
      // CSS has loaded), so it must also be toggled here — an inline style always beats a class
      // rule, so a CSS-only ".open { transform: ... }" rule can never win against it.
      drawer.style.transform = isOpen ? "translateX(0)" : "translateX(100%)";
    };
    document.body.appendChild(toggle);

    // Drawer
    const drawer = document.createElement("div");
    drawer.id = "dbgDrawer";
    drawer.setAttribute(
      "style",
      [
        "position:fixed", "top:0", "right:0", "bottom:0", "width:min(480px,100vw)",
        "background:#0d1310", "color:#d7e8dd", "z-index:950", "box-shadow:-12px 0 40px rgba(0,0,0,.4)",
        "transform:translateX(100%)", "transition:transform .2s ease", "display:flex", "flex-direction:column",
        "font-family:'SF Mono',Consolas,'Courier New',monospace",
      ].join(";")
    );
    drawer.innerHTML = [
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #23302a;background:#141a17">',
      '  <div style="font-size:13px;font-weight:700;color:#fff;font-family:-apple-system,sans-serif">API call log</div>',
      '  <div style="display:flex;gap:8px">',
      '    <button id="dbgClear" style="background:#23302a;color:#d7e8dd;border:none;border-radius:6px;padding:8px 12px;font-size:11px;cursor:pointer;min-height:36px">Clear</button>',
      '    <button id="dbgClose" style="background:#23302a;color:#d7e8dd;border:none;border-radius:6px;padding:8px 12px;font-size:11px;cursor:pointer;min-height:36px">✕</button>',
      "  </div>",
      "</div>",
      '<div id="dbgList" style="flex:1;overflow:auto;padding:10px"></div>',
    ].join("");
    document.body.appendChild(drawer);

    document.getElementById("dbgClose").onclick = () => drawer.classList.remove("open");
    document.getElementById("dbgClear").onclick = () => {
      log.length = 0;
      renderLog();
    };

    const style = document.createElement("style");
    style.textContent = `
      #dbgDrawer.open{ transform:translateX(0); }
      .dbg-entry{ border:1px solid #23302a; border-radius:8px; margin-bottom:8px; overflow:hidden; }
      .dbg-entry-head{ display:flex; align-items:center; gap:8px; padding:9px 11px; cursor:pointer; font-size:11.5px; }
      .dbg-entry-head:hover{ background:#141a17; }
      .dbg-method{ font-weight:800; font-size:10px; padding:2px 6px; border-radius:4px; background:#23302a; color:#8fd; flex-shrink:0; }
      .dbg-entry-icecash{ border-color:#4a3a1e; }
      .dbg-source-icecash{ background:#3a2c10; color:#e0b84f; }
      .dbg-status{ font-weight:800; font-size:10px; padding:2px 6px; border-radius:4px; flex-shrink:0; }
      .dbg-status.ok{ background:#0f2e1c; color:#5fd68a; }
      .dbg-status.bad{ background:#2e1414; color:#f08a8a; }
      .dbg-status.pending{ background:#2e2814; color:#e0c060; }
      .dbg-url{ flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#d7e8dd; }
      .dbg-ms{ color:#7c8880; flex-shrink:0; }
      .dbg-body{ display:none; padding:0 11px 11px; }
      .dbg-body.open{ display:block; }
      .dbg-body h5{ margin:8px 0 4px; font-size:10px; text-transform:uppercase; letter-spacing:.05em; color:#7c8880; }
      .dbg-body pre{ margin:0; background:#141a17; border:1px solid #23302a; border-radius:6px; padding:9px 10px; font-size:11px; line-height:1.5; white-space:pre-wrap; word-break:break-word; color:#d7e8dd; max-height:260px; overflow:auto; }
      #dbgList::-webkit-scrollbar{ width:8px; }
      #dbgList::-webkit-scrollbar-thumb{ background:#23302a; border-radius:8px; }
    `;
    document.head.appendChild(style);
  }

  function renderLog() {
    const countEl = document.getElementById("dbgCount");
    if (countEl) countEl.textContent = log.length;
    const list = document.getElementById("dbgList");
    if (!list) return;

    if (log.length === 0) {
      list.innerHTML = '<div style="color:#7c8880;font-size:12px;padding:20px;text-align:center">No API calls yet — use the form on the left.</div>';
      return;
    }

    list.innerHTML = log
      .map((e) => {
        const isIcecash = e.source === "icecash";
        const statusClass = e.error ? "bad" : e.status == null ? "pending" : e.ok ? "ok" : "bad";
        const statusLabel = e.error ? "ERR" : e.status == null ? "…" : e.status;
        // Gateway calls: show just the path (same origin, path is the interesting part).
        // IceCash calls: show the full URL — that's the whole point, it's a different host.
        const displayUrl = isIcecash
          ? e.url
          : (() => {
              try {
                return new URL(e.url, location.origin).pathname + new URL(e.url, location.origin).search;
              } catch (err) {
                return e.url;
              }
            })();
        const sourceBadge = isIcecash
          ? `<span class="dbg-method dbg-source-icecash">ICECASH${e.functionName ? " · " + escapeHtml(e.functionName) : ""}${e.mode ? " (" + e.mode + ")" : ""}</span>`
          : `<span class="dbg-method">GATEWAY</span>`;
        return `
        <div class="dbg-entry ${isIcecash ? "dbg-entry-icecash" : ""}">
          <div class="dbg-entry-head" onclick="document.getElementById('dbg-body-${e.id}').classList.toggle('open')">
            ${sourceBadge}
            <span class="dbg-method">${e.method}</span>
            <span class="dbg-status ${statusClass}">${statusLabel}</span>
            <span class="dbg-url" title="${escapeHtml(displayUrl)}">${escapeHtml(displayUrl)}</span>
            <span class="dbg-ms">${e.ms != null ? e.ms + "ms" : ""}</span>
          </div>
          <div class="dbg-body" id="dbg-body-${e.id}">
            <h5>Request</h5>
            <pre>${escapeHtml(fmt(e.reqBody) || "(no body)")}</pre>
            <h5>Response ${e.error ? "(network error)" : ""}</h5>
            <pre>${escapeHtml(e.error || fmt(e.resBody) || "(pending…)")}</pre>
          </div>
        </div>`;
      })
      .join("");
  }

  function fmt(v) {
    if (v == null) return "";
    if (typeof v === "string") return v;
    try {
      return JSON.stringify(v, null, 2);
    } catch (err) {
      return String(v);
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
})();
