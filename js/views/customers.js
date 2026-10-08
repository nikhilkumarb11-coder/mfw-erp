/**
 * #/customers              list + search
 * #/customers/new          add (#/customers/new/order → go on to a new order after saving)
 * #/customers/:id          detail
 * #/customers/:id/edit     edit
 */
Views.customers = (() => {
  const PAGE = 100;
  let query = '';
  let shown = PAGE;

  const isMasked = v => /x/i.test(String(v || ''));

  function matches(c, q) {
    if (!q) return true;
    return [c.name, c.contact_no, c.company_name, c.location].some(v => String(v || '').toLowerCase().includes(q));
  }

  // ───── List ─────

  function renderList(el) {
    el.innerHTML = `
      <div class="d-flex flex-wrap gap-2 align-items-center mb-3">
        <div class="input-group input-group-merge flex-grow-1 list-search">
          <span class="input-group-text"><i class="bx bx-search"></i></span>
          <input type="search" class="form-control" id="cust-search" placeholder="Search name, number, company, location" value="${U.esc(query)}">
        </div>
        <a href="#/customers/new" class="btn btn-primary"><i class="bx bx-user-plus me-1"></i>Add customer</a>
      </div>
      <div id="cust-results"></div>`;
    const input = el.querySelector('#cust-search');
    input.addEventListener('input', U.debounce(() => { query = input.value; shown = PAGE; updateList(el); }, 120));
    updateList(el);
  }

  function updateList(el) {
    const box = el.querySelector('#cust-results');
    if (!box) return;
    const q = query.trim().toLowerCase();
    const stats = Metrics.customerStats();
    const all = Store.list('Customers').filter(c => matches(c, q))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const rows = all.slice(0, shown);
    const empty = { orders: 0, billed: 0, paid: 0, balance: 0 };

    if (!all.length) {
      box.innerHTML = `<div class="card"><div class="card-body text-center text-muted py-5">
        <i class="bx bx-user display-6 d-block mb-2"></i>
        ${q ? 'No customers match your search.' : 'No customers yet. Add your first one.'}</div></div>`;
      return;
    }

    box.innerHTML = `
      <div class="card d-none d-md-block">
        <div class="table-responsive">
          <table class="table table-hover mb-0">
            <thead><tr><th>Customer</th><th>Contact</th><th>Location</th><th class="text-end">Orders</th>
              <th class="text-end">Billed</th><th class="text-end">Paid</th><th class="text-end">Balance</th></tr></thead>
            <tbody>${rows.map(c => {
              const s = stats.get(c.id) || empty;
              return `<tr class="row-link" data-href="#/customers/${encodeURIComponent(c.id)}">
                <td><div class="fw-semibold">${U.esc(c.name)}</div>${c.company_name ? `<small class="text-muted">${U.esc(c.company_name)}</small>` : ''}</td>
                <td>${U.esc(c.contact_no)}</td><td>${U.esc(c.location)}</td>
                <td class="text-end">${s.orders}</td><td class="text-end">${U.inr(s.billed)}</td>
                <td class="text-end">${U.inr(s.paid)}</td>
                <td class="text-end fw-semibold ${s.balance > 0 ? 'text-danger' : ''}">${U.inr(s.balance)}</td></tr>`;
            }).join('')}</tbody>
          </table>
        </div>
      </div>
      <div class="d-md-none list-cards">${rows.map(c => {
        const s = stats.get(c.id) || empty;
        return `<a href="#/customers/${encodeURIComponent(c.id)}" class="card list-card">
          <div class="card-body">
            <div class="d-flex justify-content-between gap-2">
              <div class="min-w-0"><div class="fw-semibold text-truncate">${U.esc(c.name)}</div>
                <small class="text-muted">${U.esc(c.contact_no)} · ${U.esc(c.location)}</small></div>
              <div class="text-end flex-shrink-0"><div class="fw-semibold ${s.balance > 0 ? 'text-danger' : ''}">${U.inr(s.balance)}</div>
                <small class="text-muted">${s.orders} order${s.orders === 1 ? '' : 's'}</small></div>
            </div>
          </div></a>`;
      }).join('')}</div>
      ${all.length > shown ? `<div class="text-center mt-3"><button class="btn btn-outline-secondary" id="cust-more">Show more (${all.length - shown} left)</button></div>` : ''}
      <p class="text-muted small text-center mt-3 mb-0">${all.length} customer${all.length === 1 ? '' : 's'}</p>`;

    box.querySelectorAll('.row-link').forEach(tr => tr.addEventListener('click', () => { location.hash = tr.dataset.href; }));
    const more = box.querySelector('#cust-more');
    if (more) more.addEventListener('click', () => { shown += PAGE; updateList(el); });
  }

  // ───── Form ─────

  function renderForm(el, id, next) {
    const c = id ? Store.get('Customers', id) : null;
    if (id && !c) { Views.notfound.render(el); return; }
    const masked = c && isMasked(c.aadhar_no);
    el.innerHTML = `
      <form class="card form-card" id="cust-form" novalidate>
        <div class="card-header d-flex align-items-center gap-2">
          <a href="${c ? `#/customers/${encodeURIComponent(c.id)}` : '#/customers'}" class="btn btn-icon btn-sm btn-text-secondary" aria-label="Back"><i class="bx bx-arrow-back"></i></a>
          <h5 class="mb-0">${c ? 'Edit customer' : 'New customer'}</h5>
        </div>
        <div class="card-body">
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label" for="f-name">Name *</label>
              <input class="form-control" id="f-name" name="name" required value="${U.esc(c ? c.name : '')}" autocomplete="off">
              <div class="invalid-feedback">Enter the customer's name.</div>
            </div>
            <div class="col-md-6">
              <label class="form-label" for="f-contact">Contact number *</label>
              <input class="form-control" id="f-contact" name="contact_no" required inputmode="numeric" maxlength="10" pattern="\\d{10}" value="${U.esc(c ? c.contact_no : '')}" placeholder="10-digit mobile">
              <div class="invalid-feedback">Enter a 10-digit number.</div>
            </div>
            <div class="col-md-6">
              <label class="form-label" for="f-location">Location *</label>
              <input class="form-control" id="f-location" name="location" required value="${U.esc(c ? c.location : '')}">
              <div class="invalid-feedback">Enter the location.</div>
            </div>
            <div class="col-md-6">
              <label class="form-label" for="f-aadhar">Aadhar number <span class="text-muted">(optional)</span></label>
              <input class="form-control" id="f-aadhar" name="aadhar_no" inputmode="numeric" maxlength="40"
                value="${c && !masked ? U.esc(c.aadhar_no) : ''}" placeholder="${masked ? `${U.esc(c.aadhar_no)} — leave blank to keep` : ''}">
            </div>
            <div class="col-md-6">
              <label class="form-label" for="f-company">Company name <span class="text-muted">(optional)</span></label>
              <input class="form-control" id="f-company" name="company_name" value="${U.esc(c ? c.company_name : '')}">
            </div>
          </div>
        </div>
        <div class="card-footer sticky-save d-flex gap-2 justify-content-end">
          <a href="${c ? `#/customers/${encodeURIComponent(c.id)}` : '#/customers'}" class="btn btn-outline-secondary">Cancel</a>
          <button type="submit" class="btn btn-primary flex-grow-1 flex-md-grow-0"><i class="bx bx-save me-1"></i>Save customer</button>
        </div>
      </form>`;

    const form = el.querySelector('#cust-form');
    const contactInput = form.querySelector('#f-contact');
    contactInput.addEventListener('input', () => { contactInput.value = contactInput.value.replace(/\D/g, ''); });
    form.addEventListener('submit', e => { e.preventDefault(); save(form, c, next); });
    if (!c) form.querySelector('#f-name').focus();
  }

  async function save(form, existing, next) {
    const v = name => form.elements[name].value.trim();
    const aadhar = v('aadhar_no');
    if (!form.checkValidity()) {
      form.classList.add('was-validated');
      const bad = form.querySelector(':invalid');
      if (bad) bad.focus();
      return;
    }

    const contact = v('contact_no');
    const dup = Store.list('Customers').find(c => c.contact_no === contact && (!existing || c.id !== existing.id));
    if (dup) {
      const ok = await UI.confirm({
        title: 'Number already used',
        message: `${dup.name} (${dup.location}) already has the number ${contact}. Save anyway?`,
        confirmText: 'Save anyway',
        danger: false
      });
      if (!ok) return;
    }

    const patch = {
      name: v('name'),
      contact_no: contact,
      location: v('location'),
      company_name: v('company_name')
    };
    if (existing) patch.id = existing.id;
    if (aadhar) patch.aadhar_no = aadhar;
    const row = await Store.save('Customers', patch);
    UI.toast(existing ? 'Customer updated' : 'Customer added');
    location.hash = next === 'order' ? `#/orders/new/${encodeURIComponent(row.id)}` : `#/customers/${encodeURIComponent(row.id)}`;
  }

  // ───── Detail ─────

  function renderDetail(el, id) {
    const c = Store.get('Customers', id);
    if (!c) { Views.notfound.render(el); return; }
    const paid = Metrics.paidByOrder();
    const orders = Store.list('Orders').filter(o => o.customer_id === id)
      .sort((a, b) => String(b.order_date).localeCompare(String(a.order_date)) || String(b.created_at).localeCompare(String(a.created_at)));
    const s = Metrics.customerStats().get(id) || { orders: 0, billed: 0, paid: 0, balance: 0 };
    const deleted = c.is_deleted === true;

    el.innerHTML = `
      ${deleted ? '<div class="alert alert-warning">This customer was removed. Their history is kept for your records.</div>' : ''}
      <div class="card mb-4">
        <div class="card-header d-flex align-items-center gap-2 flex-wrap">
          <a href="#/customers" class="btn btn-icon btn-sm btn-text-secondary" aria-label="Back"><i class="bx bx-arrow-back"></i></a>
          <div class="me-auto min-w-0">
            <h5 class="mb-0 text-truncate">${U.esc(c.name)}</h5>
            ${c.company_name ? `<small class="text-muted">${U.esc(c.company_name)}</small>` : ''}
          </div>
          ${deleted ? '' : `
          <a href="#/customers/${encodeURIComponent(id)}/edit" class="btn btn-sm btn-outline-primary"><i class="bx bx-edit-alt me-1"></i>Edit</a>
          <button class="btn btn-sm btn-outline-danger" id="cust-delete"><i class="bx bx-trash me-1"></i>Delete</button>`}
        </div>
        <div class="card-body">
          <div class="row g-3">
            <div class="col-sm-6 col-lg-3"><small class="text-muted d-block">Contact</small>
              <a href="tel:${U.esc(c.contact_no)}" class="fw-semibold">${U.esc(c.contact_no)}</a></div>
            <div class="col-sm-6 col-lg-3"><small class="text-muted d-block">Location</small><span class="fw-semibold">${U.esc(c.location)}</span></div>
            <div class="col-sm-6 col-lg-3"><small class="text-muted d-block">Aadhar</small>
              <span class="fw-semibold" id="aadhar-value">${U.esc(c.aadhar_no || '—')}</span>
              ${isMasked(c.aadhar_no) ? '<button class="btn btn-link btn-sm p-0 ms-2" id="aadhar-show">Show</button>' : ''}</div>
            <div class="col-sm-6 col-lg-3"><small class="text-muted d-block">Customer since</small><span class="fw-semibold">${U.fmtDate(String(c.created_at || '').slice(0, 10))}</span></div>
          </div>
        </div>
      </div>

      <div class="row g-3 mb-4">
        ${[['Orders', s.orders], ['Billed', U.inr(s.billed)], ['Paid', U.inr(s.paid)], ['Balance', U.inr(s.balance)]].map(([k, val]) => `
          <div class="col-6 col-lg-3"><div class="card h-100"><div class="card-body">
            <small class="text-muted">${k}</small><h5 class="mb-0 mt-1 ${k === 'Balance' && s.balance > 0 ? 'text-danger' : ''}">${val}</h5>
          </div></div></div>`).join('')}
      </div>

      <div class="card">
        <div class="card-header d-flex align-items-center justify-content-between">
          <h5 class="mb-0">Orders</h5>
          ${deleted ? '' : `<a href="#/quotations/new/${encodeURIComponent(id)}" class="btn btn-sm btn-outline-primary"><i class="bx bx-file me-1"></i>Quotation</a>
            <a href="#/orders/new/${encodeURIComponent(id)}" class="btn btn-sm btn-primary"><i class="bx bx-plus me-1"></i>New order</a>`}
        </div>
        ${orders.length ? `<div class="list-group list-group-flush">${orders.map(o => Views.orders.listItem(o, paid, { showCustomer: false })).join('')}</div>`
          : '<div class="card-body text-center text-muted py-4">No orders yet.</div>'}
      </div>`;

    const showBtn = el.querySelector('#aadhar-show');
    if (showBtn) showBtn.addEventListener('click', () => revealAadhar(c, showBtn));
    const del = el.querySelector('#cust-delete');
    if (del) del.addEventListener('click', () => remove(c, orders.length));
  }

  async function revealAadhar(c, btn) {
    btn.disabled = true;
    btn.textContent = 'Loading…';
    try {
      const res = await Api.call('getPrivate', { table: 'Customers', id: c.id });
      const v = String(res.row.aadhar_no || '');
      document.getElementById('aadhar-value').textContent = v.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3');
      btn.remove();
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Show';
      UI.toast(e.code === 'NETWORK' ? 'You need to be online to view the Aadhar number.' : e.message, 'warning');
    }
  }

  async function remove(c, orderCount) {
    const ok = await UI.confirm({
      title: `Delete ${c.name}?`,
      message: orderCount
        ? `This customer has ${orderCount} order${orderCount === 1 ? '' : 's'}. They'll be hidden from the customer list, but their orders and payments stay on record.`
        : 'They will be removed from the customer list.',
      confirmText: 'Delete'
    });
    if (!ok) return;
    await Store.remove('Customers', c.id);
    UI.toast('Customer deleted');
    location.hash = '#/customers';
  }

  return {
    title: 'Customers',
    refreshOn: params => (params[0] === 'new' || params[1] === 'edit') ? null : ['Customers', 'Orders', 'Payments'],

    render(el, params) {
      const [a, b] = params;
      if (!a) return renderList(el);
      if (a === 'new') return renderForm(el, null, b);
      if (b === 'edit') return renderForm(el, a);
      return renderDetail(el, a);
    },

    update(el, params) {
      if (!params[0]) updateList(el);
      else this.render(el, params);
    }
  };
})();
