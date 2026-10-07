/**
 * Talks to the Apps Script web app.
 *
 * Requests are POST with Content-Type text/plain: Apps Script can't answer a
 * CORS preflight, and text/plain is a "simple" request that doesn't need one.
 */
class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const Api = (() => {
  async function call(action, payload = {}, { timeoutMs = 45000 } = {}) {
    const url = APP_CONFIG.apiUrl;
    if (!url) throw new ApiError('NO_API', 'API URL not set in config.js');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, token: Auth.token(), device: Auth.deviceName(), ...payload }),
        signal: ctrl.signal,
        redirect: 'follow',
        cache: 'no-store'
      });
    } catch (e) {
      throw new ApiError('NETWORK', navigator.onLine ? 'Could not reach the server' : 'You are offline');
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      const hint = /sign in|accounts\.google/i.test(text)
        ? 'Apps Script deployment must allow access to "Anyone".'
        : `Server returned an unexpected response (HTTP ${res.status}).`;
      throw new ApiError('BAD_RESPONSE', hint);
    }
    if (!json.ok) {
      if (json.code === 'AUTH') Auth.onExpired();
      throw new ApiError(json.code || 'ERROR', json.message || 'Request failed');
    }
    return json;
  }

  return { call };
})();

const Auth = (() => {
  const TOKEN_KEY = 'mfw_token';
  const EXP_KEY = 'mfw_token_exp';
  const DEVICE_KEY = 'mfw_device_name';

  return {
    token: () => localStorage.getItem(TOKEN_KEY) || '',

    isLoggedIn() {
      const exp = Number(localStorage.getItem(EXP_KEY) || 0);
      return !!localStorage.getItem(TOKEN_KEY) && exp > Date.now();
    },

    async login(password) {
      const res = await Api.call('login', { password });
      localStorage.setItem(TOKEN_KEY, res.token);
      localStorage.setItem(EXP_KEY, String(res.expiresAt));
    },

    /** Clears the session and this device's cached data (it's a shared login). */
    async logout() {
      Sync.stop();
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(EXP_KEY);
      await Store.reset();
      App.showLogin();
    },

    onExpired() {
      if (!localStorage.getItem(TOKEN_KEY)) return;
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(EXP_KEY);
      Sync.stop();
      UI.toast('Session expired. Please log in again — unsaved changes are kept on this device.', 'warning');
      App.showLogin();
    },

    deviceName: () => localStorage.getItem(DEVICE_KEY) || '',
    setDeviceName: name => localStorage.setItem(DEVICE_KEY, String(name || '').trim().slice(0, 40))
  };
})();

/**
 * Background sync: pushes the outbox first, then pulls changes since the last
 * pull. Runs on a timer while the tab is visible, and right after every save.
 */
const Sync = (() => {
  const BATCH_SIZE = 40;
  const BACKOFF_MS = [5000, 15000, 30000, 60000];

  let timer = null;
  let kickTimer = null;
  let running = false;
  let again = false;
  let failures = 0;
  let lastPullAt = 0;
  let status = { state: 'idle', message: '', lastSync: null };
  const listeners = new Set();

  function setStatus(patch) {
    status = { ...status, ...patch, pending: Store.pendingCount() };
    listeners.forEach(fn => fn(status));
  }

  async function push() {
    while (Store.hasPending()) {
      const ops = Store.takeOutbox(BATCH_SIZE);
      if (!ops.length) return;
      setStatus({ state: 'saving' });
      let res;
      try {
        res = await Api.call('batch', {
          ops: ops.map(op => ({
            opId: op.seq,
            table: op.t,
            id: op.id,
            type: op.type,
            data: op.data,
            base: op.type === 'update' ? (Store.get(op.t, op.id) || {})._srv || null : null
          }))
        });
      } catch (e) {
        Store.releaseOutbox(ops);
        throw e;
      }
      for (const result of res.results) {
        const op = ops.find(o => o.seq === result.opId);
        if (!op) continue;
        await Store.finishOp(op);
        if (result.ok) {
          await Store.applyServerRows(op.t, [result.row]);
        } else if (result.code === 'CONFLICT') {
          await Store.applyServerRows(op.t, [result.row]);
          UI.toast('Someone else changed this record first. Their version is shown — please redo your edit.', 'warning');
        } else {
          if (result.row) await Store.applyServerRows(op.t, [result.row]);
          else if (op.type === 'create') await Store.discard(op.t, op.id);
          UI.toast(`Not saved: ${result.message}`, 'danger');
        }
      }
    }
  }

  async function pull() {
    const since = (await DB.getMeta('since')) || '';
    const res = await Api.call('sync', { since }, { timeoutMs: 90000 });
    for (const [table, rows] of Object.entries(res.tables || {})) {
      await Store.applyServerRows(table, rows);
    }
    await DB.setMeta('since', res.serverTime);
    lastPullAt = Date.now();
  }

  async function run({ forcePull = false } = {}) {
    if (!Auth.isLoggedIn()) return;
    if (running) { again = true; return; }
    running = true;
    try {
      await push();
      if (forcePull || Date.now() - lastPullAt >= APP_CONFIG.syncIntervalMs - 1000) {
        setStatus({ state: 'syncing' });
        await pull();
      }
      failures = 0;
      setStatus({ state: 'synced', message: '', lastSync: U.nowIso() });
    } catch (e) {
      failures++;
      const offline = e.code === 'NETWORK';
      setStatus({ state: offline ? 'offline' : 'error', message: e.message });
      if (e.code !== 'AUTH' && e.code !== 'NO_API') {
        clearTimeout(kickTimer);
        kickTimer = setTimeout(() => run(), BACKOFF_MS[Math.min(failures - 1, BACKOFF_MS.length - 1)]);
      }
    } finally {
      running = false;
      if (again) { again = false; run(); }
    }
  }

  function tick() {
    if (document.visibilityState === 'visible') run();
  }

  return {
    /** First sync after login: pulls everything before the app opens. */
    async initial() {
      await DB.setMeta('since', '');
      lastPullAt = 0;
      await pull();
      setStatus({ state: 'synced', lastSync: U.nowIso() });
    },

    start() {
      this.stop();
      timer = setInterval(tick, APP_CONFIG.syncIntervalMs);
      document.addEventListener('visibilitychange', tick);
      window.addEventListener('online', tick);
      run({ forcePull: Date.now() - lastPullAt > 5000 });
    },

    stop() {
      clearInterval(timer);
      clearTimeout(kickTimer);
      timer = null;
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('online', tick);
    },

    /** Called after every local save; pushes soon, batching rapid edits together. */
    kick() {
      clearTimeout(kickTimer);
      kickTimer = setTimeout(() => run(), 300);
    },

    now: () => run({ forcePull: true }),
    status: () => ({ ...status, pending: Store.pendingCount() }),
    onStatus(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };
})();
