Views.settings = {
  title: 'Settings',

  FIELDS: [
    { key: 'company_name', label: 'Company name', required: true },
    { key: 'address', label: 'Address', type: 'textarea' },
    { key: 'phone', label: 'Phone', inputmode: 'tel' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'licence_no', label: 'Licence number' },
    { key: 'bank_name', label: 'Bank name' },
    { key: 'bank_account', label: 'Account number', inputmode: 'numeric' },
    { key: 'bank_ifsc', label: 'IFSC' },
    { key: 'upi_id', label: 'UPI ID' },
    { key: 'doc_sign_name', label: 'Name in the signature block', placeholder: 'MADEENA GRAND FIREWORKS' },
    { key: 'invoice_terms', label: 'Terms on invoices (one per line)', type: 'textarea', rows: 4, def: () => Docs.DEFAULT_TERMS },
    { key: 'invoice_footer', label: 'Invoice footer note', type: 'textarea' },
    { section: 'Invoice party details', note: 'Extra lines on proforma and final invoices.' },
    { key: 'invoice_show_company', label: 'Show customer company name on invoices', type: 'checkbox', def: () => 'TRUE' },
    { key: 'invoice_show_aadhar', label: 'Show masked Aadhaar (XXXX XXXX last 4) on invoices', type: 'checkbox', def: () => 'FALSE' },
    { section: 'Agreement header', note: 'Agreements are issued under this firm. The header is built from these details.' },
    { key: 'agr_firm_name', label: 'Firm name', def: () => Docs.FIRM_DEFAULTS.agr_firm_name },
    { key: 'agr_proprietor', label: 'Proprietor', def: () => Docs.FIRM_DEFAULTS.agr_proprietor },
    { key: 'agr_phones', label: 'Phone numbers (comma separated)', def: () => Docs.FIRM_DEFAULTS.agr_phones },
    { key: 'agr_gstin', label: 'GSTIN', def: () => Docs.FIRM_DEFAULTS.agr_gstin },
    { key: 'agr_address', label: 'Address', type: 'textarea', def: () => Docs.FIRM_DEFAULTS.agr_address }
  ],

  value(s, f) {
    return f.key in s ? s[f.key] || '' : (f.def ? f.def() : '');
  },

  checked(s, f) {
    const v = String(this.value(s, f)).toUpperCase();
    if (v === '') return String(f.def ? f.def() : '').toUpperCase() === 'TRUE';
    return v === 'TRUE' || v === '1' || v === 'YES';
  },

  render(el) {
    const s = Store.settings();
    const field = f => {
      if (f.section) {
        return `<div class="col-12 mt-4"><h6 class="mb-0">${f.section}</h6>${f.note ? `<small class="text-muted">${f.note}</small>` : ''}</div>`;
      }
      if (f.type === 'checkbox') {
        return `<div class="col-12">
          <div class="form-check">
            <input class="form-check-input" type="checkbox" id="set-${f.key}" name="${f.key}" value="TRUE" ${this.checked(s, f) ? 'checked' : ''}>
            <label class="form-check-label" for="set-${f.key}">${f.label}</label>
          </div>
        </div>`;
      }
      const value = U.esc(this.value(s, f));
      const attrs = `class="form-control" id="set-${f.key}" name="${f.key}" ${f.required ? 'required' : ''} ${f.inputmode ? `inputmode="${f.inputmode}"` : ''} ${f.placeholder ? `placeholder="${U.esc(f.placeholder)}"` : ''}`;
      const input = f.type === 'textarea'
        ? `<textarea ${attrs} rows="${f.rows || 2}">${value}</textarea>`
        : `<input type="${f.type || 'text'}" ${attrs} value="${value}">`;
      return `<div class="col-md-6"><label class="form-label" for="set-${f.key}">${f.label}</label>${input}</div>`;
    };

    el.innerHTML = `
      <div class="row g-4">
        <div class="col-xl-8">
          <form class="card" id="company-form" novalidate>
            <h5 class="card-header">Company profile</h5>
            <div class="card-body">
              <p class="text-muted small">Invoices and receipts use your letterhead image for the header; the fields below fill in the rest.</p>
              <div class="row g-3">${this.FIELDS.map(field).join('')}</div>
            </div>
            <div class="card-footer sticky-save">
              <button type="submit" class="btn btn-primary w-100 w-md-auto"><i class="bx bx-save me-1"></i>Save profile</button>
            </div>
          </form>

          <div class="card mt-4">
            <div class="card-header d-flex align-items-center justify-content-between">
              <div><h5 class="mb-0">Agreement terms</h5><small class="text-muted">Ticked terms are pre-selected on new agreements.</small></div>
              <button class="btn btn-sm btn-primary" id="term-add"><i class="bx bx-plus me-1"></i>Add term</button>
            </div>
            <div class="list-group list-group-flush" id="terms-list"></div>
          </div>

          <div class="card mt-4 border-danger">
            <h5 class="card-header text-danger">Clear test data</h5>
            <div class="card-body" id="cleanup-card"></div>
          </div>
        </div>

        <div class="col-xl-4">
          <div class="card mb-4">
            <h5 class="card-header">Sync & data</h5>
            <div class="card-body" id="sync-card"></div>
          </div>

          ${this.installCard()}

          <form class="card mb-4" id="device-form">
            <h5 class="card-header">This device</h5>
            <div class="card-body">
              <label class="form-label" for="device-name">Device name</label>
              <input class="form-control" id="device-name" placeholder="e.g. Shop PC, Owner's phone" value="${U.esc(Auth.deviceName())}">
              <div class="form-text">Recorded as "created by" on entries made here.</div>
              <button type="submit" class="btn btn-outline-primary mt-3">Save</button>
            </div>
          </form>

          <div class="card">
            <h5 class="card-header">Account</h5>
            <div class="card-body">
              <p class="small text-muted mb-3">To change the shared password, open the Google Sheet → <b>MFW ERP</b> menu → <b>Set app password</b>.</p>
              <button class="btn btn-outline-danger w-100" id="logout-btn"><i class="bx bx-log-out me-1"></i>Log out</button>
              <p class="small text-muted text-center mt-3 mb-0">Version ${U.esc(APP_CONFIG.version)}</p>
            </div>
          </div>
        </div>
      </div>`;

    this.renderSyncCard();
    this.renderTerms();
    this.renderCleanup();
    el.querySelector('#term-add').addEventListener('click', () => this.editTerm(null));
    if (this.unsub) this.unsub();
    this.unsub = Sync.onStatus(() => {
      if (document.getElementById('sync-card')) this.renderSyncCard();
      else { this.unsub(); this.unsub = null; }
    });

    el.querySelector('#company-form').addEventListener('submit', e => this.saveProfile(e));
    el.querySelector('#device-form').addEventListener('submit', e => {
      e.preventDefault();
      Auth.setDeviceName(el.querySelector('#device-name').value);
      UI.toast('Device name saved');
    });
    el.querySelector('#logout-btn').addEventListener('click', () => this.logout());
    const installBtn = el.querySelector('#install-btn');
    if (installBtn) installBtn.addEventListener('click', async () => {
      if (await App.install.prompt()) return;
      this.render(el);
    });
  },

  installCard() {
    const ins = App.install;
    let body;
    if (ins.isInstalled()) {
      body = '<p class="small mb-0"><i class="bx bx-check-circle text-success me-1"></i>Running as an installed app on this device.</p>';
    } else if (ins.canPrompt()) {
      body = `<p class="small text-muted">Add the app to this device's home screen. It opens full screen and loads instantly, even on a weak connection.</p>
        <button class="btn btn-primary w-100" id="install-btn"><i class="bx bx-download me-1"></i>Install app</button>`;
    } else if (ins.isIos()) {
      body = `<p class="small text-muted mb-2">iPhone does not show an Install button. Add the app from Safari:</p>
        <ol class="small text-muted mb-0 ps-3">
          <li class="mb-1">Open this site in <b>Safari</b> (not Chrome or an in-app browser).</li>
          <li class="mb-1">Tap <b>Share</b> <i class="bx bx-share"></i> at the bottom.</li>
          <li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
        </ol>`;
    } else {
      body = '<p class="small text-muted mb-0">Open the browser menu (⋮) and choose <b>Install app</b> or <b>Add to Home screen</b>.</p>';
    }
    return `<div class="card mb-4"><h5 class="card-header">Install on this device</h5><div class="card-body">${body}</div></div>`;
  },

  renderTerms() {
    const box = document.getElementById('terms-list');
    if (!box) return;
    const terms = Docs.agreementTerms();
    box.innerHTML = terms.map((t, i) => `
      <div class="list-group-item d-flex gap-2 align-items-start">
        <input class="form-check-input mt-1 flex-shrink-0" type="checkbox" data-default="${U.esc(t.id)}" title="Pre-selected on new agreements"
          ${t.default_checked !== false && t.default_checked !== 'FALSE' ? 'checked' : ''}>
        <div class="flex-grow-1 min-w-0">
          <div class="fw-semibold">${i + 1}. ${U.esc(t.title)}</div>
          <small class="text-muted">${U.esc(t.term_text)}</small>
        </div>
        <div class="d-flex flex-shrink-0">
          <button class="btn btn-icon btn-sm btn-text-secondary" data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up"><i class="bx bx-chevron-up"></i></button>
          <button class="btn btn-icon btn-sm btn-text-secondary" data-down="${i}" ${i === terms.length - 1 ? 'disabled' : ''} aria-label="Move down"><i class="bx bx-chevron-down"></i></button>
          <button class="btn btn-icon btn-sm btn-text-secondary" data-edit="${U.esc(t.id)}" aria-label="Edit"><i class="bx bx-edit-alt"></i></button>
          <button class="btn btn-icon btn-sm btn-text-danger" data-del="${U.esc(t.id)}" aria-label="Delete"><i class="bx bx-trash"></i></button>
        </div>
      </div>`).join('') || '<div class="list-group-item text-muted text-center py-4">No terms. Add your first one.</div>';

    const move = async (i, dir) => {
      const a = terms[i], b = terms[i + dir];
      await Store.saveMany(terms.map((t, k) => ['Terms', { id: t.id, sort: t === a ? i + dir : t === b ? i : k }]));
      this.renderTerms();
    };
    box.querySelectorAll('[data-up]').forEach(btn => btn.addEventListener('click', () => move(Number(btn.dataset.up), -1)));
    box.querySelectorAll('[data-down]').forEach(btn => btn.addEventListener('click', () => move(Number(btn.dataset.down), 1)));
    box.querySelectorAll('[data-default]').forEach(cb => cb.addEventListener('change', async () => {
      await Store.save('Terms', { id: cb.dataset.default, default_checked: cb.checked });
    }));
    box.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => this.editTerm(Store.get('Terms', btn.dataset.edit))));
    box.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', async () => {
      const t = Store.get('Terms', btn.dataset.del);
      const ok = await UI.confirm({ title: 'Delete this term?', message: `"${t.title}" will no longer be offered on new agreements. Existing agreements keep it.`, confirmText: 'Delete' });
      if (!ok) return;
      await Store.remove('Terms', t.id);
      this.renderTerms();
    }));
  },

  editTerm(term) {
    const el = U.el(`
      <div class="modal fade" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered">
          <form class="modal-content" novalidate>
            <div class="modal-header"><h5 class="modal-title">${term ? 'Edit term' : 'Add term'}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
            <div class="modal-body">
              <label class="form-label" for="term-title">Title *</label>
              <input class="form-control mb-3" id="term-title" required maxlength="80" value="${U.esc(term ? term.title : '')}" placeholder="e.g. Payment Terms">
              <label class="form-label" for="term-text">Text *</label>
              <textarea class="form-control" id="term-text" rows="4" required maxlength="600">${U.esc(term ? term.term_text : '')}</textarea>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="submit" class="btn btn-primary">Save</button>
            </div>
          </form>
        </div>
      </div>`);
    document.body.appendChild(el);
    const modal = new bootstrap.Modal(el);
    const form = el.querySelector('form');
    let saved = false;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (saved) return;
      if (!form.checkValidity()) { form.classList.add('was-validated'); return; }
      saved = true;
      const title = form.querySelector('#term-title').value.trim();
      const text = form.querySelector('#term-text').value.trim();
      modal.hide();
      if (term) {
        await Store.save('Terms', { id: term.id, title, term_text: text });
      } else {
        const last = Docs.agreementTerms().reduce((m, t) => Math.max(m, Number(t.sort) || 0), -1);
        await Store.save('Terms', { title, term_text: text, sort: last + 1, default_checked: true, active: true });
      }
      this.renderTerms();
    });
    el.addEventListener('shown.bs.modal', () => form.querySelector('#term-title').focus());
    el.addEventListener('hidden.bs.modal', () => el.remove());
    modal.show();
  },

  renderSyncCard() {
    const s = Sync.status();
    const card = document.getElementById('sync-card');
    card.innerHTML = `
      <dl class="row mb-3 small">
        <dt class="col-6 text-muted fw-normal">Status</dt><dd class="col-6 text-end mb-1">${U.esc(s.state)}</dd>
        <dt class="col-6 text-muted fw-normal">Last synced</dt><dd class="col-6 text-end mb-1">${U.timeAgo(s.lastSync)}</dd>
        <dt class="col-6 text-muted fw-normal">Waiting to save</dt><dd class="col-6 text-end mb-1">${s.pending}</dd>
      </dl>
      ${s.message ? `<div class="alert alert-warning small py-2">${U.esc(s.message)}</div>` : ''}
      <div class="d-grid gap-2">
        <button class="btn btn-primary" id="sync-now"><i class="bx bx-refresh me-1"></i>Sync now</button>
        <button class="btn btn-outline-secondary" id="reload-data"><i class="bx bx-data me-1"></i>Reload all data</button>
      </div>`;
    card.querySelector('#sync-now').addEventListener('click', () => Sync.now());
    card.querySelector('#reload-data').addEventListener('click', () => this.reloadAll());
  },

  async saveProfile(e) {
    e.preventDefault();
    const form = e.target;
    if (!form.checkValidity()) {
      form.classList.add('was-validated');
      return;
    }
    const s = Store.settings();
    const nextVal = f => {
      if (f.type === 'checkbox') return form.elements[f.key].checked ? 'TRUE' : 'FALSE';
      return form.elements[f.key].value.trim();
    };
    const prevVal = f => {
      if (f.type === 'checkbox') return this.checked(s, f) ? 'TRUE' : 'FALSE';
      return this.value(s, f).trim();
    };
    const changed = this.FIELDS.filter(f => f.key && nextVal(f) !== prevVal(f));
    if (changed.length) {
      await Store.saveMany(changed.map(f => ['Settings', { id: f.key, key: f.key, value: nextVal(f) }]));
    }
    UI.toast(changed.length ? 'Company profile saved' : 'No changes to save', changed.length ? 'success' : 'info');
  },

  // ───── Clear test data ─────

  CLEANUP_CATS: [
    { id: 'orders', label: 'Orders & Events (+ line items)' },
    { id: 'payments', label: 'Payments (void — removed from Collected)' },
    { id: 'invoices', label: 'Invoices (void)' },
    { id: 'quotations', label: 'Quotations (+ lines)' },
    { id: 'agreements', label: 'Agreements' },
    { id: 'expenses', label: 'Expenses' },
    { id: 'customers', label: 'Customers (only if they have no remaining orders)' }
  ],

  renderCleanup() {
    const box = document.getElementById('cleanup-card');
    if (!box) return;
    const today = U.today();
    const monthStart = today.slice(0, 7) + '-01';
    box.innerHTML = `
      <p class="small text-muted">Removes dummy / test entries for a date range without editing the Sheet by hand.
        Rows are soft-deleted or voided through the app (same rules as normal). Number counters are not reset.</p>
      <div class="row g-2 mb-3">
        <div class="col-6">
          <label class="form-label small mb-1" for="cu-from">From</label>
          <input type="date" class="form-control form-control-sm" id="cu-from" value="${U.esc(monthStart)}">
        </div>
        <div class="col-6">
          <label class="form-label small mb-1" for="cu-to">To</label>
          <input type="date" class="form-control form-control-sm" id="cu-to" value="${U.esc(today)}">
        </div>
        <div class="col-12">
          <label class="form-label small mb-1" for="cu-mode">Match dates by</label>
          <select class="form-select form-select-sm" id="cu-mode">
            <option value="doc">Document date (order / payment / invoice date…)</option>
            <option value="created">Created date (when the row was saved)</option>
          </select>
        </div>
      </div>
      <div class="mb-2 small fw-semibold">Categories</div>
      <div id="cu-cats" class="mb-3">
        ${this.CLEANUP_CATS.map(c => `
          <div class="form-check">
            <input class="form-check-input" type="checkbox" id="cu-${c.id}" data-cu="${c.id}" checked>
            <label class="form-check-label" for="cu-${c.id}">${c.label} <span class="text-muted" data-cu-count="${c.id}"></span></label>
          </div>`).join('')}
      </div>
      <div class="d-flex flex-wrap gap-2 mb-2">
        <button type="button" class="btn btn-sm btn-outline-secondary" id="cu-all">Select all</button>
        <button type="button" class="btn btn-sm btn-outline-secondary" id="cu-none">Select none</button>
        <button type="button" class="btn btn-sm btn-outline-primary" id="cu-preview">Preview counts</button>
      </div>
      <div class="small text-muted mb-3" id="cu-summary">Choose a period and Preview to see what will be cleared.</div>
      <button type="button" class="btn btn-danger w-100" id="cu-run" disabled><i class="bx bx-trash me-1"></i>Clear selected data</button>`;

    const refresh = () => this.updateCleanupPreview();
    ['cu-from', 'cu-to', 'cu-mode'].forEach(id => box.querySelector('#' + id).addEventListener('change', refresh));
    box.querySelector('#cu-cats').addEventListener('change', refresh);
    box.querySelector('#cu-all').addEventListener('click', () => {
      box.querySelectorAll('[data-cu]').forEach(c => { c.checked = true; });
      refresh();
    });
    box.querySelector('#cu-none').addEventListener('click', () => {
      box.querySelectorAll('[data-cu]').forEach(c => { c.checked = false; });
      refresh();
    });
    box.querySelector('#cu-preview').addEventListener('click', refresh);
    box.querySelector('#cu-run').addEventListener('click', () => this.runCleanup());
    refresh();
  },

  cleanupOpts() {
    const box = document.getElementById('cleanup-card');
    if (!box) return null;
    const from = box.querySelector('#cu-from').value;
    const to = box.querySelector('#cu-to').value;
    const mode = box.querySelector('#cu-mode').value;
    const cats = {};
    this.CLEANUP_CATS.forEach(c => {
      const el = box.querySelector(`[data-cu="${c.id}"]`);
      cats[c.id] = !!(el && el.checked);
    });
    return { from, to, mode, cats };
  },

  inCleanupRange(dateVal, from, to) {
    const d = String(dateVal || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  },

  rowDate(row, mode, docField) {
    if (mode === 'created') return String(row.created_at || '').slice(0, 10);
    return String(row[docField] || '').slice(0, 10);
  },

  /** Build the set of rows to void / soft-delete for the current filters. */
  planCleanup(opts) {
    const { from, to, mode, cats } = opts;
    const plan = {
      invoices: [],
      payments: [],
      orders: [],
      orderItems: [],
      quotations: [],
      quotationItems: [],
      agreements: [],
      expenses: [],
      customers: [],
      notes: []
    };

    const ordersInRange = Store.list('Orders').filter(o =>
      this.inCleanupRange(this.rowDate(o, mode, 'order_date'), from, to));
    const orderIds = new Set();

    if (cats.orders) {
      plan.orders = ordersInRange;
      plan.orders.forEach(o => orderIds.add(o.id));
      plan.orderItems = Store.list('OrderItems').filter(i => orderIds.has(i.order_id));
    }

    if (cats.invoices) {
      plan.invoices = Store.list('Invoices').filter(i =>
        i.status !== 'Void' && this.inCleanupRange(this.rowDate(i, mode, 'date'), from, to));
    }
    // Invoices on orders being cleared must be voided first (server rule for voiding payments).
    if (cats.orders) {
      Store.list('Invoices').forEach(i => {
        if (i.status === 'Void' || !orderIds.has(i.order_id)) return;
        if (!plan.invoices.some(x => x.id === i.id)) plan.invoices.push(i);
      });
    }

    if (cats.payments) {
      plan.payments = Store.list('Payments').filter(p =>
        p.status !== 'Void' && this.inCleanupRange(this.rowDate(p, mode, 'date'), from, to));
    }
    if (cats.orders) {
      Store.list('Payments').forEach(p => {
        if (p.status === 'Void' || !orderIds.has(p.order_id)) return;
        if (!plan.payments.some(x => x.id === p.id)) plan.payments.push(p);
      });
    }
    // Payments selected alone may still need their order invoices voided first.
    if (cats.payments && !cats.orders) {
      const payOrderIds = new Set(plan.payments.map(p => p.order_id));
      Store.list('Invoices').forEach(i => {
        if (i.status === 'Void' || !payOrderIds.has(i.order_id)) return;
        if (!plan.invoices.some(x => x.id === i.id)) {
          plan.invoices.push(i);
          plan.notes.push(`Invoice ${i.invoice_no || ''} will be voided so linked payments can be cleared.`);
        }
      });
    }

    if (cats.quotations) {
      plan.quotations = Store.list('Quotations').filter(q =>
        this.inCleanupRange(this.rowDate(q, mode, 'date'), from, to));
      const qids = new Set(plan.quotations.map(q => q.id));
      plan.quotationItems = Store.list('QuotationItems').filter(i => qids.has(i.quotation_id));
    }

    if (cats.agreements) {
      plan.agreements = Store.list('Agreements').filter(a =>
        this.inCleanupRange(this.rowDate(a, mode, 'date'), from, to));
    }

    if (cats.expenses) {
      plan.expenses = Store.list('Expenses').filter(e =>
        this.inCleanupRange(this.rowDate(e, mode, 'date'), from, to));
    }

    if (cats.customers) {
      const remainingOrders = new Set(
        Store.list('Orders').filter(o => !orderIds.has(o.id)).map(o => o.customer_id)
      );
      plan.customers = Store.list('Customers').filter(c =>
        this.inCleanupRange(this.rowDate(c, mode, 'created_at'), from, to) && !remainingOrders.has(c.id));
      const skipped = Store.list('Customers').filter(c =>
        this.inCleanupRange(this.rowDate(c, mode, 'created_at'), from, to) && remainingOrders.has(c.id)).length;
      if (skipped) plan.notes.push(`${skipped} customer(s) in range kept — they still have orders.`);
    }

    plan.total =
      plan.invoices.length + plan.payments.length + plan.orders.length + plan.orderItems.length +
      plan.quotations.length + plan.quotationItems.length + plan.agreements.length +
      plan.expenses.length + plan.customers.length;
    return plan;
  },

  updateCleanupPreview() {
    const box = document.getElementById('cleanup-card');
    if (!box) return;
    const opts = this.cleanupOpts();
    const summary = box.querySelector('#cu-summary');
    const runBtn = box.querySelector('#cu-run');
    if (!opts.from || !opts.to) {
      summary.textContent = 'Choose From and To dates.';
      runBtn.disabled = true;
      return;
    }
    if (opts.from > opts.to) {
      summary.textContent = 'From date must be on or before To date.';
      runBtn.disabled = true;
      return;
    }
    const plan = this.planCleanup(opts);
    const counts = {
      orders: plan.orders.length,
      payments: plan.payments.length,
      invoices: plan.invoices.length,
      quotations: plan.quotations.length,
      agreements: plan.agreements.length,
      expenses: plan.expenses.length,
      customers: plan.customers.length
    };
    this.CLEANUP_CATS.forEach(c => {
      const el = box.querySelector(`[data-cu-count="${c.id}"]`);
      if (el) el.textContent = opts.cats[c.id] ? `(${counts[c.id]})` : '';
    });
    if (!Object.values(opts.cats).some(Boolean)) {
      summary.textContent = 'Select at least one category.';
      runBtn.disabled = true;
      return;
    }
    if (!plan.total) {
      summary.textContent = 'No matching entries in this period for the selected categories.';
      runBtn.disabled = true;
      return;
    }
    const parts = [
      plan.orders.length && `${plan.orders.length} order(s)`,
      plan.orderItems.length && `${plan.orderItems.length} order line(s)`,
      plan.payments.length && `${plan.payments.length} payment(s) to void`,
      plan.invoices.length && `${plan.invoices.length} invoice(s) to void`,
      plan.quotations.length && `${plan.quotations.length} quotation(s)`,
      plan.agreements.length && `${plan.agreements.length} agreement(s)`,
      plan.expenses.length && `${plan.expenses.length} expense(s)`,
      plan.customers.length && `${plan.customers.length} customer(s)`
    ].filter(Boolean);
    summary.innerHTML = `<span class="text-danger">Will clear: ${parts.join(' · ')}.</span>` +
      (plan.notes.length ? `<div class="mt-1">${plan.notes.map(U.esc).join('<br>')}</div>` : '');
    runBtn.disabled = false;
    this._cleanupPlan = plan;
    this._cleanupOpts = opts;
  },

  async runCleanup() {
    this.updateCleanupPreview();
    const plan = this._cleanupPlan;
    const opts = this._cleanupOpts;
    if (!plan || !plan.total) return;
    if (Store.hasPending()) {
      UI.toast('Sync pending changes first, then clear data.', 'warning');
      return;
    }
    const ok = await UI.confirm({
      title: 'Clear this test data?',
      message: `${plan.total} row change(s) from ${opts.from} to ${opts.to}. Type DELETE in the next step is not required — this cannot be undone from the app (voided/deleted rows stay hidden).`,
      confirmText: 'Clear data',
      danger: true
    });
    if (!ok) return;

    // Extra typed confirm
    const typed = await new Promise(resolve => {
      const el = U.el(`
        <div class="modal fade" tabindex="-1">
          <div class="modal-dialog modal-dialog-centered modal-sm">
            <form class="modal-content">
              <div class="modal-header"><h5 class="modal-title">Confirm cleanup</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
              <div class="modal-body">
                <label class="form-label" for="cu-type">Type <b>DELETE</b> to continue</label>
                <input class="form-control" id="cu-type" autocomplete="off" required>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" class="btn btn-danger">Clear now</button>
              </div>
            </form>
          </div>
        </div>`);
      document.body.appendChild(el);
      const modal = new bootstrap.Modal(el);
      let done = false;
      el.querySelector('form').addEventListener('submit', e => {
        e.preventDefault();
        done = el.querySelector('#cu-type').value.trim().toUpperCase() === 'DELETE';
        modal.hide();
      });
      el.addEventListener('hidden.bs.modal', () => { el.remove(); resolve(done); });
      el.addEventListener('shown.bs.modal', () => el.querySelector('#cu-type').focus());
      modal.show();
    });
    if (!typed) {
      UI.toast('Cleanup cancelled', 'info');
      return;
    }

    const entries = [];
    // 1) Void invoices  2) Void payments  3) Soft-delete the rest
    plan.invoices.forEach(i => entries.push(['Invoices', { id: i.id, status: 'Void', void_reason: 'Cleared as test data' }]));
    plan.payments.forEach(p => entries.push(['Payments', { id: p.id, status: 'Void' }]));
    plan.orderItems.forEach(i => entries.push(['OrderItems', { id: i.id, is_deleted: true }]));
    plan.orders.forEach(o => entries.push(['Orders', { id: o.id, is_deleted: true }]));
    plan.quotationItems.forEach(i => entries.push(['QuotationItems', { id: i.id, is_deleted: true }]));
    plan.quotations.forEach(q => entries.push(['Quotations', { id: q.id, is_deleted: true }]));
    plan.agreements.forEach(a => entries.push(['Agreements', { id: a.id, is_deleted: true }]));
    plan.expenses.forEach(e => entries.push(['Expenses', { id: e.id, is_deleted: true }]));
    plan.customers.forEach(c => entries.push(['Customers', { id: c.id, is_deleted: true }]));

    try {
      // Batch in chunks so a huge cleanup still fits Apps Script limits.
      const CHUNK = 40;
      for (let i = 0; i < entries.length; i += CHUNK) {
        await Store.saveMany(entries.slice(i, i + CHUNK));
      }
      await Sync.now();
      UI.toast(`Cleared ${plan.total} change(s)`);
      this.renderCleanup();
    } catch (err) {
      UI.toast(`Cleanup failed: ${err.message || err}`, 'danger');
    }
  },

  async reloadAll() {
    if (Store.hasPending()) {
      UI.toast('Some changes are still waiting to save. Sync first, then reload.', 'warning');
      return;
    }
    const ok = await UI.confirm({ title: 'Reload all data?', message: 'This re-downloads everything from the Google Sheet. Use it if something looks out of date.', confirmText: 'Reload', danger: false });
    if (!ok) return;
    UI.showSkeleton();
    try {
      await Sync.initial();
      UI.toast('All data reloaded');
    } catch (err) {
      UI.toast(`Reload failed: ${err.message}`, 'danger');
    }
    UI.route();
  },

  async logout() {
    const pending = Store.pendingCount();
    const ok = await UI.confirm({
      title: 'Log out?',
      message: pending
        ? `${pending} change(s) haven't reached the server yet and will be lost. Sync first if you can.`
        : 'This device\'s cached data will be cleared.',
      confirmText: 'Log out'
    });
    if (ok) Auth.logout();
  }
};
