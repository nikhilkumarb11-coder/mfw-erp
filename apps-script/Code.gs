/**
 * Madeena Grand Fireworks ERP — Google Apps Script API
 *
 * This file is a copy kept in GitHub for version history. The live code runs
 * inside the Google Sheet: Extensions → Apps Script. See README.md for setup.
 *
 * All requests are POST with Content-Type text/plain and a JSON body:
 *   { action: "login" | "sync" | "batch" | "getPrivate", token, ... }
 * Responses are JSON: { ok: true, ... } or { ok: false, code, message }.
 *
 * Every round trip to Apps Script costs 1–3 s, so "login" can carry the first
 * full download (withData) and "batch" can carry the next pull (since).
 */

const API_VERSION = '0.4.0';
const TOKEN_DAYS = 30;
const SYNC_OVERLAP_MS = 15000;
const MAX_LOGIN_FAILS = 8;

const COMMON_FIELDS = ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'is_deleted'];

const SCHEMA = {
  Customers:      ['name', 'contact_no', 'location', 'aadhar_no', 'company_name'],
  Orders:         ['order_no', 'customer_id', 'order_date', 'delivery_date', 'total', 'status', 'source_quotation_id', 'notes'],
  OrderItems:     ['order_id', 'item_name', 'qty', 'rate', 'amount', 'sort'],
  Payments:       ['receipt_no', 'order_id', 'date', 'amount', 'note', 'status'],
  Invoices:       ['invoice_no', 'type', 'order_id', 'buyer_name', 'buyer_contact', 'buyer_address', 'date', 'total', 'status', 'void_reason'],
  InvoiceItems:   ['invoice_id', 'item_name', 'qty', 'rate', 'amount', 'sort'],
  Quotations:     ['quote_no', 'customer_id', 'prospect_name', 'prospect_contact', 'date', 'total', 'status', 'converted_order_id', 'notes'],
  QuotationItems: ['quotation_id', 'item_name', 'qty', 'rate', 'amount', 'sort'],
  Agreements:     ['agreement_no', 'order_id', 'date', 'terms_text', 'total', 'party_name', 'party_contact', 'party_address', 'venue', 'event_date', 'remarks'],
  Terms:          ['title', 'term_text', 'sort', 'default_checked', 'active'],
  Expenses:       ['date', 'category', 'vendor_name', 'amount', 'description'],
  Settings:       ['key', 'value']
};

const NUMERIC_FIELDS = { qty: 1, rate: 1, amount: 1, total: 1, sort: 1 };
const BOOLEAN_FIELDS = { is_deleted: 1, default_checked: 1, active: 1 };

/** Fields the server assigns on create; clients can never set or change them. */
const AUTO_NUMBERS = {
  Orders:     { field: 'order_no',     prefix: 'O-',  counter: 'ORD' },
  Payments:   { field: 'receipt_no',   prefix: 'R-',  counter: 'RCPT' },
  Quotations: { field: 'quote_no',     prefix: 'Q-',  counter: 'QUO' },
  Agreements: { field: 'agreement_no', prefix: 'AG-', counter: 'AG' },
  Invoices:   { field: 'invoice_no',   monthly: true }
};

/** Never sent in bulk sync; fetched one record at a time via getPrivate. */
const PRIVATE_FIELDS = { Customers: ['aadhar_no'] };

const ORDER_STATUSES = ['Pending', 'In Production', 'Ready', 'Delivered', 'Cancelled'];

/**
 * Per-table server-side rules, run under the write lock with the merged row.
 * prev is null on create. ctx gives access to other tables (including rows
 * written earlier in the same batch). Throw invalid_() to reject an op.
 */
