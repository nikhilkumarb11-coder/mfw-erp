/**
 * #/payments                 list of receipts
 * #/payments/new             record a payment (#/payments/new/:orderId to preselect)
 * #/payments/:id             receipt (view, PDF, WhatsApp, void)
 */
Views.payments = (() => {
  const PAGE = 100;
  let query = '';
  let shown = PAGE;

  const receiptNo = p => p.receipt_no ? U.esc(p.receipt_no) : '<span class="text-muted fst-italic">Saving…</span>';

  function orderInfo(orderId) {
    const o = Store.get('Orders', orderId);
    const c = o ? Store.get('Customers', o.customer_id) : null;
    return { o, c, name: c ? c.name : 'Unknown customer', orderNo: o && o.order_no ? o.order_no : '' };
  }

  // ───── List ─────

  function renderList(el) {
    el.innerHTML = `
      <div class="row g-3 mb-3" id="pay-stats"></div>
      <div class="d-flex flex-wrap gap-2 align-items-center mb-3">
        <div class="input-group input-group-merge flex-grow-1 list-search">
          <span class="input-group-text"><i class="bx bx-search"></i></span>
          <input type="search" class="form-control" id="pay-search" placeholder="Search receipt, customer or order no." value="${U.esc(query)}">
        </div>
        <a href="#/payments/new" class="btn btn-primary"><i class="bx bx-plus me-1"></i>Add payment</a>
      </div>
      <div id="pay-results"></div>`;
    const input = el.querySelector('#pay-search');
    input.addEventListener('input', U.debounce(() => { query = input.value; shown = PAGE; updateList(el); }, 120));
    updateList(el);
  }

  function updateList(el) {
    const box = el.querySelector('#pay-results');
    if (!box) return;
    const m = Metrics.thisMonth();
    el.querySelector('#pay-stats').innerHTML = [
      ['Collected this month', U.inr(m.collected), 'bx-wallet', 'success'],
      ['Pending dues', U.inr(m.pending), 'bx-time-five', 'danger']
    ].map(([label, value, icon, color]) => `
      <div class="col-6"><div class="card"><div class="card-body d-flex align-items-center gap-3 py-3">
        <span class="avatar-initial rounded bg-label-${color} stat-icon d-none d-sm-flex"><i class="bx ${icon}"></i></span>
        <div class="min-w-0"><small class="text-muted d-block text-truncate">${label}</small><h5 class="mb-0">${value}</h5></div>
      </div></div></div>`).join('');

    const q = query.trim().toLowerCase();
    let list = Store.list('Payments').map(p => ({ p, ...orderInfo(p.order_id) })).filter(r => {
      if (!q) return true;
      return [r.p.receipt_no, r.name, r.orderNo, r.c && r.c.contact_no].some(v => String(v || '').toLowerCase().includes(q));
    });
    list.sort((a, b) => String(b.p.date).localeCompare(String(a.p.date)) || String(b.p.created_at).localeCompare(String(a.p.created_at)));
    const total = list.length;
    list = list.slice(0, shown);

    if (!total) {
      box.innerHTML = `<div class="card"><div class="card-body text-center text-muted py-5">
        <i class="bx bx-wallet display-6 d-block mb-2"></i>${q ? 'No payments match.' : 'No payments yet.'}</div></div>`;
      return;
    }
    const voidCls = r => r.p.status === 'Void' ? 'text-decoration-line-through text-muted' : '';
    box.innerHTML = `
      <div class="card d-none d-md-block">
        <div class="table-responsive">
          <table class="table table-hover mb-0">
            <thead><tr><th>Receipt</th><th>Date</th><th>Customer</th><th>Order</th><th>Note</th><th class="text-end">Amount</th></tr></thead>
            <tbody>${list.map(r => `
              <tr class="row-link" data-href="#/payments/${encodeURIComponent(r.p.id)}">
                <td class="fw-semibold">${receiptNo(r.p)} ${r.p.status === 'Void' ? '<span class="badge bg-label-danger ms-1">Void</span>' : ''}</td>
                <td>${U.fmtDate(r.p.date)}</td>
                <td>${U.esc(r.name)}</td>
                <td>${U.esc(r.orderNo)}</td>
                <td class="text-muted">${U.esc(r.p.note)}</td>
                <td class="text-end fw-semibold ${voidCls(r)}">${U.inr(r.p.amount)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <div class="card d-md-none"><div class="list-group list-group-flush">${list.map(r => `
        <a href="#/payments/${encodeURIComponent(r.p.id)}" class="list-group-item list-group-item-action d-flex justify-content-between gap-2">
          <div class="min-w-0">
            <div class="fw-semibold text-truncate">${U.esc(r.name)}</div>
            <small class="text-muted">${receiptNo(r.p)} · ${U.esc(r.orderNo)} · ${U.fmtDate(r.p.date)}</small>
            ${r.p.status === 'Void' ? '<div><span class="badge bg-label-danger">Void</span></div>' : ''}
          </div>
          <div class="fw-semibold flex-shrink-0 ${voidCls(r)}">${U.inr(r.p.amount)}</div>
        </a>`).join('')}</div></div>
      ${total > shown ? `<div class="text-center mt-3"><button class="btn btn-outline-secondary" id="pay-more">Show more (${total - shown} left)</button></div>` : ''}
      <p class="text-muted small text-center mt-3 mb-0">${total} payment${total === 1 ? '' : 's'}</p>`;
    box.querySelectorAll('.row-link').forEach(tr => tr.addEventListener('click', () => { location.hash = tr.dataset.href; }));
    const more = box.querySelector('#pay-more');
    if (more) more.addEventListener('click', () => { shown += PAGE; updateList(el); });
  }

  // ───── Form ─────

  function openOrders() {
    const paid = Metrics.paidByOrder();
    return Store.list('Orders')
      .filter(o => o.status !== 'Cancelled')
      .map(o => ({ o, balance: Metrics.balanceFor(o, paid) }))
      .filter(r => r.balance > 0);
  }

  function renderForm(el, presetOrderId) {
    let orderId = presetOrderId && Store.get('Orders', presetOrderId) ? presetOrderId : '';
    const back = orderId ? `#/orders/${encodeURIComponent(orderId)}` : '#/payments';

    el.innerHTML = `
      <form class="card form-card" id="pay-form" novalidate>
        <div class="card-header d-flex align-items-center gap-2">
          <a href="${back}" class="btn btn-icon btn-sm btn-text-secondary" aria-label="Back"><i class="bx bx-arrow-back"></i></a>
          <h5 class="mb-0">Add payment</h5>
        </div>
        <div class="card-body">
          <div class="row g-3">
            <div class="col-12">
              <label class="form-label" for="f-order">Order *</label>
              <div id="order-picked" class="customer-chip d-none"></div>
              <div id="order-search-box">
                <input class="form-control" id="f-order" placeholder="Type customer name, number or order no.">
                <div class="invalid-feedback d-block d-none" id="order-error">Choose an order with a balance.</div>
              </div>
            </div>
            <div class="col-md-6">
              <label class="form-label" for="f-amount">Amount *</label>
              <div class="input-group has-validation">
                <span class="input-group-text">₹</span>
                <input type="number" class="form-control" id="f-amount" name="amount" inputmode="decimal" min="0.01" step="any" required>
                <button type="button" class="btn btn-outline-primary" id="pay-full">Full balance</button>
                <div class="invalid-feedback" id="amount-feedback">Enter an amount.</div>
              </div>
            </div>
            <div class="col-md-6">
              <label class="form-label" for="f-date">Date</label>
              <input type="date" class="form-control" id="f-date" name="date" required value="${U.today()}" max="${U.today()}">
            </div>
            <div class="col-12">
              <label class="form-label" for="f-note">Note <span class="text-muted">(optional)</span></label>
              <input class="form-control" id="f-note" name="note" maxlength="120" placeholder="e.g. Cash, UPI, cheque no.">
            </div>
          </div>
          <div class="alert alert-danger mt-3 mb-0 d-none" id="pay-error"></div>
        </div>
        <div class="card-footer sticky-save d-flex gap-2 justify-content-end">
          <a href="${back}" class="btn btn-outline-secondary">Cancel</a>
          <button type="submit" class="btn btn-primary flex-grow-1 flex-md-grow-0"><i class="bx bx-save me-1"></i>Save & view receipt</button>
        </div>
      </form>`;

    const form = el.querySelector('#pay-form');
    const picked = form.querySelector('#order-picked');
    const searchBox = form.querySelector('#order-search-box');
    const orderInput = form.querySelector('#f-order');
    const amount = form.querySelector('#f-amount');
    const balanceNow = () => { const o = Store.get('Orders', orderId); return o ? Metrics.balanceFor(o) : 0; };

    function showOrder() {
      const info = orderId ? orderInfo(orderId) : null;
      picked.classList.toggle('d-none', !info);
      searchBox.classList.toggle('d-none', !!info);
      if (!info) return;
      const bal = balanceNow();
      picked.innerHTML = `
        <div class="min-w-0"><div class="fw-semibold text-truncate">${U.esc(info.name)} · ${U.esc(info.orderNo || 'New order')}</div>
          <small class="text-muted">Total ${U.inr(info.o.total)} · Balance <b class="${bal > 0 ? 'text-danger' : 'text-success'}">${U.inr(bal)}</b></small></div>
        ${presetOrderId ? '' : '<button type="button" class="btn btn-sm btn-text-secondary" id="order-change">Change</button>'}`;
      const change = picked.querySelector('#order-change');
      if (change) change.addEventListener('click', () => { orderId = ''; showOrder(); orderInput.value = ''; orderInput.focus(); });
      form.querySelector('#order-error').classList.add('d-none');
      amount.max = bal;
    }

    Typeahead.attach(orderInput, {
      limit: 10,
      source: q => {
        const n = q.toLowerCase();
        return openOrders()
          .map(r => ({ ...r, info: orderInfo(r.o.id) }))
          .filter(r => !n || [r.info.name, r.info.orderNo, r.info.c && r.info.c.contact_no, r.info.c && r.info.c.company_name]
            .some(v => String(v || '').toLowerCase().includes(n)))
          .sort((a, b) => String(a.o.delivery_date).localeCompare(String(b.o.delivery_date)))
          .map(r => ({ label: `${r.info.name} · ${r.info.orderNo || 'New order'}`, sub: `Balance ${U.inr(r.balance)} of ${U.inr(r.o.total)} · Delivery ${U.fmtDate(r.o.delivery_date)}`, value: r.o.id }));
      },
      onPick: it => { orderId = it.value; showOrder(); amount.focus(); }
    });
    showOrder();

    form.querySelector('#pay-full').addEventListener('click', () => {
      if (!orderId) { form.querySelector('#order-error').classList.remove('d-none'); return; }
      amount.value = balanceNow();
    });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const errBox = form.querySelector('#pay-error');
      errBox.classList.add('d-none');
      form.querySelector('#order-error').classList.toggle('d-none', !!orderId);
      const value = U.round2(amount.value);
      const bal = balanceNow();
      amount.setCustomValidity(value > bal ? 'too much' : '');
      form.querySelector('#amount-feedback').textContent = value > bal ? `Only ${U.inr(bal)} is pending on this order.` : 'Enter an amount.';
      if (!form.checkValidity() || !orderId) {
        form.classList.add('was-validated');
        return;
      }
      if (!(value > 0)) return;
      const [row] = await Store.saveMany([['Payments', {
        order_id: orderId, date: form.elements.date.value, amount: value, note: form.elements.note.value.trim(), status: ''
      }]]);
      UI.toast(`Payment of ${U.inr(value)} saved`);
      location.hash = `#/payments/${encodeURIComponent(row.id)}`;
    });
    if (!orderId) orderInput.focus(); else amount.focus();
  }

  // ───── Receipt ─────

  function renderReceipt(el, id) {
    const p = Store.get('Payments', id);
    if (!p || p.is_deleted) { Views.notfound.render(el); return; }
    const info = orderInfo(p.order_id);
    const isVoid = p.status === 'Void';
    const invoice = Metrics.activeInvoiceFor(p.order_id);
    const waiting = !p.receipt_no ? 'Waiting for the receipt number from the server…' : '';

    el.innerHTML = `
      <div class="card mb-3">
        <div class="card-header d-flex align-items-center gap-2 flex-wrap">
          <a href="${info.o ? `#/orders/${encodeURIComponent(p.order_id)}` : '#/payments'}" class="btn btn-icon btn-sm btn-text-secondary" aria-label="Back"><i class="bx bx-arrow-back"></i></a>
          <div class="me-auto min-w-0">
            <h5 class="mb-0">Receipt ${receiptNo(p)} ${isVoid ? '<span class="badge bg-danger ms-1">Void</span>' : ''}</h5>
            <small class="text-muted">${U.esc(info.name)} · ${U.inr(p.amount)} · ${U.fmtDate(p.date)}</small>
          </div>
          <div class="d-flex gap-2 flex-wrap">
            ${Docs.actionsHtml()}
            ${!isVoid && !invoice && p.receipt_no ? '<button class="btn btn-sm btn-outline-danger" id="pay-void"><i class="bx bx-block me-1"></i>Void</button>' : ''}
          </div>
        </div>
        ${waiting ? `<div class="card-body py-2 small text-muted"><span class="spinner-border spinner-border-sm me-1"></span>${waiting}</div>` : ''}
      </div>
      <div id="doc-preview"></div>`;

    Docs.preview(el.querySelector('#doc-preview'), Docs.receipt(p));
    Docs.wireActions(el, () => Docs.receipt(Store.get('Payments', id)), () => !!(Store.get('Payments', id) || {}).receipt_no);
    const voidBtn = el.querySelector('#pay-void');
    if (voidBtn) voidBtn.addEventListener('click', async () => {
      const ok = await UI.confirm({
        title: 'Void this payment?',
        message: `${U.inr(p.amount)} will no longer count towards order ${info.orderNo}. The receipt stays on record marked VOID.`,
        confirmText: 'Void payment'
      });
      if (!ok) return;
      await Store.save('Payments', { id, status: 'Void' });
      UI.toast('Payment voided', 'warning');
    });
  }

  return {
    title: 'Payments',
    refreshOn: params => params[0] === 'new' ? null : ['Payments', 'Orders', 'Customers', 'Invoices'],

    render(el, params) {
      const [a, b] = params;
      if (!a) return renderList(el);
      if (a === 'new') return renderForm(el, b);
      return renderReceipt(el, a);
    },

    update(el, params) {
      if (!params[0]) updateList(el);
      else this.render(el, params);
    }
  };
})();
