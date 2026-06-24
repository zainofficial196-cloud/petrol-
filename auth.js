/* ===========================================================
   Authentication helpers.
   Passwords are never stored in plain text — we use Node's
   built-in crypto.scrypt to hash them with a random salt per
   user. Login returns a random token (like a temporary key)
   that the frontend must send back on every request.
   =========================================================== */

const crypto = require('crypto');

function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

// Builds a full user record (without id) ready to push into users.json
function createUserRecord(username, password, role, name) {
  const salt = generateSalt();
  const passwordHash = hashPassword(password, salt);
  return { username, salt, passwordHash, role, name };
}

function verifyPassword(password, salt, passwordHash) {
  const attempt = hashPassword(password, salt);
  const a = Buffer.from(attempt, 'hex');
  const b = Buffer.from(passwordHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  generateSalt,
  hashPassword,
  createUserRecord,
  verifyPassword,
  generateToken,
};
