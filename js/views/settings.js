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
    { key: 'invoice_footer', label: 'Invoice footer note', type: 'textarea' }
  ],

  render(el) {
    const s = Store.settings();
    const field = f => {
      const value = U.esc(s[f.key] || '');
      const attrs = `class="form-control" id="set-${f.key}" name="${f.key}" ${f.required ? 'required' : ''} ${f.inputmode ? `inputmode="${f.inputmode}"` : ''}`;
      const input = f.type === 'textarea'
        ? `<textarea ${attrs} rows="2">${value}</textarea>`
        : `<input type="${f.type || 'text'}" ${attrs} value="${value}">`;
      return `<div class="col-md-6"><label class="form-label" for="set-${f.key}">${f.label}</label>${input}</div>`;
    };

    el.innerHTML = `
      <div class="row g-4">
        <div class="col-xl-8">
          <form class="card" id="company-form" novalidate>
            <h5 class="card-header">Company profile</h5>
            <div class="card-body">
              <p class="text-muted small">Shown on receipts, invoices, quotations and agreements.</p>
              <div class="row g-3">${this.FIELDS.map(field).join('')}</div>
            </div>
            <div class="card-footer sticky-save">
              <button type="submit" class="btn btn-primary w-100 w-md-auto"><i class="bx bx-save me-1"></i>Save profile</button>
            </div>
          </form>
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
    const changed = this.FIELDS.filter(f => (form.elements[f.key].value.trim()) !== (s[f.key] || ''));
    for (const f of changed) {
      await Store.save('Settings', { id: f.key, key: f.key, value: form.elements[f.key].value.trim() });
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
