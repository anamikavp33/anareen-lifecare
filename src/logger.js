/**
 * Error log. Server errors are printed to the console and appended, one
 * timestamped entry each, to LOG_FILE so problems can be looked at later.
 * When the file passes 5 MB it is renamed to <file>.1 (replacing the older
 * one), so the log can never fill the disk.
 *
 * Callers pass a short context such as "GET /api/book", never the query
 * string, so mobile numbers don't end up in the log.
 */
const fs = require("fs");
const path = require("path");
const config = require("./config");

const MAX_BYTES = 5 * 1024 * 1024;

function logError(err, context = "") {
  const entry = `[${new Date().toISOString()}] ERROR${context ? ` ${context}` : ""}: ${err?.stack || err}\n`;
  console.error(entry.trimEnd());
  if (!config.logFile) return;
  try {
    fs.mkdirSync(path.dirname(path.resolve(config.logFile)), { recursive: true });
    if (fs.existsSync(config.logFile) && fs.statSync(config.logFile).size > MAX_BYTES) {
      fs.renameSync(config.logFile, `${config.logFile}.1`);
    }
    fs.appendFileSync(config.logFile, entry);
  } catch (e) {
    console.error(`Could not write to ${config.logFile}: ${e.message}`);
  }
}

module.exports = { logError };
