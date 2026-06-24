/* ===========================================================
   Fuel Expense — Reports Page (Phase 4)
   Preview + Print/PDF generation via /api/reports/pdf
   =========================================================== */

const token   = sessionStorage.getItem('fuelToken');
const userRaw = sessionStorage.getItem('fuelUser');

// Auth guard
if (!token || !userRaw) {
  window.location.href = 'index.html';
}

const currentUser = userRaw ? JSON.parse(userRaw) : null;

// Current active report type
let activeType = 'month';

document.addEventListener('DOMContentLoaded', () => {

  // Show user info
  if (currentUser) {
    document.getElementById('whoami').textContent = `${currentUser.name} (${currentUser.role})`;
  }

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', logout);

  // Set default month to current month
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  document.getElementById('r_month').value = currentMonth;

  // Set default date range to current month
  const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const lastDay  = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  document.getElementById('r_dateFrom').value = firstDay;
  document.getElementById('r_dateTo').value   = lastDay;

  // Report type tabs
  document.querySelectorAll('.type-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      activeType = tab.dataset.type;
      switchTab(activeType);
      resetPreview();
    });
  });

  // Preview button
  document.getElementById('previewBtn').addEventListener('click', loadPreview);

  // Print button
  document.getElementById('printBtn').addEventListener('click', openPrintReport);

});

/* ---------------------------------------------------------
   Auth helpers
   --------------------------------------------------------- */
function authHeaders(extra = {}) {
  return Object.assign({ Authorization: `Bearer ${token}` }, extra);
}

async function logout() {
  try {
    await fetch('/api/logout', { method: 'POST', headers: authHeaders() });
  } catch (e) { /* ignore */ }
  sessionStorage.removeItem('fuelToken');
  sessionStorage.removeItem('fuelUser');
  window.location.href = 'index.html';
}

/* ---------------------------------------------------------
   Tab switching
   --------------------------------------------------------- */
function switchTab(type) {
  // Update tab buttons
  document.querySelectorAll('.type-tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.type === type);
  });

  // Show/hide panels
  document.querySelectorAll('.type-panel').forEach((p) => {
    p.classList.remove('active');
  });
  const panel = document.getElementById(`panel_${type}`);
  if (panel) panel.classList.add('active');
}

/* ---------------------------------------------------------
   Build query params based on active type
   --------------------------------------------------------- */
function buildParams() {
  const params = new URLSearchParams();

  switch (activeType) {
    case 'month': {
      const month = document.getElementById('r_month').value;
      if (!month) { showMessage('Month select karein.', 'error'); return null; }
      params.set('month', month);
      break;
    }
    case 'daterange': {
      const dateFrom = document.getElementById('r_dateFrom').value;
      const dateTo   = document.getElementById('r_dateTo').value;
      if (!dateFrom || !dateTo) { showMessage('Dono dates fill karein.', 'error'); return null; }
      if (dateFrom > dateTo)    { showMessage('Start date, end date se pehle honi chahiye.', 'error'); return null; }
      params.set('dateFrom', dateFrom);
      params.set('dateTo',   dateTo);
      break;
    }
    case 'vehicle': {
      const vehicle = document.getElementById('r_vehicle').value.trim();
      if (!vehicle) { showMessage('Vehicle number darj karein.', 'error'); return null; }
      params.set('vehicle', vehicle);
      break;
    }
    case 'all':
      // No extra params needed
      break;
  }

  return params;
}

/* ---------------------------------------------------------
   Preview — loads stats from /api/entries with filters
   --------------------------------------------------------- */
async function loadPreview() {
  const params = buildParams();
  if (params === null) return;

  showMessage('', '');
  setPreviewLoading(true);

  try {
    const res = await fetch(`/api/entries?${params.toString()}`, {
      headers: authHeaders(),
    });
    if (res.status === 401) return logout();

    const data = await res.json();
    const entries = data.entries || [];

    renderPreview(entries);

  } catch (err) {
    showMessage('Server se connect nahi ho saka.', 'error');
    resetPreview();
  } finally {
    setPreviewLoading(false);
  }
}

/* ---------------------------------------------------------
   Render preview summary
   --------------------------------------------------------- */
