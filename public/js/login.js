(function () {
  const { api, $, mountHeader } = App;
  mountHeader("");

  const home = (role) => (role === "doctor" ? "/doctor" : "/admin");

  // Already signed in? Go straight to the right dashboard.
  api("/api/auth/me").then(({ user }) => location.replace(home(user.role))).catch(() => {});

  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#submitBtn");
    $("#error").textContent = "";
    btn.disabled = true;
    btn.textContent = "Signing in…";
    try {
      const { user } = await api("/api/auth/login", {
        method: "POST",
        body: { username: $("#username").value.trim(), password: $("#password").value },
      });
      const next = App.qs("next");
      location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : home(user.role);
    } catch (err) {
      $("#error").textContent = err.message;
      $("#password").select();
    } finally {
      btn.disabled = false;
      btn.textContent = "Sign in";
    }
  });
})();
