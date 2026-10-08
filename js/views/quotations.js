/**
 * #/quotations                list (Open / Converted / All + search)
 * #/quotations/new            new quotation (#/quotations/new/:customerId to preselect)
 * #/quotations/:id            view (PDF, WhatsApp, convert)
 * #/quotations/:id/edit       edit (open quotations only)
 * #/quotations/:id/convert    convert to an order
 */
Views.quotations = (() => {
  const PAGE = 100;
  let filter = 'Open';
  let query = '';
  let shown = PAGE;

  const quoteNo = q => q.quote_no ? U.esc(q.quote_no) : '<span class="text-muted fst-italic">Saving…</span>';
  const statusBadge = q => q.status === 'Converted'
    ? '<span class="badge bg-label-success">Converted</span>'
    : '<span class="badge bg-label-info">Open</span>';

  function partyOf(q) {
    const c = q.customer_id ? Store.get('Customers', q.customer_id) : null;
    return c
      ? { name: c.name, contact: c.contact_no, sub: c.company_name || c.location, customer: c }
      : { name: q.prospect_name || 'Prospect', contact: q.prospect_contact, sub: 'Prospect', customer: null };
  }

  function itemsOf(id) {
    return Store.list('QuotationItems').filter(i => i.quotation_id === id)
      .sort((a, b) => (Number(a.sort) || 0) - (Number(b.sort) || 0));
  }

  function customerSource(q) {
    const n = q.toLowerCase();
    return Store.list('Customers')
      .filter(c => [c.name, c.contact_no, c.company_name, c.location].some(v => String(v || '').toLowerCase().includes(n)))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)))
      .map(c => ({ label: c.name, sub: `${c.contact_no} · ${c.location}${c.company_name ? ' · ' + c.company_name : ''}`, value: c.id }));
  }

  // ───── List ─────

  function renderList(el) {
    const tabs = ['Open', 'Converted', 'All'];
    el.innerHTML = `
      <div class="d-flex flex-wrap gap-2 align-items-center mb-3">
        <div class="input-group input-group-merge flex-grow-1 list-search">
          <span class="input-group-text"><i class="bx bx-search"></i></span>
          <input type="search" class="form-control" id="quote-search" placeholder="Search name, number or quote no." value="${U.esc(query)}">
        </div>
        <a href="#/quotations/new" class="btn btn-primary"><i class="bx bx-plus me-1"></i>New quotation</a>
      </div>
      <div class="filter-pills mb-3" id="quote-filters">
        ${tabs.map(t => `<button type="button" class="btn btn-sm ${t === filter ? 'btn-primary' : 'btn-outline-secondary'}" data-filter="${t}">${t}</button>`).join('')}
      </div>
      <div id="quote-results"></div>`;
    const input = el.querySelector('#quote-search');
    input.addEventListener('input', U.debounce(() => { query = input.value; shown = PAGE; updateList(el); }, 120));
    el.querySelector('#quote-filters').addEventListener('click', e => {
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
    const box = el.querySelector('#quote-results');
    if (!box) return;
    const q = query.trim().toLowerCase();
    let list = Store.list('Quotations').map(x => ({ x, p: partyOf(x) })).filter(({ x, p }) => {
      if (filter !== 'All' && (x.status || 'Open') !== filter) return false;
      if (!q) return true;
      return [p.name, p.contact, p.sub, x.quote_no].some(v => String(v || '').toLowerCase().includes(q));
    });
    list.sort((a, b) => String(b.x.date).localeCompare(String(a.x.date)) || String(b.x.created_at).localeCompare(String(a.x.created_at)));
    const total = list.length;
    list = list.slice(0, shown);

    if (!total) {
      box.innerHTML = `<div class="card"><div class="card-body text-center text-muted py-5">
        <i class="bx bx-file display-6 d-block mb-2"></i>${q || filter !== 'All' ? 'No quotations match.' : 'No quotations yet.'}</div></div>`;
      return;
    }
    box.innerHTML = `
      <div class="card d-none d-md-block">
        <div class="table-responsive">
          <table class="table table-hover mb-0">
            <thead><tr><th>Quote</th><th>Date</th><th>For</th><th>Contact</th><th>Status</th><th class="text-end">Total</th></tr></thead>
            <tbody>${list.map(({ x, p }) => `
              <tr class="row-link" data-href="#/quotations/${encodeURIComponent(x.id)}">
                <td class="fw-semibold">${quoteNo(x)}</td>
                <td>${U.fmtDate(x.date)}</td>
                <td>${U.esc(p.name)} <small class="text-muted d-block">${U.esc(p.sub || '')}</small></td>
                <td>${U.esc(p.contact || '')}</td>
                <td>${statusBadge(x)}</td>
                <td class="text-end fw-semibold">${U.inr(x.total)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <div class="card d-md-none"><div class="list-group list-group-flush">${list.map(({ x, p }) => `
        <a href="#/quotations/${encodeURIComponent(x.id)}" class="list-group-item list-group-item-action d-flex justify-content-between gap-2">
          <div class="min-w-0">
            <div class="fw-semibold text-truncate">${U.esc(p.name)}</div>
            <small class="text-muted">${quoteNo(x)} · ${U.fmtDate(x.date)}</small>
            <div class="mt-1">${statusBadge(x)}</div>
          </div>
          <div class="fw-semibold flex-shrink-0">${U.inr(x.total)}</div>
        </a>`).join('')}</div></div>
      ${total > shown ? `<div class="text-center mt-3"><button class="btn btn-outline-secondary" id="quote-more">Show more (${total - shown} left)</button></div>` : ''}
      <p class="text-muted small text-center mt-3 mb-0">${total} quotation${total === 1 ? '' : 's'}</p>`;
    box.querySelectorAll('.row-link').forEach(tr => tr.addEventListener('click', () => { location.hash = tr.dataset.href; }));
    const more = box.querySelector('#quote-more');
    if (more) more.addEventListener('click', () => { shown += PAGE; updateList(el); });
  }

  // ───── Form ─────

  function renderForm(el, id, presetCustomerId) {
    const x = id ? Store.get('Quotations', id) : null;
    if (id && (!x || x.is_deleted)) { Views.notfound.render(el); return; }
    if (x && x.status === 'Converted') { location.hash = `#/quotations/${encodeURIComponent(id)}`; return; }
    let customerId = x ? x.customer_id : (presetCustomerId && Store.get('Customers', presetCustomerId) ? presetCustomerId : '');
    let mode = x && !x.customer_id ? 'prospect' : 'customer';
    const back = x ? `#/quotations/${encodeURIComponent(x.id)}` : '#/quotations';

    el.innerHTML = `
      <form class="card form-card" id="quote-form" novalidate>
        <div class="card-header d-flex align-items-center gap-2">
          <a href="${back}" class="btn btn-icon btn-sm btn-text-secondary" aria-label="Back"><i class="bx bx-arrow-back"></i></a>
          <h5 class="mb-0">${x ? `Edit quotation ${x.quote_no ? U.esc(x.quote_no) : ''}` : 'New quotation'}</h5>
        </div>
        <div class="card-body">
          <div class="btn-group mb-3" role="group" id="quote-mode">
            <button type="button" class="btn btn-sm" data-mode="customer"><i class="bx bx-user me-1"></i>Existing customer</button>
            <button type="button" class="btn btn-sm" data-mode="prospect"><i class="bx bx-user-plus me-1"></i>New prospect</button>
          </div>
          <div class="row g-3">
            <div class="col-12" id="mode-customer">
              <label class="form-label" for="f-customer">Customer *</label>
              <div id="customer-picked" class="customer-chip d-none"></div>
              <div id="customer-search-box">
                <input class="form-control" id="f-customer" placeholder="Type a name, number or company">
                <div class="invalid-feedback d-block d-none" id="customer-error">Choose a customer.</div>
              </div>
            </div>
            <div class="col-md-6" data-prospect>
              <label class="form-label" for="f-pname">Prospect name *</label>
              <input class="form-control" id="f-pname" name="prospect_name" maxlength="80" value="${U.esc(x ? x.prospect_name : '')}">
              <div class="invalid-feedback">Enter the name.</div>
            </div>
            <div class="col-md-6" data-prospect>
              <label class="form-label" for="f-pcontact">Contact number</label>
              <input class="form-control" id="f-pcontact" name="prospect_contact" inputmode="numeric" maxlength="10" pattern="\\d{10}" value="${U.esc(x ? x.prospect_contact : '')}">
              <div class="invalid-feedback">Enter 10 digits, or leave it empty.</div>
            </div>
            <div class="col-6 col-md-4">
              <label class="form-label" for="f-date">Date</label>
              <input type="date" class="form-control" id="f-date" name="date" required value="${U.esc(x ? x.date : U.today())}">
            </div>
          </div>

          <h6 class="mt-4 mb-2">Items <small class="text-muted fw-normal">— rates are kept for the order; the printed quotation shows the total only</small></h6>
          <div id="items-editor"></div>
          <div class="row g-3 mt-2">
            <div class="col-md-6">
              <label class="form-label" for="f-notes">Notes on the quotation <span class="text-muted">(optional)</span></label>
              <textarea class="form-control" id="f-notes" name="notes" rows="2" placeholder="e.g. Valid for 15 days">${U.esc(x ? x.notes : '')}</textarea>
            </div>
            <div class="col-md-6">
              <div class="grand-total"><span>Grand total</span><strong id="grand-total">₹0</strong></div>
            </div>
          </div>
          <div class="alert alert-danger mt-3 mb-0 d-none" id="quote-error"></div>
        </div>
        <div class="card-footer sticky-save d-flex gap-2 justify-content-end">
          <a href="${back}" class="btn btn-outline-secondary">Cancel</a>
          <button type="submit" class="btn btn-primary flex-grow-1 flex-md-grow-0"><i class="bx bx-save me-1"></i>Save quotation</button>
        </div>
      </form>`;

    const form = el.querySelector('#quote-form');
    const picked = form.querySelector('#customer-picked');
    const searchBox = form.querySelector('#customer-search-box');
    const custInput = form.querySelector('#f-customer');

    function applyMode() {
      form.querySelectorAll('[data-mode]').forEach(b => {
        b.classList.toggle('btn-primary', b.dataset.mode === mode);
        b.classList.toggle('btn-outline-secondary', b.dataset.mode !== mode);
      });
      form.querySelector('#mode-customer').classList.toggle('d-none', mode !== 'customer');
      form.querySelectorAll('[data-prospect]').forEach(d => d.classList.toggle('d-none', mode !== 'prospect'));
      form.querySelector('#f-pname').required = mode === 'prospect';
    }
    form.querySelector('#quote-mode').addEventListener('click', e => {
      const b = e.target.closest('[data-mode]');
      if (!b) return;
      mode = b.dataset.mode;
      applyMode();
    });

    function showCustomer() {
      const c = customerId ? Store.get('Customers', customerId) : null;
      picked.classList.toggle('d-none', !c);
      searchBox.classList.toggle('d-none', !!c);
      if (!c) return;
      picked.innerHTML = `
        <div class="min-w-0"><div class="fw-semibold text-truncate">${U.esc(c.name)}</div>
          <small class="text-muted">${U.esc(c.contact_no)} · ${U.esc(c.location)}</small></div>
        <button type="button" class="btn btn-sm btn-text-secondary" id="customer-change">Change</button>`;
      picked.querySelector('#customer-change').addEventListener('click', () => { customerId = ''; showCustomer(); custInput.value = ''; custInput.focus(); });
      form.querySelector('#customer-error').classList.add('d-none');
    }
    Typeahead.attach(custInput, { source: customerSource, onPick: it => { customerId = it.value; showCustomer(); } });
    showCustomer();
    applyMode();

    const editor = ItemsEditor.mount(form.querySelector('#items-editor'), {
      items: x ? itemsOf(x.id) : [],
      onChange: total => { form.querySelector('#grand-total').textContent = U.inr(total); }
    });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const errBox = form.querySelector('#quote-error');
      errBox.classList.add('d-none');
      const needCustomer = mode === 'customer' && !customerId;
      form.querySelector('#customer-error').classList.toggle('d-none', !needCustomer);
      if (!form.checkValidity() || needCustomer) { form.classList.add('was-validated'); return; }
      const itemErr = editor.validate();
      if (itemErr) { errBox.textContent = itemErr; errBox.classList.remove('d-none'); return; }

      const qid = x ? x.id : U.uuid();
      const fields = {
        id: qid,
        customer_id: mode === 'customer' ? customerId : '',
        prospect_name: mode === 'prospect' ? form.elements.prospect_name.value.trim() : '',
        prospect_contact: mode === 'prospect' ? form.elements.prospect_contact.value.trim() : '',
        date: form.elements.date.value,
        total: editor.total(),
        notes: form.elements.notes.value.trim()
      };
      if (!x) Object.assign(fields, { status: 'Open', converted_order_id: '' });
      const entries = [['Quotations', fields]];
      const before = new Map((x ? itemsOf(x.id) : []).map(i => [i.id, i]));
      editor.getItems().forEach((it, i) => {
        const data = { item_name: it.item_name, qty: it.qty, rate: it.rate, amount: it.amount, sort: i };
        const prev = it.id && before.get(it.id);
        if (!prev) { entries.push(['QuotationItems', { quotation_id: qid, ...data }]); return; }
        before.delete(it.id);
        if (Object.keys(data).some(k => String(prev[k]) !== String(data[k]))) entries.push(['QuotationItems', { id: it.id, ...data }]);
      });
      before.forEach(prev => entries.push(['QuotationItems', { id: prev.id, is_deleted: true }]));
      await Store.saveMany(entries);
      UI.toast(x ? 'Quotation updated' : 'Quotation saved');
      location.hash = `#/quotations/${encodeURIComponent(qid)}`;
    });
    if (mode === 'customer' && !customerId) custInput.focus();
  }

  // ───── View ─────

  function renderView(el, id) {
    const x = Store.get('Quotations', id);
    if (!x || x.is_deleted) { Views.notfound.render(el); return; }
    const p = partyOf(x);
    const converted = x.status === 'Converted';
    const order = converted ? Store.get('Orders', x.converted_order_id) : null;
    const waiting = !x.quote_no ? 'Waiting for the quotation number from the server…' : '';

    el.innerHTML = `
      ${converted ? `<div class="alert alert-success d-flex gap-2 align-items-center"><i class="bx bx-check-circle fs-5"></i>
        <div class="me-auto">Converted to order ${order ? `<a href="#/orders/${encodeURIComponent(order.id)}" class="fw-semibold">${U.esc(order.order_no || 'view')}</a>` : ''}.</div></div>` : ''}
      <div class="card mb-3">
        <div class="card-header d-flex align-items-center gap-2 flex-wrap">
          <a href="#/quotations" class="btn btn-icon btn-sm btn-text-secondary" aria-label="Back"><i class="bx bx-arrow-back"></i></a>
          <div class="me-auto min-w-0">
            <h5 class="mb-0">Quotation ${quoteNo(x)} ${statusBadge(x)}</h5>
            <small class="text-muted">${U.esc(p.name)} · ${U.inr(x.total)} · ${U.fmtDate(x.date)}</small>
          </div>
          <div class="d-flex gap-2 flex-wrap">
            ${Docs.actionsHtml()}
            ${converted ? '' : `
              <a href="#/quotations/${encodeURIComponent(id)}/edit" class="btn btn-sm btn-outline-primary"><i class="bx bx-edit-alt me-1"></i>Edit</a>
              <a href="#/quotations/${encodeURIComponent(id)}/convert" class="btn btn-sm btn-primary"><i class="bx bx-transfer me-1"></i>Convert to order</a>
              <button class="btn btn-sm btn-outline-danger" id="quote-delete" aria-label="Delete"><i class="bx bx-trash"></i></button>`}
          </div>
        </div>
        ${waiting ? `<div class="card-body py-2 small text-muted"><span class="spinner-border spinner-border-sm me-1"></span>${waiting}</div>` : ''}
      </div>
      <div id="doc-preview"></div>`;

    Docs.preview(el.querySelector('#doc-preview'), Docs.quotation(x));
    Docs.wireActions(el, () => Docs.quotation(Store.get('Quotations', id)), () => !!(Store.get('Quotations', id) || {}).quote_no);
    const del = el.querySelector('#quote-delete');
    if (del) del.addEventListener('click', async () => {
      const ok = await UI.confirm({ title: 'Delete this quotation?', message: 'It will be removed from all lists.', confirmText: 'Delete' });
      if (!ok) return;
      await Store.saveMany([['Quotations', { id, is_deleted: true }], ...itemsOf(id).map(i => ['QuotationItems', { id: i.id, is_deleted: true }])]);
      UI.toast('Quotation deleted');
      location.hash = '#/quotations';
    });
  }

  // ───── Convert ─────

  function renderConvert(el, id) {
    const x = Store.get('Quotations', id);
    if (!x || x.is_deleted) { Views.notfound.render(el); return; }
    if (x.status === 'Converted') { location.hash = `#/quotations/${encodeURIComponent(id)}`; return; }
    const existing = x.customer_id ? Store.get('Customers', x.customer_id) : null;
    const match = !existing && x.prospect_contact ? Store.list('Customers').find(c => c.contact_no === x.prospect_contact) : null;
    let linkId = existing ? existing.id : (match ? match.id : '');
    const back = `#/quotations/${encodeURIComponent(id)}`;

    el.innerHTML = `
      <form class="card form-card" id="conv-form" novalidate>
        <div class="card-header d-flex align-items-center gap-2">
          <a href="${back}" class="btn btn-icon btn-sm btn-text-secondary" aria-label="Back"><i class="bx bx-arrow-back"></i></a>
          <h5 class="mb-0">Convert ${x.quote_no ? U.esc(x.quote_no) : 'quotation'} to an order</h5>
        </div>
        <div class="card-body">
          <h6 class="mb-2">Customer</h6>
          ${existing ? `
            <div class="customer-chip"><div class="min-w-0"><div class="fw-semibold">${U.esc(existing.name)}</div>
              <small class="text-muted">${U.esc(existing.contact_no)} · ${U.esc(existing.location)}</small></div></div>` : `
            ${match ? `
              <div class="form-check mb-2">
                <input class="form-check-input" type="radio" name="cust_mode" id="cm-link" value="link" checked>
                <label class="form-check-label" for="cm-link">Use existing customer <b>${U.esc(match.name)}</b> (${U.esc(match.contact_no)}, ${U.esc(match.location)})</label>
              </div>
              <div class="form-check mb-3">
                <input class="form-check-input" type="radio" name="cust_mode" id="cm-new" value="new">
                <label class="form-check-label" for="cm-new">Create a new customer</label>
              </div>` : '<p class="small text-muted">The prospect becomes a customer. Fill in the missing details.</p>'}
            <div class="row g-3 ${match ? 'd-none' : ''}" id="new-customer">
              <div class="col-md-6">
                <label class="form-label" for="c-name">Name *</label>
                <input class="form-control" id="c-name" name="c_name" maxlength="80" value="${U.esc(x.prospect_name)}">
                <div class="invalid-feedback">Enter the name.</div>
              </div>
              <div class="col-md-6">
                <label class="form-label" for="c-contact">Contact number *</label>
                <input class="form-control" id="c-contact" name="c_contact" inputmode="numeric" maxlength="10" pattern="\\d{10}" value="${U.esc(x.prospect_contact)}">
                <div class="invalid-feedback">Enter a 10-digit number.</div>
              </div>
              <div class="col-md-6">
                <label class="form-label" for="c-location">Location *</label>
                <input class="form-control" id="c-location" name="c_location" maxlength="80">
                <div class="invalid-feedback">Enter the location.</div>
              </div>
              <div class="col-md-6">
                <label class="form-label" for="c-aadhar">Aadhar number <span class="text-muted">(optional)</span></label>
                <input class="form-control" id="c-aadhar" name="c_aadhar" inputmode="numeric" maxlength="40">
              </div>
              <div class="col-md-6">
                <label class="form-label" for="c-company">Company name <span class="text-muted">(optional)</span></label>
                <input class="form-control" id="c-company" name="c_company" maxlength="80">
              </div>
            </div>`}

          <h6 class="mt-4 mb-2">Order</h6>
          <div class="row g-3">
            <div class="col-6 col-md-4">
              <label class="form-label" for="o-date">Order date</label>
              <input type="date" class="form-control" id="o-date" name="order_date" required value="${U.today()}">
            </div>
            <div class="col-6 col-md-4">
              <label class="form-label" for="o-delivery">Delivery date *</label>
              <input type="date" class="form-control" id="o-delivery" name="delivery_date" required>
              <div class="invalid-feedback">Choose the delivery date.</div>
            </div>
            <div class="col-md-4">
              <label class="form-label" for="o-advance">Advance <span class="text-muted">(optional)</span></label>
              <div class="input-group"><span class="input-group-text">₹</span>
                <input type="number" class="form-control" id="o-advance" inputmode="decimal" min="0" step="any" placeholder="0"></div>
            </div>
          </div>
          <h6 class="mt-4 mb-2">Items</h6>
          <div id="items-editor"></div>
          <div class="row mt-2"><div class="col-md-6 ms-auto">
            <div class="grand-total"><span>Order total</span><strong id="grand-total">₹0</strong></div>
          </div></div>
          <div class="alert alert-danger mt-3 mb-0 d-none" id="conv-error"></div>
        </div>
        <div class="card-footer sticky-save d-flex gap-2 justify-content-end">
          <a href="${back}" class="btn btn-outline-secondary">Cancel</a>
          <button type="submit" class="btn btn-primary flex-grow-1 flex-md-grow-0"><i class="bx bx-transfer me-1"></i>Create order</button>
        </div>
      </form>`;

    const form = el.querySelector('#conv-form');
    const newBox = form.querySelector('#new-customer');
    const creatingCustomer = () => !existing && (!match || form.querySelector('#cm-new').checked);
    const setRequired = () => {
      if (!newBox) return;
      const on = creatingCustomer();
      newBox.classList.toggle('d-none', !on);
      ['c_name', 'c_contact', 'c_location'].forEach(n => { form.elements[n].required = on; });
    };
    form.querySelectorAll('[name="cust_mode"]').forEach(r => r.addEventListener('change', setRequired));
    setRequired();

    const editor = ItemsEditor.mount(form.querySelector('#items-editor'), {
      items: itemsOf(id).map(({ item_name, qty, rate, amount }) => ({ item_name, qty, rate, amount })),
      onChange: total => { form.querySelector('#grand-total').textContent = U.inr(total); }
    });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const errBox = form.querySelector('#conv-error');
      const fail = msg => { errBox.textContent = msg; errBox.classList.remove('d-none'); };
      errBox.classList.add('d-none');
      const newCust = creatingCustomer();
      if (!form.checkValidity()) { form.classList.add('was-validated'); return; }
      const itemErr = editor.validate();
      if (itemErr) return fail(itemErr);
      const total = editor.total();
      const orderDate = form.elements.order_date.value;
      const delivery = form.elements.delivery_date.value;
      if (delivery < orderDate) return fail('Delivery date is before the order date.');
      const advance = U.round2(form.querySelector('#o-advance').value);
      if (advance < 0) return fail("Advance can't be negative.");
      if (advance > total) return fail(`Advance (${U.inr(advance)}) is more than the order total (${U.inr(total)}).`);

      const entries = [];
      let customerId = linkId;
      if (newCust) {
        const contact = form.elements.c_contact.value.trim();
        const dup = Store.list('Customers').find(c => c.contact_no === contact);
        if (dup) {
          const ok = await UI.confirm({ title: 'Number already used', message: `${dup.name} already has ${contact}. Create another customer anyway?`, confirmText: 'Create anyway', danger: false });
          if (!ok) return;
        }
        customerId = U.uuid();
        entries.push(['Customers', {
          id: customerId, name: form.elements.c_name.value.trim(), contact_no: contact,
          location: form.elements.c_location.value.trim(), aadhar_no: form.elements.c_aadhar.value.trim(),
          company_name: form.elements.c_company.value.trim()
        }]);
      }
      const orderId = U.uuid();
      entries.push(['Orders', {
        id: orderId, customer_id: customerId, order_date: orderDate, delivery_date: delivery,
        status: 'Pending', total, notes: x.notes || '', source_quotation_id: id
      }]);
      editor.getItems().forEach((it, i) => entries.push(['OrderItems', { order_id: orderId, item_name: it.item_name, qty: it.qty, rate: it.rate, amount: it.amount, sort: i }]));
      if (advance > 0) entries.push(['Payments', { order_id: orderId, date: orderDate, amount: advance, note: 'Advance', status: '' }]);
      entries.push(['Quotations', { id, status: 'Converted', converted_order_id: orderId, customer_id: customerId }]);
      await Store.saveMany(entries);
      UI.toast('Order created from the quotation');
      location.hash = `#/orders/${encodeURIComponent(orderId)}`;
    });
    form.querySelector('#o-delivery').focus();
  }

  return {
    title: 'Quotations',
    refreshOn: params => (params[0] === 'new' || params[1] === 'edit' || params[1] === 'convert') ? null : ['Quotations', 'QuotationItems', 'Customers', 'Orders', 'Settings'],

    render(el, params) {
      const [a, b] = params;
      if (!a) return renderList(el);
      if (a === 'new') return renderForm(el, null, b);
      if (b === 'edit') return renderForm(el, a);
      if (b === 'convert') return renderConvert(el, a);
      return renderView(el, a);
    },

    update(el, params) {
      if (!params[0]) updateList(el);
      else this.render(el, params);
    }
  };
})();