const VALIDATORS = {
  Customers: function (row) {
    if (row.is_deleted) return;
    if (!row.name) throw invalid_('Customer name is required');
    if (!/^\d{10}$/.test(String(row.contact_no))) throw invalid_('Contact number must be 10 digits');
    if (!row.location) throw invalid_('Location is required');
    if (!/^\d{12}$/.test(String(row.aadhar_no))) throw invalid_('Aadhar number must be 12 digits');
  },
  Settings: function (row) {
    if (!row.key) throw invalid_('Setting key is required');
  },
  Orders: function (row, prev, ctx) {
    if (row.is_deleted) {
      if (prev && !prev.is_deleted && paidForOrder_(ctx, row.id) > 0) throw invalid_("An order with payments can't be deleted. Cancel it instead.");
      return;
    }
    if (!row.customer_id) throw invalid_('Customer is required');
    if (!row.delivery_date) throw invalid_('Delivery date is required');
    if (!row.status) row.status = 'Pending';
    if (ORDER_STATUSES.indexOf(row.status) === -1) throw invalid_('Unknown status: ' + row.status);
    if (row.total < 0) throw invalid_("Total can't be negative");
    if (prev) {
      const paid = paidForOrder_(ctx, row.id);
      if (row.total + 0.001 < paid) throw invalid_('Total ₹' + row.total + ' is less than ₹' + paid + ' already paid');
    }
  },
  OrderItems: function (row) {
    if (row.is_deleted) return;
    if (!row.order_id) throw invalid_('Item is missing its order');
    if (!row.item_name) throw invalid_('Item name is required');
    if (!(row.qty > 0)) throw invalid_('Quantity must be more than 0');
  },
  Payments: function (row, prev, ctx) {
    if (prev) {
      if (Number(row.amount) !== Number(prev.amount) || row.order_id !== prev.order_id || row.is_deleted) {
        throw invalid_("A payment can't be changed or deleted. Void it and record a new one.");
      }
      if (prev.status === 'Void' && row.status !== 'Void') throw invalid_('A voided payment stays void');
      if (row.status === 'Void' && prev.status !== 'Void' && activeInvoiceFor_(ctx, row.order_id)) {
        throw invalid_('This order has a final invoice. Void the invoice first.');
      }
      return;
    }
    if (!row.order_id) throw invalid_('Payment is missing its order');
    if (!(row.amount > 0)) throw invalid_('Payment amount must be more than 0');
    const order = findRow_(ctx, 'Orders', row.order_id);
    if (!order || order.is_deleted) throw invalid_('Order not found');
    const balance = round2_(Number(order.total) - paidForOrder_(ctx, row.order_id));
    if (row.amount > balance + 0.001) throw invalid_('Payment ₹' + row.amount + ' is more than the balance of ₹' + balance);
    row.status = '';
  },
  Invoices: function (row, prev, ctx) {
    if (prev) {
      if (prev.status === 'Void') throw invalid_('This invoice is already void');
      Object.keys(row).forEach(function (k) {
        if (['status', 'void_reason', 'updated_at', 'updated_by'].indexOf(k) === -1 && String(row[k]) !== String(prev[k])) {
          throw invalid_("Invoices can't be edited. Void it and issue a new one.");
        }
      });
      if (row.status !== 'Void') throw invalid_('An invoice can only be voided');
      if (!row.void_reason) throw invalid_('Give a reason for voiding');
      return;
    }
    row.status = 'Issued';
    row.void_reason = '';
    if (row.type === 'Order') {
      const order = findRow_(ctx, 'Orders', row.order_id);
      if (!order || order.is_deleted) throw invalid_('Order not found');
      if (order.status === 'Cancelled') throw invalid_('This order is cancelled');
      const total = round2_(order.total);
      if (!(total > 0)) throw invalid_('The order total is ₹0');
      const pending = round2_(total - paidForOrder_(ctx, row.order_id));
      if (pending > 0.001) throw invalid_('₹' + pending + ' is still pending on this order');
      if (activeInvoiceFor_(ctx, row.order_id)) throw invalid_('This order already has a final invoice');
      row.total = total;
    } else if (row.type === 'Custom') {
      row.order_id = '';
      if (!row.buyer_name) throw invalid_('Buyer name is required');
      if (!(row.total > 0)) throw invalid_('Invoice total must be more than 0');
    } else {
      throw invalid_('Unknown invoice type');
    }
  },
  Quotations: function (row, prev) {
    if (prev && prev.status === 'Converted' && (row.is_deleted || row.status !== 'Converted' || row.converted_order_id !== prev.converted_order_id)) {
      throw invalid_('This quotation was already converted to an order');
    }
    if (row.is_deleted) return;
    if (!row.status) row.status = 'Open';
    if (['Open', 'Converted'].indexOf(row.status) === -1) throw invalid_('Unknown status: ' + row.status);
    if (row.status === 'Converted' && !row.converted_order_id) throw invalid_('Converted quotation needs its order');
    if (!row.customer_id && !row.prospect_name) throw invalid_('Choose a customer or enter the prospect name');
    if (row.prospect_contact && !/^\d{10}$/.test(String(row.prospect_contact))) throw invalid_('Contact number must be 10 digits');
    if (row.total < 0) throw invalid_("Total can't be negative");
  },
  QuotationItems: function (row, prev, ctx) {
    if (row.is_deleted) return;
    if (!prev) {
      const q = findRow_(ctx, 'Quotations', row.quotation_id);
      if (!q || q.is_deleted) throw invalid_('Quotation not found');
    }
    if (!row.item_name) throw invalid_('Item name is required');
    if (!(row.qty > 0)) throw invalid_('Quantity must be more than 0');
  },
  Agreements: function (row, prev, ctx) {
    if (row.is_deleted) return;
    const order = findRow_(ctx, 'Orders', row.order_id);
    if (!order || order.is_deleted) throw invalid_('Order not found');
    if (!prev && order.status === 'Cancelled') throw invalid_('This order is cancelled');
    if (!row.party_name) throw invalid_('Customer name is required');
    row.total = round2_(order.total);
  },
  Terms: function (row) {
    if (row.is_deleted) return;
    if (!row.title && !row.term_text) throw invalid_('A term needs a title or text');
  },
  InvoiceItems: function (row, prev, ctx) {
    if (prev) throw invalid_("Invoice items can't be changed");
    const inv = findRow_(ctx, 'Invoices', row.invoice_id);
    if (!inv || inv.is_deleted) throw invalid_('Invoice not found');
    if (!row.item_name) throw invalid_('Item name is required');
    if (!(row.qty > 0)) throw invalid_('Quantity must be more than 0');
  }
};

