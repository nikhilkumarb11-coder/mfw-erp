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

  /** Fire-and-forget GET so Apps Script finishes its cold start while the user types. */
  let warmedAt = 0;
  function warm() {
    const url = APP_CONFIG.apiUrl;
    if (!url || Date.now() - warmedAt < 120000) return;
    warmedAt = Date.now();
    fetch(url, { method: 'GET', mode: 'no-cors', cache: 'no-store' }).catch(() => {});
  }

  return { call, warm };
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

    /** Resolves to the full data download that comes with the reply (older servers send none). */
    async login(password) {
      const res = await Api.call('login', { password, withData: true }, { timeoutMs: 90000 });
      localStorage.setItem(TOKEN_KEY, res.token);
      localStorage.setItem(EXP_KEY, String(res.expiresAt));
      return res.sync || null;
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

  async function applyPull(sync) {
    await Store.applyServerTables(sync.tables);
    await DB.setMeta('since', sync.serverTime);
    lastPullAt = Date.now();
  }

  /**
   * Sends the outbox. When withPull is set, the first batch also asks for
   * changes since the last pull, saving a separate round trip. Returns true
   * if that pull happened.
   */
  async function push(withPull) {
    let pulled = false;
    while (Store.hasPending()) {
      const ops = Store.takeOutbox(BATCH_SIZE);
      if (!ops.length) break;
      setStatus({ state: 'saving' });
      const since = withPull && !pulled ? (await DB.getMeta('since')) || '' : '';
      let res;
      try {
        res = await Api.call('batch', {
          since: since || undefined,
          ops: ops.map(op => ({
            opId: op.seq,
            table: op.t,
            id: op.id,
            type: op.type,
            data: op.data,
            base: op.type === 'update' ? (Store.get(op.t, op.id) || {})._srv || null : null
          }))
        }, { timeoutMs: 90000 });
      } catch (e) {
        Store.releaseOutbox(ops);
        throw e;
      }

      const answered = [];
      const rows = {};
      const discards = [];
      const errors = new Set();
      let conflict = false;
      for (const result of res.results) {
        const op = ops.find(o => o.seq === result.opId);
        if (!op) continue;
        answered.push(op);
        if (result.row) (rows[op.t] = rows[op.t] || []).push(result.row);
        if (result.ok) continue;
        if (result.code === 'CONFLICT') conflict = true;
        else {
          if (!result.row && op.type === 'create') discards.push(op);
          errors.add(result.message);
        }
      }
      await Store.finishOps(answered);
      await Store.applyServerTables(rows);
      for (const op of discards) await Store.discard(op.t, op.id);
      if (res.sync) { await applyPull(res.sync); pulled = true; }
      if (conflict) UI.toast('Someone else changed this record first. Their version is shown — please redo your edit.', 'warning');
      errors.forEach(msg => UI.toast(`Not saved: ${msg}`, 'danger'));
    }
    return pulled;
  }

  async function pull() {
    const since = (await DB.getMeta('since')) || '';
    const res = await Api.call('sync', { since }, { timeoutMs: 90000 });
    await applyPull(res);
  }

  async function run({ forcePull = false } = {}) {
    if (!Auth.isLoggedIn()) return;
    if (running) { again = true; return; }
    running = true;
    try {
      const wantPull = forcePull || Date.now() - lastPullAt >= APP_CONFIG.syncIntervalMs - 1000;
      const pulled = await push(wantPull);
      if (wantPull && !pulled) {
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
    /** Full download before the app opens. `data` is the copy that came with the login reply. */
    async initial(data) {
      await DB.setMeta('since', '');
      lastPullAt = 0;
      if (data && data.tables) await applyPull(data);
      else await pull();
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
