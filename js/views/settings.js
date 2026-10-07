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

  render(el) {
    const s = Store.settings();
    const field = f => {
      if (f.section) {
        return `<div class="col-12 mt-4"><h6 class="mb-0">${f.section}</h6>${f.note ? `<small class="text-muted">${f.note}</small>` : ''}</div>`;
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
        </div>

        <div class="col-xl-4">
          <div class="card mb-4">
            <h5 class="card-header">Sync & data</h5>
            <div class="card-body" id="sync-card"></div>
          </div>

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
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (!form.checkValidity()) { form.classList.add('was-validated'); return; }
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
    const changed = this.FIELDS.filter(f => f.key && form.elements[f.key].value.trim() !== this.value(s, f).trim());
    if (changed.length) {
      await Store.saveMany(changed.map(f => ['Settings', { id: f.key, key: f.key, value: form.elements[f.key].value.trim() }]));
    }
    UI.toast(changed.length ? 'Company profile saved' : 'No changes to save', changed.length ? 'success' : 'info');
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