function activeInvoiceFor_(ctx, orderId) {
  return tableCtx_(ctx, 'Invoices').rows.some(function (i) {
    return i.type === 'Order' && i.order_id === orderId && !i.is_deleted && i.status !== 'Void';
  });
}

function round2_(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Tables read inside a batch (under the lock), so missing columns can be added. */
function tableCtx_(ctx, table) {
  return ctx[table] || (ctx[table] = readTable_(table, true));
}

function findRow_(ctx, table, id) {
  const t = tableCtx_(ctx, table);
  const idx = t.index[id];
  return idx == null ? null : t.rows[idx];
}

function paidForOrder_(ctx, orderId) {
  const sum = tableCtx_(ctx, 'Payments').rows.reduce(function (s, p) {
    if (p.order_id !== orderId || p.is_deleted || p.status === 'Void') return s;
    return s + (Number(p.amount) || 0);
  }, 0);
  return Math.round(sum * 100) / 100;
}

// ───────────────────────────── HTTP entry points ─────────────────────────────

function doGet() {
  return json_({ ok: true, app: 'MFW ERP API', version: API_VERSION });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, code: 'BAD_REQUEST', message: 'Request body is not valid JSON' });
  }
  try {
    if (req.action === 'login') {
      const res = login_(req.password);
      if (res.ok && req.withData) res.sync = sync_('');
      return json_(res);
    }
    verifyToken_(req.token);
    const user = String(req.device || 'app').slice(0, 40);
    switch (req.action) {
      case 'ping':       return json_({ ok: true, serverTime: nowIso_() });
      case 'sync':       return json_(sync_(req.since));
      case 'batch': {
        const ctx = {};
        const res = batch_(req.ops || [], user, ctx);
        if (req.since) res.sync = sync_(req.since, ctx);
        return json_(res);
      }
      case 'getPrivate': return json_(getPrivate_(req.table, req.id));
      default:           return json_({ ok: false, code: 'BAD_REQUEST', message: 'Unknown action: ' + req.action });
    }
  } catch (err) {
    return json_({ ok: false, code: err.code || 'ERROR', message: String(err && err.message ? err.message : err) });
  }
}

// ───────────────────────────── Auth ─────────────────────────────

let PROPS_ = null;

/** Script properties, read once per request (each read is a slow service call). */
function props_() {
  return PROPS_ || (PROPS_ = PropertiesService.getScriptProperties().getProperties());
}

