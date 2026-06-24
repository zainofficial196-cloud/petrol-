// controllers/authController.js

const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const db     = require('../config/db');

// POST /api/auth/login
async function login(req, res, next) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required.' });
    }

    // Look up the user — always use a parameterized query.
    const [rows] = await db.execute(
      'SELECT id, username, password, full_name, role, status FROM users WHERE username = ? LIMIT 1',
      [username]
    );

    const user = rows[0];

    // Use the same error message whether the user doesn't exist or the password
    // is wrong — prevents username enumeration.
    if (!user || user.status !== 'active') {
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }

    // Sign a JWT that the frontend will store and send with every request.
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        id:        user.id,
        username:  user.username,
        full_name: user.full_name,
        role:      user.role,
      },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/auth/me  — return the currently logged-in user's info
async function me(req, res, next) {
  try {
    const [rows] = await db.execute(
      'SELECT id, username, full_name, role FROM users WHERE id = ? LIMIT 1',
      [req.user.id]
    );

    if (!rows[0]) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    res.json({ success: true, user: rows[0] });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, me };
