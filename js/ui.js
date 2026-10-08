/** App shell: navigation, routing, toasts, dialogs, sync indicator. */

const NAV = [
  { id: 'home', label: 'Home', icon: 'bx-home-circle' },
  { header: 'Sales' },
  { id: 'customers', label: 'Customers', icon: 'bx-user' },
  { id: 'orders', label: 'Orders', icon: 'bx-package' },
  { id: 'payments', label: 'Payments', icon: 'bx-wallet' },
  { id: 'invoices', label: 'Invoices', icon: 'bx-receipt' },
  { id: 'quotations', label: 'Quotations', icon: 'bx-file' },
  { id: 'agreements', label: 'Agreements', icon: 'bx-pen' },
  { header: 'Business' },
  { id: 'expenses', label: 'Expenses', icon: 'bx-money-withdraw' },
  { id: 'dashboards', label: 'Dashboards', icon: 'bx-bar-chart-alt-2' },
  { header: 'System' },
  { id: 'settings', label: 'Settings', icon: 'bx-cog' }
];

/** Section id → its sidebar group name, shown under the page title. */
const NAV_GROUP = (() => {
  const out = { money: 'Business' };
  let group = '';
  NAV.forEach(i => { if (i.header) group = i.header; else if (group) out[i.id] = group; });
  return out;
})();

const BOTTOM_NAV = [
  { id: 'home', label: 'Home', icon: 'bx-home-circle' },
  { id: 'customers', label: 'Customers', icon: 'bx-user' },
  { id: 'new', label: 'New', icon: 'bx-plus', action: 'new' },
  { id: 'orders', label: 'Orders', icon: 'bx-package' },
  { id: 'more', label: 'More', icon: 'bx-grid-alt', action: 'more', rest: true }
];

const QUICK_ACTIONS = [
  { label: 'Order', icon: 'bx-package', href: '#/orders/new', tone: 'orange' },
  { label: 'Payment', icon: 'bx-wallet', href: '#/payments/new', tone: 'green' },
  { label: 'Customer', icon: 'bx-user-plus', href: '#/customers/new', tone: 'violet' },
  { label: 'Quotation', icon: 'bx-file', href: '#/quotations/new', tone: 'blue' },
  { label: 'Invoice', icon: 'bx-receipt', href: '#/invoices/new', tone: 'amber' },
  { label: 'Expense', icon: 'bx-money-withdraw', href: '#/expenses/new', tone: 'rose' }
];

/** Screen registry. Each view: { title, render(el, params), refreshOn?: [tables] } */
const Views = {};

