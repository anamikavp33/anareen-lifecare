process.env.NODE_ENV = "test";
const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const request = require("supertest");
const config = require("../src/config");
const { openDatabase } = require("../src/db");
const { seedDatabase, DEMO_PASSWORDS } = require("../src/db/seed");
const { createApp } = require("../src/app");
const { today } = require("../src/services/queue");
const { purgeOldPatientData } = require("../src/services/retention");

config.bookingOpen = "00:00"; // keep the booking window open whatever time the tests run
config.bookingClose = "24:00";

function setup() {
  const db = openDatabase(":memory:");
  seedDatabase(db, { rounds: 4 });
  return { db, app: createApp({ db }) };
}

const daysAgo = (db, n) => db.prepare("SELECT date(?, ?) AS d").get(today(), `-${n} days`).d;

describe("privacy notice and consent", () => {
  let ctx, reception;
  before(async () => {
    ctx = setup();
    reception = request.agent(ctx.app);
    await reception.post("/api/auth/login").send({ username: "reception", password: DEMO_PASSWORDS.reception });
  });

  test("online booking needs the consent box ticked, and records when", async () => {
    const book = (extra) => request(ctx.app).post("/api/book").send({ doctorId: 1, name: "Asha Menon", phone: "9800000001", ...extra });
    for (const consent of [undefined, false, "yes", 1]) {
      const r = await book({ consent });
      assert.equal(r.status, 400, `consent ${consent} should be refused`);
      assert.match(r.body.error, /privacy notice/);
    }
    const before = Date.now();
    const ok = await book({ consent: true });
    assert.equal(ok.status, 201);
    const row = ctx.db.prepare("SELECT consent_at FROM bookings WHERE id = ?").get(ok.body.bookingId);
    assert.ok(Date.parse(row.consent_at) >= before - 1000, "consent time is stored");
  });

  test("consent is optional at the reception desk", async () => {
    const without = await reception.post("/api/queue/1/issue").send({ name: "Walk In", phone: "9800000002" });
    assert.equal(without.status, 200);
    const withConsent = await reception.post("/api/queue/1/issue").send({ name: "Walk In Two", phone: "9800000003", consent: true });
    const consentOf = (id) => ctx.db.prepare("SELECT consent_at FROM bookings WHERE id = ?").get(id).consent_at;
    assert.equal(consentOf(without.body.bookingId), null);
    assert.ok(consentOf(withConsent.body.bookingId));
    const staffList = (await reception.get("/api/staff/bookings?doctorId=1")).body;
    assert.ok(staffList.find((b) => b.id === withConsent.body.bookingId).consentAt, "staff can see that consent was given");
  });

  test("the privacy page is public and the retention period is published", async () => {
    const page = await request(ctx.app).get("/privacy");
    assert.equal(page.status, 200);
    assert.match(page.text, /Privacy/);
    const cfg = (await request(ctx.app).get("/api/config")).body;
    assert.equal(cfg.retentionDays, config.retentionDays);
    assert.equal(cfg.backupKeepDays, config.backupKeep);
  });

  test("doctors carry a reason code when online booking isn't possible", async () => {
    const admin = request.agent(ctx.app);
    await admin.post("/api/auth/login").send({ username: "admin", password: DEMO_PASSWORDS.admin });
    await admin.put("/api/admin/doctors/2").send({ onlineEnabled: false });
    await admin.put("/api/admin/doctors/3").send({ onlineLimit: 0 });
    const doc = async (id) => (await request(ctx.app).get(`/api/doctors/${id}`)).body.online;
    assert.equal((await doc(1)).reason, null);
    assert.equal((await doc(2)).reason, "off");
    assert.equal((await doc(3)).reason, "full");
    config.bookingClose = "00:00";
    assert.equal((await doc(1)).reason, "closed");
    config.bookingClose = "24:00";
  });
});

