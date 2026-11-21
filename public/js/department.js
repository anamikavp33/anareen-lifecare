(async function () {
  const { api, esc, $, t, pill, initials, minutes, mountHeader, mountFooter, socket, room: roomLabel, deptName, deptDesc } = App;
  mountHeader("departments");
  mountFooter();

  const slug = App.qs("d");
  const doctors = new Map();
  const bookingNote = (d) => t(`note.${d.online.reason}`, d.online.note || "", d.online.hours);

  function card(d) {
    const wait = d.status === "consulting" ? minutes(d.waiting * d.avgConsultMin) : "—";
    return `
      <article class="card doctor-card" id="doc-${d.id}">
        <div class="doctor-top">
          <div class="avatar" aria-hidden="true">${esc(initials(d.name))}</div>
          <div>
            <h3>${esc(d.name)}</h3>
            <p>${esc(d.designation)}${d.room ? ` · ${esc(roomLabel(d.room))}` : ""}</p>
          </div>
        </div>
        <div class="doctor-stats">
          <div><div class="label">${t("nowServing", "Now serving")}</div><div class="value big" aria-live="polite">${d.currentToken || "–"}</div></div>
          <div><div class="label">${t("dept.inQueue", "In queue")}</div><div class="value">${d.waiting}</div></div>
          <div><div class="label">${t("dept.wait", "Est. wait")}</div><div class="value" style="font-size:1rem;padding-top:.35rem">${wait}</div></div>
        </div>
        <div class="doctor-foot">
          ${pill(d.status, d.resumeTime)}
          ${d.online.open
            ? `<a class="btn btn-sm" href="/book?doctor=${d.id}">${t("dept.book", "Book token")}</a>`
            : `<span class="online-line" title="${esc(bookingNote(d))}">${t("dept.atReception", "Book at reception")}</span>`}
        </div>
        ${d.online.open ? `<div class="online-line">${t("dept.onlineLeft", `🌐 ${d.online.left} of ${d.online.limit} online tokens left today`, d.online)}</div>` : ""}
      </article>`;
  }

  function render() {
    const list = [...doctors.values()];
    $("#doctorCount").textContent = t("count.doctors", `${list.length} doctor${list.length === 1 ? "" : "s"}`, { n: list.length });
    $("#doctorGrid").innerHTML = list.length
      ? list.map(card).join("")
      : `<div class="card empty">${t("dept.empty", "No doctors are listed in this department yet.")}</div>`;
  }

  async function loadSidebar() {
    const deps = await api("/api/departments");
    $("#deptList").innerHTML =
      `<li><a href="/department" class="${slug ? "" : "active"}">🏥 ${t("allDepartments", "All departments")}</a></li>` +
      deps
        .map(
          (d) => `<li><a href="/department?d=${encodeURIComponent(d.slug)}" class="${d.slug === slug ? "active" : ""}">
            <span aria-hidden="true">${esc(d.icon)}</span> ${esc(deptName(d))} <span class="count">${d.doctorCount}</span></a></li>`
        )
        .join("");
  }

  async function load() {
    let list;
    if (slug) {
      try {
        const dep = await api(`/api/departments/${encodeURIComponent(slug)}`);
        $("#deptIcon").textContent = dep.icon;
        $("#deptName").textContent = deptName(dep);
        $("#deptDesc").textContent = deptDesc(dep) || t("dept.leadOne", "Live token status for this department.");
        document.title = `${deptName(dep)} · Anareen Lifecare`;
        list = dep.doctors;
        room = `department:${dep.id}`;
      } catch (e) {
        $("#deptName").textContent = t("dept.notFound", "Department not found");
        $("#deptDesc").innerHTML = `<a href="/department">${t("dept.seeAll", "See all departments")}</a>`;
        $("#doctorGrid").innerHTML = "";
        return;
      }
    } else {
      list = await api("/api/doctors");
    }
    doctors.clear();
    list.forEach((d) => doctors.set(d.id, d));
    render();
  }

  let room = "all";
  await Promise.all([loadSidebar(), load()]);

  const s = socket([room], ({ doctor }) => {
    if (slug && doctor.department.slug !== slug) return;
    const before = doctors.get(doctor.id);
    if (!doctor.active) doctors.delete(doctor.id);
    else doctors.set(doctor.id, doctor);
    render();
    if (before && before.currentToken !== doctor.currentToken) $(`#doc-${doctor.id}`)?.classList.add("flash");
  });
  s?.on("structure:changed", () => { loadSidebar(); load(); });
})();