function login_(password) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('login_fails') || 0);
  if (fails >= MAX_LOGIN_FAILS) {
    return { ok: false, code: 'LOCKED', message: 'Too many wrong attempts. Try again in 15 minutes.' };
  }
  const salt = props_().PASSWORD_SALT;
  const hash = props_().PASSWORD_HASH;
  if (!salt || !hash) {
    return { ok: false, code: 'NOT_SET_UP', message: 'App password not set. Open the Sheet → MFW ERP menu → Set app password.' };
  }
  if (sha256Hex_(salt + String(password || '')) !== hash) {
    cache.put('login_fails', String(fails + 1), 15 * 60);
    return { ok: false, code: 'WRONG_PASSWORD', message: 'Wrong password' };
  }
  cache.remove('login_fails');
  const exp = Date.now() + TOKEN_DAYS * 24 * 3600 * 1000;
  const payload = Utilities.base64EncodeWebSafe(JSON.stringify({ exp: exp }));
  return { ok: true, token: payload + '.' + sign_(payload), expiresAt: exp, serverTime: nowIso_() };
}

function verifyToken_(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2 || sign_(parts[0]) !== parts[1]) throw error_('AUTH', 'Please log in again');
  let payload;
  try {
    payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
  } catch (err) {
    throw error_('AUTH', 'Please log in again');
  }
  if (!payload.exp || payload.exp < Date.now()) throw error_('AUTH', 'Session expired, please log in again');
}

function sign_(text) {
  const secret = getTokenSecret_();
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(text, secret));
}

function getTokenSecret_() {
  let secret = props_().TOKEN_SECRET;
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    PropertiesService.getScriptProperties().setProperty('TOKEN_SECRET', secret);
    props_().TOKEN_SECRET = secret;
  }
  return secret;
}

function sha256Hex_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); })
    .join('');
}

// ───────────────────────────── Sync (read) ─────────────────────────────

/**
 * Rows changed since `since` (everything when empty). Tables the API hasn't
 * written since the cutoff are skipped without opening the sheet. `ctx` reuses
 * tables a batch already has in memory.
 */
function sync_(since, ctx) {
  const serverTime = nowIso_();
  const cutoff = since ? new Date(new Date(since).getTime() - SYNC_OVERLAP_MS).toISOString() : '';
  const props = props_();
  const tables = {};
  Object.keys(SCHEMA).forEach(function (table) {
    const lastWrite = props['mod_' + table];
    if (cutoff && (!lastWrite || lastWrite < cutoff)) return;
    const t = (ctx && ctx[table]) || readTable_(table);
    const rows = t.rows
      .filter(function (r) { return !cutoff || String(r.updated_at) > cutoff; })
      .map(function (r) { return publicRow_(table, r); });
    if (rows.length) tables[table] = rows;
  });
  return { ok: true, serverTime: serverTime, full: !since, tables: tables };
}

function getPrivate_(table, id) {
  if (!PRIVATE_FIELDS[table]) throw error_('BAD_REQUEST', 'No private fields on ' + table);
  const t = readTable_(table);
  const row = t.rows.filter(function (r) { return r.id === id; })[0];
  if (!row) throw error_('NOT_FOUND', 'Record not found');
  const out = { id: id };
  PRIVATE_FIELDS[table].forEach(function (f) { out[f] = row[f]; });
  return { ok: true, row: out };
}

// ───────────────────────────── Batch (write) ─────────────────────────────

/**
 * ops: [{ opId, table, id, type: "create"|"update", data: {...}, base: updated_at|null }]
 * Each op succeeds or fails on its own; results come back in the same order.
 */
function batch_(ops, user, ctx) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw error_('BUSY', 'Server busy, will retry');
  try {
    const results = ops.map(function (op) {
      try {
        return applyOp_(op, ctx, user);
      } catch (err) {
        const res = { opId: op.opId, ok: false, code: err.code || 'INVALID', message: String(err.message || err) };
        const t = ctx[op.table];
        if (t && t.index[op.id] != null) res.row = publicRow_(op.table, t.rows[t.index[op.id]]);
        return res;
      }
    });
    const touched = Object.keys(ctx).filter(function (name) { return ctx[name].dirty; });
    touched.forEach(function (name) { writeTable_(ctx[name]); });
    if (touched.length) {
      SpreadsheetApp.flush();
      const now = nowIso_();
      const mods = {};
      touched.forEach(function (name) { mods['mod_' + name] = now; });
      PropertiesService.getScriptProperties().setProperties(mods);
      Object.assign(props_(), mods);
    }
    return { ok: true, serverTime: nowIso_(), results: results };
  } finally {
    lock.releaseLock();
  }
}