describe("automatic cleanup of old patient details", () => {
  function seedHistory(db) {
    const ins = db.prepare("INSERT INTO bookings (doctor_id, queue_date, token, patient_name, phone, source, status, code) VALUES (?, ?, ?, ?, ?, ?, ?, '1234')");
    const ev = db.prepare("INSERT INTO token_events (doctor_id, action, token, detail, queue_date) VALUES (1, ?, ?, ?, ?)");
    const old = daysAgo(db, 31), edge = daysAgo(db, 30), recent = daysAgo(db, 5);
    ins.run(1, old, 1, "Old Online", "9811111111", "online", "done");
    ins.run(1, old, 2, "Old Walkin", "9822222222", "walkin", "no_show");
    ins.run(2, old, 1, null, null, "walkin", "done"); // a walk-in who gave no details
    ins.run(1, edge, 1, "Exactly Thirty", "9833333333", "online", "done");
    ins.run(1, recent, 1, "Recent Patient", "9844444444", "online", "done");
    ev.run("book", 1, "online · Ol*** O.", old);
    ev.run("issue", 2, "walk-in · Old Walkin", old);
    ev.run("next", 1, null, old);
    ev.run("issue", 1, "walk-in · Recent Patient", recent);
    return { old, edge, recent };
  }

  test("removes names and numbers older than the retention period, keeps the counts", () => {
    const { db } = setup();
    const { old, edge, recent } = seedHistory(db);
    const countsBefore = db.prepare("SELECT source, status, COUNT(*) AS n FROM bookings GROUP BY source, status ORDER BY source, status").all();

    const r = purgeOldPatientData(db, { days: 30 });
    assert.equal(r.cutoff, edge);
    assert.equal(r.bookings, 2);
    assert.equal(r.events, 2);

    const oldRows = db.prepare("SELECT patient_name, phone FROM bookings WHERE queue_date = ?").all(old);
    assert.ok(oldRows.every((b) => b.patient_name === null && b.phone === null));
    assert.equal(db.prepare("SELECT patient_name FROM bookings WHERE queue_date = ?").get(edge).patient_name, "Exactly Thirty");
    assert.equal(db.prepare("SELECT phone FROM bookings WHERE queue_date = ?").get(recent).phone, "9844444444");

    const details = db.prepare("SELECT action, detail FROM token_events WHERE queue_date = ? ORDER BY id").all(old).map((e) => ({ ...e }));
    assert.deepEqual(details, [
      { action: "book", detail: "online" },
      { action: "issue", detail: "walk-in" },
      { action: "next", detail: null },
    ]);
    assert.equal(db.prepare("SELECT detail FROM token_events WHERE queue_date = ?").get(recent).detail, "walk-in · Recent Patient");

    const countsAfter = db.prepare("SELECT source, status, COUNT(*) AS n FROM bookings GROUP BY source, status ORDER BY source, status").all();
    assert.deepEqual(countsAfter, countsBefore, "anonymous counts are unchanged");
    const audit = db.prepare("SELECT username, detail FROM audit_log WHERE action = 'privacy.cleanup'").all();
    assert.equal(audit.length, 1);
    assert.equal(audit[0].username, "system");
  });

  test("running it again changes nothing and doesn't touch today's queue", async () => {
    const { db, app } = setup();
    seedHistory(db);
    await request(app).post("/api/book").send({ doctorId: 1, name: "Today Patient", phone: "9855555555", consent: true });
    purgeOldPatientData(db, { days: 30 });
    const again = purgeOldPatientData(db, { days: 30 });
    assert.deepEqual([again.bookings, again.events], [0, 0]);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'privacy.cleanup'").get().n, 1);
    const mine = (await request(app).get("/api/my-tokens?phone=9855555555")).body;
    assert.equal(mine.length, 1, "today's patients can still find their token");

    const strict = purgeOldPatientData(db, { days: 1 });
    assert.equal(strict.bookings, 2, "a shorter period cleans the newer history too");
    assert.equal(db.prepare("SELECT phone FROM bookings WHERE queue_date = ?").get(today()).phone, "9855555555");
  });

  test("refuses a retention period under one day", () => {
    const { db } = setup();
    for (const days of [0, -5, 1.5, undefined]) assert.throws(() => purgeOldPatientData(db, { days }), /at least 1 day/);
  });

  test("RETENTION_DAYS is validated when the app starts", () => {
    const { execFileSync } = require("child_process");
    const run = (value) =>
      execFileSync(process.execPath, ["-e", "console.log(require('./src/config').retentionDays)"], {
        cwd: path.join(__dirname, ".."),
        env: { ...process.env, RETENTION_DAYS: value },
        encoding: "utf8",
        stdio: "pipe",
      }).trim();
    assert.equal(run("45"), "45");
    assert.throws(() => run("0"), /RETENTION_DAYS must be a whole number/);
    assert.throws(() => run("thirty"), /RETENTION_DAYS must be a whole number/);
  });
});

describe("upgrading a v2.1 database", () => {
  test("adds the consent column to existing bookings without losing them", () => {
    const { DatabaseSync } = require("node:sqlite");
    const file = path.join(os.tmpdir(), `anareen-v21-${process.pid}.db`);
    fs.rmSync(file, { force: true });
    const fresh = openDatabase(file);
    fresh.close();
    // Recreate the v2.1 bookings table (no consent_at) with one booking in it.
    const old = new DatabaseSync(file);
    old.exec(`DROP TABLE bookings;
      CREATE TABLE bookings (id INTEGER PRIMARY KEY AUTOINCREMENT, doctor_id INTEGER NOT NULL, queue_date TEXT NOT NULL, token INTEGER NOT NULL,
        patient_name TEXT, phone TEXT, source TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'booked', code TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')));
      INSERT INTO bookings (doctor_id, queue_date, token, patient_name, phone, source, code) VALUES (1, '2026-01-01', 1, 'Old Booking', '9876543210', 'online', '1111');`);
    old.close();
    const db = openDatabase(file);
    const cols = db.prepare("PRAGMA table_info(bookings)").all().map((c) => c.name);
    assert.ok(cols.includes("consent_at"));
    const row = db.prepare("SELECT patient_name, consent_at FROM bookings").get();
    assert.equal(row.patient_name, "Old Booking");
    assert.equal(row.consent_at, null);
    db.close();
    for (const f of [file, `${file}-wal`, `${file}-shm`]) fs.rmSync(f, { force: true });
  });
});
