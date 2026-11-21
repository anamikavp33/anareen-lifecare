process.env.NODE_ENV = "test";
const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { openDatabase } = require("../src/db");
const { seedDatabase, DEMO_PASSWORDS } = require("../src/db/seed");
const { createApp } = require("../src/app");

function setup() {
  const db = openDatabase(":memory:");
  seedDatabase(db, { rounds: 4 }); // low bcrypt cost keeps tests fast
  const published = [];
  const app = createApp({ db, publish: (d, extra) => published.push({ d, extra }) });
  return { db, app, published };
}

async function login(app, username, password) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send({ username, password });
  assert.equal(res.status, 200, `login ${username} failed: ${JSON.stringify(res.body)}`);
  return agent;
}

describe("public API", () => {
  const { app } = setup();

  test("health check", async () => {
    const res = await request(app).get("/api/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  });

  test("lists departments with doctor counts", async () => {
    const res = await request(app).get("/api/departments");
    assert.equal(res.status, 200);
    assert.ok(res.body.length >= 8);
    const gm = res.body.find((d) => d.slug === "general-medicine");
    assert.equal(gm.doctorCount, 2);
  });

  test("department page returns its doctors", async () => {
    const res = await request(app).get("/api/departments/pediatrics");
    assert.equal(res.status, 200);
    assert.equal(res.body.doctors.length, 2);
    assert.ok(res.body.doctors.every((d) => d.department.slug === "pediatrics"));
  });

  test("unknown department is 404", async () => {
    assert.equal((await request(app).get("/api/departments/nope")).status, 404);
  });

  test("track rejects bad input", async () => {
    assert.equal((await request(app).get("/api/track?doctorId=1&token=0")).status, 400);
    assert.equal((await request(app).get("/api/track?doctorId=abc&token=3")).status, 400);
    assert.equal((await request(app).get("/api/track?doctorId=999&token=3")).status, 404);
  });

  test("unknown API route is a JSON 404", async () => {
    const res = await request(app).get("/api/does-not-exist");
    assert.equal(res.status, 404);
    assert.ok(res.body.error);
  });

  test("security headers are set", async () => {
    const res = await request(app).get("/");
    assert.ok(res.headers["content-security-policy"]);
    assert.equal(res.headers["x-powered-by"], undefined);
  });
});

describe("authentication", () => {
  const { app } = setup();

  test("wrong password is rejected", async () => {
    const res = await request(app).post("/api/auth/login").send({ username: "admin", password: "wrong" });
    assert.equal(res.status, 401);
  });

  test("session cookie is httpOnly and SameSite=Strict", async () => {
    const res = await request(app).post("/api/auth/login").send({ username: "admin", password: DEMO_PASSWORDS.admin });
    const cookie = res.headers["set-cookie"][0];
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
  });

  test("me returns the user; logout ends the session", async () => {
    const agent = await login(app, "dr.arun", DEMO_PASSWORDS.doctor);
    const me = await agent.get("/api/auth/me");
    assert.equal(me.body.user.role, "doctor");
    await agent.post("/api/auth/logout");
    assert.equal((await agent.get("/api/auth/me")).status, 401);
  });

  test("protected routes need a session", async () => {
    assert.equal((await request(app).post("/api/queue/1/next")).status, 401);
    assert.equal((await request(app).get("/api/admin/stats")).status, 401);
  });

  test("login is rate-limited after repeated failures", async () => {
    const { app: fresh } = setup();
    for (let i = 0; i < 5; i++) await request(fresh).post("/api/auth/login").send({ username: "admin", password: "x" });
    const res = await request(fresh).post("/api/auth/login").send({ username: "admin", password: DEMO_PASSWORDS.admin });
    assert.equal(res.status, 429);
  });

  test("change password works", async () => {
    const { app: fresh } = setup();
    const agent = await login(fresh, "reception", DEMO_PASSWORDS.reception);
    const r = await agent.post("/api/auth/change-password").send({ currentPassword: DEMO_PASSWORDS.reception, newPassword: "BrandNew#2026" });
    assert.equal(r.status, 200);
    await login(fresh, "reception", "BrandNew#2026");
  });
});

describe("queue control", () => {
  let ctx, doctor, reception;
  before(async () => {
    ctx = setup();
    doctor = await login(ctx.app, "dr.arun", DEMO_PASSWORDS.doctor); // doctor id 1
    reception = await login(ctx.app, "reception", DEMO_PASSWORDS.reception);
  });

  test("reception issues tokens in order", async () => {
    for (let i = 1; i <= 5; i++) {
      const r = await reception.post("/api/queue/1/issue");
      assert.equal(r.status, 200);
      assert.equal(r.body.token, i);
    }
    const d = (await request(ctx.app).get("/api/doctors/1")).body;
    assert.equal(d.issuedTokens, 5);
    assert.equal(d.waiting, 5);
  });

  test("doctors cannot issue tokens", async () => {
    assert.equal((await doctor.post("/api/queue/1/issue")).status, 403);
  });

  test("next advances the token, sets consulting, and is broadcast", async () => {
    const before = ctx.published.length;
    const r = await doctor.post("/api/queue/1/next");
    assert.equal(r.status, 200);
    assert.equal(r.body.doctor.currentToken, 1);
    assert.equal(r.body.doctor.status, "consulting");
    assert.equal(r.body.doctor.waiting, 4);
    assert.equal(ctx.published.length, before + 1);
    assert.equal(ctx.published.at(-1).extra.announce, true);
  });

  test("a doctor cannot control another doctor's queue", async () => {
    assert.equal((await doctor.post("/api/queue/2/next")).status, 403);
  });

  test("reception can control any queue", async () => {
    assert.equal((await reception.post("/api/queue/2/next")).status, 200);
  });

  test("tracking reports patients ahead and estimated wait", async () => {
    const r = await request(ctx.app).get("/api/track?doctorId=1&token=4");
    assert.equal(r.body.state, "waiting");
    assert.equal(r.body.ahead, 2); // serving 1, so 2 and 3 are ahead of 4
    assert.equal(r.body.etaMin, 3 * r.body.doctor.avgConsultMin);
    assert.equal((await request(ctx.app).get("/api/track?doctorId=1&token=1")).body.state, "now");
  });

  test("previous goes back and cannot go below zero", async () => {
    assert.equal((await doctor.post("/api/queue/1/previous")).body.doctor.currentToken, 0);
    assert.equal((await doctor.post("/api/queue/1/previous")).status, 400);
  });

  test("set validates its input", async () => {
    assert.equal((await doctor.post("/api/queue/1/set").send({ token: -3 })).status, 400);
    assert.equal((await doctor.post("/api/queue/1/set").send({ token: "abc" })).status, 400);
    const r = await doctor.post("/api/queue/1/set").send({ token: 3 });
    assert.equal(r.body.doctor.currentToken, 3);
    assert.equal((await request(ctx.app).get("/api/track?doctorId=1&token=2")).body.state, "passed");
  });

  test("status with resume time", async () => {
    const r = await doctor.post("/api/queue/1/status").send({ status: "break", resumeTime: "11:30" });
    assert.equal(r.body.doctor.status, "break");
    assert.equal(r.body.doctor.resumeTime, "11:30");
    assert.equal((await doctor.post("/api/queue/1/status").send({ status: "sleeping" })).status, 400);
    assert.equal((await doctor.post("/api/queue/1/status").send({ status: "break", resumeTime: "25:00" })).status, 400);
  });

  test("history records every action", async () => {
    const h = (await doctor.get("/api/queue/1/history")).body;
    const actions = h.map((e) => e.action);
    for (const a of ["issue", "next", "previous", "set", "status"]) assert.ok(actions.includes(a), `missing ${a}`);
  });

  test("reset clears the day's queue", async () => {
    const r = await doctor.post("/api/queue/1/reset");
    assert.equal(r.body.doctor.currentToken, 0);
    assert.equal(r.body.doctor.issuedTokens, 0);
  });

  test("queue resets automatically on a new day", async () => {
    await doctor.post("/api/queue/1/set").send({ token: 7 });
    ctx.db.prepare("UPDATE doctors SET queue_date = '2000-01-01' WHERE id = 1").run();
    const d = (await request(ctx.app).get("/api/doctors/1")).body;
    assert.equal(d.currentToken, 0);
  });
});

describe("admin", () => {
  let ctx, admin, reception;
  before(async () => {
    ctx = setup();
    admin = await login(ctx.app, "admin", DEMO_PASSWORDS.admin);
    reception = await login(ctx.app, "reception", DEMO_PASSWORDS.reception);
  });

  test("creates a department and a doctor with a login", async () => {
    const dep = await admin.post("/api/admin/departments").send({ name: "Ophthalmology", icon: "👁️", description: "Eye care" });
    assert.equal(dep.status, 201);
    assert.equal(dep.body.slug, "ophthalmology");

    const doc = await admin.post("/api/admin/doctors").send({
      name: "Dr. Test Person", departmentId: dep.body.id, room: "9", avgConsultMin: 7, username: "dr.test", password: "Testing#123",
    });
    assert.equal(doc.status, 201);
    const agent = await login(ctx.app, "dr.test", "Testing#123");
    assert.equal((await agent.post(`/api/queue/${doc.body.id}/next`)).status, 200);
  });

  test("duplicate department name is a 409", async () => {
    assert.equal((await admin.post("/api/admin/departments").send({ name: "Cardiology" })).status, 409);
  });

  test("cannot delete a department that still has doctors", async () => {
    assert.equal((await admin.delete("/api/admin/departments/1")).status, 409);
  });

  test("validates doctor fields", async () => {
    assert.equal((await admin.post("/api/admin/doctors").send({ name: "" , departmentId: 1 })).status, 400);
    assert.equal((await admin.post("/api/admin/doctors").send({ name: "Dr X", departmentId: 999 })).status, 400);
    assert.equal((await admin.post("/api/admin/doctors").send({ name: "Dr X", departmentId: 1, avgConsultMin: 500 })).status, 400);
  });

  test("hiding a doctor removes them from the public list", async () => {
    await admin.put("/api/admin/doctors/2").send({ active: false });
    const pub = (await request(ctx.app).get("/api/departments/general-medicine")).body;
    assert.ok(!pub.doctors.some((d) => d.id === 2));
  });

  test("reception can view stats but not manage doctors", async () => {
    assert.equal((await reception.get("/api/admin/stats")).status, 200);
    assert.equal((await reception.post("/api/admin/doctors").send({ name: "Dr Y", departmentId: 1 })).status, 403);
    assert.equal((await reception.get("/api/admin/users")).status, 403);
  });

  test("stats add up", async () => {
    await admin.post("/api/queue/3/issue");
    await admin.post("/api/queue/3/issue");
    await admin.post("/api/queue/3/next");
    const s = (await admin.get("/api/admin/stats")).body;
    const row = s.doctors.find((d) => d.id === 3);
    assert.equal(row.served, 1);
    assert.equal(row.waiting, 1);
    assert.ok(s.hourly.length >= 1);
  });

  test("the last admin cannot be deleted, nor yourself", async () => {
    const users = (await admin.get("/api/admin/users")).body;
    const me = users.find((u) => u.username === "admin");
    assert.equal((await admin.delete(`/api/admin/users/${me.id}`)).status, 400);
  });

  test("audit log records admin actions", async () => {
    const log = (await admin.get("/api/admin/audit")).body;
    assert.ok(log.some((r) => r.action === "department.create"));
    assert.ok(log.some((r) => r.action.startsWith("queue.")));
  });
});

describe("online booking and tracking by mobile number", () => {
  const config = require("../src/config");
  let ctx, reception, doctor;
  before(async () => {
    config.bookingOpen = "00:00"; // keep the booking window open whatever time the tests run
    config.bookingClose = "24:00";
    ctx = setup();
    reception = await login(ctx.app, "reception", DEMO_PASSWORDS.reception);
    doctor = await login(ctx.app, "dr.meera", DEMO_PASSWORDS.doctor); // doctor id 3
  });

  // Online booking now needs consent to the privacy notice (v2.2); these tests are about other rules.
  const book = (body) => request(ctx.app).post("/api/book").send({ consent: true, ...body });

  test("a patient books a token from home", async () => {
    const r = await book({ doctorId: 3, name: "Rahul Krishnan", phone: "+91 98765 43210" });
    assert.equal(r.status, 201);
    assert.equal(r.body.token, 1);
    assert.match(r.body.code, /^\d{4}$/);
    assert.equal(r.body.state, "waiting");
    assert.equal(r.body.doctor.online.used, 1);
  });

  test("booking validates name and mobile number", async () => {
    assert.equal((await book({ doctorId: 3, name: "", phone: "9876500000" })).status, 400);
    assert.equal((await book({ doctorId: 3, name: "Asha", phone: "12345" })).status, 400);
    assert.equal((await book({ doctorId: 3, name: "Asha", phone: "5876500000" })).status, 400); // must start 6-9
  });

  test("one mobile number gets only one token per doctor per day", async () => {
    const r = await book({ doctorId: 3, name: "Rahul K", phone: "09876543210" });
    assert.equal(r.status, 409);
    assert.match(r.body.error, /already has token 1/);
    assert.equal((await book({ doctorId: 4, name: "Rahul K", phone: "9876543210" })).status, 201); // other doctor is fine
  });

  test("walk-in and online tokens share one sequence", async () => {
    const w = await reception.post("/api/queue/3/issue").send({ name: "Fathima", phone: "9123456780" });
    assert.equal(w.body.token, 2);
    const plain = await reception.post("/api/queue/3/issue").send({});
    assert.equal(plain.body.token, 3); // walk-in with no details still works
    const o = await book({ doctorId: 3, name: "Joseph", phone: "9000000001" });
    assert.equal(o.body.token, 4);
  });

  test("patients find their tokens by mobile number alone, with names masked", async () => {
    const r = await request(ctx.app).get("/api/my-tokens?phone=9876543210");
    assert.equal(r.status, 200);
    assert.equal(r.body.length, 2);
    const t = r.body.find((x) => x.doctor.id === 3);
    assert.equal(t.token, 1);
    assert.equal(t.patient, "Ra*** K.");
    assert.equal(JSON.stringify(r.body).includes("9876543210"), false, "phone number must not be echoed back");
    assert.equal((await request(ctx.app).get("/api/my-tokens?phone=9999999999")).body.length, 0);
    assert.equal((await request(ctx.app).get("/api/my-tokens?phone=abc")).status, 400);
  });

  test("cancelling needs the right booking code", async () => {
    const r = await book({ doctorId: 3, name: "Cancel Me", phone: "9000000002" });
    const wrong = await request(ctx.app).post(`/api/bookings/${r.body.bookingId}/cancel`).send({ phone: "9000000002", code: "0000" === r.body.code ? "1111" : "0000" });
    assert.equal(wrong.status, 403);
    const other = await request(ctx.app).post(`/api/bookings/${r.body.bookingId}/cancel`).send({ phone: "9000000003", code: r.body.code });
    assert.equal(other.status, 404);
    const ok = await request(ctx.app).post(`/api/bookings/${r.body.bookingId}/cancel`).send({ phone: "9000000002", code: r.body.code });
    assert.equal(ok.status, 200);
    assert.equal((await request(ctx.app).get("/api/my-tokens?phone=9000000002")).body.length, 0);
  });

  test("cancelled and no-show tokens are skipped and not counted as ahead", async () => {
    // tokens: 1 Rahul, 2 Fathima, 3 walk-in, 4 Joseph, 5 cancelled
    const list = (await reception.get("/api/staff/bookings?doctorId=3")).body;
    const fathima = list.find((b) => b.token === 2);
    assert.equal(fathima.phone, "9123456780"); // staff see full details
    assert.equal((await reception.post(`/api/staff/bookings/${fathima.id}/status`).send({ status: "no_show" })).status, 200);

    const before = (await request(ctx.app).get("/api/track?doctorId=3&token=4")).body;
    assert.equal(before.ahead, 2); // 1 and 3 only; 2 is a no-show

    await doctor.post("/api/queue/3/next"); // → 1
    const n = await doctor.post("/api/queue/3/next"); // jumps over 2 → 3
    assert.equal(n.body.doctor.currentToken, 3);
    assert.equal((await request(ctx.app).get("/api/track?doctorId=3&token=2")).body.state, "no_show");
    const j = (await request(ctx.app).get("/api/track?doctorId=3&token=4")).body;
    assert.equal(j.ahead, 0);
    assert.equal(n.body.doctor.waiting, 1); // only token 4; token 5 was cancelled
  });

  test("doctor sees upcoming patients and can only manage their own", async () => {
    const up = (await doctor.get("/api/queue/3/upcoming")).body;
    assert.deepEqual(up.map((b) => b.token), [3, 4]);
    const other = (await reception.get("/api/staff/bookings?doctorId=4")).body[0];
    assert.equal((await doctor.post(`/api/staff/bookings/${other.id}/status`).send({ status: "arrived" })).status, 403);
  });

  test("online limit, switch-off and booking hours are enforced", async () => {
    const admin = await login(ctx.app, "admin", DEMO_PASSWORDS.admin);
    await admin.put("/api/admin/doctors/5").send({ onlineLimit: 1 });
    assert.equal((await book({ doctorId: 5, name: "First", phone: "9000000010" })).status, 201);
    const full = await book({ doctorId: 5, name: "Second", phone: "9000000011" });
    assert.equal(full.status, 409);
    assert.equal((await reception.post("/api/queue/5/issue").send({})).status, 200, "desk can still issue when online is full");

    await admin.put("/api/admin/doctors/6").send({ onlineEnabled: false });
    assert.equal((await book({ doctorId: 6, name: "Third", phone: "9000000012" })).status, 400);
    assert.equal((await request(ctx.app).get("/api/doctors/6")).body.online.open, false);

    config.bookingOpen = "00:00";
    config.bookingClose = "00:00"; // closed all day
    const closed = await book({ doctorId: 7, name: "Late", phone: "9000000013" });
    assert.equal(closed.status, 400);
    assert.match(closed.body.error, /open from/);
    config.bookingClose = "24:00";
  });

  test("stats split online and walk-in", async () => {
    const admin = await login(ctx.app, "admin", DEMO_PASSWORDS.admin);
    const s = (await admin.get("/api/admin/stats")).body;
    assert.ok(s.bookings.online >= 4);
    assert.ok(s.bookings.walkin >= 3);
    assert.equal(s.bookings.noShow, 1);
    assert.equal(s.bookings.cancelled, 1);
  });

  test("reset clears the day's bookings too", async () => {
    await doctor.post("/api/queue/3/reset");
    assert.equal((await request(ctx.app).get("/api/my-tokens?phone=9000000001")).body.length, 0);
    const again = await book({ doctorId: 3, name: "Joseph", phone: "9000000001" });
    assert.equal(again.body.token, 1);
  });
});

describe("upgrading an older database", () => {
  test("adds the new columns and keeps old events", () => {
    const fs = require("fs");
    const os = require("os");
    const path = require("path");
    const { DatabaseSync } = require("node:sqlite");
    const file = path.join(os.tmpdir(), `anareen-migrate-${process.pid}.db`);
    fs.rmSync(file, { force: true });
    const old = new DatabaseSync(file);
    old.exec(`CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT, slug TEXT, icon TEXT, description TEXT, created_at TEXT);
      CREATE TABLE doctors (id INTEGER PRIMARY KEY, department_id INTEGER, name TEXT, designation TEXT, room TEXT, avg_consult_min INTEGER,
        current_token INTEGER, issued_tokens INTEGER, status TEXT, resume_time TEXT, queue_date TEXT, active INTEGER, updated_at TEXT, created_at TEXT);
      CREATE TABLE token_events (id INTEGER PRIMARY KEY AUTOINCREMENT, doctor_id INTEGER, user_id INTEGER,
        action TEXT NOT NULL CHECK (action IN ('next','previous','set','issue','reset','status')), token INTEGER, detail TEXT, queue_date TEXT NOT NULL, created_at TEXT);
      INSERT INTO departments (id, name, slug, icon, description) VALUES (1, 'General', 'general', 'x', '');
      INSERT INTO doctors (id, department_id, name, designation, room, avg_consult_min, current_token, issued_tokens, status, active)
        VALUES (1, 1, 'Dr. Old', '', '', 10, 0, 0, 'unavailable', 1);
      INSERT INTO token_events (doctor_id, action, token, queue_date, created_at) VALUES (1, 'next', 4, '2026-01-01', '2026-01-01T10:00:00Z');`);
    old.close();
    const db = openDatabase(file);
    const cols = db.prepare("PRAGMA table_info(doctors)").all().map((c) => c.name);
    assert.ok(cols.includes("online_enabled") && cols.includes("online_limit"));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM token_events").get().n, 1);
    db.prepare("INSERT INTO token_events (doctor_id, action, queue_date) VALUES (1, 'book', '2026-01-01')").run();
    db.close();
    fs.rmSync(file, { force: true });
  });
});
