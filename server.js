/* ===========================================================
   Fuel Expense & Slip Management — Backend Server
   Phase 1: Foundation (per project roadmap)
     - JSON-file database (users, vehicles, drivers, entries)
     - Role-based authentication (Admin / Accountant / Driver)
     - Basic CRUD APIs

   Run with:  node server.js
   Then open: http://localhost:3000

   No npm install needed — only Node's built-in modules are used.
   =========================================================== */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const { readJSON, writeJSON, nextId } = require('./lib/db');
const { createUserRecord, verifyPassword, generateToken } = require('./lib/auth');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

/* ---------------------------------------------------------
   First-run setup: create data files with demo accounts
   --------------------------------------------------------- */
function ensureSeedData() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

  const usersFile = path.join(DATA_DIR, 'users.json');
  if (!fs.existsSync(usersFile)) {
    const admin = { id: 1, ...createUserRecord('admin', 'admin123', 'admin', 'Office Admin') };
    const accountant = { id: 2, ...createUserRecord('accountant', 'acc123', 'accountant', 'Accountant') };
    writeJSON('users.json', [admin, accountant]);
  }

  ['vehicles.json', 'drivers.json', 'entries.json', 'sessions.json'].forEach((f) => {
    const fp = path.join(DATA_DIR, f);
    if (!fs.existsSync(fp)) fs.writeFileSync(fp, '[]', 'utf-8');
  });
}
ensureSeedData();

/* ---------------------------------------------------------
   Small helpers
   --------------------------------------------------------- */
function sendJSON(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function getBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function getTokenUser(req) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;

  const sessions = readJSON('sessions.json');
  const session = sessions.find((s) => s.token === token);
  if (!session || session.expiresAt < Date.now()) return null;

  const users = readJSON('users.json');
  return users.find((u) => u.id === session.userId) || null;
}

// Returns the logged-in user, or sends a 401/403 and returns null
function requireAuth(req, res, roles) {
  const user = getTokenUser(req);
  if (!user) {
    sendJSON(res, 401, { success: false, message: 'Login required.' });
    return null;
  }
  if (roles && !roles.includes(user.role)) {
    sendJSON(res, 403, { success: false, message: 'You do not have permission for this action.' });
    return null;
  }
  return user;
}

/* ---------------------------------------------------------
   Static file serving (the frontend lives in /public)
   --------------------------------------------------------- */
function serveStatic(req, res, pathname) {
  const safePath = path.normalize(pathname === '/' ? '/index.html' : pathname);
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

/* ---------------------------------------------------------
   Route handlers — Auth
   --------------------------------------------------------- */
async function handleLogin(req, res) {
  const body = await getBody(req);
  const { username, password } = body;

  if (!username || !password) {
    return sendJSON(res, 400, { success: false, message: 'Username and password required.' });
  }

  const users = readJSON('users.json');
  const user = users.find((u) => u.username === username);

  if (!user || !verifyPassword(password, user.salt, user.passwordHash)) {
    return sendJSON(res, 401, { success: false, message: 'Invalid username or password.' });
  }

  const token = generateToken();
  const sessions = readJSON('sessions.json');
  sessions.push({ token, userId: user.id, expiresAt: Date.now() + 1000 * 60 * 60 * 8 }); // 8 hours
  writeJSON('sessions.json', sessions);

  sendJSON(res, 200, {
    success: true,
    token,
    user: { id: user.id, name: user.name, role: user.role, username: user.username },
  });
}

function handleLogout(req, res) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    const sessions = readJSON('sessions.json').filter((s) => s.token !== token);
    writeJSON('sessions.json', sessions);
  }
  sendJSON(res, 200, { success: true });
}

function handleMe(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;
  sendJSON(res, 200, {
    success: true,
    user: { id: user.id, name: user.name, role: user.role, username: user.username },
  });
}

/* ---------------------------------------------------------
   Route handlers — Vehicles
   --------------------------------------------------------- */
function handleGetVehicles(req, res) {
  const user = requireAuth(req, res, ['admin', 'accountant', 'driver']);
  if (!user) return;
  sendJSON(res, 200, { success: true, vehicles: readJSON('vehicles.json') });
}

async function handleAddVehicle(req, res) {
  const user = requireAuth(req, res, ['admin']);
  if (!user) return;
  const body = await getBody(req);
  if (!body.number) return sendJSON(res, 400, { success: false, message: 'Vehicle number required.' });

  const vehicles = readJSON('vehicles.json');
  const vehicle = { id: nextId(vehicles), number: body.number, type: body.type || '' };
  vehicles.push(vehicle);
  writeJSON('vehicles.json', vehicles);
  sendJSON(res, 201, { success: true, vehicle });
}

