/* Shared helpers used by every page. */
(function () {
  const App = {};

  /** Escape text before putting it into HTML (prevents XSS). */
  App.esc = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /** fetch wrapper: JSON in, JSON out, throws Error(message) on failure. */
  App.api = async (path, { method = "GET", body } = {}) => {
    const res = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
    let data = null;
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) {
      const err = new Error(data?.error || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  };

  /*
   * Language helpers. These English defaults are what staff pages use;
   * i18n.js (loaded on the patient pages) replaces them with Malayalam ones.
   */
  App.t = (_key, en) => en;
  App.tError = (message) => message;
  App.deptName = (dep) => dep.name;
  App.deptDesc = (dep) => dep.description;
  App.room = (room) => App.t("room", `Room ${room}`, { room });

  App.qs = (name) => new URLSearchParams(location.search).get(name);
  App.$ = (sel, root = document) => root.querySelector(sel);
  App.$$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  App.STATUS = {
    consulting: "Consulting",
    break: "On break",
    unavailable: "Not available",
  };
  App.pill = (status, resume) =>
    `<span class="pill ${App.esc(status)}">${App.esc(App.STATUS[status] || status)}${resume ? ` · back ${App.esc(App.time12(resume))}` : ""}</span>`;

  App.time12 = (hhmm) => {
    if (!hhmm) return "";
    const [h, m] = hhmm.split(":").map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  };

  App.initials = (name) =>
    name.replace(/^Dr\.?\s*/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("");

  App.minutes = (m) => {
    if (m <= 0) return "now";
    if (m < 60) return `~${m} min`;
    const h = Math.floor(m / 60), r = m % 60;
    return `~${h} h${r ? ` ${r} min` : ""}`;
  };

  App.fmtTime = (iso) => {
    const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  /* ---------- Toasts ---------- */
  App.toast = (msg, type = "") => {
    let box = App.$(".toasts");
    if (!box) {
      box = document.createElement("div");
      box.className = "toasts";
      box.setAttribute("role", "status");
      box.setAttribute("aria-live", "polite");
      document.body.appendChild(box);
    }
    const t = document.createElement("div");
    t.className = `toast ${type}`;
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  };

  /* ---------- Socket.IO ---------- */
  App.socket = (rooms, onUpdate) => {
    if (typeof io === "undefined") return null;
    const s = io({ transports: ["websocket", "polling"] });
    const dots = () => App.$$(".live-dot");
    s.on("connect", () => {
      rooms.forEach((r) => s.emit("watch", r));
      dots().forEach((d) => { d.classList.remove("offline"); d.textContent = App.t("live.on", "Live"); });
    });
    s.on("disconnect", () => dots().forEach((d) => { d.classList.add("offline"); d.textContent = App.t("live.off", "Reconnecting…"); }));
    if (onUpdate) s.on("doctor:update", onUpdate);
    return s;
  };

  /* ---------- Header / footer ---------- */
  const LOGO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`;
  App.logo = LOGO;

  App.mountHeader = (active) => {
    const t = App.t;
    const links = [
      ["/", t("nav.home", "Home"), "home"],
      ["/department", t("nav.departments", "Departments"), "departments"],
      ["/book", t("nav.book", "Book token"), "book"],
      ["/track", t("nav.track", "My tokens"), "track"],
      ["/display", t("nav.display", "Display board"), "display"],
    ];
    const el = document.createElement("header");
    el.className = "site-header";
    el.innerHTML = `
      <div class="container">
        <a class="brand" href="/"><span class="brand-mark">${LOGO}</span><span>Anareen Lifecare<small>${t("brand.tag", "Live OP Queue")}</small></span></a>
        <button class="nav-toggle" aria-label="${t("nav.menu", "Menu")}" aria-expanded="false">☰</button>
        <nav class="nav">
          ${links.map(([href, label, key]) => `<a href="${href}" class="${key === active ? "active" : ""}">${label}</a>`).join("")}
          <a class="btn btn-sm" href="/login">${t("nav.staff", "Staff sign in")}</a>
        </nav>
        ${App.i18n ? App.langSwitch() : ""}
      </div>`;
    document.body.prepend(el);
    const toggle = App.$(".nav-toggle", el), nav = App.$(".nav", el);
    toggle.addEventListener("click", () => {
      nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", nav.classList.contains("open"));
    });
  };

  App.mountFooter = () => {
    const f = document.createElement("footer");
    f.className = "site-footer";
    f.innerHTML = `
      <div class="container">
        <div><strong>Anareen Lifecare Hospital</strong><br>${App.t("footer.hours", "Live OP token tracking · Open 8:00 AM – 8:00 PM")}</div>
        <div>📞 +91 98765 43210<br><a href="/display">${App.t("footer.display", "Waiting-hall display")}</a> · <a href="/privacy">${App.t("footer.privacy", "Privacy")}</a> · <a href="/login">${App.t("footer.staff", "Staff portal")}</a></div>
      </div>`;
    document.body.appendChild(f);
  };

  /* ---------- Patient's mobile number, remembered on this device only ---------- */
  const PHONE_KEY = "anareen:phone";
  App.savedPhone = {
    get() { try { return localStorage.getItem(PHONE_KEY) || ""; } catch { return ""; } },
    set(v) { try { localStorage.setItem(PHONE_KEY, v); } catch { /* storage unavailable */ } },
    clear() { try { localStorage.removeItem(PHONE_KEY); } catch { /* ignore */ } },
  };
  App.cleanPhone = (v) => {
    let d = String(v || "").replace(/\D/g, "");
    if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
    if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
    return /^[6-9]\d{9}$/.test(d) ? d : null;
  };
  App.prettyPhone = (d) => (d && d.length === 10 ? `${d.slice(0, 5)} ${d.slice(5)}` : d || "");

  /** Fills a <select> with active doctors grouped by department. */
  App.fillDoctorSelect = async (select, selectedId) => {
    const doctors = await App.api("/api/doctors");
    const groups = {};
    doctors.forEach((d) => (groups[App.deptName(d.department)] ||= []).push(d));
    select.innerHTML =
      `<option value="">${App.esc(App.t("pick.yourDoctor", "Choose your doctor…"))}</option>` +
      Object.entries(groups)
        .map(([dep, ds]) => `<optgroup label="${App.esc(dep)}">${ds.map((d) => `<option value="${d.id}" ${String(d.id) === String(selectedId) ? "selected" : ""}>${App.esc(d.name)}</option>`).join("")}</optgroup>`)
        .join("");
    return doctors;
  };

  window.App = App;
})();