function applyOp_(op, ctx, user) {
  const table = op.table;
  if (!SCHEMA[table]) throw error_('BAD_REQUEST', 'Unknown table: ' + table);
  if (!op.id) throw error_('BAD_REQUEST', 'Missing id');
  const t = tableCtx_(ctx, table);
  const idx = t.index[op.id];
  const now = nowIso_();
  const data = sanitize_(table, op.data || {});

  if (op.type === 'create') {
    // A retried create (lost response) must not duplicate the row or burn a number.
    if (idx != null) return { opId: op.opId, ok: true, row: publicRow_(table, t.rows[idx]) };
    const row = blankRow_(table);
    Object.keys(data).forEach(function (k) { row[k] = data[k]; });
    row.id = String(op.id);
    row.created_at = now;
    row.created_by = user;
    row.updated_at = now;
    row.updated_by = user;
    row.is_deleted = data.is_deleted === true;
    if (VALIDATORS[table]) VALIDATORS[table](row, null, ctx);
    assignNumber_(table, row);
    t.index[row.id] = t.rows.length;
    t.rows.push(row);
    t.appended.push(row);
    t.dirty = true;
    return { opId: op.opId, ok: true, row: publicRow_(table, row) };
  }

  if (op.type === 'update') {
    if (idx == null) throw error_('NOT_FOUND', 'Record not found (it may have been removed)');
    const prev = t.rows[idx];
    if (op.base && String(prev.updated_at) !== String(op.base)) {
      return { opId: op.opId, ok: false, code: 'CONFLICT', message: 'Changed on another device', row: publicRow_(table, prev) };
    }
    const next = {};
    Object.keys(prev).forEach(function (k) { next[k] = prev[k]; });
    Object.keys(data).forEach(function (k) { next[k] = data[k]; });
    next.updated_at = now;
    next.updated_by = user;
    if (VALIDATORS[table]) VALIDATORS[table](next, prev, ctx);
    t.rows[idx] = next;
    if (prev.__row) {
      t.updatedIdx[idx] = true;
    } else {
      t.appended[t.appended.indexOf(prev)] = next;
    }
    t.dirty = true;
    return { opId: op.opId, ok: true, row: publicRow_(table, next) };
  }

  throw error_('BAD_REQUEST', 'Unknown op type: ' + op.type);
}

/** Keeps only known, client-writable fields and coerces their types. */
function sanitize_(table, data) {
  const out = {};
  const auto = AUTO_NUMBERS[table];
  SCHEMA[table].concat(['is_deleted']).forEach(function (f) {
    if (!(f in data)) return;
    if (auto && f === auto.field) return;
    let v = data[f];
    if (NUMERIC_FIELDS[f]) {
      v = Math.round((Number(v) || 0) * 100) / 100;
    } else if (BOOLEAN_FIELDS[f]) {
      v = v === true || v === 'TRUE' || v === 'true';
    } else {
      v = v == null ? '' : String(v).trim();
    }
    out[f] = v;
  });
  // Masked values come back from clients that only ever saw the mask; never store them.
  (PRIVATE_FIELDS[table] || []).forEach(function (f) {
    if (f in out && /x/i.test(out[f])) delete out[f];
  });
  return out;
}

function assignNumber_(table, row) {
  const auto = AUTO_NUMBERS[table];
  if (!auto) return;
  if (auto.monthly) {
    const tz = Session.getScriptTimeZone();
    const now = new Date();
    const mm = Utilities.formatDate(now, tz, 'MM');
    const yyyy = Utilities.formatDate(now, tz, 'yyyy');
    const seq = nextSeq_('INV-' + yyyy + '-' + mm);
    row[auto.field] = mm + '/' + yyyy + '/' + ('00' + seq).slice(-3);
  } else {
    const seq = nextSeq_(auto.counter);
    row[auto.field] = auto.prefix + ('000' + seq).slice(-4);
  }
}

/** Must be called while holding the script lock. */
function nextSeq_(key) {
  const sh = getSheet_('Counters');
  const last = sh.getLastRow();
  const values = last > 1 ? sh.getRange(2, 1, last - 1, 2).getValues() : [];
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === key) {
      const seq = Number(values[i][1] || 0) + 1;
      sh.getRange(i + 2, 2).setValue(seq);
      return seq;
    }
  }
  sh.getRange(last + 1, 1, 1, 2).setNumberFormats([['@', '0']]).setValues([[key, 1]]);
  return 1;
}

// ───────────────────────────── Sheet I/O ─────────────────────────────