/* ---------------------------------------------------------
   Route handlers — Drivers
   --------------------------------------------------------- */
function handleGetDrivers(req, res) {
  const user = requireAuth(req, res, ['admin', 'accountant']);
  if (!user) return;
  sendJSON(res, 200, { success: true, drivers: readJSON('drivers.json') });
}

async function handleAddDriver(req, res) {
  const user = requireAuth(req, res, ['admin']);
  if (!user) return;
  const body = await getBody(req);
  if (!body.name) return sendJSON(res, 400, { success: false, message: 'Driver name required.' });

  const drivers = readJSON('drivers.json');
  const driver = { id: nextId(drivers), name: body.name, vehicleId: body.vehicleId || null };
  drivers.push(driver);
  writeJSON('drivers.json', drivers);
  sendJSON(res, 201, { success: true, driver });
}

/* ---------------------------------------------------------
   Route handlers — Fuel Entries
   --------------------------------------------------------- */
function handleGetEntries(req, res) {
  const user = requireAuth(req, res, ['admin', 'accountant', 'driver']);
  if (!user) return;

  const parsed = url.parse(req.url, true);
  const { search, vehicle, driver, dateFrom, dateTo, month } = parsed.query;

  let entries = readJSON('entries.json');

  // Driver can only see own entries
  if (user.role === 'driver') {
    entries = entries.filter((e) => e.createdBy === user.id);
  }

  // Search (vehicle number ya driver name mein)
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    entries = entries.filter(
      (e) =>
        (e.vehicleNumber || '').toLowerCase().includes(q) ||
        (e.createdByName || '').toLowerCase().includes(q) ||
        (e.pumpName || '').toLowerCase().includes(q)
    );
  }

  // Vehicle filter
  if (vehicle && vehicle.trim()) {
    const v = vehicle.trim().toLowerCase();
    entries = entries.filter((e) => (e.vehicleNumber || '').toLowerCase().includes(v));
  }

  // Driver filter
  if (driver && driver.trim()) {
    const d = driver.trim().toLowerCase();
    entries = entries.filter((e) => (e.createdByName || '').toLowerCase().includes(d));
  }

  // Date range filter
  if (dateFrom) {
    entries = entries.filter((e) => e.date && e.date >= dateFrom);
  }
  if (dateTo) {
    entries = entries.filter((e) => e.date && e.date <= dateTo);
  }

  // Month filter (YYYY-MM format)
  if (month) {
    entries = entries.filter((e) => e.date && e.date.startsWith(month));
  }

  sendJSON(res, 200, { success: true, entries });
}

async function handleAddEntry(req, res) {
  const user = requireAuth(req, res, ['admin', 'driver']);
  if (!user) return;

  const body = await getBody(req);
  const { vehicleNumber, liters, amount, fuelType, pumpName, slipNumber, date } = body;

  if (!vehicleNumber || !liters || !amount) {
    return sendJSON(res, 400, { success: false, message: 'Vehicle, liters, and amount are required.' });
  }
  if (isNaN(liters) || isNaN(amount) || Number(liters) <= 0 || Number(amount) <= 0) {
    return sendJSON(res, 400, { success: false, message: 'Liters and amount must be valid positive numbers.' });
  }

  const entries = readJSON('entries.json');
  const entry = {
    id: nextId(entries),
    vehicleNumber,
    liters: Number(liters),
    amount: Number(amount),
    fuelType: fuelType || 'Petrol',
    pumpName: pumpName || '',
    slipNumber: slipNumber || '',
    date: date || new Date().toISOString().slice(0, 10),
    createdBy: user.id,
    createdByName: user.name,
    createdAt: new Date().toISOString(),
  };
  entries.push(entry);
  writeJSON('entries.json', entries);
  sendJSON(res, 201, { success: true, entry });
}

function handleDeleteEntry(req, res, id) {
  const user = requireAuth(req, res, ['admin']);
  if (!user) return;

  let entries = readJSON('entries.json');
  const exists = entries.some((e) => e.id === id);
  if (!exists) return sendJSON(res, 404, { success: false, message: 'Entry not found.' });

  entries = entries.filter((e) => e.id !== id);
  writeJSON('entries.json', entries);
  sendJSON(res, 200, { success: true });
}

