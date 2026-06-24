// controllers/fuelController.js

const fs   = require('fs');
const path = require('path');
const db   = require('../config/db');

// ─── GET /api/fuel-entries ───────────────────────────────
// Supports optional query params: ?search=&vehicle_id=&date=
async function getAll(req, res, next) {
  try {
    const { search, vehicle_id, date } = req.query;

    let sql = `
      SELECT
        fe.id,
        fe.vehicle_id,
        v.vehicle_number,
        fe.driver_name,
        fe.fuel_type,
        fe.liters,
        fe.amount,
        fe.entry_date,
        fe.slip_image,
        fe.created_at
      FROM fuel_entries fe
      JOIN vehicles v ON v.id = fe.vehicle_id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      sql += ' AND (v.vehicle_number LIKE ? OR fe.driver_name LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like);
    }

    if (vehicle_id) {
      sql += ' AND fe.vehicle_id = ?';
      params.push(vehicle_id);
    }

    if (date) {
      sql += ' AND fe.entry_date = ?';
      params.push(date);
    }

    sql += ' ORDER BY fe.entry_date DESC, fe.id DESC';

    const [rows] = await db.execute(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/fuel-entries/:id ───────────────────────────
async function getById(req, res, next) {
  try {
    const [rows] = await db.execute(
      `SELECT fe.*, v.vehicle_number
       FROM fuel_entries fe
       JOIN vehicles v ON v.id = fe.vehicle_id
       WHERE fe.id = ? LIMIT 1`,
      [req.params.id]
    );

    if (!rows[0]) {
      return res.status(404).json({ success: false, message: 'Fuel entry not found.' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/fuel-entries ──────────────────────────────
// Accepts multipart/form-data (because of slip image upload).
async function create(req, res, next) {
  try {
    const { vehicle_id, driver_name, fuel_type, liters, amount, entry_date } = req.body;

    // Validate required fields
    if (!vehicle_id || !driver_name || !fuel_type || !liters || !amount || !entry_date) {
      // If a file was uploaded but validation fails, remove it to avoid orphans.
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    const allowedFuelTypes = ['Petrol', 'Diesel'];
    if (!allowedFuelTypes.includes(fuel_type)) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, message: 'fuel_type must be Petrol or Diesel.' });
    }

    // Verify the vehicle exists
    const [vRows] = await db.execute('SELECT id, driver_name FROM vehicles WHERE id = ? LIMIT 1', [vehicle_id]);
    if (!vRows[0]) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ success: false, message: 'Vehicle not found.' });
    }

    const slipImagePath = req.file
      ? req.file.path.replace(/\\/g, '/') // normalize Windows backslashes
      : null;

    const [result] = await db.execute(
      `INSERT INTO fuel_entries
         (vehicle_id, driver_name, fuel_type, liters, amount, entry_date, slip_image, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        vehicle_id,
        driver_name.trim(),
        fuel_type,
        parseFloat(liters),
        parseFloat(amount),
        entry_date,
        slipImagePath,
        req.user.id,
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Fuel entry saved successfully.',
      data: { id: result.insertId, slip_image: slipImagePath },
    });
  } catch (err) {
    if (req.file) fs.unlinkSync(req.file.path);
    next(err);
  }
}

// ─── PUT /api/fuel-entries/:id ───────────────────────────
async function update(req, res, next) {
  try {
    const { driver_name, fuel_type, liters, amount, entry_date } = req.body;

    if (!driver_name || !fuel_type || !liters || !amount || !entry_date) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    const allowedFuelTypes = ['Petrol', 'Diesel'];
    if (!allowedFuelTypes.includes(fuel_type)) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, message: 'fuel_type must be Petrol or Diesel.' });
    }

    // Fetch existing record so we can delete the old slip if a new one is uploaded.
    const [existing] = await db.execute('SELECT slip_image FROM fuel_entries WHERE id = ? LIMIT 1', [req.params.id]);
    if (!existing[0]) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ success: false, message: 'Fuel entry not found.' });
    }

    let slipImagePath = existing[0].slip_image;

    if (req.file) {
      // Delete the old slip file if it exists.
      if (slipImagePath && fs.existsSync(slipImagePath)) {
        fs.unlinkSync(slipImagePath);
      }
      slipImagePath = req.file.path.replace(/\\/g, '/');
    }

    await db.execute(
      `UPDATE fuel_entries
       SET driver_name = ?, fuel_type = ?, liters = ?, amount = ?, entry_date = ?, slip_image = ?
       WHERE id = ?`,
      [
        driver_name.trim(),
        fuel_type,
        parseFloat(liters),
        parseFloat(amount),
        entry_date,
        slipImagePath,
        req.params.id,
      ]
    );

    res.json({ success: true, message: 'Fuel entry updated successfully.' });
  } catch (err) {
    if (req.file) fs.unlinkSync(req.file.path);
    next(err);
  }
}

// ─── DELETE /api/fuel-entries/:id ────────────────────────
async function remove(req, res, next) {
  try {
    const [rows] = await db.execute('SELECT slip_image FROM fuel_entries WHERE id = ? LIMIT 1', [req.params.id]);
    if (!rows[0]) {
      return res.status(404).json({ success: false, message: 'Fuel entry not found.' });
    }

    // Delete from DB first.
    await db.execute('DELETE FROM fuel_entries WHERE id = ?', [req.params.id]);

    // Then clean up the slip file from disk (best-effort).
    const slipPath = rows[0].slip_image;
    if (slipPath && fs.existsSync(slipPath)) {
      fs.unlinkSync(slipPath);
    }

    res.json({ success: true, message: 'Fuel entry deleted successfully.' });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/fuel-entries/dashboard-stats ───────────────
async function dashboardStats(req, res, next) {
  try {
    const [[{ total_vehicles }]] = await db.execute('SELECT COUNT(*) AS total_vehicles FROM vehicles');
    const [[{ total_drivers }]]  = await db.execute('SELECT COUNT(DISTINCT driver_name) AS total_drivers FROM vehicles');
    const [[{ total_slips }]]    = await db.execute('SELECT COUNT(*) AS total_slips FROM fuel_entries');
    const [[{ total_cost }]]     = await db.execute('SELECT COALESCE(SUM(amount), 0) AS total_cost FROM fuel_entries');

    const [recent] = await db.execute(
      `SELECT v.vehicle_number, fe.driver_name, fe.amount, fe.entry_date
       FROM fuel_entries fe
       JOIN vehicles v ON v.id = fe.vehicle_id
       ORDER BY fe.entry_date DESC, fe.id DESC
       LIMIT 6`
    );

    res.json({
      success: true,
      data: {
        total_vehicles,
        total_drivers,
        total_slips,
        total_cost: parseFloat(total_cost),
        recent_entries: recent,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getAll, getById, create, update, remove, dashboardStats };
