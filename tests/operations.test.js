process.env.NODE_ENV = "test";
const { test, describe, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const request = require("supertest");
const config = require("../src/config");
const { openDatabase, DatabaseSync } = require("../src/db");
const { seedDatabase, DEMO_PASSWORDS } = require("../src/db/seed");
const { createApp } = require("../src/app");
const { backupDatabase } = require("../src/db/backup");
const { startMaintenance } = require("../src/maintenance");
const { today } = require("../src/services/queue");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "anareen-ops-"));
after(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));
const tmp = (name) => path.join(tmpRoot, name);

function setup() {
  const db = openDatabase(":memory:");
  seedDatabase(db, { rounds: 4 });
  return { db, app: createApp({ db }) };
}

/** Runs fn with console.error silenced (the tests below cause server errors on purpose). */
async function quietly(fn) {
  const original = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = original;
  }
}

describe("health check and error log", () => {
  test("health check reports the database", async () => {
    const { app } = setup();
    const r = await request(app).get("/api/health");
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.database, "ok");
    assert.equal(typeof r.body.uptimeSec, "number");
  });

  test("health check fails with 503 when the database is down", async () => {
    const { db, app } = setup();
    db.close();
    const r = await quietly(() => request(app).get("/api/health"));
    assert.equal(r.status, 503);
    assert.equal(r.body.ok, false);
    assert.equal(r.body.database, "unavailable");
  });

  test("server errors are written to the log file with a timestamp, without mobile numbers", async () => {
    const { db, app } = setup();
    config.logFile = tmp("logs/error.log");
    try {
      db.close();
      const r = await quietly(() => request(app).get("/api/my-tokens?phone=9876543210"));
      assert.equal(r.status, 500);
      assert.equal(r.body.error, "Something went wrong on the server", "details stay out of the response");
      const log = fs.readFileSync(config.logFile, "utf8");
      assert.match(log, /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] ERROR GET \/api\/my-tokens: /m);
      assert.ok(!log.includes("9876543210"), "the query string is not logged");
    } finally {
      config.logFile = "";
    }
  });

  test("client errors (4xx) are not logged as server errors", async () => {
    const { app } = setup();
    config.logFile = tmp("logs/client.log");
    try {
      assert.equal((await request(app).get("/api/my-tokens?phone=abc")).status, 400);
      assert.equal(fs.existsSync(config.logFile), false);
    } finally {
      config.logFile = "";
    }
  });
});

describe("running behind an HTTPS proxy", () => {
  test("login cookie is Secure in production", async () => {
    const { app } = setup();
    config.env = "production";
    try {
      const res = await request(app).post("/api/auth/login").send({ username: "admin", password: DEMO_PASSWORDS.admin });
      assert.equal(res.status, 200);
      assert.match(res.headers["set-cookie"][0], /; Secure/);
    } finally {
      config.env = "test";
    }
    const dev = await request(app).post("/api/auth/login").send({ username: "admin", password: DEMO_PASSWORDS.admin });
    assert.doesNotMatch(dev.headers["set-cookie"][0], /; Secure/);
  });

  test("FORCE_HTTPS redirects plain HTTP and trusts the proxy's X-Forwarded-Proto", async () => {
    config.forceHttps = true;
    let app;
    try {
      app = setup().app;
    } finally {
      config.forceHttps = false;
    }
    const plain = await request(app).get("/book?doctor=1").set("Host", "clinic.example.in");
    assert.equal(plain.status, 301);
    assert.equal(plain.headers.location, "https://clinic.example.in/book?doctor=1");
    const viaProxy = await request(app).get("/book").set("X-Forwarded-Proto", "https");
    assert.equal(viaProxy.status, 200);
    assert.equal((await request(app).get("/api/health")).status, 200, "health checks are never redirected");
  });

  test("HSTS header tells browsers to stay on HTTPS", async () => {
    const res = await request(setup().app).get("/");
    assert.match(res.headers["strict-transport-security"], /max-age=\d+/);
  });
});