/* ---------------------------------------------------------
   Route handlers — Stats (Phase 3)
   --------------------------------------------------------- */
function handleGetStats(req, res) {
  const user = requireAuth(req, res, ['admin', 'accountant']);
  if (!user) return;

  let entries = readJSON('entries.json');

  // Monthly totals (last 6 months)
  const monthlyMap = {};
  entries.forEach((e) => {
    if (!e.date) return;
    const month = e.date.slice(0, 7); // YYYY-MM
    if (!monthlyMap[month]) monthlyMap[month] = { month, totalLiters: 0, totalAmount: 0, count: 0 };
    monthlyMap[month].totalLiters += Number(e.liters) || 0;
    monthlyMap[month].totalAmount += Number(e.amount) || 0;
    monthlyMap[month].count += 1;
  });
  const monthly = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month)).slice(-6);

  // Vehicle-wise totals
  const vehicleMap = {};
  entries.forEach((e) => {
    const v = e.vehicleNumber || 'Unknown';
    if (!vehicleMap[v]) vehicleMap[v] = { vehicle: v, totalLiters: 0, totalAmount: 0, count: 0 };
    vehicleMap[v].totalLiters += Number(e.liters) || 0;
    vehicleMap[v].totalAmount += Number(e.amount) || 0;
    vehicleMap[v].count += 1;
  });
  const byVehicle = Object.values(vehicleMap).sort((a, b) => b.totalAmount - a.totalAmount).slice(0, 10);

  // Driver-wise totals
  const driverMap = {};
  entries.forEach((e) => {
    const d = e.createdByName || 'Unknown';
    if (!driverMap[d]) driverMap[d] = { driver: d, totalLiters: 0, totalAmount: 0, count: 0 };
    driverMap[d].totalLiters += Number(e.liters) || 0;
    driverMap[d].totalAmount += Number(e.amount) || 0;
    driverMap[d].count += 1;
  });
  const byDriver = Object.values(driverMap).sort((a, b) => b.totalAmount - a.totalAmount).slice(0, 10);

  // Overall totals
  const totalLiters = entries.reduce((s, e) => s + (Number(e.liters) || 0), 0);
  const totalAmount = entries.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const totalEntries = entries.length;

  // Current month stats
  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentMonthEntries = entries.filter((e) => e.date && e.date.startsWith(currentMonth));
  const monthLiters = currentMonthEntries.reduce((s, e) => s + (Number(e.liters) || 0), 0);
  const monthAmount = currentMonthEntries.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  sendJSON(res, 200, {
    success: true,
    stats: {
      totalLiters: Math.round(totalLiters * 100) / 100,
      totalAmount: Math.round(totalAmount),
      totalEntries,
      monthLiters: Math.round(monthLiters * 100) / 100,
      monthAmount: Math.round(monthAmount),
      monthly,
      byVehicle,
      byDriver,
    },
  });
}

/* ---------------------------------------------------------
   OCR handler — Phase 2
   Receives a base64 image, calls Claude Vision API to extract
   fuel slip details (vehicle, liters, amount, driver, date).
   --------------------------------------------------------- */
