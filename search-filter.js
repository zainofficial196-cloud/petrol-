/* ===========================================================
   Fuel Expense — Search & Filter Page (Phase 3)
   Talks to the updated /api/entries with query params.
   =========================================================== */

const token = sessionStorage.getItem('fuelToken');
const userRaw = sessionStorage.getItem('fuelUser');

// Auth guard
if (!token || !userRaw) {
  window.location.href = 'index.html';
}

const currentUser = userRaw ? JSON.parse(userRaw) : null;

// All fetched entries (kept in memory for client-side sort)
let allEntries = [];

document.addEventListener('DOMContentLoaded', () => {
  // Show logged-in user
  if (currentUser) {
    document.getElementById('whoami').textContent = `${currentUser.name} (${currentUser.role})`;
  }

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', logout);

  // Search button
  document.getElementById('searchBtn').addEventListener('click', doSearch);

  // Clear button
  document.getElementById('clearBtn').addEventListener('click', clearFilters);

  // Sort change
  document.getElementById('sortBy').addEventListener('change', () => {
    renderTable(allEntries);
  });

  // Enter key on any filter input triggers search
  document.querySelectorAll('.filter-input').forEach((input) => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSearch();
    });
  });

  // Month input clears date range and vice versa (they conflict)
  document.getElementById('f_month').addEventListener('change', () => {
    document.getElementById('f_dateFrom').value = '';
    document.getElementById('f_dateTo').value = '';
  });
  document.getElementById('f_dateFrom').addEventListener('change', () => {
    document.getElementById('f_month').value = '';
  });
  document.getElementById('f_dateTo').addEventListener('change', () => {
    document.getElementById('f_month').value = '';
  });

  // Load all entries on page open
  doSearch();
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
   Main search function
   --------------------------------------------------------- */
async function doSearch() {
  const search   = document.getElementById('f_search').value.trim();
  const vehicle  = document.getElementById('f_vehicle').value.trim();
  const driver   = document.getElementById('f_driver').value.trim();
  const month    = document.getElementById('f_month').value;
  const dateFrom = document.getElementById('f_dateFrom').value;
  const dateTo   = document.getElementById('f_dateTo').value;

  // Build query string
  const params = new URLSearchParams();
  if (search)   params.set('search', search);
  if (vehicle)  params.set('vehicle', vehicle);
  if (driver)   params.set('driver', driver);
  if (month)    params.set('month', month);
  if (dateFrom) params.set('dateFrom', dateFrom);
  if (dateTo)   params.set('dateTo', dateTo);

  setSearchLoading(true);

  try {
    const res = await fetch(`/api/entries?${params.toString()}`, {
      headers: authHeaders(),
    });

    if (res.status === 401) return logout();

    const data = await res.json();
    allEntries = data.entries || [];

    renderTable(allEntries);
    renderSummary(allEntries);
    showResultsArea(true);

  } catch (err) {
    showError('Server se connect nahi ho saka. "node server.js" chal raha hai?');
  } finally {
    setSearchLoading(false);
  }
}

/* ---------------------------------------------------------
   Render table with current sort
   --------------------------------------------------------- */
function renderTable(entries) {
  const sortVal = document.getElementById('sortBy').value;
  const sorted = [...entries].sort((a, b) => {
    switch (sortVal) {
      case 'date-asc':     return (a.date || '').localeCompare(b.date || '');
      case 'date-desc':    return (b.date || '').localeCompare(a.date || '');
      case 'amount-desc':  return (Number(b.amount) || 0) - (Number(a.amount) || 0);
      case 'amount-asc':   return (Number(a.amount) || 0) - (Number(b.amount) || 0);
      case 'liters-desc':  return (Number(b.liters) || 0) - (Number(a.liters) || 0);
      default:             return (b.date || '').localeCompare(a.date || '');
    }
  });

  const tbody = document.getElementById('tableBody');
  const emptyState = document.getElementById('emptyState');
  const tableWrap = document.querySelector('.table-wrap');

  // Update results badge
  const badge = document.getElementById('resultsBadge');
  const countEl = document.getElementById('resultsCount');
  badge.style.display = 'flex';
  countEl.textContent = `${sorted.length} entr${sorted.length === 1 ? 'y' : 'ies'}`;

  if (sorted.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = 'block';
    tableWrap.style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';
  tableWrap.style.display = 'block';

  tbody.innerHTML = sorted.map((item, idx) => `
    <tr>
      <td class="td-num">${idx + 1}</td>
      <td class="td-date">${formatDate(item.date)}</td>
      <td class="td-vehicle"><span class="vehicle-pill">${item.vehicleNumber || '—'}</span></td>
      <td class="td-driver">${item.createdByName || '—'}</td>
      <td class="td-pump">${item.pumpName || '—'}</td>
      <td class="td-liters">${Number(item.liters).toFixed(1)} L</td>
      <td class="td-amount amber-text">Rs. ${Number(item.amount).toLocaleString()}</td>
      <td class="td-type"><span class="fuel-badge ${(item.fuelType || 'Petrol').toLowerCase()}">${item.fuelType || 'Petrol'}</span></td>
    </tr>
  `).join('');
}

/* ---------------------------------------------------------
   Render summary bar
   --------------------------------------------------------- */
function renderSummary(entries) {
  const bar = document.getElementById('summaryBar');

  if (entries.length === 0) {
    bar.style.display = 'none';
    return;
  }

  const totalLiters = entries.reduce((s, e) => s + (Number(e.liters) || 0), 0);
  const totalAmount = entries.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const avgAmount   = entries.length ? totalAmount / entries.length : 0;

  document.getElementById('sum_count').textContent  = entries.length;
  document.getElementById('sum_liters').textContent = `${totalLiters.toFixed(1)} L`;
  document.getElementById('sum_amount').textContent = `Rs. ${Math.round(totalAmount).toLocaleString()}`;
  document.getElementById('sum_avg').textContent    = `Rs. ${Math.round(avgAmount).toLocaleString()}`;

  bar.style.display = 'flex';
}

/* ---------------------------------------------------------
   Clear all filters and reload
   --------------------------------------------------------- */
function clearFilters() {
  document.getElementById('f_search').value   = '';
  document.getElementById('f_vehicle').value  = '';
  document.getElementById('f_driver').value   = '';
  document.getElementById('f_month').value    = '';
  document.getElementById('f_dateFrom').value = '';
  document.getElementById('f_dateTo').value   = '';
  doSearch();
}

/* ---------------------------------------------------------
   UI helpers
   --------------------------------------------------------- */
function showResultsArea(show) {
  document.getElementById('resultsSection').style.display = show ? 'block' : 'none';
}

function setSearchLoading(isLoading) {
  const btn = document.getElementById('searchBtn');
  btn.disabled = isLoading;
  btn.textContent = isLoading ? '⏳ Searching...' : '🔍 Search Karein';
}

function showError(msg) {
  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#D8453A;padding:24px;">${msg}</td></tr>`;
  document.querySelector('.table-wrap').style.display = 'block';
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('resultsSection').style.display = 'block';
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}
