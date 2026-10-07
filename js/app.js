/** Startup and switching between the login screen and the app. */
const App = (() => {
  const $ = sel => document.querySelector(sel);
  let started = false;

  function applyBranding() {
    document.querySelectorAll('[data-brand-name]').forEach(el => { el.textContent = APP_CONFIG.companyName; });
    document.querySelectorAll('[data-brand-tagline]').forEach(el => { el.textContent = APP_CONFIG.tagline; });
    document.querySelectorAll('[data-brand-logo]').forEach(el => { el.src = APP_CONFIG.logo; });
  }

  function showLogin() {
    $('#app-shell').classList.add('d-none');
    $('#login-screen').classList.remove('d-none');
    $('#login-password').value = '';
    $('#login-error').classList.add('d-none');
    if (!APP_CONFIG.apiUrl) {
      $('#login-setup-hint').classList.remove('d-none');
    }
    setTimeout(() => $('#login-password').focus(), 50);
  }

  function showApp() {
    $('#login-screen').classList.add('d-none');
    $('#app-shell').classList.remove('d-none');
    if (!started) {
      started = true;
      window.addEventListener('hashchange', UI.route);
      Store.onChange(UI.onDataChange);
      Sync.onStatus(UI.renderSyncStatus);
    }
  }

  async function onLoginSubmit(e) {
    e.preventDefault();
    const btn = $('#login-btn');
    const err = $('#login-error');
    err.classList.add('d-none');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Checking…';
    try {
      await Auth.login($('#login-password').value);
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Loading your data…';
      showApp();
      UI.showSkeleton();
      await Store.load();
      await Sync.initial();
      UI.route();
      UI.updateBadges();
      Sync.start();
    } catch (ex) {
      showLogin();
      err.textContent = ex.message;
      err.classList.remove('d-none');
    } finally {
      btn.disabled = false;
      btn.innerHTML = 'Log in';
    }
  }

  async function boot() {
    applyBranding();
    UI.buildNav();
    $('#login-form').addEventListener('submit', onLoginSubmit);

    if (!Auth.isLoggedIn()) {
      showLogin();
      return;
    }
    showApp();
    UI.showSkeleton();
    await Store.load();
    UI.route();
    UI.updateBadges();
    UI.renderSyncStatus(Sync.status());
    Sync.start();
  }

  return { boot, showLogin, showApp };
})();

document.addEventListener('DOMContentLoaded', () => {
  App.boot().catch(err => {
    console.error(err);
    document.body.insertAdjacentHTML('afterbegin',
      `<div class="alert alert-danger m-3">The app could not start: ${U.esc(err.message)}. Try reloading the page.</div>`);
  });
});