const UI = (() => {
  let current = null;

  const $ = sel => document.querySelector(sel);

  function buildNav() {
    const menu = $('#menu-items');
    menu.innerHTML = NAV.map(item => item.header
      ? `<li class="menu-header small text-uppercase"><span class="menu-header-text">${item.header}</span></li>`
      : `<li class="menu-item" data-nav="${item.id}">
           <a href="#/${item.id}" class="menu-link">
             <i class="menu-icon tf-icons bx ${item.icon}"></i>
             <div>${item.label}</div>
             <span class="badge rounded-pill bg-danger ms-auto d-none" data-badge="${item.id}"></span>
           </a>
         </li>`).join('');

    $('#bottom-nav').innerHTML = BOTTOM_NAV.map(item => item.action === 'new'
      ? `<button type="button" class="bottom-nav-new" data-action="new" aria-label="Create new"><i class="bx bx-plus"></i></button>`
      : `<a href="${item.action ? 'javascript:void(0)' : '#/' + item.id}" class="bottom-nav-item" data-bottom="${item.id}" ${item.action ? `data-action="${item.action}"` : ''}>
          <span class="bottom-nav-icon"><i class="bx ${item.icon}"></i>
            <span class="badge rounded-pill bg-danger bottom-nav-badge d-none" data-badge="${item.id}"></span></span>
          <span>${item.label}</span>
        </a>`).join('');

    $('#more-items').innerHTML = NAV.filter(i => !i.header).map(item => `
      <a href="#/${item.id}" class="more-tile">
        <i class="bx ${item.icon}"></i><span>${item.label}</span>
      </a>`).join('');

    $('#new-items').innerHTML = QUICK_ACTIONS.map(a => `
      <a href="${a.href}" class="action-tile">
        <span class="action-icon tone-${a.tone}"><i class="bx ${a.icon}"></i></span><span>${a.label}</span>
      </a>`).join('');

    $('#fab-menu').innerHTML = QUICK_ACTIONS.map(a => `
      <li><a class="dropdown-item d-flex align-items-center gap-2 py-2" href="${a.href}">
        <span class="action-icon action-icon-sm tone-${a.tone}"><i class="bx ${a.icon}"></i></span><span>${a.label}</span></a></li>`).join('');

    document.querySelector('[data-action="more"]').addEventListener('click', () => {
      bootstrap.Offcanvas.getOrCreateInstance($('#more-sheet')).show();
    });
    document.querySelector('[data-action="new"]').addEventListener('click', () => {
      bootstrap.Offcanvas.getOrCreateInstance($('#new-sheet')).show();
    });
    // Bootstrap's data-bs-dismiss cancels link clicks, so the sheets close here instead.
    ['#more-sheet', '#new-sheet'].forEach(sel => $(sel).addEventListener('click', e => {
      if (e.target.closest('a[href^="#/"]')) bootstrap.Offcanvas.getOrCreateInstance($(sel)).hide();
    }));
    Search.init();
    document.querySelectorAll('.layout-menu-toggle').forEach(btn => btn.addEventListener('click', e => {
      e.preventDefault();
      document.documentElement.classList.toggle('layout-menu-expanded');
    }));
    $('#sync-status').addEventListener('click', () => Sync.now());
  }

  function parseHash() {
    const parts = (location.hash || '#/home').replace(/^#\/?/, '').split('/').filter(Boolean);
    return { name: parts[0] || 'home', params: parts.slice(1).map(decodeURIComponent) };
  }

  function route() {
    const { name, params } = parseHash();
    const view = Views[name] || Views.notfound;
    current = { name, params, view };
    document.documentElement.classList.remove('layout-menu-expanded');

    document.querySelectorAll('[data-nav]').forEach(li => li.classList.toggle('active', li.dataset.nav === name));
    const named = BOTTOM_NAV.filter(b => !b.action).map(b => b.id);
    document.querySelectorAll('[data-bottom]').forEach(a => {
      const def = BOTTOM_NAV.find(b => b.id === a.dataset.bottom);
      a.classList.toggle('active', def.rest ? !named.includes(name) : def.id === name);
    });

    $('#page-title').textContent = view.title || '';
    $('#page-sub').textContent = name === 'home' ? U.fmtDate(U.today()) : (NAV_GROUP[name] || '');
    document.body.dataset.page = name;
    document.title = `${view.title ? view.title + ' · ' : ''}${APP_CONFIG.companyName}`;
    render();
    const el = $('#page-content');
    el.classList.remove('page-enter');
    void el.offsetWidth;
    el.classList.add('page-enter');
    window.scrollTo(0, 0);
  }

  function render() {
    if (!current) return;
    const el = $('#page-content');
    try {
      current.view.render(el, current.params);
    } catch (e) {
      console.error(e);
      el.innerHTML = `<div class="alert alert-danger">Something went wrong showing this screen: ${U.esc(e.message)}</div>`;
    }
  }

  /**
   * refreshOn: tables (or params => tables) that should refresh the screen.
   * Views with update(el, params) refresh just their data area, so a half-typed
   * search or an open form is never wiped by a background sync.
   */
  function onDataChange(tables) {
    updateBadges();
    renderSyncStatus(Sync.status());
    if (!current) return;
    const { view, params } = current;
    const watch = typeof view.refreshOn === 'function' ? view.refreshOn(params) : view.refreshOn;
    if (!watch || !watch.some(t => tables.has(t))) return;
    if (view.update) {
      try { view.update($('#page-content'), params); } catch (e) { console.error(e); }
    } else {
      render();
    }
  }

  function updateBadges() {
    const due = Metrics.reminders().length;
    document.querySelectorAll('[data-badge="home"]').forEach(b => {
      b.textContent = due;
      b.classList.toggle('d-none', !due);
    });
  }

  function renderSyncStatus(s) {
    const btn = $('#sync-status');
    if (!btn) return;
    const pending = s.pending || 0;
    const states = {
      idle:    ['bx-cloud', 'text-muted', 'Ready'],
      syncing: ['bx-refresh bx-spin', 'text-muted', 'Syncing…'],
      saving:  ['bx-loader-alt bx-spin', 'text-primary', `Saving… (${pending})`],
      synced:  [pending ? 'bx-loader-alt bx-spin' : 'bx-check-circle', pending ? 'text-primary' : 'text-success', pending ? `Saving… (${pending})` : 'Saved'],
      offline: ['bx-wifi-off', 'text-warning', pending ? `Offline · ${pending} pending` : 'Offline'],
      error:   ['bx-error-circle', 'text-danger', pending ? `Sync error · ${pending} pending` : 'Sync error']
    };
    const [icon, color, label] = states[s.state] || states.idle;
    btn.className = `btn btn-sm sync-pill ${color}`;
    btn.title = s.message || (s.lastSync ? `Last synced ${U.timeAgo(s.lastSync)} — tap to sync now` : 'Tap to sync now');
    btn.innerHTML = `<i class="bx ${icon}"></i><span class="sync-label">${label}</span>`;
  }

  /** action: { label, onClick } adds a button and keeps the toast open until used or closed. */
  function toast(message, type = 'success', action = null) {
    const icons = { success: 'bx-check-circle', danger: 'bx-error-circle', warning: 'bx-error', info: 'bx-info-circle' };
    const el = U.el(`
      <div class="toast align-items-center text-white bg-${type} border-0" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="d-flex">
          <div class="toast-body d-flex gap-2 align-items-start"><i class="bx ${icons[type] || icons.info} fs-5"></i><span>${U.esc(message)}</span></div>
          ${action ? `<button type="button" class="btn btn-sm btn-light my-auto" data-action>${U.esc(action.label)}</button>` : ''}
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
      </div>`);
    if (action) el.querySelector('[data-action]').addEventListener('click', action.onClick);
    $('#toast-area').appendChild(el);
    const t = new bootstrap.Toast(el, { autohide: !action, delay: type === 'danger' || type === 'warning' ? 7000 : 3000 });
    el.addEventListener('hidden.bs.toast', () => el.remove());
    t.show();
  }

  /** Promise<boolean>. Use for every destructive action. */
  function confirm({ title = 'Are you sure?', message = '', confirmText = 'Confirm', danger = true } = {}) {
    return new Promise(resolve => {
      const el = U.el(`
        <div class="modal fade" tabindex="-1">
          <div class="modal-dialog modal-dialog-centered modal-sm">
            <div class="modal-content">
              <div class="modal-header"><h5 class="modal-title">${U.esc(title)}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
              <div class="modal-body">${U.esc(message)}</div>
              <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-${danger ? 'danger' : 'primary'}" data-ok>${U.esc(confirmText)}</button>
              </div>
            </div>
          </div>
        </div>`);
      document.body.appendChild(el);
      const modal = new bootstrap.Modal(el);
      let ok = false;
      el.querySelector('[data-ok]').addEventListener('click', () => { ok = true; modal.hide(); });
      el.addEventListener('hidden.bs.modal', () => { el.remove(); resolve(ok); });
      modal.show();
    });
  }

  function skeleton(cards = 4) {
    return `<div class="row g-3">${Array.from({ length: cards }, () => `
      <div class="col-6 col-lg-3"><div class="card"><div class="card-body">
        <div class="skeleton skeleton-line w-50"></div>
        <div class="skeleton skeleton-line skeleton-lg w-75 mt-2"></div>
      </div></div></div>`).join('')}
      <div class="col-12"><div class="card"><div class="card-body">
        ${Array.from({ length: 4 }, () => '<div class="skeleton skeleton-line my-3"></div>').join('')}
      </div></div></div></div>`;
  }

  return {
    buildNav, route, render, onDataChange, renderSyncStatus, updateBadges, toast, confirm, skeleton,
    current: () => current && current.name,
    showSkeleton: () => { $('#page-content').innerHTML = skeleton(); }
  };
})();

/** Business numbers shared by Home, lists and (later) the dashboards. */
const Metrics = (() => {
  const CLOSED = ['Delivered', 'Cancelled'];
  let itemMemoryCache = null;
  Store.onChange(tables => { if (tables.has('OrderItems')) itemMemoryCache = null; });

  /** Every item name used before, with its most recent rate and how often it was used. */
  function itemMemory() {
    if (itemMemoryCache) return itemMemoryCache;
    const map = new Map();
    Store.list('OrderItems').forEach(it => {
      const name = String(it.item_name || '').trim();
      if (!name) return;
      const key = name.toLowerCase();
      const m = map.get(key);
      if (!m) {
        map.set(key, { name, rate: Number(it.rate) || 0, count: 1, at: it.updated_at || '' });
      } else {
        m.count++;
        if ((it.updated_at || '') > m.at) { m.rate = Number(it.rate) || 0; m.at = it.updated_at || ''; m.name = name; }
      }
    });
    itemMemoryCache = [...map.values()].sort((a, b) => b.count - a.count);
    return itemMemoryCache;
  }

  /** order_id → total paid, in one pass over Payments. */
  function paidByOrder() {
    const map = new Map();
    Store.list('Payments').forEach(p => {
      if (p.status === 'Void') return;
      map.set(p.order_id, (map.get(p.order_id) || 0) + (Number(p.amount) || 0));
    });
    return map;
  }

  function paidFor(orderId) {
    return paidByOrder().get(orderId) || 0;
  }

  /** The order's final invoice that isn't void, if any. */
  function activeInvoiceFor(orderId) {
    return Store.list('Invoices').find(i => i.type === 'Order' && i.order_id === orderId && i.status !== 'Void') || null;
  }

  return {
    CLOSED,
    paidFor,
    paidByOrder,
    activeInvoiceFor,
    itemMemory,

    itemSuggestions(q) {
      const needle = q.trim().toLowerCase();
      if (!needle) return [];
      const all = itemMemory();
      const starts = all.filter(m => m.name.toLowerCase().startsWith(needle));
      const contains = all.filter(m => !m.name.toLowerCase().startsWith(needle) && m.name.toLowerCase().includes(needle));
      return starts.concat(contains);
    },

    balanceFor(order, paidMap) {
      const paid = paidMap ? (paidMap.get(order.id) || 0) : paidFor(order.id);
      return U.round2((Number(order.total) || 0) - paid);
    },

    /** Unpaid / Partial / Fully Settled, with the badge colour to show it in. */
    paymentState(total, paid) {
      total = U.round2(total);
      paid = U.round2(paid);
      if (total > 0 && paid >= total) return { label: 'Fully Settled', color: 'success' };
      if (paid > 0) return { label: 'Partial', color: 'warning' };
      return { label: 'Unpaid', color: 'danger' };
    },

    /** customer id → { orders, billed, paid, balance } over non-cancelled orders. */
    customerStats() {
      const paid = paidByOrder();
      const stats = new Map();
      Store.list('Orders').forEach(o => {
        if (o.status === 'Cancelled') return;
        const s = stats.get(o.customer_id) || { orders: 0, billed: 0, paid: 0, balance: 0 };
        s.orders++;
        s.billed += Number(o.total) || 0;
        s.paid += paid.get(o.id) || 0;
        s.balance = U.round2(s.billed - s.paid);
        stats.set(o.customer_id, s);
      });
      return stats;
    },

    /** Orders due within the reminder window (or overdue) that aren't delivered/cancelled. */
    reminders() {
      return Store.list('Orders')
        .filter(o => o.delivery_date && !CLOSED.includes(o.status))
        .map(o => ({ order: o, days: U.daysUntil(o.delivery_date) }))
        .filter(r => r.days <= APP_CONFIG.reminderDays)
        .sort((a, b) => a.days - b.days);
    },

    /** Sales, collections and order count for a 'YYYY-MM' month; pending dues are across all months. */
    thisMonth(month = U.today().slice(0, 7)) {
      const orders = Store.list('Orders').filter(o => o.status !== 'Cancelled');
      const monthOrders = orders.filter(o => String(o.order_date).startsWith(month));
      const customInvoices = Store.list('Invoices')
        .filter(i => i.type === 'Custom' && i.status !== 'Void' && String(i.date).startsWith(month));
      const sales = monthOrders.reduce((s, o) => s + (Number(o.total) || 0), 0)
        + customInvoices.reduce((s, i) => s + (Number(i.total) || 0), 0);
      const collected = Store.list('Payments')
        .filter(p => p.status !== 'Void' && String(p.date).startsWith(month))
        .reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const paid = paidByOrder();
      const dues = orders.map(o => Math.max(0, (Number(o.total) || 0) - (paid.get(o.id) || 0))).filter(d => d > 0);
      const pending = dues.reduce((s, d) => s + d, 0);
      return { orderCount: monthOrders.length, sales, collected, pending, pendingOrders: dues.length };
    }
  };
})();

/** Navbar / Ctrl+K search across customers, orders, quotations, invoices and receipts. */
const Search = (() => {
  const LIMIT = 6;
  let modal = null;
  let input = null;
  let box = null;

  function open() {
    if (!Auth.isLoggedIn()) return;
    input.value = '';
    show('');
    modal.show();
  }

  function find(q) {
    const n = q.trim().toLowerCase();
    if (!n) return [];
    const digits = n.replace(/\D/g, '');
    const has = (...vals) => vals.some(v => String(v || '').toLowerCase().includes(n));
    const phone = v => digits.length >= 3 && String(v || '').includes(digits);
    const custs = new Map(Store.list('Customers', { includeDeleted: true }).map(c => [c.id, c]));
    const cname = id => (custs.get(id) || {}).name || '';
    const recent = (a, b, f) => String(b[f] || '').localeCompare(String(a[f] || ''));

    const groups = [
      {
        title: 'Customers', icon: 'bx-user', tone: 'violet',
        rows: Store.list('Customers').filter(c => has(c.name, c.location, c.company_name) || phone(c.contact_no))
          .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
          .map(c => ({ href: `#/customers/${encodeURIComponent(c.id)}`, title: c.name, sub: [c.contact_no, c.location].filter(Boolean).join(' · ') }))
      },
      {
        title: 'Orders', icon: 'bx-package', tone: 'orange',
        rows: Store.list('Orders').filter(o => has(o.order_no, cname(o.customer_id)))
          .sort((a, b) => recent(a, b, 'order_date'))
          .map(o => ({ href: `#/orders/${encodeURIComponent(o.id)}`, title: `${o.order_no || 'New order'} · ${cname(o.customer_id)}`, sub: `${U.fmtDate(o.order_date)} · ${U.inr(o.total)} · ${o.status || ''}` }))
      },
      {
        title: 'Quotations', icon: 'bx-file', tone: 'blue',
        rows: Store.list('Quotations').filter(x => has(x.quote_no, x.prospect_name, cname(x.customer_id)) || phone(x.prospect_contact))
          .sort((a, b) => recent(a, b, 'date'))
          .map(x => ({ href: `#/quotations/${encodeURIComponent(x.id)}`, title: `${x.quote_no || 'Quotation'} · ${cname(x.customer_id) || x.prospect_name || ''}`, sub: `${U.fmtDate(x.date)} · ${U.inr(x.total)}` }))
      },
      {
        title: 'Invoices', icon: 'bx-receipt', tone: 'amber',
        rows: Store.list('Invoices').filter(i => has(i.invoice_no, i.buyer_name) || phone(i.buyer_contact))
          .sort((a, b) => recent(a, b, 'date'))
          .map(i => ({ href: `#/invoices/${encodeURIComponent(i.id)}`, title: `${i.invoice_no || 'Invoice'} · ${i.buyer_name || ''}`, sub: `${U.fmtDate(i.date)} · ${U.inr(i.total)}${i.status === 'Void' ? ' · Void' : ''}` }))
      },
      {
        title: 'Receipts', icon: 'bx-wallet', tone: 'green',
        rows: Store.list('Payments').filter(p => has(p.receipt_no))
          .sort((a, b) => recent(a, b, 'date'))
          .map(p => ({ href: `#/payments/${encodeURIComponent(p.id)}`, title: p.receipt_no, sub: `${U.fmtDate(p.date)} · ${U.inr(p.amount)}` }))
      }
    ];
    return groups.filter(g => g.rows.length);
  }

  function show(q) {
    if (!q.trim()) {
      box.innerHTML = `<div class="search-empty"><i class="bx bx-search-alt"></i><div>Type a name, phone number, order, quotation, invoice or receipt number.</div></div>`;
      return;
    }
    const groups = find(q);
    if (!groups.length) {
      box.innerHTML = `<div class="search-empty"><i class="bx bx-ghost"></i><div>Nothing matches “${U.esc(q.trim())}”.</div></div>`;
      return;
    }
    box.innerHTML = groups.map(g => `
      <div class="search-group">
        <div class="search-group-title">${g.title}${g.rows.length > LIMIT ? ` <span>${LIMIT} of ${g.rows.length}</span>` : ''}</div>
        ${g.rows.slice(0, LIMIT).map(r => `
          <a href="${r.href}" class="search-row">
            <span class="action-icon action-icon-sm tone-${g.tone}"><i class="bx ${g.icon}"></i></span>
            <span class="min-w-0"><span class="search-row-title">${U.esc(r.title)}</span><span class="search-row-sub">${U.esc(r.sub)}</span></span>
            <i class="bx bx-chevron-right ms-auto text-muted"></i>
          </a>`).join('')}
      </div>`).join('');
  }

  function init() {
    const el = document.getElementById('search-modal');
    modal = bootstrap.Modal.getOrCreateInstance(el);
    input = document.getElementById('search-input');
    box = document.getElementById('search-results');
    document.querySelectorAll('[data-search-open]').forEach(b => b.addEventListener('click', open));
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open(); }
    });
    el.addEventListener('shown.bs.modal', () => input.focus());
    input.addEventListener('input', U.debounce(() => show(input.value), 120));
    input.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const first = box.querySelector('.search-row');
      if (first) { location.hash = first.getAttribute('href'); modal.hide(); }
    });
    box.addEventListener('click', e => { if (e.target.closest('.search-row')) modal.hide(); });
  }

  return { init, open };
})();
