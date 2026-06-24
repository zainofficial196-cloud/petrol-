/* ===========================================================
   Fuel Expense Dashboard logic
   Now talks to the real backend (server.js) instead of
   localStorage. Every request sends the login token so the
   server knows who is asking.
   =========================================================== */

const token = sessionStorage.getItem('fuelToken');
const userRaw = sessionStorage.getItem('fuelUser');

// Auth guard — bounce back to login if not signed in
if (!token || !userRaw) {
  window.location.href = 'index.html';
}

const currentUser = userRaw ? JSON.parse(userRaw) : null;

// Chart instances (kept so we can destroy/recreate on refresh)
let monthlyChartInst = null;
let vehicleChartInst = null;

document.addEventListener('DOMContentLoaded', () => {
  if (currentUser) {
    document.getElementById('whoami').textContent = `${currentUser.name} (${currentUser.role})`;
  }
  document.getElementById('logoutBtn').addEventListener('click', logout);
  showData();
  // Load stats + charts for admin and accountant
  if (currentUser && currentUser.role !== 'driver') {
    loadStats();
  }
});

function authHeaders(extra = {}) {
  return Object.assign({ Authorization: `Bearer ${token}` }, extra);
}

async function logout() {
  try {
    await fetch('/api/logout', { method: 'POST', headers: authHeaders() });
  } catch (e) {
    /* ignore network errors on logout */
  }
  sessionStorage.removeItem('fuelToken');
  sessionStorage.removeItem('fuelUser');
  window.location.href = 'index.html';
}

async function saveData() {
  const vehicle = document.getElementById('vehicle').value.trim();
  const liters = document.getElementById('liters').value.trim();
  const amount = document.getElementById('amount').value.trim();

  if (!vehicle || !liters || !amount) {
    showMessage('Please fill all fields before saving.', 'error');
    return;
  }
  if (isNaN(liters) || isNaN(amount) || Number(liters) <= 0 || Number(amount) <= 0) {
    showMessage('Liters and Amount must be valid positive numbers.', 'error');
    return;
  }

  try {
    const res = await fetch('/api/entries', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ vehicleNumber: vehicle, liters, amount }),
    });
    const data = await res.json();

    if (res.status === 401) {
      return logout(); // session expired
    }
    if (!data.success) {
      showMessage(data.message || 'Could not save entry.', 'error');
      return;
    }

    document.getElementById('vehicle').value = '';
    document.getElementById('liters').value = '';
    document.getElementById('amount').value = '';

    showMessage('Entry saved successfully.', 'success');
    showData();
  } catch (err) {
    showMessage('Could not reach the server. Make sure "node server.js" is running.', 'error');
  }
}

async function deleteData(id) {
  try {
    const res = await fetch(`/api/entries/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    const data = await res.json();

    if (res.status === 401) return logout();
    if (!data.success) {
      showMessage(data.message || 'Could not delete entry.', 'error');
      return;
    }
    showData();
  } catch (err) {
    showMessage('Could not reach the server.', 'error');
  }
}

async function showData() {
  const list = document.getElementById('list');

  try {
    const res = await fetch('/api/entries', { headers: authHeaders() });
    if (res.status === 401) return logout();

    const data = await res.json();
    const entries = data.entries || [];

    if (entries.length === 0) {
      list.innerHTML = `<p class="empty-state">No entries yet. Add your first fuel record above.</p>`;
      return;
    }

    list.innerHTML = '';
    entries.forEach((item) => {
      list.innerHTML += `
        <div class="entry-row">
          <span>🚗 ${item.vehicleNumber} | ⛽ ${item.liters} L | 💰 ${item.amount} | 📅 ${item.date}</span>
          ${currentUser && currentUser.role === 'admin'
            ? `<button onclick="deleteData(${item.id})" class="delete-btn">Delete</button>`
            : ''}
        </div>
      `;
    });
  } catch (err) {
    list.innerHTML = `<p class="empty-state">Could not reach the server. Make sure "node server.js" is running.</p>`;
  }
}

function showMessage(text, type) {
  const msgEl = document.getElementById('formMessage');
  if (!msgEl) return;
  msgEl.textContent = text;
  msgEl.style.color = type === 'error' ? '#D8453A' : '#2E7D32';
}

/* ---------------------------------------------------------
   Phase 3 — Stats & Charts
   --------------------------------------------------------- */
async function loadStats() {
  try {
    const res = await fetch('/api/stats', { headers: authHeaders() });
    if (res.status === 401) return logout();
    const data = await res.json();
    if (!data.success) return;

    const s = data.stats;

    // Update stat cards
    setText('s_monthEntries', s.monthAmount > 0 ? s.monthly[s.monthly.length - 1]?.count ?? '0' : '0');
    setText('s_monthLiters',  `${s.monthLiters} L`);
    setText('s_monthAmount',  `Rs. ${s.monthAmount.toLocaleString()}`);
    setText('s_total',        s.totalEntries);

    // Show charts section if we have data
    if (s.monthly.length > 0 || s.byVehicle.length > 0) {
      document.getElementById('chartsGrid').style.display = 'grid';
      renderMonthlyChart(s.monthly);
      renderVehicleChart(s.byVehicle);
    }

  } catch (err) {
    // Stats failing silently is fine — entries list still works
    console.warn('Stats load failed:', err);
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function renderMonthlyChart(monthly) {
  const ctx = document.getElementById('monthlyChart');
  if (!ctx) return;

  if (monthlyChartInst) monthlyChartInst.destroy();

  const labels = monthly.map((m) => {
    const [year, month] = m.month.split('-');
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('en-PK', { month: 'short', year: '2-digit' });
  });
  const amounts = monthly.map((m) => m.totalAmount);

  monthlyChartInst = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Amount (Rs.)',
        data: amounts,
        backgroundColor: 'rgba(224, 138, 44, 0.75)',
        borderColor: '#E08A2C',
        borderWidth: 1.5,
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` Rs. ${ctx.parsed.y.toLocaleString()}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: true,
          ticks: {
            callback: (val) => `Rs. ${(val / 1000).toFixed(0)}k`,
          },
        },
      },
    },
  });
}

function renderVehicleChart(byVehicle) {
  const ctx = document.getElementById('vehicleChart');
  if (!ctx) return;

  if (vehicleChartInst) vehicleChartInst.destroy();

  const top = byVehicle.slice(0, 6);
  const labels  = top.map((v) => v.vehicle);
  const amounts = top.map((v) => v.totalAmount);

  const colors = [
    'rgba(19,  40,  100, 0.8)',
    'rgba(37,  69,  108, 0.8)',
    'rgba(224, 138,  44, 0.8)',
    'rgba(242, 169,  63, 0.8)',
    'rgba(91,  107, 122, 0.8)',
    'rgba(138, 153, 166, 0.8)',
  ];

  vehicleChartInst = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: amounts,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: '#F7F5F0',
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'right',
          labels: { font: { size: 12 }, padding: 14 },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` Rs. ${ctx.parsed.toLocaleString()}`,
          },
        },
      },
    },
  });
}