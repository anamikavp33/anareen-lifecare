(async function () {
  const { api, esc, $, $$, run, fmtTime, socket } = App;

  const user = await App.requireUser(["doctor", "admin", "reception"]);
  App.wireStaffChrome(user);

  // Doctors control their own queue. Staff can open /doctor?id=N for any doctor.
  const doctorId = user.role === "doctor" ? user.doctorId : Number(App.qs("id"));
  if (!doctorId) return location.replace("/admin");
  if (user.role !== "doctor") $("#backAdmin").classList.remove("hidden");
  $("#backAdmin").addEventListener("click", () => (location.href = "/admin#desk"));

  let doctor = null;
  const ACTION = {
    next: (e) => `Called token ${e.token}${e.detail ? ` (${e.detail})` : ""}`,
    previous: (e) => `Went back to token ${e.token}`,
    set: (e) => `Jumped to token ${e.token}`,
    issue: (e) => `Token ${e.token} issued at reception${e.detail && e.detail.includes("·") ? ` (${e.detail.split("· ")[1]})` : ""}`,
    book: (e) => `Token ${e.token} booked online${e.detail ? ` (${e.detail.split("· ")[1] || ""})` : ""}`,
    cancel: (e) => `Token ${e.token} cancelled${e.detail ? ` ${e.detail}` : ""}`,
    arrived: (e) => `Token ${e.token} arrived`,
    no_show: (e) => `Token ${e.token} marked not present`,
    reset: () => "Queue reset",
    status: (e) => `Status: ${e.detail}`,
  };

  function render(d) {
    doctor = d;
    $("#docName").textContent = d.name;
    $("#docMeta").textContent = `${d.department.icon} ${d.department.name}${d.room ? ` · Room ${d.room}` : ""} · ${d.designation}`;
    $("#current").textContent = d.currentToken;
    $("#waiting").textContent = d.waiting;
    $("#issued").textContent = d.issuedTokens;
    $("#prevBtn").disabled = d.currentToken <= 0;
    $$(".seg button").forEach((b) => b.classList.toggle("on", b.dataset.status === d.status));
    $("#resume").value = d.resumeTime || "";
    $("#avgInfo").textContent = d.avgIsLearned
      ? `Average today: ${d.avgConsultMin} min per patient`
      : `Using default ${d.avgConsultMin} min per patient until there's enough data`;
    document.title = `${d.currentToken} · ${d.name}`;
  }

  async function loadUpcoming() {
    const rows = await api(`/api/queue/${doctorId}/upcoming`).catch(() => []);
    $("#upnext").innerHTML = rows.length
      ? rows
          .map(
            (b) => `<li>
              <span class="tk">${b.token}</span>
              <span class="nm">${esc(b.name || "Walk-in patient")}<small>${b.source === "online" ? "🌐 Booked online" : "🏥 Reception"}${b.status === "arrived" ? " · ✅ arrived" : ""}${doctor && b.token === doctor.currentToken ? " · with you now" : ""}</small></span>
              ${doctor && b.token === doctor.currentToken ? "" : `${b.status === "booked" ? `<button class="btn btn-sm btn-ghost" data-bid="${b.id}" data-st="arrived" type="button">Arrived</button>` : ""}<button class="btn btn-sm btn-ghost" data-bid="${b.id}" data-st="no_show" type="button">Not here</button>`}
            </li>`
          )
          .join("")
      : `<li class="muted">No booked patients waiting.</li>`;
  }
  $("#upnext").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-bid]");
    if (!b) return;
    const r = await run(() => api(`/api/staff/bookings/${b.dataset.bid}/status`, { method: "POST", body: { status: b.dataset.st } }));
    if (r) { render(r.doctor); loadUpcoming(); loadHistory(); }
  });

  async function loadHistory() {
    const rows = await api(`/api/queue/${doctorId}/history`).catch(() => []);
    $("#history").innerHTML = rows.length
      ? rows.map((e) => `<li><span>${esc((ACTION[e.action] || (() => e.action))(e))}${e.username ? ` <span class="muted small">by ${esc(e.username)}</span>` : ""}</span><time>${fmtTime(e.at)}</time></li>`).join("")
      : `<li class="muted">Nothing yet today. Press “Call next patient” to begin.</li>`;
  }

  async function act(path, body) {
    const r = await run(() => api(`/api/queue/${doctorId}/${path}`, { method: "POST", body }));
    if (r) { render(r.doctor); loadHistory(); loadUpcoming(); }
    return r;
  }

  $("#nextBtn").addEventListener("click", () => act("next"));
  $("#prevBtn").addEventListener("click", () => act("previous"));
  $("#setForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = Number($("#setValue").value);
    act("set", { token: v }).then((r) => r && ($("#setValue").value = ""));
  });
  $("#resetBtn").addEventListener("click", () => {
    if (confirm("Reset today's queue to token 0? This also deletes today's bookings for you, including online ones. This can't be undone.")) act("reset");
  });
  $$(".seg button").forEach((b) =>
    b.addEventListener("click", () => act("status", { status: b.dataset.status, resumeTime: $("#resume").value || undefined }))
  );
  $("#resume").addEventListener("change", () => {
    if (doctor && doctor.status !== "consulting") act("status", { status: doctor.status, resumeTime: $("#resume").value || undefined });
  });
  $("#openDisplay").addEventListener("click", () => window.open(`/display?d=${doctor?.department.slug || ""}`, "_blank"));

  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea, select, dialog") || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "n" || e.key === "N" || e.key === " ") { e.preventDefault(); act("next"); }
    if (e.key === "p" || e.key === "P") { e.preventDefault(); if (doctor?.currentToken > 0) act("previous"); }
  });

  try {
    render(await api(`/api/doctors/${doctorId}`));
  } catch (e) {
    $("#docName").textContent = e.message;
    return;
  }
  loadHistory();
  loadUpcoming();

  // Reception may issue tokens or change things from another screen.
  socket([`doctor:${doctorId}`], ({ doctor: d }) => { render(d); loadHistory(); loadUpcoming(); });
})();