function headersFor_(table) {
  return COMMON_FIELDS.concat(SCHEMA[table]);
}

function getSheet_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw error_('NOT_SET_UP', 'Sheet tab "' + name + '" missing. Run MFW ERP → Run setup.');
  return sh;
}

/** addMissing: append columns added to SCHEMA since setup ran (only while holding the lock). */
function readTable_(table, addMissing) {
  const sh = getSheet_(table);
  const values = sh.getDataRange().getValues();
  const headers = (values[0] || []).map(function (h) { return String(h || '').trim(); });
  if (addMissing && headers.length) {
    const missing = headersFor_(table).filter(function (h) { return headers.indexOf(h) === -1; });
    if (missing.length) {
      sh.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold').setBackground('#fde8dc');
      missing.forEach(function (h, i) {
        const col = columnLetter_(headers.length + i + 1);
        sh.getRange(col + '2:' + col).setNumberFormat(formatFor_(h));
      });
      Array.prototype.push.apply(headers, missing);
    }
  }
  const tz = Session.getScriptTimeZone();
  const rows = [];
  const index = {};
  for (let r = 1; r < values.length; r++) {
    const obj = {};
    headers.forEach(function (h, c) {
      if (!h) return;
      let v = values[r][c];
      if (Object.prototype.toString.call(v) === '[object Date]') {
        v = isNaN(v.getTime()) ? '' : Utilities.formatDate(v, tz, 'yyyy-MM-dd');
      }
      obj[h] = v;
    });
    if (!obj.id) continue;
    obj.id = String(obj.id);
    obj.is_deleted = obj.is_deleted === true || obj.is_deleted === 'TRUE';
    index[obj.id] = rows.length;
    rows.push(obj);
    obj.__row = r + 1;
  }
  return { name: table, sheet: sh, headers: headers, rows: rows, index: index, appended: [], updatedIdx: {}, dirty: false };
}

function writeTable_(t) {
  const toArray = function (row) {
    return t.headers.map(function (h) { return h && row[h] != null ? row[h] : ''; });
  };
  Object.keys(t.updatedIdx).forEach(function (i) {
    const row = t.rows[i];
    t.sheet.getRange(row.__row, 1, 1, t.headers.length).setValues([toArray(row)]);
  });
  if (t.appended.length) {
    const start = t.sheet.getLastRow() + 1;
    const formats = t.appended.map(function () { return t.headers.map(formatFor_); });
    t.sheet.getRange(start, 1, t.appended.length, t.headers.length)
      .setNumberFormats(formats)
      .setValues(t.appended.map(toArray));
  }
}

/** Text columns stay text so Sheets never turns 12-digit Aadhar into 1.2E+11 or "10/2026/001" into a date. */
function formatFor_(header) {
  if (NUMERIC_FIELDS[header]) return '0.##';
  if (BOOLEAN_FIELDS[header]) return 'General';
  return '@';
}

function blankRow_(table) {
  const row = {};
  headersFor_(table).forEach(function (h) { row[h] = ''; });
  return row;
}

function publicRow_(table, row) {
  const out = {};
  Object.keys(row).forEach(function (k) { if (k.indexOf('__') !== 0) out[k] = row[k]; });
  (PRIVATE_FIELDS[table] || []).forEach(function (f) {
    const v = String(out[f] || '');
    out[f] = v ? 'XXXX XXXX ' + v.slice(-4) : '';
  });
  return out;
}

// ───────────────────────────── Helpers ─────────────────────────────

