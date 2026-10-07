/**
 * #/invoices                 list (order + custom invoices)
 * #/invoices/new             custom invoice for a walk-in buyer
 * #/invoices/:id             invoice (view, PDF, WhatsApp, void)
 * #/invoices/proforma/:orderId   proforma invoice for an order (not saved)
 */
Views.invoices = (() => {
  const PAGE = 100;
  let filter = 'All';
  let query = '';
  let shown = PAGE;

  const invNo = i => i.invoice_no ? U.esc(i.invoice_no) : '<span class="text-muted fst-italic">Assigning…</span>';
  const statusBadge = i => i.status === 'Void'
    ? '<span class="badge bg-label-danger">Void</span>'
    : '<span class="badge bg-label-success">Paid</span>';

  /** Issues the final invoice for a fully paid order, copying its items as they are now. */
  async function createForOrder(order) {
    const c = Store.get('Customers', order.customer_id) || {};
    const items = Store.list('OrderItems').filter(i => i.order_id === order.id)
      .sort((a, b) => (Number(a.sort) || 0) - (Number(b.sort) || 0));
    const id = U.uuid();
    await Store.saveMany([
      ['Invoices', {
        id, type: 'Order', order_id: order.id, date: U.today(), total: U.round2(order.total), status: 'Issued',
        buyer_name: c.company_name || c.name || '', buyer_contact: c.contact_no || '', buyer_address: c.location || ''
      }],
      ...items.map((it, i) => ['InvoiceItems', { invoice_id: id, item_name: it.item_name, qty: it.qty, rate: it.rate, amount: it.amount, sort: i }])
    ]);
    return id;
  }

  /** True when the order's items or total no longer match what the invoice captured. */
  function changedSince(inv, order) {
    if (U.round2(inv.total) !== U.round2(order.total)) return true;
    const sig = list => list.map(i => `${String(i.item_name).trim().toLowerCase()}|${U.round2(i.qty)}|${U.round2(i.rate)}`).sort().join(';');
    const invItems = Store.list('InvoiceItems').filter(i => i.invoice_id === inv.id);
    if (!invItems.length) return false;
    return sig(invItems) !== sig(Store.list('OrderItems').filter(i => i.order_id === order.id));
  }

  // ───── List ─────

  function renderList(el) {
    const tabs = ['All', 'Order', 'Custom', 'Void'];
    el.innerHTML = `
      <div class="d-flex flex-wrap gap-2 align-items-center mb-3">
        <div class="input-group input-group-merge flex-grow-1 list-search">
          <span class="input-group-text"><i class="bx bx-search"></i></span>
          <input type="search" class="form-control" id="inv-search" placeholder="Search invoice no., buyer or number" value="${U.esc(query)}">
        </div>
        <a href="#/invoices/new" class="btn btn-primary"><i class="bx bx-plus me-1"></i>Custom invoice</a>
      </div>
      <div class="filter-pills mb-3" id="inv-filters">
        ${tabs.map(t => `<button type="button" class="btn btn-sm ${t === filter ? 'btn-primary' : 'btn-outline-secondary'}" data-filter="${t}">${t === 'Order' ? 'Order invoices' : t === 'Custom' ? 'Custom' : t}</button>`).join('')}
      </div>
      <div id="inv-results"></div>`;
    const input = el.querySelector('#inv-search');
    input.addEventListener('input', U.debounce(() => { query = input.value; shown = PAGE; updateList(el); }, 120));
    el.querySelector('#inv-filters').addEventListener('click', e => {
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
    const box = el.querySelector('#inv-results');
    if (!box) return;
    const q = query.trim().toLowerCase();
    let list = Store.list('Invoices').filter(i => {
      if (filter === 'Void' ? i.status !== 'Void' : filter !== 'All' && i.type !== filter) return false;
      if (!q) return true;
      return [i.invoice_no, i.buyer_name, i.buyer_contact].some(v => String(v || '').toLowerCase().includes(q));
    });
    list.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.created_at).localeCompare(String(a.created_at)));
    const total = list.length;
    list = list.slice(0, shown);

    if (!total) {
      box.innerHTML = `<div class="card"><div class="card-body text-center text-muted py-5">
        <i class="bx bx-receipt display-6 d-block mb-2"></i>${q || filter !== 'All' ? 'No invoices match.' : 'No invoices yet. Final invoices are issued from a fully paid order.'}</div></div>`;
      return;
    }
    const amtCls = i => i.status === 'Void' ? 'text-decoration-line-through text-muted' : '';
    box.innerHTML = `
      <div class="card d-none d-md-block">
        <div class="table-responsive">
          <table class="table table-hover mb-0">
            <thead><tr><th>Invoice</th><th>Date</th><th>Buyer</th><th>Type</th><th>Status</th><th class="text-end">Total</th></tr></thead>
            <tbody>${list.map(i => `
              <tr class="row-link" data-href="#/invoices/${encodeURIComponent(i.id)}">
                <td class="fw-semibold">${invNo(i)}</td>
                <td>${U.fmtDate(i.date)}</td>
                <td>${U.esc(i.buyer_name)}</td>
                <td>${i.type === 'Custom' ? 'Custom' : 'Order'}</td>
                <td>${statusBadge(i)}</td>
                <td class="text-end fw-semibold ${amtCls(i)}">${U.inr(i.total)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <div class="card d-md-none"><div class="list-group list-group-flush">${list.map(i => `
        <a href="#/invoices/${encodeURIComponent(i.id)}" class="list-group-item list-group-item-action d-flex justify-content-between gap-2">
          <div class="min-w-0">
            <div class="fw-semibold text-truncate">${U.esc(i.buyer_name)}</div>
            <small class="text-muted">${invNo(i)} · ${U.fmtDate(i.date)} · ${i.type === 'Custom' ? 'Custom' : 'Order'}</small>
            <div class="mt-1">${statusBadge(i)}</div>
          </div>
          <div class="fw-semibold flex-shrink-0 ${amtCls(i)}">${U.inr(i.total)}</div>
        </a>`).join('')}</div></div>
      ${total > shown ? `<div class="text-center mt-3"><button class="btn btn-outline-secondary" id="inv-more">Show more (${total - shown} left)</button></div>` : ''}
      <p class="text-muted small text-center mt-3 mb-0">${total} invoice${total === 1 ? '' : 's'}</p>`;
    box.querySelectorAll('.row-link').forEach(tr => tr.addEventListener('click', () => { location.hash = tr.dataset.href; }));
    const more = box.querySelector('#inv-more');
    if (more) more.addEventListener('click', () => { shown += PAGE; updateList(el); });
  }

  // ───── Custom invoice form ─────

  function renderForm(el) {
    el.innerHTML = `
      <form class="card form-card" id="inv-form" novalidate>
        <div class="card-header d-flex align-items-center gap-2">
          <a href="#/invoices" class="btn btn-icon btn-sm btn-text-secondary" aria-label="Back"><i class="bx bx-arrow-back"></i></a>
          <h5 class="mb-0">Custom invoice</h5>
        </div>
        <div class="card-body">
          <p class="text-muted small">For walk-in buyers — no saved customer needed. Treated as paid in full.</p>
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label" for="f-buyer">Buyer name *</label>
              <input class="form-control" id="f-buyer" name="buyer_name" required maxlength="80">
              <div class="invalid-feedback">Enter the buyer's name.</div>
            </div>
            <div class="col-md-6">
              <label class="form-label" for="f-contact">Contact number <span class="text-muted">(optional)</span></label>
              <input class="form-control" id="f-contact" name="buyer_contact" inputmode="numeric" maxlength="10" pattern="\\d{10}">
              <div class="invalid-feedback">Enter 10 digits, or leave it empty.</div>
            </div>
            <div class="col-md-8">
              <label class="form-label" for="f-address">Address <span class="text-muted">(optional)</span></label>
              <input class="form-control" id="f-address" name="buyer_address" maxlength="120">
            </div>
            <div class="col-md-4">
              <label class="form-label">Invoice date</label>
              <input class="form-control" value="${U.fmtDate(U.today())}" disabled>
            </div>
          </div>
          <h6 class="mt-4 mb-2">Items</h6>
          <div id="items-editor"></div>
          <div class="row mt-2"><div class="col-md-6 ms-auto">
            <div class="grand-total"><span>Grand total</span><strong id="grand-total">₹0</strong></div>
          </div></div>
          <div class="alert alert-danger mt-3 mb-0 d-none" id="inv-error"></div>
        </div>
        <div class="card-footer sticky-save d-flex gap-2 justify-content-end">
          <a href="#/invoices" class="btn btn-outline-secondary">Cancel</a>
          <button type="submit" class="btn btn-primary flex-grow-1 flex-md-grow-0"><i class="bx bx-receipt me-1"></i>Issue invoice</button>
        </div>
      </form>`;
    const form = el.querySelector('#inv-form');
    const editor = ItemsEditor.mount(form.querySelector('#items-editor'), {
      onChange: total => { form.querySelector('#grand-total').textContent = U.inr(total); }
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const errBox = form.querySelector('#inv-error');
      errBox.classList.add('d-none');
      if (!form.checkValidity()) { form.classList.add('was-validated'); return; }
      const err = editor.validate() || (editor.total() > 0 ? '' : 'The invoice total must be more than ₹0.');
      if (err) { errBox.textContent = err; errBox.classList.remove('d-none'); return; }
      const ok = await UI.confirm({
        title: 'Issue this invoice?',
        message: `${U.inr(editor.total())} for ${form.elements.buyer_name.value.trim()}. Invoices can't be edited afterwards, only voided.`,
        confirmText: 'Issue invoice', danger: false
      });
      if (!ok) return;
      const id = U.uuid();
      await Store.saveMany([
        ['Invoices', {
          id, type: 'Custom', order_id: '', date: U.today(), total: editor.total(), status: 'Issued',
          buyer_name: form.elements.buyer_name.value.trim(),
          buyer_contact: form.elements.buyer_contact.value.trim(),
          buyer_address: form.elements.buyer_address.value.trim()
        }],
        ...editor.getItems().map((it, i) => ['InvoiceItems', { invoice_id: id, item_name: it.item_name, qty: it.qty, rate: it.rate, amount: it.amount, sort: i }])
      ]);
      UI.toast('Invoice issued');
      location.hash = `#/invoices/${encodeURIComponent(id)}`;
    });
    form.querySelector('#f-buyer').focus();
  }

  // ───── Invoice view ─────

  function renderInvoice(el, id) {
    const inv = Store.get('Invoices', id);
    if (!inv || inv.is_deleted) { Views.notfound.render(el); return; }
    const order = inv.type === 'Order' ? Store.get('Orders', inv.order_id) : null;
    const isVoid = inv.status === 'Void';
    const waiting = !inv.invoice_no ? 'Waiting for the invoice number from the server…' : '';
    const changed = !isVoid && order && changedSince(inv, order);

    el.innerHTML = `
      ${changed ? `<div class="alert alert-warning d-flex gap-2"><i class="bx bx-error fs-5"></i>
        <div>Order ${U.esc(order.order_no)} was changed after this invoice was issued. If the invoice should match, void it and issue a new one from the order.</div></div>` : ''}
      <div class="card mb-3">
        <div class="card-header d-flex align-items-center gap-2 flex-wrap">
          <a href="${order ? `#/orders/${encodeURIComponent(order.id)}` : '#/invoices'}" class="btn btn-icon btn-sm btn-text-secondary" aria-label="Back"><i class="bx bx-arrow-back"></i></a>
          <div class="me-auto min-w-0">
            <h5 class="mb-0">Invoice ${invNo(inv)} ${isVoid ? '<span class="badge bg-danger ms-1">Void</span>' : ''}</h5>
            <small class="text-muted">${U.esc(inv.buyer_name)} · ${U.inr(inv.total)} · ${U.fmtDate(inv.date)} · ${inv.type === 'Custom' ? 'Custom' : `Order ${U.esc(order ? order.order_no : '')}`}</small>
          </div>
          <div class="d-flex gap-2 flex-wrap">
            ${Docs.actionsHtml(waiting)}
            ${!isVoid && inv.invoice_no ? '<button class="btn btn-sm btn-outline-danger" id="inv-void"><i class="bx bx-block me-1"></i>Void</button>' : ''}
          </div>
        </div>
        ${waiting ? `<div class="card-body py-2 small text-muted"><span class="spinner-border spinner-border-sm me-1"></span>${waiting}</div>` : ''}
        ${isVoid && inv.void_reason ? `<div class="card-body py-2 small text-danger">Voided: ${U.esc(inv.void_reason)}</div>` : ''}
      </div>
      <div id="doc-preview"></div>`;

    Docs.preview(el.querySelector('#doc-preview'), Docs.invoice(inv));
    Docs.wireActions(el, () => Docs.invoice(Store.get('Invoices', id)));
    const voidBtn = el.querySelector('#inv-void');
    if (voidBtn) voidBtn.addEventListener('click', () => askVoid(inv));
  }

  function askVoid(inv) {
    const el = U.el(`
      <div class="modal fade" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered">
          <form class="modal-content" novalidate>
            <div class="modal-header"><h5 class="modal-title">Void invoice ${U.esc(inv.invoice_no)}?</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
            <div class="modal-body">
              <p class="small text-muted">The number stays on record marked VOID. ${inv.type === 'Order' ? 'You can then issue a new invoice from the order.' : ''}</p>
              <label class="form-label" for="void-reason">Reason *</label>
              <input class="form-control" id="void-reason" required maxlength="120" placeholder="e.g. Wrong item quantity">
              <div class="invalid-feedback">Give a reason.</div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="submit" class="btn btn-danger">Void invoice</button>
            </div>
          </form>
        </div>
      </div>`);
    document.body.appendChild(el);
    const modal = new bootstrap.Modal(el);
    const form = el.querySelector('form');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const reason = form.querySelector('#void-reason').value.trim();
      if (!reason) { form.classList.add('was-validated'); return; }
      modal.hide();
      await Store.save('Invoices', { id: inv.id, status: 'Void', void_reason: reason });
      UI.toast('Invoice voided', 'warning');
    });
    el.addEventListener('shown.bs.modal', () => form.querySelector('#void-reason').focus());
    el.addEventListener('hidden.bs.modal', () => el.remove());
    modal.show();
  }

  // ───── Proforma ─────

  function renderProforma(el, orderId) {
    const o = Store.get('Orders', orderId);
    if (!o || o.is_deleted) { Views.notfound.render(el); return; }
    el.innerHTML = `
      <div class="card mb-3">
        <div class="card-header d-flex align-items-center gap-2 flex-wrap">
          <a href="#/orders/${encodeURIComponent(orderId)}" class="btn btn-icon btn-sm btn-text-secondary" aria-label="Back"><i class="bx bx-arrow-back"></i></a>
          <div class="me-auto min-w-0">
            <h5 class="mb-0">Proforma invoice</h5>
            <small class="text-muted">Order ${U.esc(o.order_no || '')} · not numbered or saved — reflects the order as it is now</small>
          </div>
          <div class="d-flex gap-2">${Docs.actionsHtml(o.order_no ? '' : 'Waiting for the order number…')}</div>
        </div>
      </div>
      <div id="doc-preview"></div>`;
    Docs.preview(el.querySelector('#doc-preview'), Docs.proforma(o));
    Docs.wireActions(el, () => Docs.proforma(Store.get('Orders', orderId)));
  }

  return {
    title: 'Invoices',
    createForOrder,
    changedSince,
    refreshOn: params => params[0] === 'new' ? null : ['Invoices', 'InvoiceItems', 'Orders', 'OrderItems', 'Payments', 'Customers', 'Settings'],

    render(el, params) {
      const [a, b] = params;
      if (!a) return renderList(el);
      if (a === 'new') return renderForm(el);
      if (a === 'proforma') return renderProforma(el, b);
      return renderInvoice(el, a);
    },

    update(el, params) {
      if (!params[0]) updateList(el);
      else this.render(el, params);
    }
  };
})();
