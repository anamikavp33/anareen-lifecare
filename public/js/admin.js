(async function () {
  const { api, esc, $, $$, run, pill, toast, fmtTime, socket, cleanPhone, prettyPhone } = App;

  const user = await App.requireUser(["admin", "reception"]);
  App.wireStaffChrome(user);
  const isAdmin = user.role === "admin";
  if (!isAdmin) $$(".admin-only").forEach((el) => el.remove());

  $("#today").textContent = new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const TITLES = { overview: "Overview", desk: "Front desk", bookings: "Today's patients", doctors: "Doctors", departments: "Departments", users: "Staff accounts", activity: "Activity log" };
  const loaders = {};
  let currentTab = null;

  function showTab(name) {
    if (!TITLES[name] || !$(`.tab[data-tab="${name}"]`)) name = "overview";
    currentTab = name;
    $$(".tab[data-tab]").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    $$("[data-panel]").forEach((p) => p.classList.toggle("hidden", p.dataset.panel !== name));
    $("#pageTitle").textContent = TITLES[name];
    if (location.hash !== `#${name}`) history.replaceState(null, "", `#${name}`);
    loaders[name]?.();
  }
  $$(".tab[data-tab]").forEach((t) => t.addEventListener("click", () => showTab(t.dataset.tab)));
  window.addEventListener("hashchange", () => { if (location.hash.slice(1) !== currentTab) showTab(location.hash.slice(1)); });

  // Close buttons on every dialog
  $$("dialog [data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));

  /* ================= Overview ================= */
  function bars(el, rows, labelFn) {
    if (!rows.length) return (el.innerHTML = `<div class="empty" style="width:100%">No data yet</div>`);
    const max = Math.max(...rows.map((r) => r.v), 1);
    el.innerHTML = rows
      .map((r) => `<div class="bar" title="${r.v}"><b>${r.v}</b><i style="height:${Math.max(2, (r.v / max) * 100)}%"></i><span>${esc(labelFn(r))}</span></div>`)
      .join("");
  }

  loaders.overview = async () => {
    const s = await run(() => api("/api/admin/stats"));
    if (!s) return;
    $("#tServed").textContent = s.totals.served;
    $("#tIssued").textContent = s.totals.issued;
    $("#tWaiting").textContent = s.totals.waiting;
    $("#tConsulting").textContent = s.totals.consulting;
    $("#tDoctors").textContent = `of ${s.totals.doctors} doctors`;
    $("#tOnline").textContent = s.bookings.online;
    $("#tWalkin").textContent = s.bookings.walkin;
    $("#tNoShow").textContent = s.bookings.noShow;
    $("#tCancelled").textContent = s.bookings.cancelled;
    $("#perfBody").innerHTML = s.doctors
      .map(
        (d) => `<tr><td><strong>${esc(d.name)}</strong><div class="muted small">${esc(d.department)}</div></td>
        <td>${pill(d.status)}</td><td class="num">${d.served}</td><td class="num">${d.waiting}</td>
        <td class="num">${d.avgConsultMin} min${d.avgIsLearned ? "" : ' <span class="muted small">(default)</span>'}</td></tr>`
      )
      .join("");
    const hours = s.hourly.map((h) => ({ v: h.n, h: Number(h.hour) }));
    bars($("#hourly"), hours, (r) => `${((r.h + 11) % 12) + 1}${r.h < 12 ? "a" : "p"}`);
    // fill in missing days so the week reads left to right
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(s.date + "T00:00:00");
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString("en-CA");
      days.push({ v: s.daily.find((x) => x.date === key)?.served || 0, d });
    }
    bars($("#daily"), days, (r) => r.d.toLocaleDateString([], { weekday: "short" }));
  };

  /* ================= Front desk ================= */
  let deskDoctors = [];
  function renderDesk() {
    const q = $("#deskSearch").value.trim().toLowerCase();
    const list = deskDoctors.filter((d) => d.active && (!q || `${d.name} ${d.department.name}`.toLowerCase().includes(q)));
    $("#deskGrid").innerHTML =
      list
        .map(
          (d) => `
        <div class="card desk-card" id="desk-${d.id}">
          <div class="row"><div><strong>${esc(d.name)}</strong><div class="muted small">${esc(d.department.name)}${d.room ? ` · Room ${esc(d.room)}` : ""}</div></div>${pill(d.status, d.resumeTime)}</div>
          <div class="nums">
            <div><strong>${d.currentToken}</strong>serving</div>
            <div><strong>${d.issuedTokens}</strong>issued</div>
            <div><strong>${d.waiting}</strong>waiting</div>
          </div>
          <div class="online-line">${d.online.enabled ? `🌐 Online: ${d.online.used} of ${d.online.limit} booked` : "🌐 Online booking off"}</div>
          <div class="btns">
            <button class="btn btn-sm" data-issue="${d.id}" type="button">+ Issue token</button>
            <button class="btn btn-sm btn-ghost" data-console="${d.id}" type="button">Open console</button>
          </div>
        </div>`
        )
        .join("") || `<div class="card empty">No doctors match.</div>`;
  }
  loaders.desk = async () => {
    deskDoctors = (await run(() => api("/api/admin/doctors"))) || [];
    renderDesk();
  };
  $("#deskSearch").addEventListener("input", renderDesk);
  $("#deskGrid").addEventListener("click", async (e) => {
    const issue = e.target.closest("[data-issue]");
    const con = e.target.closest("[data-console]");
    if (con) location.href = `/doctor?id=${con.dataset.console}`;
    if (!issue) return;
    openIssue(deskDoctors.find((d) => d.id === Number(issue.dataset.issue)));
  });

  let issuing = null;
  function openIssue(d) {
    issuing = d;
    $("#issueTitle").textContent = `Issue token · ${d.name}`;
    $("#issueForm").reset();
    $("#issueErr").textContent = "";
    $("#issueDialog").showModal();
    $("#iName").focus();
  }
  $("#issueForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const rawPhone = $("#iPhone").value.trim();
    const phone = rawPhone ? cleanPhone(rawPhone) : null;
    if (rawPhone && !phone) return ($("#issueErr").textContent = "That mobile number doesn't look right. Leave it empty if the patient has none.");
    const btn = $("#issueSubmit");
    btn.disabled = true;
    try {
      const r = await api(`/api/queue/${issuing.id}/issue`, { method: "POST", body: { name: $("#iName").value.trim() || undefined, phone: phone || undefined, consent: $("#iConsent").checked } });
      $("#issueDialog").close();
      showSlip(r, $("#iName").value.trim(), phone);
    } catch (err) {
      $("#issueErr").textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  function showSlip(r, name, phone) {
    const d = r.doctor;
    const ahead = Math.max(r.token - d.currentToken - 1, 0);
    $("#slipBody").innerHTML = `
      <div class="hosp">Anareen Lifecare Hospital</div>
      <div class="muted small">OP token · ${new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</div>
      <div class="tok">${r.token}</div>
      ${name ? `<div style="font-weight:600">${esc(name)}</div>` : ""}
      <div><strong>${esc(d.name)}</strong></div>
      <div class="meta">${esc(d.department.name)}${d.room ? ` · Room ${esc(d.room)}` : ""}</div>
      <div class="meta" style="margin:8px 0 14px">${ahead} patient${ahead === 1 ? "" : "s"} ahead · about ${(ahead + (d.currentToken ? 1 : 0)) * d.avgConsultMin} min</div>
      <div class="howto" style="text-align:left">
        ${phone
          ? `<strong>Check your turn from your phone</strong><br>Go to our website → <b>My tokens</b> → enter <b>${esc(prettyPhone(phone))}</b>`
          : `<strong>Check your turn</strong><br>Go to our website → <b>My tokens</b> → “Track by token number”, choose ${esc(d.name)} and enter <b>${r.token}</b>`}
        <div class="muted small" style="margin-top:6px">Booking code (to cancel): <b>${r.code}</b></div>
      </div>`;
    $("#slipDialog").showModal();
  }
  $("#printSlip").addEventListener("click", () => window.print());

  /* ================= Today's patients ================= */
  const BSTATUS = { booked: "Booked", arrived: "Arrived", done: "Seen", no_show: "No-show", cancelled: "Cancelled" };
  let bookingRows = [];
  function renderBookings() {
    const doc = $("#bDoctor").value, st = $("#bStatus").value, q = $("#bSearch").value.trim().toLowerCase();
    const rows = bookingRows.filter((b) =>
      (!doc || String(b.doctorId) === doc) && (!st || b.status === st) &&
      (!q || `${b.name || ""} ${b.phone || ""}`.toLowerCase().includes(q)));
    $("#bBody").innerHTML =
      rows
        .map((b) => {
          const acts = [];
          if (b.status === "booked") acts.push(["arrived", "Arrived", "btn-ghost"], ["no_show", "No-show", "btn-ghost"], ["cancelled", "Cancel", "btn-danger"]);
          if (b.status === "arrived") acts.push(["no_show", "No-show", "btn-ghost"], ["cancelled", "Cancel", "btn-danger"]);
          if (b.status === "no_show" || b.status === "cancelled") acts.push(["booked", "Restore", "btn-ghost"]);
          return `<tr>
            <td class="num"><strong style="font-size:1.1rem">${b.token}</strong></td>
            <td>${esc(b.name) || '<span class="muted">—</span>'}</td>
            <td class="num">${b.phone ? esc(prettyPhone(b.phone)) : '<span class="muted">—</span>'}</td>
            <td>${esc(b.doctorName)}<div class="muted small">now at ${b.currentToken}</div></td>
            <td><span class="badge ${b.source}">${b.source === "online" ? "🌐 Online" : "🏥 Desk"}</span></td>
            <td>${b.token === b.currentToken && (b.status === "booked" || b.status === "arrived") ? `<span class="bstat arrived">With doctor</span>` : `<span class="bstat ${b.status}">${BSTATUS[b.status]}</span>`}</td>
            <td class="actions">${acts.map(([v, l, c]) => `<button class="btn btn-sm ${c}" type="button" data-bid="${b.id}" data-bstatus="${v}">${l}</button>`).join("")}</td>
          </tr>`;
        })
        .join("") || `<tr><td colspan="7" class="empty">No patients match.</td></tr>`;
  }
  loaders.bookings = async () => {
    const [rows, docs] = await Promise.all([run(() => api("/api/staff/bookings")), api("/api/doctors").catch(() => [])]);
    bookingRows = rows || [];
    const sel = $("#bDoctor"), keep = sel.value;
    sel.innerHTML = `<option value="">All doctors</option>` + docs.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join("");
    sel.value = keep;
    renderBookings();
  };
  ["#bDoctor", "#bStatus"].forEach((id) => $(id).addEventListener("change", renderBookings));
  $("#bSearch").addEventListener("input", renderBookings);
  $("#bBody").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-bid]");
    if (!b) return;
    if (b.dataset.bstatus === "cancelled" && !confirm("Cancel this token?")) return;
    if (await run(() => api(`/api/staff/bookings/${b.dataset.bid}/status`, { method: "POST", body: { status: b.dataset.bstatus } }))) loaders.bookings();
  });

  /* ================= Doctors ================= */
  let departments = [];
  let doctorsAll = [];
  let editingDoctor = null;

  async function loadDepartmentsList() {
    departments = (await run(() => api("/api/admin/departments"))) || [];
    return departments;
  }

  loaders.doctors = async () => {
    await loadDepartmentsList();
    doctorsAll = (await run(() => api("/api/admin/doctors"))) || [];
    $("#docBody").innerHTML =
      doctorsAll
        .map(
          (d) => `<tr>
          <td><strong>${esc(d.name)}</strong><div class="muted small">${esc(d.designation)}</div></td>
          <td>${esc(d.department.icon)} ${esc(d.department.name)}</td>
          <td>${esc(d.room) || "—"}</td>
          <td>${d.username ? `<code>${esc(d.username)}</code>` : '<span class="muted">none</span>'}</td>
          <td>${d.active ? "Yes" : '<span class="muted">Hidden</span>'}</td>
          <td class="actions"><button class="btn btn-sm btn-ghost" data-edit="${d.id}" type="button">Edit</button><button class="btn btn-sm btn-danger" data-del="${d.id}" type="button">Delete</button></td>
        </tr>`
        )
        .join("") || `<tr><td colspan="6" class="empty">No doctors yet.</td></tr>`;
  };

  function openDoctor(d) {
    editingDoctor = d || null;
    $("#docDialogTitle").textContent = d ? `Edit ${d.name}` : "Add doctor";
    $("#fDept").innerHTML = departments.map((x) => `<option value="${x.id}">${esc(x.icon)} ${esc(x.name)}</option>`).join("");
    $("#fName").value = d?.name || "";
    $("#fDept").value = d?.department.id || departments[0]?.id || "";
    $("#fRoom").value = d?.room || "";
    $("#fDesig").value = d?.designation || "";
    $("#fAvg").value = d?.defaultConsultMin ?? 10;
    $("#fActive").value = d && !d.active ? "0" : "1";
    $("#fOnline").value = d && !d.online.enabled ? "0" : "1";
    $("#fLimit").value = d ? d.online.limit : 20;
    $("#fUser").value = "";
    $("#fPass").value = "";
    $("#loginFields").classList.toggle("hidden", !!d);
    $("#docErr").textContent = "";
    $("#docDialog").showModal();
    $("#fName").focus();
  }
  $("#addDoctor")?.addEventListener("click", async () => { await loadDepartmentsList(); openDoctor(null); });
  $("#docBody")?.addEventListener("click", async (e) => {
    const ed = e.target.closest("[data-edit]"), del = e.target.closest("[data-del]");
    if (ed) openDoctor(doctorsAll.find((d) => d.id === Number(ed.dataset.edit)));
    if (del) {
      const d = doctorsAll.find((x) => x.id === Number(del.dataset.del));
      if (!confirm(`Delete ${d.name}? Their login and token history will also be removed. To keep history, edit and hide them instead.`)) return;
      if (await run(() => api(`/api/admin/doctors/${d.id}`, { method: "DELETE" }), "Doctor deleted")) loaders.doctors();
    }
  });
  $("#docForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = {
      name: $("#fName").value,
      departmentId: Number($("#fDept").value),
      room: $("#fRoom").value,
      designation: $("#fDesig").value,
      avgConsultMin: Number($("#fAvg").value),
      active: $("#fActive").value === "1",
      onlineEnabled: $("#fOnline").value === "1",
      onlineLimit: Number($("#fLimit").value),
    };
    if (!editingDoctor && $("#fUser").value.trim()) {
      body.username = $("#fUser").value.trim();
      body.password = $("#fPass").value;
    }
    try {
      if (editingDoctor) await api(`/api/admin/doctors/${editingDoctor.id}`, { method: "PUT", body });
      else await api("/api/admin/doctors", { method: "POST", body });
      $("#docDialog").close();
      toast("Saved", "ok");
      loaders.doctors();
    } catch (err) {
      $("#docErr").textContent = err.message;
    }
  });

  /* ================= Departments ================= */
  let editingDept = null;
  loaders.departments = async () => {
    await loadDepartmentsList();
    const counts = {};
    ((await api("/api/departments").catch(() => [])) || []).forEach((d) => (counts[d.id] = d.doctorCount));
    $("#deptBody").innerHTML = departments
      .map(
        (d) => `<tr><td style="font-size:1.4rem;width:50px">${esc(d.icon)}</td>
        <td><strong>${esc(d.name)}</strong><div class="muted small">${counts[d.id] || 0} active doctor(s)</div></td>
        <td class="muted">${esc(d.description)}</td>
        <td class="actions"><button class="btn btn-sm btn-ghost" data-edit="${d.id}" type="button">Edit</button><button class="btn btn-sm btn-danger" data-del="${d.id}" type="button">Delete</button></td></tr>`
      )
      .join("");
  };
  function openDept(d) {
    editingDept = d || null;
    $("#deptDialogTitle").textContent = d ? `Edit ${d.name}` : "Add department";
    $("#gIcon").value = d?.icon || "🏥";
    $("#gName").value = d?.name || "";
    $("#gDesc").value = d?.description || "";
    $("#deptErr").textContent = "";
    $("#deptDialog").showModal();
  }
  $("#addDept")?.addEventListener("click", () => openDept(null));
  $("#deptBody")?.addEventListener("click", async (e) => {
    const ed = e.target.closest("[data-edit]"), del = e.target.closest("[data-del]");
    if (ed) openDept(departments.find((d) => d.id === Number(ed.dataset.edit)));
    if (del) {
      const d = departments.find((x) => x.id === Number(del.dataset.del));
      if (!confirm(`Delete the ${d.name} department?`)) return;
      if (await run(() => api(`/api/admin/departments/${d.id}`, { method: "DELETE" }), "Department deleted")) loaders.departments();
    }
  });
  $("#deptForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = { icon: $("#gIcon").value, name: $("#gName").value, description: $("#gDesc").value };
    try {
      if (editingDept) await api(`/api/admin/departments/${editingDept.id}`, { method: "PUT", body });
      else await api("/api/admin/departments", { method: "POST", body });
      $("#deptDialog").close();
      toast("Saved", "ok");
      loaders.departments();
    } catch (err) {
      $("#deptErr").textContent = err.message;
    }
  });

  /* ================= Users ================= */
  let users = [];
  loaders.users = async () => {
    users = (await run(() => api("/api/admin/users"))) || [];
    $("#userBody").innerHTML = users
      .map(
        (u) => `<tr><td><code>${esc(u.username)}</code>${u.id === user.id ? ' <span class="muted small">(you)</span>' : ""}</td>
        <td>${esc(u.role)}</td><td>${esc(u.doctorName) || "—"}</td><td class="muted small">${fmtTime(u.createdAt)} · ${new Date(u.createdAt.replace(" ", "T") + "Z").toLocaleDateString()}</td>
        <td class="actions"><button class="btn btn-sm btn-ghost" data-pw="${u.id}" type="button">Reset password</button>${u.id === user.id ? "" : `<button class="btn btn-sm btn-danger" data-del="${u.id}" type="button">Delete</button>`}</td></tr>`
      )
      .join("");
  };
  $("#uRole")?.addEventListener("change", () => $("#uDocWrap").classList.toggle("hidden", $("#uRole").value !== "doctor"));
  $("#addUser")?.addEventListener("click", async () => {
    const docs = (await api("/api/admin/doctors").catch(() => [])) || [];
    $("#uDoc").innerHTML = docs.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join("");
    $("#userForm").reset();
    $("#uDocWrap").classList.add("hidden");
    $("#userErr").textContent = "";
    $("#userDialog").showModal();
  });
  $("#userForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = { username: $("#uName").value.trim(), password: $("#uPass").value, role: $("#uRole").value };
    if (body.role === "doctor") body.doctorId = Number($("#uDoc").value);
    try {
      await api("/api/admin/users", { method: "POST", body });
      $("#userDialog").close();
      toast("Account created", "ok");
      loaders.users();
    } catch (err) {
      $("#userErr").textContent = err.message;
    }
  });
  $("#userBody")?.addEventListener("click", async (e) => {
    const pw = e.target.closest("[data-pw]"), del = e.target.closest("[data-del]");
    if (pw) {
      const u = users.find((x) => x.id === Number(pw.dataset.pw));
      const p = prompt(`New password for ${u.username} (min 8 characters):`);
      if (p) await run(() => api(`/api/admin/users/${u.id}/password`, { method: "POST", body: { password: p } }), "Password reset");
    }
    if (del) {
      const u = users.find((x) => x.id === Number(del.dataset.del));
      if (confirm(`Delete the account ${u.username}?`) && (await run(() => api(`/api/admin/users/${u.id}`, { method: "DELETE" }), "Account deleted"))) loaders.users();
    }
  });

  /* ================= Activity ================= */
  loaders.activity = async () => {
    const rows = (await run(() => api("/api/admin/audit?limit=150"))) || [];
    $("#auditBody").innerHTML =
      rows
        .map(
          (r) => `<tr><td class="muted small num" style="white-space:nowrap">${new Date(r.at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</td>
          <td>${esc(r.username) || "—"}</td><td><code>${esc(r.action)}</code></td><td>${esc(r.detail)}</td></tr>`
        )
        .join("") || `<tr><td colspan="4" class="empty">No activity yet.</td></tr>`;
  };
  $("#refreshAudit")?.addEventListener("click", () => loaders.activity());

  /* ================= Live updates ================= */
  let pending;
  const s = socket(["all"], ({ doctor }) => {
    const i = deskDoctors.findIndex((d) => d.id === doctor.id);
    if (i >= 0) { deskDoctors[i] = { ...deskDoctors[i], ...doctor }; if (currentTab === "desk") renderDesk(); }
    if (currentTab === "overview" || currentTab === "bookings") { clearTimeout(pending); pending = setTimeout(loaders[currentTab], 400); }
  });
  s?.on("structure:changed", () => loaders[currentTab]?.());

  showTab(location.hash.slice(1) || "overview");
  if (currentTab !== "desk") loaders.desk(); // keep desk data warm for live updates
})();
