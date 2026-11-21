/**
 * Database backups with SQLite's VACUUM INTO, which writes a clean, consistent
 * copy while the app keeps running (an "online" backup). There is one file per
 * day in BACKUP_DIR, named anareen-YYYY-MM-DD.db, and only the newest
 * BACKUP_KEEP are kept.
 *
 * Run by hand with:  npm run backup   (replaces today's copy with a fresh one)
 *
 * To restore: stop the server, copy a backup over DB_PATH, delete the -wal and
 * -shm files next to DB_PATH if present, and start the server again.
 */
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("./index");

const BACKUP_FILE = /^anareen-\d{4}-\d{2}-\d{2}\.db$/;

function backupDatabase(db, { dir, keep, date, replace = false }) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `anareen-${date}.db`);
  if (!replace && fs.existsSync(file)) return { file, skipped: true, removed: [] };

  // Write to a temporary name first, so a half-written copy never looks like a real backup.
  const partial = `${file}.partial`;
  fs.rmSync(partial, { force: true });
  db.prepare("VACUUM INTO ?").run(partial);

  // A backup that can't be restored is worse than none: check it before keeping it.
  const copy = new DatabaseSync(partial, { readOnly: true });
  let result;
  try {
    result = copy.prepare("PRAGMA quick_check").get().quick_check;
  } finally {
    copy.close();
  }
  if (result !== "ok") {
    fs.rmSync(partial, { force: true });
    throw new Error(`Backup failed its integrity check: ${result}`);
  }
  fs.renameSync(partial, file);
  return { file, skipped: false, removed: pruneBackups(dir, keep) };
}

/** Deletes all but the newest `keep` daily backups. Other files in the folder are left alone. */
function pruneBackups(dir, keep) {
  const old = fs.readdirSync(dir).filter((f) => BACKUP_FILE.test(f)).sort().reverse().slice(keep);
  for (const f of old) fs.rmSync(path.join(dir, f));
  return old;
}

module.exports = { backupDatabase, pruneBackups };

if (require.main === module) {
  const config = require("../config");
  const { openDatabase } = require("./index");
  const { today } = require("../services/queue");
  if (!fs.existsSync(config.dbPath)) {
    console.error(`No database found at ${config.dbPath}. Start the app once with \`npm start\` first.`);
    process.exit(1);
  }
  const db = openDatabase(config.dbPath);
  try {
    const r = backupDatabase(db, { dir: config.backupDir, keep: config.backupKeep, date: today(), replace: true });
    console.log(`Backup saved: ${r.file}`);
    if (r.removed.length) console.log(`Removed old backups: ${r.removed.join(", ")}`);
  } catch (e) {
    console.error(`Backup failed: ${e.message}`);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}
