/**
 * #/expenses          list with month / category / vendor filters
 * #/expenses/new      add an expense
 * #/expenses/:id      edit (or delete) an expense
 */
Views.expenses = (() => {
  const CATEGORIES = ['Purchase', 'Rent', 'Travel', 'Salaries', 'Maintenance', 'Miscellaneous'];
  const ICONS = { Purchase: 'bx-cart', Rent: 'bx-building-house', Travel: 'bx-car', Salaries: 'bx-group', Maintenance: 'bx-wrench', Miscellaneous: 'bx-dots-horizontal-rounded' };
  const PAGE = 100;
  const filters = { month: U.today().slice(0, 7), category: '', vendor: '' };
  let shown = PAGE;

  /** Vendor names used before, most used first. */
  function vendors() {
    const map = new Map();
    Store.list('Expenses').forEach(e => {
      const name = String(e.vendor_name || '').trim();
      if (!name) return;
      const key = name.toLowerCase();
      const v = map.get(key) || { name, count: 0 };
      v.count++;
      map.set(key, v);
    });
    return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  function filtered() {
    const vendor = filters.vendor.toLowerCase();
    return Store.list('Expenses')
      .filter(e => (!filters.month || String(e.date).startsWith(filters.month))
        && (!filters.category || e.category === filters.category)
        && (!vendor || String(e.vendor_name || '').toLowerCase() === vendor))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.created_at).localeCompare(String(a.created_at)));
  }

  function periodLabel() {
    return [filters.month ? Reports.monthLabel(filters.month) : 'All time', filters.category, filters.vendor].filter(Boolean).join(' · ');
  }

  // ───── List ─────

  function renderList(el) {
    const vendorOptions = vendors();
    el.innerHTML = `
      <div class="row g-3 mb-3" id="exp-stats"></div>
      <div class="card mb-3"><div class="card-body py-3">
        <div class="row g-2 align-items-end">
          <div class="col-6 col-md-3">
            <label class="form-label small mb-1" for="exp-month">Month</label>
            <input type="month" class="form-control" id="exp-month" value="${U.esc(filters.month)}">
          </div>
          <div class="col-6 col-md-3">
            <label class="form-label small mb-1" for="exp-cat">Category</label>
            <select class="form-select" id="exp-cat">
              <option value="">All categories</option>
              ${CATEGORIES.map(c => `<option ${c === filters.category ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>
          <div class="col-12 col-md-3">
            <label class="form-label small mb-1" for="exp-vendor">Vendor</label>
            <select class="form-select" id="exp-vendor">
              <option value="">All vendors</option>
              ${vendorOptions.map(v => `<option ${v.name.toLowerCase() === filters.vendor.toLowerCase() ? 'selected' : ''}>${U.esc(v.name)}</option>`).join('')}
            </select>
          </div>
          <div class="col-12 col-md-3 d-flex gap-2">
            <button class="btn btn-outline-secondary flex-grow-1" id="exp-all" title="Show every month">All time</button>
            <button class="btn btn-outline-success" id="exp-export" title="Download as Excel"><i class="bx bx-spreadsheet me-1"></i>Excel</button>
          </div>
        </div>
      </div></div>
      <div class="d-flex justify-content-between align-items-center mb-2">
        <small class="text-muted" id="exp-period"></small>
        <a href="#/expenses/new" class="btn btn-primary"><i class="bx bx-plus me-1"></i>Add expense</a>
      </div>
      <div id="exp-results"></div>`;

    const month = el.querySelector('#exp-month');
    month.addEventListener('change', () => { filters.month = month.value; shown = PAGE; updateList(el); });
    el.querySelector('#exp-cat').addEventListener('change', e => { filters.category = e.target.value; shown = PAGE; updateList(el); });
    el.querySelector('#exp-vendor').addEventListener('change', e => { filters.vendor = e.target.value; shown = PAGE; updateList(el); });
    el.querySelector('#exp-all').addEventListener('click', () => { filters.month = ''; month.value = ''; shown = PAGE; updateList(el); });
    el.querySelector('#exp-export').addEventListener('click', e => exportList(e.currentTarget));
    updateList(el);
  }

  function updateList(el) {
    const box = el.querySelector('#exp-results');
    if (!box) return;
    const all = Store.list('Expenses');
    const month = U.today().slice(0, 7);
    const year = U.today().slice(0, 4);
    const list = filtered();
    const total = Reports.sum(list, e => e.amount);
    el.querySelector('#exp-stats').innerHTML = [
      ['Shown total', U.inr(total), 'bx-filter-alt', 'primary'],
      ['This month', U.inr(Reports.sum(all.filter(e => String(e.date).startsWith(month)), e => e.amount)), 'bx-calendar', 'warning'],
      ['This year', U.inr(Reports.sum(all.filter(e => String(e.date).startsWith(year)), e => e.amount)), 'bx-trending-up', 'info'],
      ['Entries shown', String(list.length), 'bx-list-ul', 'secondary']
    ].map(([label, value, icon, color]) => `
      <div class="col-6 col-lg-3"><div class="card h-100"><div class="card-body d-flex align-items-center gap-3 py-3">
        <span class="avatar-initial rounded bg-label-${color} stat-icon d-none d-sm-flex"><i class="bx ${icon}"></i></span>
        <div class="min-w-0"><small class="text-muted d-block text-truncate">${label}</small><h5 class="mb-0">${value}</h5></div>
      </div></div></div>`).join('');
    el.querySelector('#exp-period').textContent = periodLabel();

    if (!list.length) {
      box.innerHTML = `<div class="card"><div class="card-body text-center text-muted py-5">
        <i class="bx bx-money-withdraw display-6 d-block mb-2"></i>${all.length ? 'No expenses match these filters.' : 'No expenses yet.'}
        ${all.length ? '' : '<div class="mt-3"><a href="#/expenses/new" class="btn btn-primary btn-sm">Add the first one</a></div>'}</div></div>`;
      return;
    }
    const page = list.slice(0, shown);
    const who = e => e.category === 'Purchase' && e.vendor_name ? U.esc(e.vendor_name) : '';
    box.innerHTML = `
      <div class="card d-none d-md-block">
        <div class="table-responsive">
          <table class="table table-hover mb-0">
            <thead><tr><th>Date</th><th>Category</th><th>Vendor</th><th>Description</th><th class="text-end">Amount</th></tr></thead>
            <tbody>${page.map(e => `
              <tr class="row-link" data-href="#/expenses/${encodeURIComponent(e.id)}">
                <td class="text-nowrap">${U.fmtDate(e.date)}</td>
                <td><i class="bx ${ICONS[e.category] || 'bx-purchase-tag'} text-muted me-1"></i>${U.esc(e.category)}</td>
                <td>${who(e)}</td>
                <td class="text-muted">${U.esc(e.description)}</td>
                <td class="text-end fw-semibold">${U.inr(e.amount)}</td></tr>`).join('')}
            </tbody>
            <tfoot><tr><th colspan="4" class="text-end">Total</th><th class="text-end">${U.inr(total)}</th></tr></tfoot>
          </table>
        </div>
      </div>
      <div class="card d-md-none"><div class="list-group list-group-flush">${page.map(e => `
        <a href="#/expenses/${encodeURIComponent(e.id)}" class="list-group-item list-group-item-action d-flex align-items-center gap-3">
          <span class="avatar-initial rounded bg-label-secondary stat-icon flex-shrink-0"><i class="bx ${ICONS[e.category] || 'bx-purchase-tag'}"></i></span>
          <div class="min-w-0 flex-grow-1">
            <div class="fw-semibold text-truncate">${who(e) || U.esc(e.category)}</div>
            <small class="text-muted d-block text-truncate">${U.fmtDate(e.date)}${who(e) ? ' · Purchase' : ''}${e.description ? ' · ' + U.esc(e.description) : ''}</small>
          </div>
          <div class="fw-semibold flex-shrink-0">${U.inr(e.amount)}</div>
        </a>`).join('')}</div></div>
      ${list.length > shown ? `<div class="text-center mt-3"><button class="btn btn-outline-secondary" id="exp-more">Show more (${list.length - shown} left)</button></div>` : ''}`;
    box.querySelectorAll('.row-link').forEach(tr => tr.addEventListener('click', () => { location.hash = tr.dataset.href; }));
    const more = box.querySelector('#exp-more');
    if (more) more.addEventListener('click', () => { shown += PAGE; updateList(el); });
  }

  function exportList(btn) {
    Reports.exportXlsx(`Expenses - ${periodLabel()}`, [{
      name: 'Expenses',
      totals: true,
      rows: filtered(),
      columns: [
        { label: 'Date', type: 'date', value: e => e.date },
        { label: 'Category', value: e => e.category },
        { label: 'Vendor', value: e => e.vendor_name },
        { label: 'Description', value: e => e.description },
        { label: 'Amount', type: 'money', value: e => e.amount }
      ]
    }], btn);
  }

  // ───── Form ─────

  function renderForm(el, id) {
    const x = id ? Store.get('Expenses', id) : null;
    if (id && (!x || x.is_deleted)) { Views.notfound.render(el); return; }
    const cat = x ? x.category : '';

    el.innerHTML = `
      <form class="card form-card" id="exp-form" novalidate>
        <div class="card-header d-flex align-items-center gap-2">
          <a href="#/expenses" class="btn btn-icon btn-sm btn-text-secondary" aria-label="Back"><i class="bx bx-arrow-back"></i></a>
          <h5 class="mb-0 me-auto">${x ? 'Edit expense' : 'Add expense'}</h5>
          ${x ? '<button type="button" class="btn btn-sm btn-outline-danger" id="exp-delete"><i class="bx bx-trash me-1"></i>Delete</button>' : ''}
        </div>
        <div class="card-body">
          <label class="form-label">Category *</label>
          <div class="cat-pick mb-3" id="cat-pick">
            ${CATEGORIES.map(c => `
              <input type="radio" class="btn-check" name="category" id="cat-${c}" value="${c}" required ${c === cat ? 'checked' : ''}>
              <label class="btn btn-outline-primary" for="cat-${c}"><i class="bx ${ICONS[c]} d-block fs-4 mb-1"></i>${c}</label>`).join('')}
          </div>
          <div class="invalid-feedback mb-3" id="cat-error">Choose a category.</div>
          <div class="row g-3">
            <div class="col-12 ${cat === 'Purchase' ? '' : 'd-none'}" id="vendor-row">
              <label class="form-label" for="f-vendor">Vendor name *</label>
              <input class="form-control" id="f-vendor" name="vendor_name" maxlength="80" value="${U.esc(x ? x.vendor_name : '')}" placeholder="Who did you buy from?">
              <div class="invalid-feedback">Vendor name is required for purchases.</div>
            </div>
            <div class="col-md-6">
              <label class="form-label" for="f-amount">Amount *</label>
              <div class="input-group has-validation">
                <span class="input-group-text">₹</span>
                <input type="number" class="form-control" id="f-amount" name="amount" inputmode="decimal" min="0.01" step="any" required value="${x ? U.esc(x.amount) : ''}">
                <div class="invalid-feedback">Enter an amount.</div>
              </div>
            </div>
            <div class="col-md-6">
              <label class="form-label" for="f-date">Date *</label>
              <input type="date" class="form-control" id="f-date" name="date" required value="${U.esc(x ? x.date : U.today())}" max="${U.today()}">
            </div>
            <div class="col-12">
              <label class="form-label" for="f-desc">Description <span class="text-muted">(optional)</span></label>
              <textarea class="form-control" id="f-desc" name="description" rows="2" maxlength="300" placeholder="e.g. Chemicals for October orders">${U.esc(x ? x.description : '')}</textarea>
            </div>
          </div>
        </div>
        <div class="card-footer sticky-save d-flex gap-2 justify-content-end">
          <a href="#/expenses" class="btn btn-outline-secondary">Cancel</a>
          ${x ? '' : '<button type="submit" class="btn btn-outline-primary" data-again><span class="d-none d-sm-inline">Save & add another</span><span class="d-sm-none">Save + new</span></button>'}
          <button type="submit" class="btn btn-primary flex-grow-1 flex-md-grow-0"><i class="bx bx-save me-1"></i>Save</button>
        </div>
      </form>`;

    const form = el.querySelector('#exp-form');
    const vendorRow = form.querySelector('#vendor-row');
    const vendor = form.querySelector('#f-vendor');
    const category = () => (form.querySelector('[name="category"]:checked') || {}).value || '';

    form.querySelector('#cat-pick').addEventListener('change', () => {
      const isPurchase = category() === 'Purchase';
      vendorRow.classList.toggle('d-none', !isPurchase);
      vendor.required = isPurchase;
      form.querySelector('#cat-error').classList.remove('d-block');
      (isPurchase ? vendor : form.querySelector('#f-amount')).focus();
    });
    vendor.required = cat === 'Purchase';

    Typeahead.attach(vendor, {
      source: q => {
        const n = q.toLowerCase();
        return vendors().filter(v => !n || v.name.toLowerCase().includes(n)).map(v => ({ label: v.name, sub: `${v.count} purchase${v.count === 1 ? '' : 's'}`, value: v.name }));
      },
      onPick: it => { vendor.value = it.value; form.querySelector('#f-amount').focus(); }
    });

    let saving = false;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (saving) return;
      const cat = category();
      form.querySelector('#cat-error').classList.toggle('d-block', !cat);
      if (!form.checkValidity() || !cat) { form.classList.add('was-validated'); return; }
      const amount = U.round2(form.elements.amount.value);
      if (!(amount > 0)) return;
      saving = true;
      // Reuse the existing spelling of a vendor so filters group them together.
      const typed = vendor.value.trim();
      const known = vendors().find(v => v.name.toLowerCase() === typed.toLowerCase());
      await Store.save('Expenses', {
        ...(x ? { id: x.id } : {}),
        date: form.elements.date.value,
        category: cat,
        vendor_name: cat === 'Purchase' ? (known ? known.name : typed) : '',
        amount,
        description: form.elements.description.value.trim()
      });
      UI.toast(`${cat} expense of ${U.inr(amount)} saved`);
      if (e.submitter && e.submitter.hasAttribute('data-again')) {
        renderForm(el, null);
        const again = el.querySelector(`#cat-${cat}`);
        again.checked = true;
        again.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        location.hash = '#/expenses';
      }
    });

    const del = form.querySelector('#exp-delete');
    if (del) del.addEventListener('click', async () => {
      const ok = await UI.confirm({ title: 'Delete this expense?', message: `${x.category} · ${U.inr(x.amount)} on ${U.fmtDate(x.date)} will be removed from lists and totals.`, confirmText: 'Delete' });
      if (!ok) return;
      await Store.remove('Expenses', x.id);
      UI.toast('Expense deleted');
      location.hash = '#/expenses';
    });

    if (!x) form.querySelector('[name="category"]').focus();
  }

  return {
    title: 'Expenses',
    refreshOn: params => params[0] ? null : ['Expenses'],

    render(el, params) {
      const [a] = params;
      if (!a) return renderList(el);
      if (a === 'new') return renderForm(el, null);
      return renderForm(el, a);
    },

    update(el, params) {
      if (!params[0]) updateList(el);
    }
  };
})();
