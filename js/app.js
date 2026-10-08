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
    Api.warm();
    setTimeout(() => $('#login-password').focus(), 50);
  }

  function showApp() {
    $('#login-screen').classList.add('d-none');
    $('#app-shell').classList.remove('d-none');
    if (!started) {
      started = true;
      setTimeout(() => Docs.loadLibs().catch(() => {}), 5000);
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
    const slow = setTimeout(() => {
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Waking up the server…';
    }, 4000);
    try {
      const data = await Auth.login($('#login-password').value);
      clearTimeout(slow);
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Loading your data…';
      showApp();
      UI.showSkeleton();
      await Store.load();
      await Sync.initial(data);
      UI.route();
      UI.updateBadges();
      Sync.start();
    } catch (ex) {
      showLogin();
      err.textContent = ex.message;
      err.classList.remove('d-none');
    } finally {
      clearTimeout(slow);
      btn.disabled = false;
      btn.innerHTML = 'Log in';
    }
  }

  /** Off on localhost unless localStorage.mfw_sw is set, so local edits show without a version bump. */
  function registerWorker() {
    if (!('serviceWorker' in navigator)) return;
    const local = ['localhost', '127.0.0.1'].includes(location.hostname);
    if (local && !localStorage.getItem('mfw_sw')) return;
    let told = false;
    navigator.serviceWorker.addEventListener('message', e => {
      if (told || !e.data || e.data.type !== 'app-updated') return;
      told = true;
      UI.toast('A new version of the app is ready.', 'info', { label: 'Reload', onClick: () => location.reload() });
    });
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker not registered', err));
  }

  /** Chrome/Edge/Android offer installing; the prompt is kept for the button in Settings. */
  let installPrompt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    installPrompt = e;
    if (UI.current && UI.current() === 'settings') UI.render();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    UI.toast('App installed. Open it from your home screen.');
  });

  const install = {
    isInstalled: () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
    canPrompt: () => !!installPrompt,
    isIos: () => /iPhone|iPad|iPod/i.test(navigator.userAgent),
    async prompt() {
      if (!installPrompt) return false;
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      installPrompt = null;
      return outcome === 'accepted';
    }
  };

  async function boot() {
    registerWorker();
    applyBranding();
    UI.buildNav();
    $('#login-form').addEventListener('submit', onLoginSubmit);
    $('#login-password').addEventListener('input', () => Api.warm());

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

  return { boot, showLogin, showApp, install };
})();

document.addEventListener('DOMContentLoaded', () => {
  App.boot().catch(err => {
    console.error(err);
    document.body.insertAdjacentHTML('afterbegin',
      `<div class="alert alert-danger m-3">The app could not start: ${U.esc(err.message)}. Try reloading the page.</div>`);
  });
});
