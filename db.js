/* ===========================================================
   Simple JSON-file "database" helper.
   No external database server needed — data is stored as
   .json files inside the /data folder. Good enough for a
   single small office; can be swapped for MongoDB later
   without changing the route handlers much (see README.md).
   =========================================================== */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

function readJSON(file) {
  const filePath = path.join(DATA_DIR, file);
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf-8');
  if (!raw.trim()) return [];
  return JSON.parse(raw);
}

function writeJSON(file, data) {
  const filePath = path.join(DATA_DIR, file);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// Gives the next auto-increment style id for a list of records
function nextId(items) {
  return items.length ? Math.max(...items.map((i) => i.id)) + 1 : 1;
}

module.exports = { readJSON, writeJSON, nextId, DATA_DIR };
