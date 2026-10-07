/**
 * #/orders                 list (status filter + search)
 * #/orders/new             new order (#/orders/new/:customerId to preselect)
 * #/orders/:id             detail
 * #/orders/:id/edit        edit
 */
Views.orders = (() => {
  const STATUSES = ['Pending', 'In Production', 'Ready', 'Delivered', 'Cancelled'];
  const STATUS_COLOR = { 'Pending': 'secondary', 'In Production': 'info', 'Ready': 'primary', 'Delivered': 'success', 'Cancelled': 'dark' };
  const PAGE = 100;
  let filter = 'Active';
  let query = '';
  let shown = PAGE;

  const statusBadge = s => `<span class="badge bg-label-${STATUS_COLOR[s] || 'secondary'}">${U.esc(s || 'Pending')}</span>`;
  const orderNo = o => o.order_no ? U.esc(o.order_no) : '<span class="text-muted fst-italic">Saving…</span>';
  const customerName = id => { const c = Store.get('Customers', id); return c ? c.name : 'Unknown customer'; };

  function dueText(o) {
    if (!o.delivery_date || Metrics.CLOSED.includes(o.status)) return '';
    const d = U.daysUntil(o.delivery_date);
    if (d < 0) return `<span class="text-danger fw-semibold">${-d}d overdue</span>`;
    if (d === 0) return '<span class="text-warning fw-semibold">Due today</span>';
    if (d <= APP_CONFIG.reminderDays) return `<span class="text-warning">Due in ${d}d</span>`;
    return '';
  }

  function payBadge(o, paidMap) {
    if (o.status === 'Cancelled') return '';
    const st = Metrics.paymentState(o.total, paidMap.get(o.id) || 0);
    return `<span class="badge bg-label-${st.color}">${st.label}</span>`;
  }

  /** One order as a list-group row (used here on mobile and on the customer page). */
  function listItem(o, paidMap, { showCustomer = true } = {}) {
    const bal = Metrics.balanceFor(o, paidMap);
    return `
      <a href="#/orders/${encodeURIComponent(o.id)}" class="list-group-item list-group-item-action">
        <div class="d-flex justify-content-between gap-2">
          <div class="min-w-0">
            <div class="fw-semibold text-truncate">${showCustomer ? U.esc(customerName(o.customer_id)) + ' · ' : ''}${orderNo(o)}</div>
            <small class="text-muted">Delivery ${U.fmtDate(o.delivery_date)} ${dueText(o) ? '· ' + dueText(o) : ''}</small>
            <div class="mt-1 d-flex gap-1 flex-wrap">${statusBadge(o.status)} ${payBadge(o, paidMap)}</div>
          </div>
          <div class="text-end flex-shrink-0">
            <div class="fw-semibold">${U.inr(o.total)}</div>
            ${o.status !== 'Cancelled' && bal > 0 ? `<small class="text-danger">Bal ${U.inr(bal)}</small>` : ''}
          </div>
        </div>
      </a>`;
  }

  // ───── List ─────

  function renderList(el) {
    const tabs = ['Active', 'All', ...STATUSES];
    el.innerHTML = `
      <div class="d-flex flex-wrap gap-2 align-items-center mb-3">
        <div class="input-group input-group-merge flex-grow-1 list-search">
          <span class="input-group-text"><i class="bx bx-search"></i></span>
          <input type="search" class="form-control" id="order-search" placeholder="Search customer, number or order no." value="${U.esc(query)}">
        </div>
        <a href="#/orders/new" class="btn btn-primary"><i class="bx bx-plus me-1"></i>New order</a>
      </div>
      <div class="filter-pills mb-3" id="order-filters">
        ${tabs.map(t => `<button type="button" class="btn btn-sm ${t === filter ? 'btn-primary' : 'btn-outline-secondary'}" data-filter="${t}">${t}</button>`).join('')}
      </div>
      <div id="order-results"></div>`;
    const input = el.querySelector('#order-search');
    input.addEventListener('input', U.debounce(() => { query = input.value; shown = PAGE; updateList(el); }, 120));
    el.querySelector('#order-filters').addEventListener('click', e => {
      const btn = e.target.closest('[data-filter]');
      if (!btn) return;
      filter = btn.dataset.filter;
      shown = PAGE;
      el.querySelectorAll('[data-filter]').forEach(b => {
        b.classList.toggle('btn-primary', b === btn);
        b.classList.toggle('btn-outline-secondary', b !== btn);
      });
      updateList(el);
    });
    updateList(el);
  }

  function updateList(el) {
    const box = el.querySelector('#order-results');
    if (!box) return;
    const q = query.trim().toLowerCase();
    const customers = new Map(Store.list('Customers', { includeDeleted: true }).map(c => [c.id, c]));
    const paid = Metrics.paidByOrder();

    let list = Store.list('Orders').filter(o => {
      if (filter === 'Active' && Metrics.CLOSED.includes(o.status)) return false;
      if (filter !== 'Active' && filter !== 'All' && o.status !== filter) return false;
      if (!q) return true;
      const c = customers.get(o.customer_id) || {};
      return [c.name, c.contact_no, c.company_name, o.order_no].some(v => String(v || '').toLowerCase().includes(q));
    });
    list.sort(filter === 'Active'
      ? (a, b) => String(a.delivery_date).localeCompare(String(b.delivery_date))
      : (a, b) => String(b.order_date).localeCompare(String(a.order_date)) || String(b.created_at).localeCompare(String(a.created_at)));
    const total = list.length;
    list = list.slice(0, shown);

    if (!total) {
      box.innerHTML = `<div class="card"><div class="card-body text-center text-muted py-5">
        <i class="bx bx-package display-6 d-block mb-2"></i>
        ${q || filter !== 'All' ? 'No orders match.' : 'No orders yet.'}</div></div>`;
      return;
    }

    box.innerHTML = `
      <div class="card d-none d-md-block">
        <div class="table-responsive">
          <table class="table table-hover mb-0">
            <thead><tr><th>Order</th><th>Customer</th><th>Order date</th><th>Delivery</th><th>Status</th>
              <th class="text-end">Total</th><th class="text-end">Balance</th><th>Payment</th></tr></thead>
            <tbody>${list.map(o => {
              const c = customers.get(o.customer_id);
              const bal = Metrics.balanceFor(o, paid);
              return `<tr class="row-link" data-href="#/orders/${encodeURIComponent(o.id)}">
                <td class="fw-semibold">${orderNo(o)}</td>
                <td>${U.esc(c ? c.name : 'Unknown')}</td>
                <td>${U.fmtDate(o.order_date)}</td>
                <td>${U.fmtDate(o.delivery_date)}<div class="small">${dueText(o)}</div></td>
                <td>${statusBadge(o.status)}</td>
                <td class="text-end">${U.inr(o.total)}</td>
                <td class="text-end ${o.status !== 'Cancelled' && bal > 0 ? 'text-danger fw-semibold' : ''}">${o.status === 'Cancelled' ? '—' : U.inr(bal)}</td>
                <td>${payBadge(o, paid)}</td></tr>`;
            }).join('')}</tbody>
          </table>
        </div>
      </div>
      <div class="card d-md-none"><div class="list-group list-group-flush">${list.map(o => listItem(o, paid)).join('')}</div></div>
      ${total > shown ? `<div class="text-center mt-3"><button class="btn btn-outline-secondary" id="order-more">Show more (${total - shown} left)</button></div>` : ''}
      <p class="text-muted small text-center mt-3 mb-0">${total} order${total === 1 ? '' : 's'}</p>`;

    box.querySelectorAll('.row-link').forEach(tr => tr.addEventListener('click', () => { location.hash = tr.dataset.href; }));
    const more = box.querySelector('#order-more');
    if (more) more.addEventListener('click', () => { shown += PAGE; updateList(el); });
  }

  // ───── Form ─────

  function renderForm(el, id, presetCustomerId) {
    const o = id ? Store.get('Orders', id) : null;
    if (id && (!o || o.is_deleted)) { Views.notfound.render(el); return; }
    const items = o ? itemsOf(o.id) : [];
    const paidSoFar = o ? Metrics.paidFor(o.id) : 0;
    let customerId = o ? o.customer_id : (presetCustomerId && Store.get('Customers', presetCustomerId) ? presetCustomerId : '');
    const back = o ? `#/orders/${encodeURIComponent(o.id)}` : (presetCustomerId ? `#/customers/${encodeURIComponent(presetCustomerId)}` : '#/orders');

    el.innerHTML = `
      <form class="card form-card" id="order-form" novalidate>
        <div class="card-header d-flex align-items-center gap-2">
          <a href="${back}" class="btn btn-icon btn-sm btn-text-secondary" aria-label="Back"><i class="bx bx-arrow-back"></i></a>
          <h5 class="mb-0">${o ? `Edit order ${o.order_no ? U.esc(o.order_no) : ''}` : 'New order'}</h5>
        </div>
        <div class="card-body">
          <div class="row g-3">
            <div class="col-12">
              <label class="form-label" for="f-customer">Customer *</label>
              <div id="customer-picked" class="customer-chip d-none"></div>
              <div id="customer-search-box">
                <input class="form-control" id="f-customer" placeholder="Type a name, number or company">
                <div class="invalid-feedback d-block d-none" id="customer-error">Choose a customer.</div>
              </div>
            </div>
            <div class="col-6 col-md-4">
              <label class="form-label" for="f-order-date">Order date</label>
              <input type="date" class="form-control" id="f-order-date" name="order_date" required value="${U.esc(o ? o.order_date : U.today())}">
            </div>
            <div class="col-6 col-md-4">
              <label class="form-label" for="f-delivery">Delivery date *</label>
              <input type="date" class="form-control" id="f-delivery" name="delivery_date" required value="${U.esc(o ? o.delivery_date : '')}">
              <div class="invalid-feedback">Choose the delivery date.</div>
            </div>
            <div class="col-12 col-md-4">
              <label class="form-label" for="f-status">Status</label>
              <select class="form-select" id="f-status" name="status">
                ${STATUSES.map(s => `<option ${(o ? o.status : 'Pending') === s ? 'selected' : ''}>${s}</option>`).join('')}
              </select>
            </div>
          </div>

          <h6 class="mt-4 mb-2">Items</h6>
          <div id="items-editor"></div>

          <div class="row g-3 mt-2 align-items-end">
            <div class="col-md-6">
              ${o ? `
                <div class="money-box"><small class="text-muted">Paid so far</small><div class="fw-semibold">${U.inr(paidSoFar)}</div>
                  <small class="text-muted">The total can't go below this.</small></div>` : `
                <label class="form-label" for="f-advance">Advance payment <span class="text-muted">(optional)</span></label>
                <div class="input-group">
                  <span class="input-group-text">₹</span>
                  <input type="number" class="form-control" id="f-advance" inputmode="decimal" min="0" step="any" placeholder="0">
                </div>
                <div class="form-text">Recorded as the first payment, with a receipt.</div>`}
            </div>
            <div class="col-md-6">
              <div class="grand-total"><span>Grand total</span><strong id="grand-total">₹0</strong></div>
              <div class="text-end small" id="balance-preview"></div>
            </div>
          </div>

          <div class="mt-3">
            <label class="form-label" for="f-notes">Notes <span class="text-muted">(optional)</span></label>
            <textarea class="form-control" id="f-notes" name="notes" rows="2">${U.esc(o ? o.notes : '')}</textarea>
          </div>
          <div class="alert alert-danger mt-3 mb-0 d-none" id="order-error"></div>
        </div>
        <div class="card-footer sticky-save d-flex gap-2 justify-content-end">
          <a href="${back}" class="btn btn-outline-secondary">Cancel</a>
          <button type="submit" class="btn btn-primary flex-grow-1 flex-md-grow-0"><i class="bx bx-save me-1"></i>Save order</button>
        </div>
      </form>`;

    const form = el.querySelector('#order-form');
    const picked = form.querySelector('#customer-picked');
    const searchBox = form.querySelector('#customer-search-box');
    const custInput = form.querySelector('#f-customer');
    const advanceInput = form.querySelector('#f-advance');

    function showCustomer() {
      const c = customerId ? Store.get('Customers', customerId) : null;
      picked.classList.toggle('d-none', !c);
      searchBox.classList.toggle('d-none', !!c);
      if (c) {
        picked.innerHTML = `
          <div class="min-w-0"><div class="fw-semibold text-truncate">${U.esc(c.name)}</div>
            <small class="text-muted">${U.esc(c.contact_no)} · ${U.esc(c.location)}</small></div>
          ${o ? '' : '<button type="button" class="btn btn-sm btn-text-secondary" id="customer-change">Change</button>'}`;
        const change = picked.querySelector('#customer-change');
        if (change) change.addEventListener('click', () => { customerId = ''; showCustomer(); custInput.value = ''; custInput.focus(); });
        form.querySelector('#customer-error').classList.add('d-none');
      }
    }

    Typeahead.attach(custInput, {
      source: q => {
        const n = q.toLowerCase();
        return Store.list('Customers')
          .filter(c => [c.name, c.contact_no, c.company_name, c.location].some(v => String(v || '').toLowerCase().includes(n)))
          .sort((a, b) => String(a.name).localeCompare(String(b.name)))
          .map(c => ({ label: c.name, sub: `${c.contact_no} · ${c.location}${c.company_name ? ' · ' + c.company_name : ''}`, value: c.id }));
      },
      footer: () => '<a class="dropdown-item text-primary" href="#/customers/new/order"><i class="bx bx-user-plus me-1"></i>Add a new customer</a>',
      onPick: it => { customerId = it.value; showCustomer(); }
    });
    showCustomer();

    function updateTotals(total) {
      form.querySelector('#grand-total').textContent = U.inr(total);
      const preview = form.querySelector('#balance-preview');
      if (o) {
        preview.innerHTML = total < paidSoFar
          ? `<span class="text-danger">Total is below the ₹${paidSoFar.toLocaleString('en-IN')} already paid</span>`
          : `Balance after save: <b>${U.inr(total - paidSoFar)}</b>`;
      } else {
        const adv = U.round2(advanceInput.value);
        preview.innerHTML = adv > 0 ? `Balance after advance: <b class="${adv > total ? 'text-danger' : ''}">${U.inr(total - adv)}</b>` : '';
      }
    }
    const editor = ItemsEditor.mount(form.querySelector('#items-editor'), { items, onChange: updateTotals });
    if (advanceInput) advanceInput.addEventListener('input', () => updateTotals(editor.total()));

    form.addEventListener('submit', e => {
      e.preventDefault();
      save(form, o, () => customerId, editor);
    });
    if (!customerId) custInput.focus();
  }

  function itemsOf(orderId) {
    return Store.list('OrderItems').filter(i => i.order_id === orderId).sort((a, b) => (Number(a.sort) || 0) - (Number(b.sort) || 0));
  }

  async function save(form, existing, getCustomerId, editor) {
    const errBox = form.querySelector('#order-error');
    const fail = msg => { errBox.textContent = msg; errBox.classList.remove('d-none'); errBox.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
    errBox.classList.add('d-none');

    const customerId = getCustomerId();
    form.querySelector('#customer-error').classList.toggle('d-none', !!customerId);
    if (!form.checkValidity() || !customerId) {
      form.classList.add('was-validated');
      if (!customerId) form.querySelector('#f-customer').focus();
      return;
    }
    const itemError = editor.validate();
    if (itemError) return fail(itemError);

    const items = editor.getItems();
    const total = editor.total();
    const fields = {
      customer_id: customerId,
      order_date: form.elements.order_date.value,
      delivery_date: form.elements.delivery_date.value,
      status: form.elements.status.value,
      total,
      notes: form.elements.notes.value.trim()
    };
    if (fields.delivery_date < fields.order_date) return fail('Delivery date is before the order date.');

    const entries = [];
    if (!existing) {
      const advanceInput = form.querySelector('#f-advance');
      const advance = U.round2(advanceInput.value);
      if (advance < 0) return fail("Advance can't be negative.");
      if (advance > total) return fail(`Advance (${U.inr(advance)}) is more than the order total (${U.inr(total)}).`);
      const orderId = U.uuid();
      entries.push(['Orders', { id: orderId, ...fields, source_quotation_id: '' }]);
      items.forEach((it, i) => entries.push(['OrderItems', { order_id: orderId, item_name: it.item_name, qty: it.qty, rate: it.rate, amount: it.amount, sort: i }]));
      if (advance > 0) entries.push(['Payments', { order_id: orderId, date: fields.order_date, amount: advance, note: 'Advance', status: '' }]);
      await Store.saveMany(entries);
      UI.toast(advance > 0 ? 'Order saved with advance payment' : 'Order saved');
      location.hash = `#/orders/${encodeURIComponent(orderId)}`;
      return;
    }

    const paid = Metrics.paidFor(existing.id);
    if (total < paid) return fail(`The new total ${U.inr(total)} is less than the ${U.inr(paid)} already paid. Adjust the items first.`);

    entries.push(['Orders', { id: existing.id, ...fields }]);
    const before = new Map(itemsOf(existing.id).map(i => [i.id, i]));
    items.forEach((it, i) => {
      const data = { item_name: it.item_name, qty: it.qty, rate: it.rate, amount: it.amount, sort: i };
      const prev = it.id && before.get(it.id);
      if (!prev) {
        entries.push(['OrderItems', { order_id: existing.id, ...data }]);
        return;
      }
      before.delete(it.id);
      const changed = Object.keys(data).some(k => String(prev[k]) !== String(data[k]));
      if (changed) entries.push(['OrderItems', { id: it.id, ...data }]);
    });
    before.forEach(prev => entries.push(['OrderItems', { id: prev.id, is_deleted: true }]));

    await Store.saveMany(entries);
    UI.toast('Order updated');
    location.hash = `#/orders/${encodeURIComponent(existing.id)}`;
  }

  // ───── Detail ─────

  function renderDetail(el, id) {
    const o = Store.get('Orders', id);
    if (!o || o.is_deleted) { Views.notfound.render(el); return; }
    const c = Store.get('Customers', o.customer_id);
    const items = itemsOf(id);
    const allPayments = Store.list('Payments').filter(p => p.order_id === id)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.created_at).localeCompare(String(b.created_at)));
    const payments = allPayments.filter(p => p.status !== 'Void');
    const paid = U.round2(payments.reduce((s, p) => s + (Number(p.amount) || 0), 0));
    const total = U.round2(o.total);
    const balance = U.round2(total - paid);
    const state = Metrics.paymentState(total, paid);
    const cancelled = o.status === 'Cancelled';
    const due = dueText(o);
    const invoice = Metrics.activeInvoiceFor(id);
    const invoiceChanged = invoice && Views.invoices.changedSince(invoice, o);

    let invoiceBtn;
    if (invoice) {
      invoiceBtn = `<a href="#/invoices/${encodeURIComponent(invoice.id)}" class="btn btn-success w-100 mt-2">
        <i class="bx bx-receipt me-1"></i>View invoice ${invoice.invoice_no ? U.esc(invoice.invoice_no) : ''}</a>`;
    } else if (!cancelled && total > 0 && balance <= 0) {
      invoiceBtn = '<button class="btn btn-success w-100 mt-2" id="final-invoice"><i class="bx bx-receipt me-1"></i>Generate final invoice</button>';
    } else {
      invoiceBtn = `<button class="btn btn-outline-secondary w-100 mt-2" disabled>
        <i class="bx bx-receipt me-1"></i>Final invoice${!cancelled && balance > 0 ? ` · ${U.inr(balance)} pending` : ''}</button>`;
    }

    el.innerHTML = `
      ${cancelled ? '<div class="alert alert-dark">This order is cancelled.</div>' : ''}
      ${invoiceChanged ? `<div class="alert alert-warning d-flex gap-2"><i class="bx bx-error fs-5"></i>
        <div>This order changed after invoice ${U.esc(invoice.invoice_no || '')} was issued. Open the invoice and void it if a corrected one is needed.</div></div>` : ''}
      <div class="card mb-4">
        <div class="card-header d-flex align-items-center gap-2 flex-wrap">
          <a href="#/orders" class="btn btn-icon btn-sm btn-text-secondary" aria-label="Back"><i class="bx bx-arrow-back"></i></a>
          <div class="me-auto min-w-0">
            <h5 class="mb-0">Order ${orderNo(o)}</h5>
            ${c ? `<a href="#/customers/${encodeURIComponent(c.id)}" class="small">${U.esc(c.name)} · ${U.esc(c.contact_no)}</a>` : '<small class="text-muted">Unknown customer</small>'}
          </div>
          <a href="#/orders/${encodeURIComponent(id)}/edit" class="btn btn-sm btn-outline-primary"><i class="bx bx-edit-alt me-1"></i>Edit</a>
          ${payments.length ? '' : '<button class="btn btn-sm btn-outline-danger" id="order-delete"><i class="bx bx-trash me-1"></i>Delete</button>'}
        </div>
        <div class="card-body">
          <div class="row g-3 align-items-end">
            <div class="col-6 col-lg-3"><small class="text-muted d-block">Order date</small><span class="fw-semibold">${U.fmtDate(o.order_date)}</span></div>
            <div class="col-6 col-lg-3"><small class="text-muted d-block">Delivery date</small>
              <span class="fw-semibold">${U.fmtDate(o.delivery_date)}</span>${due ? `<div class="small">${due}</div>` : ''}</div>
            <div class="col-6 col-lg-3">
              <label class="text-muted small d-block" for="status-select">Status</label>
              <select class="form-select form-select-sm" id="status-select">
                ${STATUSES.map(s => `<option ${o.status === s ? 'selected' : ''}>${s}</option>`).join('')}
              </select>
            </div>
            <div class="col-6 col-lg-3"><small class="text-muted d-block">Payment</small>
              ${cancelled ? '—' : `<span class="badge bg-label-${state.color}">${state.label}</span>`}</div>
          </div>
        </div>
      </div>

      <div class="row g-4">
        <div class="col-lg-8">
          <div class="card mb-4">
            <h5 class="card-header">Items</h5>
            <div class="table-responsive">
              <table class="table mb-0">
                <thead><tr><th>Item</th><th class="text-end">Qty</th><th class="text-end">Rate</th><th class="text-end">Amount</th></tr></thead>
                <tbody>
                  ${items.map(it => `<tr><td>${U.esc(it.item_name)}</td><td class="text-end">${U.esc(it.qty)}</td>
                    <td class="text-end">${U.inr(it.rate)}</td><td class="text-end">${U.inr(it.amount)}</td></tr>`).join('')}
                </tbody>
                <tfoot><tr><th colspan="3" class="text-end">Total</th><th class="text-end">${U.inr(total)}</th></tr></tfoot>
              </table>
            </div>
          </div>
          ${o.notes ? `<div class="card mb-4"><div class="card-body"><small class="text-muted d-block mb-1">Notes</small>${U.esc(o.notes)}</div></div>` : ''}
        </div>

        <div class="col-lg-4">
          <div class="card mb-4">
            <div class="card-body">
              <div class="money-row"><span>Total</span><strong>${U.inr(total)}</strong></div>
              <div class="money-row"><span>Paid</span><strong class="text-success">${U.inr(paid)}</strong></div>
              <div class="money-row money-row-total"><span>Balance</span><strong class="${balance > 0 ? 'text-danger' : 'text-success'}">${U.inr(balance)}</strong></div>
              ${!cancelled && balance > 0 ? `<a href="#/payments/new/${encodeURIComponent(id)}" class="btn btn-primary w-100 mt-3"><i class="bx bx-plus me-1"></i>Add payment</a>` : ''}
              ${invoiceBtn}
              ${cancelled ? '' : `<a href="#/invoices/proforma/${encodeURIComponent(id)}" class="btn btn-outline-primary w-100 mt-2"><i class="bx bx-file me-1"></i>Proforma invoice</a>`}
            </div>
          </div>
          <div class="card">
            <h5 class="card-header">Payments</h5>
            ${allPayments.length ? `<div class="list-group list-group-flush">${allPayments.map(p => `
              <a href="#/payments/${encodeURIComponent(p.id)}" class="list-group-item list-group-item-action d-flex justify-content-between">
                <div><div class="fw-semibold">${p.receipt_no ? U.esc(p.receipt_no) : '<span class="text-muted fst-italic">Saving…</span>'}
                  ${p.status === 'Void' ? '<span class="badge bg-label-danger ms-1">Void</span>' : ''}</div>
                  <small class="text-muted">${U.fmtDate(p.date)}${p.note ? ' · ' + U.esc(p.note) : ''}</small></div>
                <div class="fw-semibold ${p.status === 'Void' ? 'text-decoration-line-through text-muted' : ''}">${U.inr(p.amount)}</div>
              </a>`).join('')}</div>` : '<div class="card-body text-muted text-center">No payments yet.</div>'}
          </div>
        </div>
      </div>`;

    el.querySelector('#status-select').addEventListener('change', async e => {
      const next = e.target.value;
      if (next === 'Cancelled') {
        const ok = await UI.confirm({
          title: 'Cancel this order?',
          message: paid > 0 ? `${U.inr(paid)} has already been paid on this order. It stays on record.` : 'You can change the status back later if needed.',
          confirmText: 'Cancel order'
        });
        if (!ok) { e.target.value = o.status; return; }
      }
      await Store.save('Orders', { id, status: next });
      UI.toast(`Status changed to ${next}`);
    });
    const finalBtn = el.querySelector('#final-invoice');
    if (finalBtn) finalBtn.addEventListener('click', async () => {
      const ok = await UI.confirm({
        title: 'Generate final invoice?',
        message: `${U.inr(total)} for ${c ? c.name : 'this customer'}. The invoice copies the items as they are now and can't be edited afterwards, only voided.`,
        confirmText: 'Generate', danger: false
      });
      if (!ok) return;
      const invId = await Views.invoices.createForOrder(o);
      UI.toast('Final invoice created');
      location.hash = `#/invoices/${encodeURIComponent(invId)}`;
    });
    const del = el.querySelector('#order-delete');
    if (del) del.addEventListener('click', async () => {
      const ok = await UI.confirm({ title: 'Delete this order?', message: 'It will be removed from all lists. Use "Cancelled" instead if you want to keep it visible.', confirmText: 'Delete' });
      if (!ok) return;
      await Store.saveMany([['Orders', { id, is_deleted: true }], ...items.map(it => ['OrderItems', { id: it.id, is_deleted: true }])]);
      UI.toast('Order deleted');
      location.hash = '#/orders';
    });
  }

  return {
    title: 'Orders',
    STATUSES,
    listItem,
    refreshOn: params => (params[0] === 'new' || params[1] === 'edit') ? null : ['Orders', 'OrderItems', 'Payments', 'Customers', 'Invoices', 'InvoiceItems'],

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