describe("database backups", () => {
  test("VACUUM INTO writes a complete, readable copy", () => {
    const file = tmp("live.db");
    const db = openDatabase(file); // a real WAL-mode file, like production
    seedDatabase(db, { rounds: 4 });
    const r = backupDatabase(db, { dir: tmp("b1"), keep: 14, date: "2026-11-21" });
    assert.equal(r.skipped, false);
    assert.equal(path.basename(r.file), "anareen-2026-11-21.db");
    assert.equal(fs.existsSync(`${r.file}.partial`), false);
    const copy = new DatabaseSync(r.file, { readOnly: true });
    assert.equal(copy.prepare("SELECT COUNT(*) AS n FROM doctors").get().n, db.prepare("SELECT COUNT(*) AS n FROM doctors").get().n);
    copy.close();
    db.close();
  });

  test("one backup per day: a second run the same day is skipped unless replaced", () => {
    const { db } = setup();
    const dir = tmp("b2");
    const first = backupDatabase(db, { dir, keep: 14, date: "2026-11-21" });
    const before = fs.statSync(first.file).mtimeMs;
    assert.equal(backupDatabase(db, { dir, keep: 14, date: "2026-11-21" }).skipped, true);
    db.prepare("INSERT INTO departments (name, slug) VALUES ('Added Later', 'added-later')").run();
    const again = backupDatabase(db, { dir, keep: 14, date: "2026-11-21", replace: true });
    assert.equal(again.skipped, false);
    const copy = new DatabaseSync(again.file, { readOnly: true });
    assert.ok(copy.prepare("SELECT 1 FROM departments WHERE slug = 'added-later'").get(), "the replaced copy has the new data");
    copy.close();
    assert.ok(fs.statSync(again.file).mtimeMs >= before);
  });

  test("keeps only the newest 14 daily backups and leaves other files alone", () => {
    const { db } = setup();
    const dir = tmp("b3");
    fs.mkdirSync(dir, { recursive: true });
    for (let d = 1; d <= 15; d++) fs.writeFileSync(path.join(dir, `anareen-2026-10-${String(d).padStart(2, "0")}.db`), "old");
    fs.writeFileSync(path.join(dir, "notes.txt"), "keep me");
    const r = backupDatabase(db, { dir, keep: 14, date: "2026-11-21" });
    const left = fs.readdirSync(dir).filter((f) => f.endsWith(".db")).sort();
    assert.equal(left.length, 14);
    assert.equal(left.at(-1), "anareen-2026-11-21.db");
    assert.equal(left[0], "anareen-2026-10-03.db");
    assert.deepEqual(r.removed.sort(), ["anareen-2026-10-01.db", "anareen-2026-10-02.db"]);
    assert.ok(fs.existsSync(path.join(dir, "notes.txt")));
  });

  test("npm run backup makes a copy by hand", () => {
    const dbFile = tmp("cli.db");
    const db = openDatabase(dbFile);
    seedDatabase(db, { rounds: 4 });
    db.close();
    const out = execFileSync(process.execPath, ["src/db/backup.js"], {
      cwd: path.join(__dirname, ".."),
      env: { ...process.env, DB_PATH: dbFile, BACKUP_DIR: tmp("cli-backups"), NODE_ENV: "test" },
      encoding: "utf8",
    });
    assert.match(out, /Backup saved: .*anareen-\d{4}-\d{2}-\d{2}\.db/);
    assert.equal(fs.readdirSync(tmp("cli-backups")).length, 1);
  });
});

describe("daily maintenance", () => {
  test("cleans up and backs up at startup, then not again the same day", () => {
    const { db } = setup();
    db.prepare("INSERT INTO bookings (doctor_id, queue_date, token, patient_name, phone, source, code) VALUES (1, '2000-01-01', 1, 'Long Ago', '9876543210', 'online', '1234')").run();
    const saved = { dir: config.backupDir, days: config.retentionDays };
    config.backupDir = tmp("maint");
    config.retentionDays = 30;
    const messages = [];
    const m = startMaintenance(db, { log: (msg) => messages.push(msg) });
    try {
      assert.equal(db.prepare("SELECT phone FROM bookings WHERE queue_date = '2000-01-01'").get().phone, null);
      assert.deepEqual(fs.readdirSync(config.backupDir), [`anareen-${today()}.db`]);
      assert.equal(messages.length, 2);
      m.run(); // the hourly check, same day
      assert.equal(messages.length, 2, "nothing more to do today");
    } finally {
      m.stop();
      config.backupDir = saved.dir;
      config.retentionDays = saved.days;
    }
  });

  test("a failed step is logged and retried at the next check", async () => {
    const { db } = setup();
    const saved = config.backupDir;
    const blocker = tmp("not-a-folder");
    fs.writeFileSync(blocker, "a file where the backup folder should be");
    config.backupDir = blocker;
    const errors = [];
    const original = console.error;
    console.error = (msg) => errors.push(String(msg));
    let m;
    try {
      m = startMaintenance(db, { log: () => {} });
      assert.ok(errors.some((e) => /ERROR daily backup/.test(e)));
      config.backupDir = tmp("maint-retry");
      m.run();
      assert.equal(fs.readdirSync(config.backupDir).length, 1, "the next hourly check makes the backup");
    } finally {
      console.error = original;
      m?.stop();
      config.backupDir = saved;
    }
  });
});
