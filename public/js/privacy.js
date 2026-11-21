(async function () {
  const { api, $$, mountHeader, mountFooter } = App;
  mountHeader("");
  mountFooter();

  // Show the clinic's real retention and backup periods (set in .env).
  try {
    const c = await api("/api/config");
    $$("[data-days]").forEach((el) => (el.textContent = c.retentionDays));
    $$("[data-backup]").forEach((el) => (el.textContent = c.backupKeepDays));
  } catch { /* keep the defaults written in the page */ }
})();
