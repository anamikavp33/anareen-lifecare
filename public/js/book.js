(async function () {
  const { api, esc, $, t, tError, pill, minutes, mountHeader, mountFooter, cleanPhone, prettyPhone, savedPhone, room: roomLabel, deptName } = App;
  mountHeader("book");
  mountFooter();

  const preselect = Number(App.qs("doctor")) || null;
  let doctors = [];

  const depSel = $("#dept"), docSel = $("#doctor");
  const bookingNote = (d) => t(`note.${d.online.reason}`, d.online.note || "", d.online.hours);

  function fillDoctors(slug) {
    const list = doctors.filter((d) => d.department.slug === slug);
    docSel.disabled = !list.length;
    docSel.innerHTML = list.length
      ? `<option value="">${t("pick.doctor", "Choose a doctor…")}</option>` +
        list.map((d) => `<option value="${d.id}" ${d.online.open ? "" : "disabled"}>${esc(d.name)} (${d.online.open ? t("book.left", `${d.online.left} online tokens left`, { n: d.online.left }) : t("book.notOnline", "not bookable online")})</option>`).join("")
      : `<option>${t("book.noDoctors", "No doctors in this department")}</option>`;
    preview();
  }

  function preview() {
    const d = doctors.find((x) => String(x.id) === docSel.value);
    const box = $("#docPreview");
    if (!d) return box.classList.add("hidden");
    box.classList.remove("hidden");
    box.innerHTML = `
      <div><strong>${esc(d.name)}</strong> <span class="muted small">${esc(d.designation)}${d.room ? ` · ${esc(roomLabel(d.room))}` : ""}</span></div>
      <div class="row">${pill(d.status, d.resumeTime)}<span class="muted small">${t("book.preview", `Now serving <b>${d.currentToken || "–"}</b> · ${d.waiting} waiting · ~${d.avgConsultMin} min each`, { cur: d.currentToken || "–", w: d.waiting, m: d.avgConsultMin })}</span></div>
      ${d.online.open ? "" : `<div class="form-error" style="min-height:0">${esc(bookingNote(d))}</div>`}`;
  }

  try {
    const [deps, docs] = await Promise.all([api("/api/departments"), api("/api/doctors")]);
    doctors = docs;
    depSel.innerHTML = `<option value="">${t("pick.department", "Choose a department…")}</option>` + deps.map((d) => `<option value="${esc(d.slug)}">${esc(d.icon)} ${esc(deptName(d))}</option>`).join("");
    const pre = doctors.find((d) => d.id === preselect);
    if (pre) {
      depSel.value = pre.department.slug;
      fillDoctors(pre.department.slug);
      docSel.value = String(pre.id);
      preview();
    }
  } catch (e) {
    $("#err").textContent = t("book.loadFailed", `Couldn't load doctors: ${e.message}`, { msg: e.message });
  }
  depSel.addEventListener("change", () => fillDoctors(depSel.value));
  docSel.addEventListener("change", preview);
  const remembered = savedPhone.get();
  if (remembered) $("#phone").value = prettyPhone(remembered);

  $("#form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#err");
    err.textContent = "";
    const doctorId = Number(docSel.value);
    const name = $("#name").value.trim();
    const phone = cleanPhone($("#phone").value);
    const consent = $("#consent").checked;
    if (!doctorId) return (err.textContent = t("book.errDoctor", "Please choose a doctor."));
    if (name.length < 2) return (err.textContent = t("book.errName", "Please enter the patient's name."));
    if (!phone) return (err.textContent = t("err.phone", "Please enter a valid 10-digit mobile number."));
    if (!consent) return (err.textContent = t("book.errConsent", "Please tick the box to agree to the privacy notice before booking."));

    const btn = $("#submitBtn");
    btn.disabled = true;
    btn.textContent = t("book.booking", "Booking…");
    try {
      const r = await api("/api/book", { method: "POST", body: { doctorId, name, phone, consent } });
      savedPhone.set(phone);
      $("#form").classList.add("hidden");
      $("#done").classList.remove("hidden");
      $("#dDoctor").textContent = `${r.doctor.name} · ${deptName(r.doctor.department)}${r.doctor.room ? ` · ${roomLabel(r.doctor.room)}` : ""}`;
      $("#dToken").textContent = r.token;
      $("#dNow").textContent = r.doctor.currentToken || "–";
      $("#dAhead").textContent = r.ahead;
      $("#dEta").textContent = minutes(r.etaMin);
      $("#dCode").textContent = r.code;
      $("#dPhone").textContent = prettyPhone(phone);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e2) {
      err.textContent = tError(e2.message);
    } finally {
      btn.disabled = false;
      btn.textContent = t("book.submit", "Book token");
    }
  });
})();
