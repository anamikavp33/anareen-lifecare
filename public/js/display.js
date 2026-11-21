(async function () {
  const { api, esc, $, t, pill, socket, room: roomLabel, deptName } = App;
  $("#logo").innerHTML = App.logo;
  $("#langSlot").innerHTML = App.langSwitch("btn btn-ghost btn-sm");

  const slug = App.qs("d");
  const doctors = new Map();
  let voice = false;
  const queue = []; // announcements waiting to be spoken
  let speaking = false;

  function tick() {
    const now = new Date();
    $("#clock").textContent = now.toLocaleTimeString(App.locale, { hour: "numeric", minute: "2-digit" });
    $("#date").textContent = now.toLocaleDateString(App.locale, { weekday: "long", day: "numeric", month: "long" });
  }
  tick();
  setInterval(tick, 10000);

  function render() {
    const list = [...doctors.values()].filter((d) => d.active);
    $("#grid").innerHTML = list
      .map(
        (d) => `
        <div class="d-card ${d.status === "consulting" ? "" : "paused"}" id="d-${d.id}">
          <div class="who"><h3>${esc(d.name)}</h3><p>${esc(deptName(d.department))}${d.room ? ` · ${esc(roomLabel(d.room))}` : ""}</p></div>
          <div class="tok"><span>${t("display.token", "Token")}</span><strong>${d.currentToken || "–"}</strong></div>
          <div class="meta">${pill(d.status, d.resumeTime)} <span>${t("display.waiting", `${d.waiting} waiting`, { n: d.waiting })}</span></div>
        </div>`
      )
      .join("") || `<p style="padding:40px;color:#8fbfb7">${t("display.none", "No doctors to show.")}</p>`;
  }

  /*
   * Voice. In Malayalam mode we need a Malayalam text-to-speech voice on the TV
   * (Chrome on Android and Microsoft Edge usually have one). Without it the
   * browser would read Malayalam script badly or not at all, so the call is
   * spoken in English instead and the start screen says so.
   */
  const canSpeak = "speechSynthesis" in window;
  const malayalamVoice = () =>
    App.lang === "ml" && canSpeak ? speechSynthesis.getVoices().find((v) => /^ml\b/i.test(v.lang.replace("_", "-"))) : null;
  function showVoiceNote() {
    $("#voiceNote")?.classList.toggle("hidden", App.lang !== "ml" || !canSpeak || !!malayalamVoice());
  }
  if (canSpeak) speechSynthesis.addEventListener?.("voiceschanged", showVoiceNote);
  setTimeout(showVoiceNote, 800); // some browsers list voices only after a moment

  function speakNext() {
    if (speaking || !queue.length) return;
    const item = queue.shift();
    if (!voice || !canSpeak) return speakNext();
    speaking = true;
    const ml = malayalamVoice();
    const u = new SpeechSynthesisUtterance(ml ? item.ml : item.en);
    if (ml) {
      u.voice = ml;
      u.lang = ml.lang;
    } else {
      u.lang = "en-IN";
    }
    u.rate = 0.9;
    u.onend = u.onerror = () => { speaking = false; setTimeout(speakNext, 600); };
    speechSynthesis.speak(u);
  }

  function announce(d) {
    const where = d.room ? `room ${d.room}` : d.department.name;
    const shown = d.room ? roomLabel(d.room) : deptName(d.department);
    $("#ticker").textContent = t("display.ticker", `Token ${d.currentToken} → ${d.name}, ${d.room ? `Room ${d.room}` : d.department.name}`, { t: d.currentToken, doctor: d.name, where: shown });
    const el = $(`#d-${d.id}`);
    if (el) { el.classList.remove("called"); void el.offsetWidth; el.classList.add("called"); }
    const text = {
      en: `Token number ${d.currentToken}, please proceed to ${d.name.replace(/^Dr\.?/, "Doctor")}, ${where}.`,
      ml: t(d.room ? "display.sayRoom" : "display.sayDept", "", {
        t: d.currentToken,
        doctor: d.name.replace(/^Dr\.?\s*/, "ഡോക്ടർ "),
        room: d.room,
        dept: deptName(d.department),
      }),
    };
    queue.push(text, text); // said twice, as in most hospitals
    speakNext();
  }

  async function loadDepartments() {
    const deps = await api("/api/departments");
    $("#deptPick").innerHTML =
      `<option value="">${t("allDepartments", "All departments")}</option>` +
      deps.map((d) => `<option value="${esc(d.slug)}" ${d.slug === slug ? "selected" : ""}>${esc(deptName(d))}</option>`).join("");
    const cur = deps.find((d) => d.slug === slug);
    if (cur) $("#boardTitle").textContent = deptName(cur);
    return cur;
  }

  async function loadDoctors() {
    const list = await api(slug ? `/api/doctors?department=${encodeURIComponent(slug)}` : "/api/doctors");
    doctors.clear();
    list.forEach((d) => doctors.set(d.id, d));
    render();
  }

  $("#deptPick").addEventListener("change", (e) => {
    location.href = e.target.value ? `/display?d=${encodeURIComponent(e.target.value)}` : "/display";
  });
  $("#fsBtn").addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  });
  const start = (withVoice) => {
    voice = withVoice;
    $("#overlay").remove();
    if (voice && "speechSynthesis" in window) speechSynthesis.speak(new SpeechSynthesisUtterance(""));
  };
  $("#startBtn").addEventListener("click", () => start(true));
  $("#muteBtn").addEventListener("click", () => start(false));

  const dep = await loadDepartments();
  await loadDoctors();

  const s = socket([dep ? `department:${dep.id}` : "all"], ({ doctor, announce: shouldAnnounce }) => {
    if (slug && doctor.department.slug !== slug) return;
    doctors.set(doctor.id, doctor);
    render();
    if (shouldAnnounce && doctor.currentToken > 0) announce(doctor);
  });
  s?.on("structure:changed", loadDoctors);
})();
