/**
 * In-memory copy of every table, backed by IndexedDB, plus the outbox of
 * unsent writes. Screens read from here and never wait for the network.
 *
 * Local rows carry two extra fields that never go to the server:
 *   _srv      the server's updated_at for this row (used for conflict checks)
 *   _pending  true while a local change hasn't been confirmed by the server
 */
const Store = (() => {
  const TABLES = ['Customers', 'Orders', 'OrderItems', 'Payments', 'Invoices', 'InvoiceItems',
    'Quotations', 'QuotationItems', 'Agreements', 'Terms', 'Expenses', 'Settings'];

  const data = Object.fromEntries(TABLES.map(t => [t, new Map()]));
  let outbox = [];
  const listeners = new Set();
  let emitQueued = false;
  const changedTables = new Set();

  const key = (t, id) => `${t}:${id}`;
  const isDeleted = r => r.is_deleted === true || r.is_deleted === 'TRUE';

  function emit(table) {
    changedTables.add(table);
    if (emitQueued) return;
    emitQueued = true;
    queueMicrotask(() => {
      emitQueued = false;
      const tables = new Set(changedTables);
      changedTables.clear();
      listeners.forEach(fn => { try { fn(tables); } catch (e) { console.error(e); } });
    });
  }

  /** Merged data of all unsent ops for a row, so server rows don't hide local edits. */
  function pendingPatch(t, id) {
    let patch = null;
    outbox.forEach(op => { if (op.t === t && op.id === id) patch = Object.assign(patch || {}, op.data); });
    return patch;
  }

  async function load() {
    const [rows, ops] = await Promise.all([DB.allRows(), DB.outboxAll()]);
    rows.forEach(r => { if (data[r.t]) data[r.t].set(r.d.id, r.d); });
    outbox = ops.map(op => ({ ...op, inflight: false })).sort((a, b) => a.seq - b.seq);
    TABLES.forEach(emit);
  }

  function list(t, { includeDeleted = false } = {}) {
    const out = [];
    data[t].forEach(r => { if (includeDeleted || !isDeleted(r)) out.push(r); });
    return out;
  }

  function get(t, id) {
    return data[t].get(id) || null;
  }

  /**
   * Creates (no id, or unknown id) or updates a row. The change shows on screen
   * at once and is queued for the server.
   */
  async function save(t, patch) {
    if (!data[t]) throw new Error('Unknown table ' + t);
    const id = patch.id || U.uuid();
    const current = data[t].get(id);
    const now = U.nowIso();
    const clean = { ...patch };
    delete clean.id;
    const row = { ...(current || {}), ...clean, id, updated_at: now, _pending: true };
    if (!current) {
      row.created_at = now;
      row.is_deleted = false;
    }
    data[t].set(id, row);
    await DB.putRows([[t, row]]);
    await enqueue(t, id, current ? 'update' : 'create', clean);
    emit(t);
    Sync.kick();
    return row;
  }

  function remove(t, id) {
    return save(t, { id, is_deleted: true });
  }

  async function enqueue(t, id, type, patch) {
    const waiting = outbox.find(op => op.t === t && op.id === id && !op.inflight);
    if (waiting) {
      Object.assign(waiting.data, patch);
      await DB.outboxPut(strip(waiting));
      return;
    }
    const op = { t, id, type, data: { ...patch }, at: U.nowIso() };
    op.seq = await DB.outboxPut(op);
    op.inflight = false;
    outbox.push(op);
  }

  const strip = op => { const { inflight, ...rest } = op; return rest; };

  /** Marks up to n ops as in flight and returns them for sending. */
  function takeOutbox(n) {
    const batch = outbox.filter(op => !op.inflight).slice(0, n);
    batch.forEach(op => { op.inflight = true; });
    return batch;
  }

  function releaseOutbox(ops) {
    ops.forEach(op => { op.inflight = false; });
  }

  async function finishOp(op) {
    outbox = outbox.filter(o => o.seq !== op.seq);
    await DB.outboxDelete(op.seq);
  }

  /** Applies authoritative rows from the server, keeping any still-unsent local edits on top. */
  async function applyServerRows(t, rows) {
    if (!data[t] || !rows || !rows.length) return;
    const writes = [];
    rows.forEach(srv => {
      const patch = pendingPatch(t, srv.id);
      const row = { ...srv, ...(patch || {}), _srv: srv.updated_at, _pending: !!patch };
      data[t].set(srv.id, row);
      writes.push([t, row]);
    });
    await DB.putRows(writes);
    emit(t);
  }

  /** Drops a local row the server rejected on create. */
  async function discard(t, id) {
    data[t].delete(id);
    await DB.deleteRow(t, id);
    emit(t);
  }

  function settings() {
    const out = {};
    list('Settings').forEach(r => { out[r.key] = r.value; });
    return out;
  }

  async function reset() {
    TABLES.forEach(t => data[t].clear());
    outbox = [];
    await DB.clearAll();
    TABLES.forEach(emit);
  }

  return {
    TABLES, load, list, get, save, remove, settings, reset,
    takeOutbox, releaseOutbox, finishOp, applyServerRows, discard,
    pendingCount: () => outbox.length,
    hasPending: () => outbox.length > 0,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };
})();
