(async function () {
  const { api, esc, $, t, tError, minutes, mountHeader, mountFooter, fillDoctorSelect, socket, time12, toast, cleanPhone, prettyPhone, savedPhone, room: roomLabel, deptName } = App;
  mountHeader("track");
  mountFooter();

  let mode = null; // "phone" or "token"
  let phone = null;
  let single = null; // { doctorId, token } in token mode
  let sock = null;
  const watched = new Set();
  let alertsOn = false;
  const alerted = new Set();

  /* ---------- Alerts ---------- */
  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25].forEach((t) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.2, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
        o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + t);
        o.stop(ctx.currentTime + t + 0.2);
      });
    } catch { /* audio not available */ }
  }
  function alertPatient(key, text) {
    if (!alertsOn || alerted.has(key)) return;
    alerted.add(key);
    beep();
    navigator.vibrate?.([300, 150, 300]);
    if ("Notification" in window && Notification.permission === "granted") new Notification("Anareen Lifecare", { body: text, icon: "/img/favicon.svg" });
    toast(text, "ok");
  }
  $("#notifyBtn").addEventListener("click", async () => {
    alertsOn = !alertsOn;
    alerted.clear();
    if (alertsOn && "Notification" in window && Notification.permission === "default") {
      try { await Notification.requestPermission(); } catch { /* ignore */ }
    }
    $("#notifyBtn").textContent = alertsOn ? t("track.alertOn", "🔕 Alerts on (tap to turn off)") : t("track.alertBtn", "🔔 Alert me when I'm next");
    if (alertsOn) toast(t("track.alertToast", "We'll alert you when you're one patient away. Keep this page open."));
    refresh();
  });

  /* ---------- One ticket ---------- */
  function message(tk) {
    const d = tk.doctor;
    const key = `${d.id}:${tk.token}`;
    const v = { t: tk.token, room: d.room, n: tk.ahead, time: time12(d.resumeTime) };
    // With a room number the Malayalam needs a different sentence, so it has its own key.
    const inRoom = (k) => (d.room ? `${k}Room` : k);
    const where = d.room ? `Room ${d.room}` : "the consultation room";
    if (tk.state === "cancelled") return ["passed", "🚫", t("track.cancelled", "This token was cancelled.")];
    if (tk.state === "no_show") return ["passed", "⚠️", t("track.noShow", "This token was marked as not present. Please speak to the reception desk.")];
    if (tk.state === "passed") return ["passed", "✔️", t("track.passed", "Your token has been called. If you missed it, please speak to the reception desk.")];
    if (d.status !== "consulting") {
      const when = d.resumeTime ? ` around ${time12(d.resumeTime)}` : "";
      return ["paused", d.status === "break" ? "☕" : "🕒", d.status === "break"
        ? t(d.resumeTime ? "track.breakAt" : "track.break", `The doctor is on a short break and will be back${when || " soon"}.`, v)
        : t(d.resumeTime ? "track.notStartedAt" : "track.notStarted", `The doctor hasn't started consultations yet${when ? `. Expected${when}` : ""}.`, v)];
    }
    if (tk.state === "now") {
      alertPatient(key, t(inRoom("track.alertNow"), `Token ${tk.token}: it's your turn now. Please go to ${where}.`, v));
      return ["now", "✅", t(inRoom("track.now"), `It's your turn! Please go to ${where}.`, v)];
    }
    if (tk.ahead === 0) {
      alertPatient(key, t(inRoom("track.alertNext"), `Token ${tk.token}: you're next. Please be near ${where}.`, v));
      return ["now", "🔜", t("track.next", "You're next! Please be near the consultation room.")];
    }
    if (tk.ahead === 1) alertPatient(key, t("track.alertOne", `Token ${tk.token}: only 1 patient ahead of you.`, v));
    return ["waiting", "⏳", t("track.waiting", `${tk.ahead} patient${tk.ahead === 1 ? "" : "s"} ahead of you. You can relax and come in time.`, v)];
  }

  function ticket(tk) {
    const d = tk.doctor;
    const [cls, ico, text] = message(tk);
    const pct = tk.state === "waiting" ? Math.min(100, Math.round((d.currentToken / tk.token) * 100)) : 100;
    const canCancel = tk.bookingId && tk.state === "waiting";
    return `
      <article class="card ticket" data-booking="${tk.bookingId || ""}">
        <div class="ticket-head">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:start">
            <div><h2>${esc(d.name)}</h2><p>${esc(d.department.icon)} ${esc(deptName(d.department))}${d.room ? ` · ${esc(roomLabel(d.room))}` : ""}</p></div>
            ${tk.source ? `<span class="badge ${tk.source}">${tk.source === "online" ? t("track.online", "🌐 Booked online") : t("track.walkin", "🏥 At reception")}</span>` : ""}
          </div>
          ${tk.patient ? `<p style="margin-top:6px">${esc(t("track.patient", `Patient: ${tk.patient}`, { name: tk.patient }))}</p>` : ""}
        </div>
        <div class="ticket-body">
          <div class="ticket-nums">
            <div class="ticket-num mine"><div class="label">${t("yourToken", "Your token")}</div><div class="value">${tk.token}</div></div>
            <div class="ticket-num"><div class="label">${t("nowServing", "Now serving")}</div><div class="value" aria-live="polite">${d.currentToken || "–"}</div></div>
          </div>
          <div class="progress" aria-hidden="true"><span style="width:${pct}%"></span></div>
          <div class="ticket-msg ${cls}" role="status"><span class="ico">${ico}</span><span>${esc(text)}</span></div>
          ${tk.state === "waiting" ? `
          <div class="ticket-facts">
            <div><strong>${tk.ahead}</strong><span>${t("ahead", "patients ahead")}</span></div>
            <div><strong>${minutes(tk.etaMin)}</strong><span>${t("eta", "estimated wait")}</span></div>
            <div><strong>${t("track.minutes", `${d.avgConsultMin} min`, { m: d.avgConsultMin })}</strong><span>${t("track.perPatient", "per patient")}</span></div>
          </div>` : ""}
          ${canCancel ? `
          <details class="cancel-box">
            <summary>${t("track.cancelSum", "Can't come? Cancel this token")}</summary>
            <div class="cancel-row">
              <input type="text" inputmode="numeric" maxlength="4" placeholder="${t("track.codePh", "4-digit booking code")}" aria-label="${t("book.code", "Booking code")}">
              <button class="btn btn-danger btn-sm" type="button" data-cancel="${tk.bookingId}">${t("track.cancelBtn", "Cancel token")}</button>
            </div>
            <p class="muted small" style="margin:6px 0 0">${t("track.codeHint", "The code was shown when you booked, or printed on your slip.")}</p>
          </details>` : ""}
        </div>
      </article>`;
  }

  /* ---------- Loading ---------- */
  function watch(ids) {
    if (!sock) {
      sock = socket([], () => { clearTimeout(watch.t); watch.t = setTimeout(refresh, 250); });
      sock?.on("connect", () => watched.forEach((id) => sock.emit("watch", `doctor:${id}`)));
    }
    ids.forEach((id) => {
      if (!watched.has(id)) {
        watched.add(id);
        sock?.connected && sock.emit("watch", `doctor:${id}`);
      }
    });
  }

  async function refresh() {
    try {
      let list;
      if (mode === "phone") list = await api(`/api/my-tokens?phone=${phone}`);
      else list = [await api(`/api/track?doctorId=${single.doctorId}&token=${single.token}`)];
      watch(list.map((tk) => tk.doctor.id));
      // keep any half-typed cancel code
      const open = [...document.querySelectorAll(".cancel-box[open]")].map((b) => [b.closest("[data-booking]").dataset.booking, b.querySelector("input").value]);
      $("#tickets").innerHTML = list.length
        ? list.map(ticket).join("")
        : `<div class="card empty card-pad">
             <p><strong>${t("track.none", "No tokens for this number today.")}</strong></p>
             <p class="muted">${t("track.noneHint", "Check the number, or book a token now.")}</p>
             <a class="btn" href="/book">${t("track.bookBtn", "Book a token")}</a>
           </div>`;
      open.forEach(([id, val]) => {
        const box = document.querySelector(`[data-booking="${id}"] .cancel-box`);
        if (box) { box.open = true; box.querySelector("input").value = val; }
      });
      const next = list.filter((tk) => tk.state === "waiting" || tk.state === "now").sort((a, b) => a.ahead - b.ahead)[0];
      document.title = !next
        ? t("track.title", "My tokens · Anareen Lifecare")
        : next.state === "now"
          ? t("track.docTurn", `Token ${next.token} · Your turn!`, { t: next.token })
          : t("track.docAhead", `Token ${next.token} · ${next.ahead} ahead`, { t: next.token, n: next.ahead });
    } catch (e) {
      $("#tickets").innerHTML = `<div class="card empty">${esc(tError(e.message))}</div>`;
    }
  }

  function showResults() {
    $("#phoneForm").classList.add("hidden");
    $("#results").classList.remove("hidden");
    const masked = phone && prettyPhone(phone).replace(/^(\d{2})\d{3}/, "$1•••");
    $("#forWho").textContent = mode === "phone" ? t("track.forPhone", `Today's tokens for ${masked}`, { phone: masked }) : t("track.one", "Tracking one token");
    $("#changeBtn").textContent = mode === "phone" ? t("track.change", "Change number") : t("track.another", "Track another");
    refresh();
  }

  $("#changeBtn").addEventListener("click", () => {
    if (mode === "phone") savedPhone.clear();
    location.href = "/track";
  });

  $("#tickets").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-cancel]");
    if (!btn) return;
    const code = btn.parentElement.querySelector("input").value.trim();
    if (!/^\d{4}$/.test(code)) return toast(t("track.errCode", "Enter the 4-digit booking code"), "error");
    if (!confirm(t("track.confirm", "Cancel this token? You'll need to book again if you change your mind."))) return;
    btn.disabled = true;
    try {
      await api(`/api/bookings/${btn.dataset.cancel}/cancel`, { method: "POST", body: { phone, code } });
      toast(t("track.cancelledToast", "Your token was cancelled"), "ok");
      refresh();
    } catch (err) {
      toast(tError(err.message), "error");
      btn.disabled = false;
    }
  });

  /* ---------- Entry points ---------- */
  const qDoctor = Number(App.qs("doctor")), qToken = Number(App.qs("token"));
  if (qDoctor && qToken) {
    mode = "token";
    single = { doctorId: qDoctor, token: qToken };
    return showResults();
  }

  const remembered = savedPhone.get();
  if (remembered) {
    mode = "phone";
    phone = remembered;
    return showResults();
  }

  fillDoctorSelect($("#doctor")).catch(() => {});
  $("#phone").focus();
  $("#phoneForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const p = cleanPhone($("#phone").value);
    if (!p) return ($("#err").textContent = t("err.phone", "Please enter a valid 10-digit mobile number."));
    if ($("#remember").checked) savedPhone.set(p);
    mode = "phone";
    phone = p;
    showResults();
  });
  $("#tokenBtn").addEventListener("click", () => {
    const d = Number($("#doctor").value), token = Number($("#token").value);
    if (!d) return ($("#err").textContent = t("track.errDoctor", "Please choose the doctor."));
    if (!Number.isInteger(token) || token < 1) return ($("#err").textContent = t("track.errToken", "Please enter your token number."));
    mode = "token";
    single = { doctorId: d, token };
    showResults();
  });
})();