async function handleOCR(req, res) {
  const user = requireAuth(req, res, ['admin', 'accountant', 'driver']);
  if (!user) return;

  let body;
  try {
    body = await getBody(req);
  } catch {
    return sendJSON(res, 400, { success: false, message: 'Invalid request body.' });
  }

  const { imageBase64 } = body;
  if (!imageBase64) {
    return sendJSON(res, 400, { success: false, message: 'imageBase64 field zaroor chahiye.' });
  }

  // Detect image type from base64 prefix or default to jpeg
  let mediaType = 'image/jpeg';
  if (imageBase64.startsWith('/9j/') || imageBase64.startsWith('FFD8')) {
    mediaType = 'image/jpeg';
  } else if (imageBase64.startsWith('iVBOR')) {
    mediaType = 'image/png';
  } else if (imageBase64.startsWith('UklG')) {
    mediaType = 'image/webp';
  }

  const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

  const prompt = `You are an OCR assistant for a fleet fuel management system in Pakistan.
Analyze this fuel slip/receipt image and extract the following information.
Return ONLY a valid JSON object with this exact structure (no markdown, no extra text):

{
  "vehicle": { "value": "vehicle number or plate or name", "confidence": 0.0-1.0 },
  "liters":  { "value": "numeric liters amount as string", "confidence": 0.0-1.0 },
  "amount":  { "value": "total amount in Rs as numeric string", "confidence": 0.0-1.0 },
  "driver":  { "value": "driver name if visible", "confidence": 0.0-1.0 },
  "date":    { "value": "date in YYYY-MM-DD format", "confidence": 0.0-1.0 },
  "notes":   { "value": "any other useful info like pump station name", "confidence": 0.0-1.0 }
}

Rules:
- If a field is not visible or unclear, set value to "" and confidence to 0.0
- For date: if year is not visible, assume current year ${new Date().getFullYear()}
- For liters and amount: return only the number, no units or currency symbols
- Confidence should reflect how certain you are about each field (1.0 = very certain, 0.0 = not found)
- Return raw JSON only, no explanation, no markdown code blocks`;

  try {
    const apiRes = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: imageBase64,
                },
              },
              { type: 'text', text: prompt },
            ],
          },
        ],
      }),
    });

    const apiData = await apiRes.json();

    if (!apiRes.ok) {
      console.error('Anthropic API error:', apiData);
      // If no API key is set, return a helpful demo response
      if (!process.env.ANTHROPIC_API_KEY) {
        return sendJSON(res, 200, {
          success: true,
          result: {
            vehicle: { value: '', confidence: 0 },
            liters:  { value: '', confidence: 0 },
            amount:  { value: '', confidence: 0 },
            driver:  { value: '', confidence: 0 },
            date:    { value: new Date().toISOString().split('T')[0], confidence: 0.5 },
            notes:   { value: 'ANTHROPIC_API_KEY environment variable set nahi hai. .env file mein key daalen.', confidence: 0 },
          },
          _demo: true,
        });
      }
      return sendJSON(res, 502, { success: false, message: 'AI service se error aaya. Baad mein koshish karein.' });
    }

    // Extract text response
    const textContent = apiData.content.find((c) => c.type === 'text');
    if (!textContent) {
      return sendJSON(res, 502, { success: false, message: 'AI ne koi response nahi diya.' });
    }

    // Parse JSON from response
    let result;
    try {
      const cleaned = textContent.text.replace(/```json|```/g, '').trim();
      result = JSON.parse(cleaned);
    } catch {
      return sendJSON(res, 502, { success: false, message: 'AI response parse nahi hua. Dobara koshish karein.' });
    }

    return sendJSON(res, 200, { success: true, result });

  } catch (err) {
    console.error('OCR fetch error:', err);
    return sendJSON(res, 500, { success: false, message: 'OCR process mein error aya.' });
  }
}

/* ---------------------------------------------------------
   Main request router
   --------------------------------------------------------- */
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  try {
    if (pathname === '/api/login' && req.method === 'POST') return await handleLogin(req, res);
    if (pathname === '/api/logout' && req.method === 'POST') return handleLogout(req, res);
    if (pathname === '/api/me' && req.method === 'GET') return handleMe(req, res);

    if (pathname === '/api/vehicles' && req.method === 'GET') return handleGetVehicles(req, res);
    if (pathname === '/api/vehicles' && req.method === 'POST') return await handleAddVehicle(req, res);

    if (pathname === '/api/drivers' && req.method === 'GET') return handleGetDrivers(req, res);
    if (pathname === '/api/drivers' && req.method === 'POST') return await handleAddDriver(req, res);

    if (pathname === '/api/entries' && req.method === 'GET') return handleGetEntries(req, res);
    if (pathname === '/api/entries' && req.method === 'POST') return await handleAddEntry(req, res);

    if (pathname === '/api/ocr' && req.method === 'POST') return await handleOCR(req, res);
    if (pathname === '/api/stats' && req.method === 'GET') return handleGetStats(req, res);

    const deleteMatch = pathname.match(/^\/api\/entries\/(\d+)$/);
    if (deleteMatch && req.method === 'DELETE') return handleDeleteEntry(req, res, Number(deleteMatch[1]));

    if (pathname.startsWith('/api/')) {
      return sendJSON(res, 404, { success: false, message: 'API route not found.' });
    }

    return serveStatic(req, res, pathname);
  } catch (err) {
    console.error(err);
    sendJSON(res, 500, { success: false, message: 'Server error.' });
  }
});

server.listen(PORT, () => {
  console.log(`Fuel Expense System running at http://localhost:${PORT}`);
  console.log('Demo logins: admin / admin123  (Admin)');
  console.log('             accountant / acc123  (Accountant)');
});
