/* ===========================================================
   Fuel Expense — Slip Upload & OCR Logic (Phase 2)

   Flow:
   1. User picks/drops/cameras an image
   2. "Read Slip Details" button sends image to /api/ocr
   3. Server uses Claude Vision API to extract fields
   4. Fields auto-fill in the form (with confidence bars)
   5. User reviews + saves via /api/entries

   Auth: every API call sends the session token from localStorage.
   =========================================================== */

/* ----------------------------------------------------------
   AUTH GUARD — redirect to login if no token
   ---------------------------------------------------------- */
const TOKEN = sessionStorage.getItem('fuelToken');
if (!TOKEN) {
  window.location.href = 'index.html';
}

/* ----------------------------------------------------------
   DOM references
   ---------------------------------------------------------- */
const dropZone      = document.getElementById('dropZone');
const fileInput     = document.getElementById('fileInput');
const cameraBtn     = document.getElementById('cameraBtn');
const cameraArea    = document.getElementById('cameraArea');
const cameraVideo   = document.getElementById('cameraVideo');
const captureBtn    = document.getElementById('captureBtn');
const cancelCamBtn  = document.getElementById('cancelCameraBtn');
const captureCanvas = document.getElementById('captureCanvas');
const previewArea   = document.getElementById('previewArea');
const previewImg    = document.getElementById('previewImg');
const removeImgBtn  = document.getElementById('removeImg');
const ocrBtn        = document.getElementById('ocrBtn');
const ocrStatus     = document.getElementById('ocrStatus');
const ocrStatusText = document.getElementById('ocrStatusText');
const autoBadge     = document.getElementById('autoBadge');
const confidenceRow = document.getElementById('confidenceRow');
const confidenceItems = document.getElementById('confidenceItems');
const formMessage   = document.getElementById('formMessage');
const recentList    = document.getElementById('recentList');
const whoami        = document.getElementById('whoami');
const logoutBtn     = document.getElementById('logoutBtn');

// Form fields
const fVehicle = document.getElementById('f_vehicle');
const fLiters  = document.getElementById('f_liters');
const fAmount  = document.getElementById('f_amount');
const fDriver  = document.getElementById('f_driver');
const fDate    = document.getElementById('f_date');
const fNotes   = document.getElementById('f_notes');

/* ----------------------------------------------------------
   State
   ---------------------------------------------------------- */
let currentImageBase64 = null; // base64 string of selected image
let cameraStream       = null; // MediaStream (camera)

/* ----------------------------------------------------------
   INIT
   ---------------------------------------------------------- */
async function init() {
  // Set today's date as default
  fDate.value = new Date().toISOString().split('T')[0];

  await loadWhoAmI();
  await loadRecentEntries();
}

/* ----------------------------------------------------------
   AUTH HEADER
   ---------------------------------------------------------- */
