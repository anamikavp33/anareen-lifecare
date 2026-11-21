/* Helpers shared by the doctor console and the admin panel. */
(function () {
  const { api, $, toast } = App;

  /** Returns the signed-in user, or sends them to the login page. */
  App.requireUser = async (roles) => {
    try {
      const { user } = await api("/api/auth/me");
      if (roles && !roles.includes(user.role)) {
        location.replace(user.role === "doctor" ? "/doctor" : "/admin");
        return new Promise(() => {});
      }
      return user;
    } catch {
      location.replace(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
      return new Promise(() => {}); // never resolves; page is leaving
    }
  };

  App.wireStaffChrome = (user) => {
    $("#logo") && ($("#logo").innerHTML = App.logo);
    $("#whoami") && ($("#whoami").textContent = `${user.username} · ${user.role}`);
    $("#logout")?.addEventListener("click", async (e) => {
      e.preventDefault();
      await api("/api/auth/logout", { method: "POST" }).catch(() => {});
      location.href = "/login";
    });

    const dlg = $("#pwDialog");
    if (!dlg) return;
    $("#pwLink").addEventListener("click", (e) => {
      e.preventDefault();
      $("#pwForm").reset();
      $("#pwErr").textContent = "";
      dlg.showModal();
    });
    $("#pwSave").addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        await api("/api/auth/change-password", {
          method: "POST",
          body: { currentPassword: $("#pwCur").value, newPassword: $("#pwNew").value },
        });
        dlg.close();
        toast("Password changed", "ok");
      } catch (err) {
        $("#pwErr").textContent = err.message;
      }
    });
  };

  /** Runs an API call, shows any error as a toast, returns the result or null. */
  App.run = async (fn, okMsg) => {
    try {
      const r = await fn();
      if (okMsg) toast(okMsg, "ok");
      return r;
    } catch (e) {
      toast(e.message, "error");
      return null;
    }
  };
})();