function renderPreview(entries) {
  const emptyEl    = document.getElementById('previewEmpty');
  const statsEl    = document.getElementById('previewStats');
  const breakdownEl = document.getElementById('vehicleBreakdown');

  if (entries.length === 0) {
    emptyEl.innerHTML = '<span class="empty-icon">📭</span><p>Is filter mein koi entry nahi mili.</p>';
    emptyEl.style.display = 'flex';
    statsEl.style.display = 'none';
    breakdownEl.style.display = 'none';
    return;
  }

  // Calculate totals
  const totalLiters = entries.reduce((s, e) => s + (Number(e.liters) || 0), 0);
  const totalAmount = entries.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const avgAmount   = totalAmount / entries.length;

  document.getElementById('prev_count').textContent  = entries.length;
  document.getElementById('prev_liters').textContent = `${totalLiters.toFixed(1)} L`;
  document.getElementById('prev_amount').textContent = `Rs. ${Math.round(totalAmount).toLocaleString()}`;
  document.getElementById('prev_avg').textContent    = `Rs. ${Math.round(avgAmount).toLocaleString()}`;

  statsEl.style.display = 'grid';
  emptyEl.style.display = 'none';

  // Vehicle breakdown
  const vehicleMap = {};
  entries.forEach((e) => {
    const v = e.vehicleNumber || 'Unknown';
    if (!vehicleMap[v]) vehicleMap[v] = { liters: 0, amount: 0, count: 0 };
    vehicleMap[v].liters += Number(e.liters) || 0;
    vehicleMap[v].amount += Number(e.amount) || 0;
    vehicleMap[v].count  += 1;
  });

  const vehicleList = Object.entries(vehicleMap)
    .sort(([, a], [, b]) => b.amount - a.amount);

  const listEl = document.getElementById('breakdownList');
  listEl.innerHTML = vehicleList.map(([vehicle, data]) => {
    const pct = totalAmount > 0 ? (data.amount / totalAmount) * 100 : 0;
    return `
      <div class="breakdown-item">
        <div class="breakdown-top">
          <span class="breakdown-vehicle">${vehicle}</span>
          <span class="breakdown-amount">Rs. ${Math.round(data.amount).toLocaleString()}</span>
        </div>
        <div class="breakdown-bar-wrap">
          <div class="breakdown-bar" style="width:${pct.toFixed(1)}%"></div>
        </div>
        <div class="breakdown-sub">${data.count} entries · ${data.liters.toFixed(1)} L</div>
      </div>
    `;
  }).join('');

  breakdownEl.style.display = 'block';
}

/* ---------------------------------------------------------
   Open print report in new tab
   --------------------------------------------------------- */
function openPrintReport() {
  const params = buildParams();
  if (params === null) return;

  showMessage('Report tayyar ho rahi hai...', 'success');

  // Build URL with auth token in query (for report endpoint)
  const reportUrl = `/api/reports/pdf?${params.toString()}&_token=${encodeURIComponent(token)}`;

  const win = window.open(reportUrl, '_blank');
  if (!win) {
    showMessage('Popup blocked hai. Browser settings mein popups allow karein.', 'error');
    return;
  }

  // Auto-trigger print after page loads
  win.addEventListener('load', () => {
    setTimeout(() => {
      win.print();
    }, 800);
  });

  showMessage('Report naye tab mein khul rahi hai — print dialog aayega.', 'success');
}

/* ---------------------------------------------------------
   UI helpers
   --------------------------------------------------------- */
function resetPreview() {
  document.getElementById('previewEmpty').innerHTML =
    '<span class="empty-icon">📊</span><p>Preview button dabayein to yahan summary dikhegi.</p>';
  document.getElementById('previewEmpty').style.display   = 'flex';
  document.getElementById('previewStats').style.display   = 'none';
  document.getElementById('vehicleBreakdown').style.display = 'none';
}

function setPreviewLoading(isLoading) {
  const btn = document.getElementById('previewBtn');
  btn.disabled    = isLoading;
  btn.textContent = isLoading ? '⏳ Loading...' : '👁 Preview Report';
}

function showMessage(text, type) {
  const el = document.getElementById('reportMessage');
  el.textContent  = text;
  el.style.color  = type === 'error' ? '#D8453A' : '#2E7D32';
}