function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${TOKEN}`,
  };
}

/* ----------------------------------------------------------
   WHO AM I
   ---------------------------------------------------------- */
async function loadWhoAmI() {
  try {
    const res = await fetch('/api/me', { headers: authHeaders() });
    if (res.status === 401) { logout(); return; }
    const data = await res.json();
    if (data.user) {
      whoami.textContent = `👤 ${data.user.name || data.user.username}`;
    }
  } catch {
    // silently ignore
  }
}

/* ----------------------------------------------------------
   LOGOUT
   ---------------------------------------------------------- */
logoutBtn.addEventListener('click', () => {
  fetch('/api/logout', { method: 'POST', headers: authHeaders() }).finally(logout);
});

function logout() {
  sessionStorage.removeItem('fuelToken');
  window.location.href = 'index.html';
}

/* ----------------------------------------------------------
   IMAGE SELECTION — file input
   ---------------------------------------------------------- */
fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (file) handleImageFile(file);
});

/* ----------------------------------------------------------
   IMAGE SELECTION — drag & drop
   ---------------------------------------------------------- */
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) {
    handleImageFile(file);
  } else {
    showMessage('Sirf image file drop karein (JPG, PNG, WEBP).', 'error');
  }
});

// Click on drop zone opens file picker
dropZone.addEventListener('click', (e) => {
  if (e.target === dropZone || dropZone.contains(e.target)) {
    // Don't trigger if camera or file buttons clicked directly
    if (!e.target.closest('.btn-file') && !e.target.closest('.btn-camera')) {
      fileInput.click();
    }
  }
});

/* ----------------------------------------------------------
   IMAGE SELECTION — camera
   ---------------------------------------------------------- */
cameraBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    cameraVideo.srcObject = cameraStream;
    dropZone.style.display = 'none';
    previewArea.style.display = 'none';
    cameraArea.style.display = 'block';
  } catch {
    showMessage('Camera access nahi mili. Permission allow karein ya file upload karein.', 'error');
  }
});

captureBtn.addEventListener('click', () => {
  captureCanvas.width  = cameraVideo.videoWidth;
  captureCanvas.height = cameraVideo.videoHeight;
  captureCanvas.getContext('2d').drawImage(cameraVideo, 0, 0);
  const dataUrl = captureCanvas.toDataURL('image/jpeg', 0.92);
  stopCamera();
  showPreview(dataUrl);
  currentImageBase64 = dataUrl.split(',')[1];
  ocrBtn.disabled = false;
});

cancelCamBtn.addEventListener('click', () => {
  stopCamera();
  dropZone.style.display = 'flex';
});

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((t) => t.stop());
    cameraStream = null;
  }
  cameraArea.style.display = 'none';
}

/* ----------------------------------------------------------
   HANDLE FILE
   ---------------------------------------------------------- */
function handleImageFile(file) {
  if (file.size > 10 * 1024 * 1024) {
    showMessage('Image 10 MB se bari hai. Choti image use karein.', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    showPreview(dataUrl);
    currentImageBase64 = dataUrl.split(',')[1];
    ocrBtn.disabled = false;
    showMessage('', '');
  };
  reader.readAsDataURL(file);
}

/* ----------------------------------------------------------
   PREVIEW
   ---------------------------------------------------------- */
function showPreview(dataUrl) {
  previewImg.src = dataUrl;
  dropZone.style.display = 'none';
  previewArea.style.display = 'block';
}

removeImgBtn.addEventListener('click', () => {
  currentImageBase64 = null;
  previewImg.src = '';
  previewArea.style.display = 'none';
  dropZone.style.display = 'flex';
  ocrBtn.disabled = true;
  clearAutoFill();
  showMessage('', '');
  fileInput.value = '';
});

/* ----------------------------------------------------------
   OCR — send image to backend
   ---------------------------------------------------------- */
ocrBtn.addEventListener('click', runOCR);

async function runOCR() {
  if (!currentImageBase64) return;

  ocrBtn.disabled = true;
  ocrStatus.style.display = 'flex';
  ocrStatusText.textContent = 'AI slip parh raha hai...';
  clearAutoFill();
  showMessage('', '');

  try {
    const res = await fetch('/api/ocr', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ imageBase64: currentImageBase64 }),
    });

    if (res.status === 401) { logout(); return; }

    const data = await res.json();

    if (!data.success) {
      ocrStatus.style.display = 'none';
      showMessage(data.message || 'OCR fail hua. Dobara koshish karein.', 'error');
      ocrBtn.disabled = false;
      return;
    }

    ocrStatus.style.display = 'none';
    applyOCRResult(data.result);
    ocrBtn.disabled = false;

  } catch (err) {
    ocrStatus.style.display = 'none';
    showMessage('Server se connection nahi hua. Dobara koshish karein.', 'error');
    ocrBtn.disabled = false;
  }
}

/* ----------------------------------------------------------
   APPLY OCR RESULT
   ---------------------------------------------------------- */
function applyOCRResult(result) {
  /*
    result = {
      vehicle: { value: "ABC-123", confidence: 0.9 },
      liters:  { value: "20.5",   confidence: 0.85 },
      amount:  { value: "2500",   confidence: 0.95 },
      driver:  { value: "Ali",    confidence: 0.7 },
      date:    { value: "2026-06-20", confidence: 0.8 },
      notes:   { value: "",       confidence: 1.0 },
    }
  */

  const fields = [
    { el: fVehicle, key: 'vehicle', label: 'Vehicle' },
    { el: fLiters,  key: 'liters',  label: 'Liters'  },
    { el: fAmount,  key: 'amount',  label: 'Amount'  },
    { el: fDriver,  key: 'driver',  label: 'Driver'  },
    { el: fDate,    key: 'date',    label: 'Date'    },
  ];

  let anyFilled = false;
  const confData = [];

  fields.forEach(({ el, key, label }) => {
    const item = result[key];
    if (item && item.value) {
      el.value = item.value;
      el.classList.add('auto-filled');
      anyFilled = true;
      confData.push({ label, confidence: item.confidence || 0.5 });
    }
  });

  if (result.notes && result.notes.value) {
    fNotes.value = result.notes.value;
    fNotes.classList.add('auto-filled');
  }

  if (anyFilled) {
    autoBadge.style.display = 'inline';
    renderConfidence(confData);
    showMessage('Slip read ho gayi! Fields auto-fill hue hain — check kar lein.', 'success');
  } else {
    showMessage('Slip se details nahi mil sakein. Manually fill karein.', 'warn');
  }
}

/* ----------------------------------------------------------
   CONFIDENCE BARS
   ---------------------------------------------------------- */
function renderConfidence(items) {
  confidenceItems.innerHTML = '';
  items.forEach(({ label, confidence }) => {
    const pct = Math.round(confidence * 100);
    const level = pct >= 80 ? 'high' : pct >= 55 ? 'mid' : 'low';
    confidenceItems.innerHTML += `
      <div class="confidence-item">
        <span class="conf-field">${label}</span>
        <div class="conf-bar-wrap">
          <div class="conf-bar ${level}" style="width: ${pct}%"></div>
        </div>
        <span class="conf-pct">${pct}%</span>
      </div>
    `;
  });
  confidenceRow.style.display = 'block';
}

/* ----------------------------------------------------------
   CLEAR AUTO-FILL
   ---------------------------------------------------------- */
function clearAutoFill() {
  [fVehicle, fLiters, fAmount, fDriver, fDate, fNotes].forEach((el) => {
    el.classList.remove('auto-filled');
  });
  autoBadge.style.display = 'none';
  confidenceRow.style.display = 'none';
  confidenceItems.innerHTML = '';
}

/* ----------------------------------------------------------
   CLEAR FORM
   ---------------------------------------------------------- */
document.getElementById('clearBtn').addEventListener('click', () => {
  fVehicle.value = '';
  fLiters.value  = '';
  fAmount.value  = '';
  fDriver.value  = '';
  fNotes.value   = '';
  fDate.value    = new Date().toISOString().split('T')[0];
  clearAutoFill();
  showMessage('', '');
});

/* ----------------------------------------------------------
   SAVE ENTRY
   ---------------------------------------------------------- */
document.getElementById('saveBtn').addEventListener('click', saveEntry);

async function saveEntry() {
  const vehicle = fVehicle.value.trim();
  const liters  = parseFloat(fLiters.value);
  const amount  = parseFloat(fAmount.value);
  const driver  = fDriver.value.trim();
  const date    = fDate.value;
  const notes   = fNotes.value.trim();

  // Validation
  if (!vehicle) {
    showMessage('Vehicle number darj karein.', 'error');
    fVehicle.focus();
    return;
  }
  if (isNaN(liters) || liters <= 0) {
    showMessage('Liters sahi darj karein.', 'error');
    fLiters.focus();
    return;
  }
  if (isNaN(amount) || amount <= 0) {
    showMessage('Amount sahi darj karein.', 'error');
    fAmount.focus();
    return;
  }

  const saveBtn = document.getElementById('saveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    const res = await fetch('/api/entries', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ vehicleNumber: vehicle, liters, amount, createdByName: driver, date, notes }),
    });

    if (res.status === 401) { logout(); return; }

    const data = await res.json();

    if (data.success) {
      showMessage('Entry save ho gayi! ✓', 'success');
      // Clear form
      fVehicle.value = '';
      fLiters.value  = '';
      fAmount.value  = '';
      fDriver.value  = '';
      fNotes.value   = '';
      fDate.value    = new Date().toISOString().split('T')[0];
      clearAutoFill();
      // Remove image
      currentImageBase64 = null;
      previewImg.src = '';
      previewArea.style.display = 'none';
      dropZone.style.display = 'flex';
      ocrBtn.disabled = true;
      fileInput.value = '';
      // Refresh recent list
      await loadRecentEntries();
    } else {
      showMessage(data.message || 'Save nahi hua. Dobara koshish karein.', 'error');
    }
  } catch {
    showMessage('Server se connection nahi hua.', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Entry';
  }
}

/* ----------------------------------------------------------
   RECENT ENTRIES (last 5)
   ---------------------------------------------------------- */
async function loadRecentEntries() {
  try {
    const res = await fetch('/api/entries', { headers: authHeaders() });
    if (res.status === 401) return;
    const data = await res.json();

    if (!data.success || !data.entries || data.entries.length === 0) {
      recentList.innerHTML = '<p class="empty-state">Koi entry nahi mili abhi tak.</p>';
      return;
    }

    // Show last 5 entries (newest first)
    const entries = [...data.entries].reverse().slice(0, 5);
    recentList.innerHTML = entries.map((e) => `
      <div class="recent-entry">
        <span class="re-vehicle">🚗 ${escHtml(e.vehicleNumber || e.vehicle || '')}</span>
        <span class="re-detail">⛽ ${e.liters} L${e.driver ? ' · ' + escHtml(e.driver) : ''}</span>
        <span class="re-amount">Rs. ${Number(e.amount).toLocaleString()}</span>
        <span class="re-date">📅 ${e.date || ''}</span>
      </div>
    `).join('');

  } catch {
    // silently ignore
  }
}

/* ----------------------------------------------------------
   HELPERS
   ---------------------------------------------------------- */
function showMessage(text, type) {
  formMessage.textContent = text;
  if (type === 'error')   formMessage.style.color = '#D8453A';
  else if (type === 'success') formMessage.style.color = '#2E7D32';
  else if (type === 'warn')    formMessage.style.color = '#E08A2C';
  else formMessage.style.color = '';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ----------------------------------------------------------
   START
   ---------------------------------------------------------- */
init();