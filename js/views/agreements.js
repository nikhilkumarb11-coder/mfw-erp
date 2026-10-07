/**
 * #/agreements                list
 * #/agreements/new            new agreement (#/agreements/new/:orderId to preselect)
 * #/agreements/:id            view (PDF, WhatsApp)
 * #/agreements/:id/edit       edit
 */
Views.agreements = (() => {
  const PAGE = 100;
  let query = '';
  let shown = PAGE;

  const agrNo = a => a.agreement_no ? U.esc(a.agreement_no) : '<span class="text-muted fst-italic">Saving…</span>';

  /** The order's latest agreement, if any. */
  function forOrder(orderId) {
    return Store.list('Agreements').filter(a => a.order_id === orderId)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] || null;
  }

  // ───── List ─────

  function renderList(el) {
    el.innerHTML = `
      <div class="d-flex flex-wrap gap-2 align-items-center mb-3">
        <div class="input-group input-group-merge flex-grow-1 list-search">
          <span class="input-group-text"><i class="bx bx-search"></i></span>
          <input type="search" class="form-control" id="agr-search" placeholder="Search customer, venue or number" value="${U.esc(query)}">
        </div>
        <a href="#/agreements/new" class="btn btn-primary"><i class="bx bx-plus me-1"></i>New agreement</a>
      </div>
      <div id="agr-results"></div>`;
    const input = el.querySelector('#agr-search');
    input.addEventListener('input', U.debounce(() => { query = input.value; shown = PAGE; updateList(el); }, 120));
    updateList(el);
  }

  function updateList(el) {
    const box = el.querySelector('#agr-results');
    if (!box) return;
    const q = query.trim().toLowerCase();
    let list = Store.list('Agreements').map(a => ({ a, o: Store.get('Orders', a.order_id) })).filter(({ a, o }) => {
      if (!q) return true;
      return [a.agreement_no, a.party_name, a.party_contact, a.venue, o && o.order_no].some(v => String(v || '').toLowerCase().includes(q));
    });
    list.sort((x, y) => String(y.a.date).localeCompare(String(x.a.date)) || String(y.a.created_at).localeCompare(String(x.a.created_at)));
    const total = list.length;
    list = list.slice(0, shown);

    if (!total) {
      box.innerHTML = `<div class="card"><div class="card-body text-center text-muted py-5">
        <i class="bx bx-pen display-6 d-block mb-2"></i>${q ? 'No agreements match.' : 'No agreements yet. Create one from an order.'}</div></div>`;
      return;
    }
    box.innerHTML = `
      <div class="card d-none d-md-block">
        <div class="table-responsive">
          <table class="table table-hover mb-0">
            <thead><tr><th>Agreement</th><th>Date</th><th>Customer</th><th>Order</th><th>Venue</th><th>Event date</th><th class="text-end">Total</th></tr></thead>
            <tbody>${list.map(({ a, o }) => `
              <tr class="row-link" data-href="#/agreements/${encodeURIComponent(a.id)}">
                <td class="fw-semibold">${agrNo(a)}</td>
                <td>${U.fmtDate(a.date)}</td>
                <td>${U.esc(a.party_name)}</td>
                <td>${U.esc(o ? o.order_no : '')}</td>
                <td>${U.esc(a.venue)}</td>
                <td>${U.fmtDate(a.event_date)}</td>
                <td class="text-end fw-semibold">${U.inr(o ? o.total : a.total)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <div class="card d-md-none"><div class="list-group list-group-flush">${list.map(({ a, o }) => `
        <a href="#/agreements/${encodeURIComponent(a.id)}" class="list-group-item list-group-item-action d-flex justify-content-between gap-2">
          <div class="min-w-0">
            <div class="fw-semibold text-truncate">${U.esc(a.party_name)}</div>
            <small class="text-muted">${agrNo(a)} · ${U.esc(a.venue || '')} ${a.event_date ? '· ' + U.fmtDate(a.event_date) : ''}</small>
          </div>
          <div class="fw-semibold flex-shrink-0">${U.inr(o ? o.total : a.total)}</div>
        </a>`).join('')}</div></div>
      ${total > shown ? `<div class="text-center mt-3"><button class="btn btn-outline-secondary" id="agr-more">Show more (${total - shown} left)</button></div>` : ''}
      <p class="text-muted small text-center mt-3 mb-0">${total} agreement${total === 1 ? '' : 's'}</p>`;
    box.querySelectorAll('.row-link').forEach(tr => tr.addEventListener('click', () => { location.hash = tr.dataset.href; }));
    const more = box.querySelector('#agr-more');
    if (more) more.addEventListener('click', () => { shown += PAGE; updateList(el); });
  }

  // ───── Form ─────

  function renderForm(el, id, presetOrderId) {
    const a = id ? Store.get('Agreements', id) : null;
    if (id && (!a || a.is_deleted)) { Views.notfound.render(el); return; }
    let orderId = a ? a.order_id : (presetOrderId && Store.get('Orders', presetOrderId) ? presetOrderId : '');
    const back = a ? `#/agreements/${encodeURIComponent(a.id)}` : (presetOrderId ? `#/orders/${encodeURIComponent(presetOrderId)}` : '#/agreements');

    // Master terms plus any saved terms no longer in the master list (edit keeps them selectable).
    const master = Docs.agreementTerms().map(t => ({ title: t.title || '', text: t.term_text || '', checked: t.default_checked !== false && t.default_checked !== 'FALSE' }));
    let terms = master;
    if (a) {
      const saved = Docs.parseTerms(a.terms_text);
      const key = t => `${t.title}|${t.text}`;
      const savedKeys = new Set(saved.map(key));
      terms = master.map(t => ({ ...t, checked: savedKeys.has(key(t)) }));
      saved.forEach(t => { if (!terms.some(m => key(m) === key(t))) terms.push({ ...t, checked: true }); });
    }

    el.innerHTML = `
      <form class="card form-card" id="agr-form" novalidate>
        <div class="card-header d-flex align-items-center gap-2">
          <a href="${back}" class="btn btn-icon btn-sm btn-text-secondary" aria-label="Back"><i class="bx bx-arrow-back"></i></a>
          <h5 class="mb-0">${a ? `Edit agreement ${a.agreement_no ? U.esc(a.agreement_no) : ''}` : 'New agreement'}</h5>
        </div>
        <div class="card-body">
          <div class="row g-3">
            <div class="col-12">
              <label class="form-label" for="f-order">Order *</label>
              <div id="order-picked" class="customer-chip d-none"></div>
              <div id="order-search-box">
                <input class="form-control" id="f-order" placeholder="Type customer name, number or order no.">
                <div class="invalid-feedback d-block d-none" id="order-error">Choose an order.</div>
              </div>
            </div>
            <div class="col-md-4">
              <label class="form-label" for="f-party">Customer name on agreement *</label>
              <input class="form-control" id="f-party" name="party_name" required maxlength="80" value="${U.esc(a ? a.party_name : '')}">
              <div class="invalid-feedback">Enter the name.</div>
            </div>
            <div class="col-md-4">
              <label class="form-label" for="f-pcontact">Contact number</label>
              <input class="form-control" id="f-pcontact" name="party_contact" inputmode="numeric" maxlength="10" value="${U.esc(a ? a.party_contact : '')}">
            </div>
            <div class="col-md-4">
              <label class="form-label" for="f-paddress">Customer address</label>
              <input class="form-control" id="f-paddress" name="party_address" maxlength="120" value="${U.esc(a ? a.party_address : '')}">
            </div>
            <div class="col-md-4">
              <label class="form-label" for="f-venue">Event venue *</label>
              <input class="form-control" id="f-venue" name="venue" required maxlength="80" placeholder="e.g. Kadapa" value="${U.esc(a ? a.venue : '')}">
              <div class="invalid-feedback">Enter the venue.</div>
            </div>
            <div class="col-6 col-md-4">
              <label class="form-label" for="f-event">Event date *</label>
              <input type="date" class="form-control" id="f-event" name="event_date" required value="${U.esc(a ? a.event_date : '')}">
              <div class="invalid-feedback">Choose the event date.</div>
            </div>
            <div class="col-6 col-md-4">
              <label class="form-label" for="f-date">Agreement date</label>
              <input type="date" class="form-control" id="f-date" name="date" required value="${U.esc(a ? a.date : U.today())}">
            </div>
            <div class="col-12">
              <label class="form-label" for="f-remarks">Remarks <span class="text-muted">(optional)</span></label>
              <input class="form-control" id="f-remarks" name="remarks" maxlength="160" placeholder="e.g. No Road Show" value="${U.esc(a ? a.remarks : '')}">
            </div>
          </div>

          <h6 class="mt-4 mb-1">Terms to include</h6>
          <p class="small text-muted mb-2">Manage the list in Settings → Agreement terms.</p>
          <div class="terms-pick" id="terms-pick">
            ${terms.map((t, i) => `
              <label class="terms-pick-item">
                <input class="form-check-input mt-1" type="checkbox" data-term="${i}" ${t.checked ? 'checked' : ''}>
                <span><b>${U.esc(t.title)}</b>${t.title && t.text ? '<br>' : ''}<span class="text-muted small">${U.esc(t.text)}</span></span>
              </label>`).join('') || '<p class="text-muted small">No terms yet.</p>'}
          </div>
          <p class="small text-muted mt-3 mb-0"><i class="bx bx-info-circle me-1"></i>The agreement lists the order's items with quantities and the order total — no item rates.</p>
          <div class="alert alert-danger mt-3 mb-0 d-none" id="agr-error"></div>
        </div>
        <div class="card-footer sticky-save d-flex gap-2 justify-content-end">
          <a href="${back}" class="btn btn-outline-secondary">Cancel</a>
          <button type="submit" class="btn btn-primary flex-grow-1 flex-md-grow-0"><i class="bx bx-save me-1"></i>Save agreement</button>
        </div>
      </form>`;

    const form = el.querySelector('#agr-form');
    const picked = form.querySelector('#order-picked');
    const searchBox = form.querySelector('#order-search-box');
    const orderInput = form.querySelector('#f-order');

    function prefill(o) {
      const c = Store.get('Customers', o.customer_id) || {};
      const set = (name, v) => { if (!form.elements[name].value) form.elements[name].value = v || ''; };
      set('party_name', c.company_name || c.name);
      set('party_contact', c.contact_no);
      set('party_address', c.location);
      set('event_date', o.delivery_date);
    }

    function showOrder() {
      const o = orderId ? Store.get('Orders', orderId) : null;
      picked.classList.toggle('d-none', !o);
      searchBox.classList.toggle('d-none', !!o);
      if (!o) return;
      const c = Store.get('Customers', o.customer_id);
      picked.innerHTML = `
        <div class="min-w-0"><div class="fw-semibold text-truncate">${U.esc(c ? c.name : 'Unknown')} · ${U.esc(o.order_no || 'New order')}</div>
          <small class="text-muted">Total ${U.inr(o.total)} · Delivery ${U.fmtDate(o.delivery_date)}</small></div>
        ${a || presetOrderId ? '' : '<button type="button" class="btn btn-sm btn-text-secondary" id="order-change">Change</button>'}`;
      const change = picked.querySelector('#order-change');
      if (change) change.addEventListener('click', () => { orderId = ''; showOrder(); orderInput.value = ''; orderInput.focus(); });
      form.querySelector('#order-error').classList.add('d-none');
    }

    Typeahead.attach(orderInput, {
      limit: 10,
      source: q => {
        const n = q.toLowerCase();
        return Store.list('Orders').filter(o => o.status !== 'Cancelled').map(o => ({ o, c: Store.get('Customers', o.customer_id) }))
          .filter(({ o, c }) => !n || [c && c.name, c && c.contact_no, c && c.company_name, o.order_no].some(v => String(v || '').toLowerCase().includes(n)))
          .sort((x, y) => String(x.o.delivery_date).localeCompare(String(y.o.delivery_date)))
          .map(({ o, c }) => ({ label: `${c ? c.name : 'Unknown'} · ${o.order_no || 'New order'}`, sub: `Total ${U.inr(o.total)} · Delivery ${U.fmtDate(o.delivery_date)}`, value: o.id }));
      },
      onPick: it => { orderId = it.value; showOrder(); prefill(Store.get('Orders', orderId)); }
    });
    showOrder();
    if (!a && orderId) prefill(Store.get('Orders', orderId));

    form.addEventListener('submit', async e => {
      e.preventDefault();
      form.querySelector('#order-error').classList.toggle('d-none', !!orderId);
      if (!form.checkValidity() || !orderId) { form.classList.add('was-validated'); return; }
      const selected = terms.filter((t, i) => form.querySelector(`[data-term="${i}"]`).checked).map(({ title, text }) => ({ title, text }));
      const order = Store.get('Orders', orderId);
      const aid = a ? a.id : U.uuid();
      await Store.save('Agreements', {
        id: aid, order_id: orderId, total: U.round2(order ? order.total : 0),
        date: form.elements.date.value, venue: form.elements.venue.value.trim(), event_date: form.elements.event_date.value,
        remarks: form.elements.remarks.value.trim(), party_name: form.elements.party_name.value.trim(),
        party_contact: form.elements.party_contact.value.trim(), party_address: form.elements.party_address.value.trim(),
        terms_text: JSON.stringify(selected)
      });
      UI.toast(a ? 'Agreement updated' : 'Agreement saved');
      location.hash = `#/agreements/${encodeURIComponent(aid)}`;
    });
    if (!orderId) orderInput.focus();
  }

  // ───── View ─────

  function renderView(el, id) {
    const a = Store.get('Agreements', id);
    if (!a || a.is_deleted) { Views.notfound.render(el); return; }
    const o = Store.get('Orders', a.order_id);
    const waiting = !a.agreement_no ? 'Waiting for the agreement number from the server…' : '';
    const changed = o && a.total !== '' && U.round2(a.total) !== U.round2(o.total);

    el.innerHTML = `
      ${changed ? `<div class="alert alert-warning d-flex gap-2"><i class="bx bx-error fs-5"></i>
        <div>The order total changed from ${U.inr(a.total)} to ${U.inr(o.total)} after this agreement was saved. The document below shows the current order — share it again if the customer needs the update.</div></div>` : ''}
      ${o && o.status === 'Cancelled' ? '<div class="alert alert-dark">The order for this agreement is cancelled.</div>' : ''}
      <div class="card mb-3">
        <div class="card-header d-flex align-items-center gap-2 flex-wrap">
          <a href="${o ? `#/orders/${encodeURIComponent(o.id)}` : '#/agreements'}" class="btn btn-icon btn-sm btn-text-secondary" aria-label="Back"><i class="bx bx-arrow-back"></i></a>
          <div class="me-auto min-w-0">
            <h5 class="mb-0">Agreement ${agrNo(a)}</h5>
            <small class="text-muted">${U.esc(a.party_name)} · ${U.esc(a.venue || '')} ${a.event_date ? '· ' + U.fmtDate(a.event_date) : ''} · Order ${U.esc(o ? o.order_no : '')}</small>
          </div>
          <div class="d-flex gap-2 flex-wrap">
            ${Docs.actionsHtml(waiting)}
            <a href="#/agreements/${encodeURIComponent(id)}/edit" class="btn btn-sm btn-outline-primary"><i class="bx bx-edit-alt me-1"></i>Edit</a>
            <button class="btn btn-sm btn-outline-danger" id="agr-delete" aria-label="Delete"><i class="bx bx-trash"></i></button>
          </div>
        </div>
        ${waiting ? `<div class="card-body py-2 small text-muted"><span class="spinner-border spinner-border-sm me-1"></span>${waiting}</div>` : ''}
      </div>
      <div id="doc-preview"></div>`;

    Docs.preview(el.querySelector('#doc-preview'), Docs.agreement(a));
    Docs.wireActions(el, () => Docs.agreement(Store.get('Agreements', id)));
    el.querySelector('#agr-delete').addEventListener('click', async () => {
      const ok = await UI.confirm({ title: 'Delete this agreement?', message: 'It will be removed from all lists. The order is not affected.', confirmText: 'Delete' });
      if (!ok) return;
      await Store.remove('Agreements', id);
      UI.toast('Agreement deleted');
      location.hash = o ? `#/orders/${encodeURIComponent(o.id)}` : '#/agreements';
    });
  }

  return {
    title: 'Agreements',
    forOrder,
    refreshOn: params => (params[0] === 'new' || params[1] === 'edit') ? null : ['Agreements', 'Orders', 'OrderItems', 'Customers', 'Settings'],

    render(el, params) {
      const [a, b] = params;
      if (!a) return renderList(el);
      if (a === 'new') return renderForm(el, null, b);
      if (b === 'edit') return renderForm(el, a);
      return renderView(el, a);
    },

    update(el, params) {
      if (!params[0]) updateList(el);
      else this.render(el, params);
    }
  };
})();
