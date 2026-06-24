/* ===========================================================
   Fuel Expense & Slip Management — Login logic
   Now connected to the real backend (server.js) via fetch().
   The old hardcoded demo check has been removed.
   =========================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const userInput = document.getElementById('user');
  const passInput = document.getElementById('pass');
  const errorEl = document.getElementById('formError');
  const loginBtn = document.getElementById('loginBtn');
  const togglePass = document.getElementById('togglePass');

  // If already logged in, skip straight to the dashboard
  if (sessionStorage.getItem('fuelToken')) {
    window.location.href = 'dashboard.html';
    return;
  }

  // Show / hide password
  togglePass.addEventListener('click', () => {
    const isHidden = passInput.type === 'password';
    passInput.type = isHidden ? 'text' : 'password';
    togglePass.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
    togglePass.classList.toggle('is-visible', isHidden);
  });

  // Clear field-level error styling as the user types
  [userInput, passInput].forEach((input) => {
    input.addEventListener('input', () => {
      input.classList.remove('input-error');
      errorEl.textContent = '';
    });
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    handleLogin();
  });

  async function handleLogin() {
    const username = userInput.value.trim();
    const password = passInput.value;

    errorEl.textContent = '';
    errorEl.style.color = '';
    userInput.classList.remove('input-error');
    passInput.classList.remove('input-error');

    // ---- Basic client-side validation ----
    if (!username && !password) {
      showError('Enter your username and password.');
      userInput.classList.add('input-error');
      passInput.classList.add('input-error');
      userInput.focus();
      return;
    }
    if (!username) {
      showError('Username is required.');
      userInput.classList.add('input-error');
      userInput.focus();
      return;
    }
    if (!password) {
      showError('Password is required.');
      passInput.classList.add('input-error');
      passInput.focus();
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (data.success) {
        sessionStorage.setItem('fuelToken', data.token);
        sessionStorage.setItem('fuelUser', JSON.stringify(data.user));
        errorEl.style.color = '#2E7D32';
        showError('Login successful. Redirecting...');
        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 600);
      } else {
        showError(data.message || 'Invalid username or password.');
        passInput.classList.add('input-error');
        passInput.focus();
      }
    } catch (err) {
      showError('Could not reach the server. Make sure "node server.js" is running.');
    } finally {
      setLoading(false);
    }
  }

  function showError(message) {
    errorEl.textContent = message;
  }

  function setLoading(isLoading) {
    loginBtn.disabled = isLoading;
    loginBtn.classList.toggle('is-loading', isLoading);
  }
});
