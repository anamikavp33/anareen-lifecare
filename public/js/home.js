(async function () {
  const { api, esc, $, t, mountHeader, mountFooter, socket, cleanPhone, prettyPhone, savedPhone, deptName, deptDesc } = App;
  mountHeader("home");
  mountFooter();

  async function loadSummary() {
    try {
      const s = await api("/api/summary");
      $("#sConsulting").textContent = s.consulting;
      $("#sWaiting").textContent = s.waiting;
      $("#sServed").textContent = s.served;
    } catch { /* keep dashes */ }
  }

  async function loadDepartments() {
    const grid = $("#deptGrid");
    try {
      const deps = await api("/api/departments");
      grid.innerHTML = deps
        .map(
          (d) => `
          <a class="card dept-card" href="/department?d=${encodeURIComponent(d.slug)}">
            <span class="dept-icon" aria-hidden="true">${esc(d.icon)}</span>
            <span>
              <h3>${esc(deptName(d))}</h3>
              <p>${esc(deptDesc(d))}</p>
              <span class="dept-meta">${esc(t("count.doctors", `${d.doctorCount} doctor${d.doctorCount === 1 ? "" : "s"}`, { n: d.doctorCount }))} →</span>
            </span>
          </a>`
        )
        .join("");
    } catch (e) {
      grid.innerHTML = `<div class="card empty">${esc(t("home.deptsFailed", "Couldn't load departments."))} ${esc(e.message)}</div>`;
    }
  }

  if (savedPhone.get()) $("#phone").value = prettyPhone(savedPhone.get());
  $("#trackForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const p = cleanPhone($("#phone").value);
    if (!p) return ($("#trackErr").textContent = t("err.phone", "Please enter a valid 10-digit mobile number."));
    savedPhone.set(p);
    location.href = "/track";
  });

  loadSummary();
  loadDepartments();
  let timer;
  socket(["all"], () => { clearTimeout(timer); timer = setTimeout(loadSummary, 300); }).on("structure:changed", loadDepartments);
})();