function nowIso_() {
  return new Date().toISOString();
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function error_(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function invalid_(message) {
  return error_('INVALID', message);
}

// ───────────────────────────── Sheet menu & setup ─────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('MFW ERP')
    .addItem('Run setup (safe to re-run)', 'setup')
    .addItem('Set app password', 'promptSetPassword')
    .addItem('Log out all devices', 'logoutAllDevices')
    .addToUi();
}

/** Creates every tab with headers and text formatting. Re-running only adds what is missing. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tabs = Object.keys(SCHEMA).map(function (t) { return { name: t, headers: headersFor_(t) }; });
  tabs.push({ name: 'Counters', headers: ['key', 'last_seq'] });

  tabs.forEach(function (tab) {
    let sh = ss.getSheetByName(tab.name);
    if (!sh) sh = ss.insertSheet(tab.name);
    const lastCol = sh.getLastColumn();
    const existing = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
    const missing = tab.headers.filter(function (h) { return existing.indexOf(h) === -1; });
    if (missing.length) sh.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
    const headers = existing.concat(missing);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#fde8dc');
    sh.setFrozenRows(1);

    const byFormat = {};
    headers.forEach(function (h, i) {
      const fmt = tab.name === 'Counters' ? (h === 'last_seq' ? '0' : '@') : formatFor_(h);
      const col = columnLetter_(i + 1);
      (byFormat[fmt] = byFormat[fmt] || []).push(col + '2:' + col);
    });
    Object.keys(byFormat).forEach(function (fmt) { sh.getRangeList(byFormat[fmt]).setNumberFormat(fmt); });
  });

  const blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);

  seedSettings_({ company_name: 'Madeena Grand Fireworks' });
  seedTerms_();
  getTokenSecret_();

  // A toast, not ui.alert(): an alert blocks a run started from the editor until someone clicks OK in the Sheet.
  const tz = Session.getScriptTimeZone();
  const msg = 'Setup complete.' +
    (tz !== 'Asia/Kolkata' ? ' Warning: script time zone is ' + tz + ' — set it to Asia/Kolkata in Project Settings.' : '') +
    (PropertiesService.getScriptProperties().getProperty('PASSWORD_HASH') ? '' : ' Next: MFW ERP → Set app password.');
  ss.toast(msg, 'MFW ERP', 15);
  Logger.log(msg);
}

function columnLetter_(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function seedSettings_(defaults) {
  const t = readTable_('Settings');
  const now = nowIso_();
  Object.keys(defaults).forEach(function (key) {
    if (t.index[key] != null) return;
    const row = blankRow_('Settings');
    row.id = key; row.key = key; row.value = defaults[key];
    row.created_at = now; row.updated_at = now; row.created_by = 'setup'; row.updated_by = 'setup'; row.is_deleted = false;
    t.appended.push(row);
  });
  if (t.appended.length) {
    writeTable_(t);
    PropertiesService.getScriptProperties().setProperty('mod_Settings', now);
  }
}

/** Default agreement terms; ids match the app's own seeding so neither can create duplicates. */
const DEFAULT_TERMS = [
  ['Government Clearances & Permits', 'You shall be solely responsible for obtaining and managing all necessary approvals, permits, and clearances from relevant government authorities, including but not limited to the Police, Fire, and Revenue departments.'],
  ['Payment Terms', 'A minimum of 80% of the total contract payment must be cleared no later than seven (7) days prior to the scheduled event date.'],
  ['Accommodation & Meals', 'You agree to provide and cover the costs of adequate food and accommodation for the team, commencing three (3) days prior to the event date.'],
  ['Site Preparation', 'You are responsible for fully preparing the open ground venue prior to our setup. This specifically includes digging the required pits for 15 poles and providing the necessary figure cutouts.']
];

function seedTerms_() {
  const t = readTable_('Terms', true);
  if (t.rows.length) return;
  const now = nowIso_();
  DEFAULT_TERMS.forEach(function (term, i) {
    const row = blankRow_('Terms');
    row.id = 'term-' + (i + 1); row.title = term[0]; row.term_text = term[1]; row.sort = i;
    row.default_checked = true; row.active = true;
    row.created_at = now; row.updated_at = now; row.created_by = 'setup'; row.updated_by = 'setup'; row.is_deleted = false;
    t.appended.push(row);
  });
  writeTable_(t);
  PropertiesService.getScriptProperties().setProperty('mod_Terms', now);
}

function promptSetPassword() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('Set app password', 'Enter the new password everyone will use to log in (min 6 characters):', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const pw = res.getResponseText();
  if (!pw || pw.length < 6) { ui.alert('Password must be at least 6 characters.'); return; }
  const salt = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperties({
    PASSWORD_SALT: salt,
    PASSWORD_HASH: sha256Hex_(salt + pw),
    TOKEN_SECRET: Utilities.getUuid() + Utilities.getUuid()
  });
  ui.alert('Password set. All devices must log in again with the new password.');
}

function logoutAllDevices() {
  PropertiesService.getScriptProperties().setProperty('TOKEN_SECRET', Utilities.getUuid() + Utilities.getUuid());
  try { SpreadsheetApp.getUi().alert('Done. Every device will need to log in again.'); } catch (e) { /* run from editor */ }
}
