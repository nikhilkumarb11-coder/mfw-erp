/**
 * #/dashboards/sales | expenses | profit
 *
 * Sales = order value on the order date (non-cancelled) + custom invoices on
 * their date. Collected = payments + custom invoices (paid at invoicing).
 * Profit = Sales − Expenses; cash view = Collected − Expenses.
 */
Views.dashboards = (() => {
  const TABS = [
    { id: 'sales', label: 'Sales', icon: 'bx-line-chart' },
    { id: 'expenses', label: 'Expenses', icon: 'bx-money-withdraw' },
    { id: 'profit', label: 'Profit', icon: 'bx-trending-up' }
  ];
  const PRESETS = [
    ['month', 'This month'], ['last-month', 'Last month'], ['year', 'This year'],
    ['fy', 'Financial year'], ['all', 'All time'], ['custom', 'Custom']
  ];
  const STATUS_COLORS = { Pending: '#f59e0b', 'In Production': '#2563eb', Ready: '#0891b2', Delivered: '#16a34a', Cancelled: '#9ca3af' };
  const state = { tab: 'sales', preset: 'fy', from: '', to: '', customerId: '', salesReport: 'customers', expCategory: '' };

  const inRange = d => { const s = String(d || '').slice(0, 10); return s && s >= state.from && s <= state.to; };
  const pad = n => String(n).padStart(2, '0');

  function earliestDate() {
    let min = U.today();
    [['Orders', 'order_date'], ['Payments', 'date'], ['Invoices', 'date'], ['Expenses', 'date']].forEach(([t, f]) => {
      Store.list(t).forEach(r => { const d = String(r[f] || '').slice(0, 10); if (d && d < min) min = d; });
    });
    return min;
  }

  function applyPreset() {
    const today = U.today();
    const y = Number(today.slice(0, 4));
    const m = Number(today.slice(5, 7));
    switch (state.preset) {
      case 'month': state.from = `${today.slice(0, 7)}-01`; state.to = today; break;
      case 'last-month': {
        const ly = m === 1 ? y - 1 : y;
        const lm = m === 1 ? 12 : m - 1;
        state.from = `${ly}-${pad(lm)}-01`;
        state.to = `${ly}-${pad(lm)}-${pad(new Date(ly, lm, 0).getDate())}`;
        break;
      }
      case 'year': state.from = `${y}-01-01`; state.to = today; break;
      case 'fy': state.from = `${m >= 4 ? y : y - 1}-04-01`; state.to = today; break;
      case 'all': state.from = earliestDate(); state.to = today; break;
      default: if (!state.from || !state.to) { state.from = `${today.slice(0, 7)}-01`; state.to = today; }
    }
  }

  function periodLabel() {
    const preset = PRESETS.find(p => p[0] === state.preset);
    const range = `${U.fmtDate(state.from)} – ${U.fmtDate(state.to)}`;
    return state.preset === 'custom' ? range : `${preset[1]} (${range})`;
  }

  /** Months to plot: the selected range, or the last 6 months when the range is shorter than 3. */
  function trendMonths() {
    const months = Reports.monthsBetween(state.from, state.to);
    return months.length >= 3 ? months : Reports.lastMonths(6, state.to.slice(0, 7));
  }

  const customerName = id => { const c = Store.get('Customers', id); return c ? c.name : 'Unknown customer'; };

  // ───── Data ─────

  function salesData({ ignoreRange = false } = {}) {
    const cust = state.tab === 'sales' ? state.customerId : '';
    const within = d => ignoreRange || inRange(d);
    const paid = Metrics.paidByOrder();
    const allOrders = Store.list('Orders').filter(o => within(o.order_date) && (!cust || o.customer_id === cust));
    const orders = allOrders.filter(o => o.status !== 'Cancelled');
    const custom = cust ? [] : Store.list('Invoices').filter(i => i.type === 'Custom' && i.status !== 'Void' && within(i.date));
    const payments = Store.list('Payments').filter(p => {
      if (p.status === 'Void' || !within(p.date)) return false;
      if (!cust) return true;
      const o = Store.get('Orders', p.order_id);
      return o && o.customer_id === cust;
    });
    const rows = orders.map(o => {
      const p = U.round2(paid.get(o.id) || 0);
      return { o, name: customerName(o.customer_id), total: Reports.num(o.total), paid: p, balance: Math.max(0, U.round2(Reports.num(o.total) - p)) };
    });
    return {
      allOrders, orders, custom, payments, rows,
      sales: U.round2(Reports.sum(orders, o => o.total) + Reports.sum(custom, i => i.total)),
      collected: U.round2(Reports.sum(payments, p => p.amount) + Reports.sum(custom, i => i.total)),
      pending: Reports.sum(rows, r => r.balance)
    };
  }

  function expenseData({ ignoreRange = false } = {}) {
    return Store.list('Expenses').filter(e => ignoreRange || inRange(e.date));
  }

  const monthOf = d => String(d || '').slice(0, 7);

  function monthlySales(months) {
    const d = salesData({ ignoreRange: true });
    const sales = Reports.groupSum([...d.orders.map(o => ({ m: monthOf(o.order_date), v: o.total })), ...d.custom.map(i => ({ m: monthOf(i.date), v: i.total }))], r => r.m, r => r.v);
    const collected = Reports.groupSum([...d.payments.map(p => ({ m: monthOf(p.date), v: p.amount })), ...d.custom.map(i => ({ m: monthOf(i.date), v: i.total }))], r => r.m, r => r.v);
    return months.map(m => ({ month: m, sales: sales.get(m) || 0, collected: collected.get(m) || 0 }));
  }

  // ───── Shared bits ─────

  function statCards(cards) {
    return `<div class="row g-3 mb-4">${cards.map(([label, value, icon, color, note]) => `
      <div class="col-6 col-lg-4 col-xl-2"><div class="card h-100"><div class="card-body py-3">
        <span class="avatar-initial rounded bg-label-${color} stat-icon mb-2"><i class="bx ${icon}"></i></span>
        <small class="text-muted d-block text-truncate">${label}</small>
        <h5 class="mb-0 text-truncate" title="${U.esc(value)}">${value}</h5>
        ${note ? `<small class="text-muted d-block text-truncate">${note}</small>` : ''}
      </div></div></div>`).join('')}</div>`;
  }

  function chartCard(id, title, sub, cls = 'col-lg-6', height = 260) {
    return `<div class="${cls}"><div class="card h-100">
      <div class="card-header pb-0"><h6 class="mb-0">${title}</h6>${sub ? `<small class="text-muted">${sub}</small>` : ''}</div>
      <div class="card-body"><div class="chart-box" style="height:${height}px"><canvas id="${id}"></canvas></div></div>
    </div></div>`;
  }

  function fmtCell(c, r) {
    const v = c.value(r);
    if (c.type === 'money') return U.inr(v);
    if (c.type === 'date') return U.fmtDate(v);
    return U.esc(v);
  }

  /** A report table showing up to `limit` rows; Excel export always has every row. */
  function reportTable(spec, limit = 50) {
    if (!spec.rows.length) return `<div class="text-center text-muted py-4">${spec.empty || 'Nothing to show for this period.'}</div>`;
    const right = c => c.type === 'money' || c.type === 'number' ? 'text-end' : '';
    const rows = spec.rows.slice(0, limit);
    return `
      <div class="table-responsive">
        <table class="table table-sm table-hover mb-0 report-table">
          <thead><tr>${spec.columns.map(c => `<th class="${right(c)} text-nowrap">${c.label}</th>`).join('')}</tr></thead>
          <tbody>${rows.map(r => `<tr ${spec.href ? `class="row-link" data-href="${spec.href(r)}"` : ''}>${spec.columns.map(c => `<td class="${right(c)} ${c.cls ? c.cls(r) : ''}">${fmtCell(c, r)}</td>`).join('')}</tr>`).join('')}</tbody>
          ${spec.totals ? `<tfoot><tr>${spec.columns.map((c, i) => `<th class="${right(c)}">${i === 0 ? 'Total' : c.type === 'money' && c.total !== false ? U.inr(Reports.sum(spec.rows, c.value)) : ''}</th>`).join('')}</tr></tfoot>` : ''}
        </table>
      </div>
      ${spec.rows.length > limit ? `<p class="small text-muted text-center mt-2 mb-0">Showing ${limit} of ${spec.rows.length}. Excel export has all rows.</p>` : ''}`;
  }

  function wireRows(root) {
    root.querySelectorAll('.row-link').forEach(tr => tr.addEventListener('click', () => { location.hash = tr.dataset.href; }));
  }

  const fileTag = () => `${state.from} to ${state.to}`;

  // ───── Sales ─────

  function salesReports(d) {
    const byCustomer = new Map();
    d.rows.forEach(r => {
      const s = byCustomer.get(r.o.customer_id) || { id: r.o.customer_id, name: r.name, orders: 0, billed: 0, paid: 0, balance: 0 };
      s.orders++; s.billed += r.total; s.paid += r.paid; s.balance += r.balance;
      byCustomer.set(r.o.customer_id, s);
    });
    const customerRows = [...byCustomer.values()].map(s => ({ ...s, billed: U.round2(s.billed), paid: U.round2(s.paid), balance: U.round2(s.balance) }));
    if (d.custom.length) customerRows.push({ id: '', name: 'Walk-in buyers (custom invoices)', orders: d.custom.length, billed: Reports.sum(d.custom, i => i.total), paid: Reports.sum(d.custom, i => i.total), balance: 0 });
    customerRows.sort((a, b) => b.billed - a.billed);

    const dues = d.rows.filter(r => r.balance > 0)
      .map(r => {
        const late = r.o.delivery_date ? -U.daysUntil(r.o.delivery_date) : null;
        const bucket = late == null || late < 0 ? 'Not yet due' : late <= 30 ? '0–30 days' : late <= 60 ? '31–60 days' : late <= 90 ? '61–90 days' : 'Over 90 days';
        return { ...r, late, bucket };
      })
      .sort((a, b) => (b.late ?? -1e9) - (a.late ?? -1e9));
    const BUCKETS = ['Not yet due', '0–30 days', '31–60 days', '61–90 days', 'Over 90 days'];
    const ageing = BUCKETS.map(b => {
      const rows = dues.filter(r => r.bucket === b);
      return { bucket: b, count: rows.length, amount: Reports.sum(rows, r => r.balance) };
    });

    const cust = state.tab === 'sales' ? state.customerId : '';
    const invoices = Store.list('Invoices').filter(i => {
      if (!inRange(i.date)) return false;
      if (!cust) return true;
      const o = i.type === 'Order' ? Store.get('Orders', i.order_id) : null;
      return o && o.customer_id === cust;
    }).sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.invoice_no).localeCompare(String(b.invoice_no)));
    const buyer = i => i.type === 'Custom' ? i.buyer_name : (() => { const o = Store.get('Orders', i.order_id); return o ? customerName(o.customer_id) : i.buyer_name; })();

    return {
      customers: {
        label: 'Customer-wise sales', sheet: 'Customer-wise sales', totals: true, rows: customerRows,
        href: r => r.id ? `#/customers/${encodeURIComponent(r.id)}` : '#/invoices',
        columns: [
          { label: 'Customer', value: r => r.name },
          { label: 'Orders', type: 'number', value: r => r.orders },
          { label: 'Sales', type: 'money', value: r => r.billed },
          { label: 'Paid', type: 'money', value: r => r.paid },
          { label: 'Balance', type: 'money', value: r => r.balance, cls: r => r.balance > 0 ? 'text-danger fw-semibold' : '' }
        ]
      },
      dues: {
        label: 'Order-wise dues', sheet: 'Order-wise dues', totals: true, rows: dues,
        empty: 'No pending dues for orders in this period.',
        href: r => `#/orders/${encodeURIComponent(r.o.id)}`,
        columns: [
          { label: 'Order', value: r => r.o.order_no },
          { label: 'Customer', value: r => r.name },
          { label: 'Order date', type: 'date', value: r => r.o.order_date },
          { label: 'Delivery', type: 'date', value: r => r.o.delivery_date },
          { label: 'Status', value: r => r.o.status },
          { label: 'Total', type: 'money', value: r => r.total },
          { label: 'Paid', type: 'money', value: r => r.paid },
          { label: 'Balance', type: 'money', value: r => r.balance, cls: () => 'text-danger fw-semibold' }
        ]
      },
      ageing: {
        label: 'Pending dues (ageing)', sheet: 'Dues ageing', totals: true, rows: dues,
        empty: 'No pending dues for orders in this period.',
        summary: ageing,
        href: r => `#/orders/${encodeURIComponent(r.o.id)}`,
        columns: [
          { label: 'Order', value: r => r.o.order_no },
          { label: 'Customer', value: r => r.name },
          { label: 'Delivery', type: 'date', value: r => r.o.delivery_date },
          { label: 'Days past delivery', type: 'number', value: r => r.late == null || r.late < 0 ? '' : r.late },
          { label: 'Age', value: r => r.bucket },
          { label: 'Balance', type: 'money', value: r => r.balance, cls: r => r.late > 30 ? 'text-danger fw-semibold' : 'fw-semibold' }
        ]
      },
      invoices: {
        label: 'Invoice register', sheet: 'Invoice register', totals: true, rows: invoices,
        empty: 'No invoices in this period.',
        href: r => `#/invoices/${encodeURIComponent(r.id)}`,
        columns: [
          { label: 'Invoice no', value: r => r.invoice_no },
          { label: 'Date', type: 'date', value: r => r.date },
          { label: 'Type', value: r => r.type },
          { label: 'Buyer', value: r => buyer(r) },
          { label: 'Status', value: r => r.status === 'Void' ? 'Void' : 'Issued', cls: r => r.status === 'Void' ? 'text-danger' : '' },
          { label: 'Amount', type: 'money', value: r => r.status === 'Void' ? 0 : r.total }
        ]
      }
    };
  }

  function renderSales(box) {
    const d = salesData();
    const month = U.today().slice(0, 7);
    const yearStart = `${U.today().slice(0, 4)}-01-01`;
    const all = salesData({ ignoreRange: true });
    const monthSales = U.round2(Reports.sum(all.orders.filter(o => monthOf(o.order_date) === month), o => o.total) + Reports.sum(all.custom.filter(i => monthOf(i.date) === month), i => i.total));
    const ytdSales = U.round2(Reports.sum(all.orders.filter(o => String(o.order_date) >= yearStart), o => o.total) + Reports.sum(all.custom.filter(i => String(i.date) >= yearStart), i => i.total));
    const reports = salesReports(d);
    if (!reports[state.salesReport]) state.salesReport = 'customers';
    const rep = reports[state.salesReport];

    box.innerHTML = `
      ${statCards([
        ['Sales in period', U.inr(d.sales), 'bx-rupee', 'primary', `${d.orders.length} orders${d.custom.length ? ` + ${d.custom.length} custom` : ''}`],
        ['Collected in period', U.inr(d.collected), 'bx-wallet', 'success'],
        ['Pending dues', U.inr(d.pending), 'bx-time-five', 'danger', 'on orders in period'],
        ['Orders in period', String(d.orders.length), 'bx-package', 'info', `${d.allOrders.length - d.orders.length} cancelled`],
        ['Sales this month', U.inr(monthSales), 'bx-calendar', 'warning'],
        ['Sales year to date', U.inr(ytdSales), 'bx-trending-up', 'secondary']
      ])}
      <div class="row g-4 mb-4">
        ${chartCard('ch-sales-trend', 'Monthly sales', 'Sales booked vs collected', 'col-12', 280)}
        ${chartCard('ch-top-customers', 'Top 10 customers', 'By sales in period', 'col-lg-6', 300)}
        <div class="col-lg-6"><div class="row g-4 h-100">
          ${chartCard('ch-collected', 'Collected vs pending', 'Orders in period', 'col-sm-6', 200)}
          ${chartCard('ch-status', 'Order status', 'Orders in period', 'col-sm-6', 200)}
        </div></div>
      </div>
      <div class="card">
        <div class="card-header d-flex flex-wrap gap-2 align-items-center">
          <div class="nav nav-pills flex-wrap gap-1 me-auto report-pills">
            ${Object.entries(reports).map(([k, r]) => `<button class="nav-link ${k === state.salesReport ? 'active' : ''}" data-report="${k}">${r.label}</button>`).join('')}
          </div>
          <button class="btn btn-sm btn-outline-success no-print" id="rep-export"><i class="bx bx-spreadsheet me-1"></i>Excel</button>
          <button class="btn btn-sm btn-outline-success no-print" id="rep-export-all" title="All four reports in one workbook"><i class="bx bx-spreadsheet me-1"></i>All reports</button>
        </div>
        ${rep.summary ? `<div class="card-body pb-0"><div class="row g-2">${rep.summary.map(s => `
          <div class="col"><div class="ageing-box ${s.bucket === 'Over 90 days' || s.bucket === '61–90 days' ? 'ageing-bad' : ''}">
            <small class="text-muted d-block text-nowrap">${s.bucket}</small><div class="fw-semibold">${U.inr(s.amount)}</div><small class="text-muted">${s.count} order${s.count === 1 ? '' : 's'}</small>
          </div></div>`).join('')}</div></div>` : ''}
        <div class="card-body">${reportTable(rep)}</div>
      </div>`;

    box.querySelectorAll('[data-report]').forEach(b => b.addEventListener('click', () => { state.salesReport = b.dataset.report; renderSales(box); }));
    box.querySelector('#rep-export').addEventListener('click', e => Reports.exportXlsx(`${rep.label} - ${fileTag()}`, [{ name: rep.sheet, ...rep }], e.currentTarget));
    box.querySelector('#rep-export-all').addEventListener('click', e => Reports.exportXlsx(`Sales reports - ${fileTag()}`,
      Object.values(reports).map(r => ({ name: r.sheet, ...r })), e.currentTarget));
    wireRows(box);

    const months = trendMonths();
    const trend = monthlySales(months);
    Reports.chart(box.querySelector('#ch-sales-trend'), {
      type: 'bar',
      data: {
        labels: months.map(Reports.monthLabel),
        datasets: [
          { label: 'Sales', data: trend.map(t => t.sales), backgroundColor: '#ea580c', borderRadius: 4, order: 2 },
          { label: 'Collected', data: trend.map(t => t.collected), type: 'line', borderColor: '#16a34a', backgroundColor: '#16a34a', tension: .3, order: 1 }
        ]
      },
      options: { plugins: { tooltip: Reports.moneyTooltip }, scales: { y: { beginAtZero: true, ticks: { callback: Reports.moneyTick } } } }
    });
    const top = reports.customers.rows.filter(r => r.id).slice(0, 10);
    Reports.chart(box.querySelector('#ch-top-customers'), {
      type: 'bar',
      data: { labels: top.map(r => r.name.length > 22 ? r.name.slice(0, 21) + '…' : r.name), datasets: [{ label: 'Sales', data: top.map(r => r.billed), backgroundColor: '#2563eb', borderRadius: 4 }] },
      options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: Reports.moneyTooltip }, scales: { x: { beginAtZero: true, ticks: { callback: Reports.moneyTick } } } }
    });
    const collectedOnOrders = Reports.sum(d.rows, r => Math.min(r.paid, r.total));
    Reports.chart(box.querySelector('#ch-collected'), {
      type: 'doughnut',
      data: { labels: ['Collected', 'Pending'], datasets: [{ data: [collectedOnOrders, d.pending], backgroundColor: ['#16a34a', '#dc2626'] }] },
      options: { cutout: '65%', plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => `${c.label}: ${U.inr(c.raw)}` } } } }
    });
    const statuses = ['Pending', 'In Production', 'Ready', 'Delivered', 'Cancelled'];
    const counts = statuses.map(s => d.allOrders.filter(o => (o.status || 'Pending') === s).length);
    Reports.chart(box.querySelector('#ch-status'), {
      type: 'doughnut',
      data: { labels: statuses, datasets: [{ data: counts, backgroundColor: statuses.map(s => STATUS_COLORS[s]) }] },
      options: { cutout: '65%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } } } }
    });
  }

  // ───── Expenses ─────

  function renderExpenses(box) {
    const list = expenseData();
    const all = expenseData({ ignoreRange: true });
    const month = U.today().slice(0, 7);
    const year = U.today().slice(0, 4);
    const byCat = [...Reports.groupSum(list, e => e.category, e => e.amount)].sort((a, b) => b[1] - a[1]);
    const byVendor = [...Reports.groupSum(list.filter(e => e.category === 'Purchase' && e.vendor_name), e => e.vendor_name, e => e.amount)].sort((a, b) => b[1] - a[1]);
    const total = Reports.sum(list, e => e.amount);
    const reg = list.filter(e => !state.expCategory || e.category === state.expCategory).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const register = {
      label: 'Expense register', sheet: 'Expenses', totals: true, rows: reg,
      empty: 'No expenses in this period.',
      href: r => `#/expenses/${encodeURIComponent(r.id)}`,
      columns: [
        { label: 'Date', type: 'date', value: r => r.date },
        { label: 'Category', value: r => r.category },
        { label: 'Vendor', value: r => r.vendor_name },
        { label: 'Description', value: r => r.description },
        { label: 'Amount', type: 'money', value: r => r.amount }
      ]
    };

    box.innerHTML = `
      ${statCards([
        ['Expenses in period', U.inr(total), 'bx-money-withdraw', 'danger', `${list.length} entries`],
        ['This month', U.inr(Reports.sum(all.filter(e => monthOf(e.date) === month), e => e.amount)), 'bx-calendar', 'warning'],
        ['Year to date', U.inr(Reports.sum(all.filter(e => String(e.date).startsWith(year)), e => e.amount)), 'bx-trending-up', 'info'],
        ['Top category', byCat.length ? U.esc(byCat[0][0]) : '—', 'bx-category', 'primary', byCat.length ? U.inr(byCat[0][1]) : ''],
        ['Top vendor', byVendor.length ? U.esc(byVendor[0][0]) : '—', 'bx-store', 'success', byVendor.length ? U.inr(byVendor[0][1]) : ''],
        ['Purchases', U.inr(Reports.sum(list.filter(e => e.category === 'Purchase'), e => e.amount)), 'bx-cart', 'secondary']
      ])}
      <div class="row g-4 mb-4">
        ${chartCard('ch-exp-trend', 'Monthly expenses', 'Stacked by category', 'col-12', 280)}
        ${chartCard('ch-exp-cat', 'By category', 'In period', 'col-lg-5', 280)}
        ${chartCard('ch-exp-vendor', 'Purchases by vendor', 'Top 10 in period', 'col-lg-7', 280)}
      </div>
      <div class="card">
        <div class="card-header d-flex flex-wrap gap-2 align-items-center">
          <h6 class="mb-0 me-auto">Expense register</h6>
          <select class="form-select form-select-sm w-auto no-print" id="reg-cat">
            <option value="">All categories</option>
            ${['Purchase', 'Rent', 'Travel', 'Salaries', 'Maintenance', 'Miscellaneous'].map(c => `<option ${c === state.expCategory ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
          <button class="btn btn-sm btn-outline-success no-print" id="rep-export"><i class="bx bx-spreadsheet me-1"></i>Excel</button>
        </div>
        <div class="card-body">${reportTable(register)}</div>
      </div>`;

    box.querySelector('#reg-cat').addEventListener('change', e => { state.expCategory = e.target.value; renderExpenses(box); });
    box.querySelector('#rep-export').addEventListener('click', e => Reports.exportXlsx(`Expenses - ${state.expCategory || 'All'} - ${fileTag()}`, [{ name: register.sheet, ...register }], e.currentTarget));
    wireRows(box);

    const months = trendMonths();
    const cats = ['Purchase', 'Rent', 'Travel', 'Salaries', 'Maintenance', 'Miscellaneous'];
    Reports.chart(box.querySelector('#ch-exp-trend'), {
      type: 'bar',
      data: {
        labels: months.map(Reports.monthLabel),
        datasets: cats.map((c, i) => {
          const g = Reports.groupSum(all.filter(e => e.category === c), e => monthOf(e.date), e => e.amount);
          return { label: c, data: months.map(m => g.get(m) || 0), backgroundColor: Reports.COLORS[i], borderRadius: 2 };
        }).filter(ds => ds.data.some(v => v))
      },
      options: { plugins: { tooltip: Reports.moneyTooltip }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { callback: Reports.moneyTick } } } }
    });
    Reports.chart(box.querySelector('#ch-exp-cat'), {
      type: 'doughnut',
      data: { labels: byCat.map(c => c[0]), datasets: [{ data: byCat.map(c => c[1]), backgroundColor: byCat.map(c => Reports.COLORS[cats.indexOf(c[0])] || '#9ca3af') }] },
      options: { cutout: '60%', plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => `${c.label}: ${U.inr(c.raw)}` } } } }
    });
    const topV = byVendor.slice(0, 10);
    Reports.chart(box.querySelector('#ch-exp-vendor'), {
      type: 'bar',
      data: { labels: topV.map(v => v[0].length > 22 ? v[0].slice(0, 21) + '…' : v[0]), datasets: [{ label: 'Purchases', data: topV.map(v => v[1]), backgroundColor: '#ea580c', borderRadius: 4 }] },
      options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: Reports.moneyTooltip }, scales: { x: { beginAtZero: true, ticks: { callback: Reports.moneyTick } } } }
    });
  }

  // ───── Profit ─────

  function renderProfit(box) {
    const d = salesData();
    const exp = expenseData();
    const expTotal = Reports.sum(exp, e => e.amount);
    const profit = U.round2(d.sales - expTotal);
    const cash = U.round2(d.collected - expTotal);
    const months = trendMonths();
    const ms = monthlySales(months);
    const expByMonth = Reports.groupSum(expenseData({ ignoreRange: true }), e => monthOf(e.date), e => e.amount);
    const monthly = ms.map(m => {
      const e = expByMonth.get(m.month) || 0;
      return { month: m.month, sales: m.sales, expenses: e, profit: U.round2(m.sales - e), collected: m.collected, cash: U.round2(m.collected - e) };
    });
    const yearly = [...monthly.reduce((map, m) => {
      const y = m.month.slice(0, 4);
      const t = map.get(y) || { year: y, sales: 0, expenses: 0, profit: 0, collected: 0, cash: 0 };
      ['sales', 'expenses', 'profit', 'collected', 'cash'].forEach(k => { t[k] = U.round2(t[k] + m[k]); });
      return map.set(y, t);
    }, new Map()).values()];
    const neg = k => r => r[k] < 0 ? 'text-danger fw-semibold' : 'fw-semibold';
    const cols = first => [first,
      { label: 'Sales', type: 'money', value: r => r.sales },
      { label: 'Expenses', type: 'money', value: r => r.expenses },
      { label: 'Profit', type: 'money', value: r => r.profit, cls: neg('profit') },
      { label: 'Collected', type: 'money', value: r => r.collected },
      { label: 'Cash (collected − expenses)', type: 'money', value: r => r.cash, cls: neg('cash') }];
    const monthlySpec = { sheet: 'Monthly', totals: true, rows: monthly, columns: cols({ label: 'Month', value: r => Reports.monthLabel(r.month) }) };
    const yearlySpec = { sheet: 'Yearly', totals: true, rows: yearly, columns: cols({ label: 'Year', value: r => r.year }) };
    const margin = d.sales > 0 ? `${Math.round((profit / d.sales) * 100)}% of sales` : '';

    box.innerHTML = `
      ${statCards([
        ['Sales', U.inr(d.sales), 'bx-rupee', 'primary'],
        ['Expenses', U.inr(expTotal), 'bx-money-withdraw', 'danger'],
        ['Profit', U.inr(profit), profit < 0 ? 'bx-trending-down' : 'bx-trending-up', profit < 0 ? 'danger' : 'success', margin],
        ['Collected', U.inr(d.collected), 'bx-wallet', 'info'],
        ['Cash view', U.inr(cash), 'bx-coin-stack', cash < 0 ? 'danger' : 'warning', 'collected − expenses'],
        ['Pending dues', U.inr(d.pending), 'bx-time-five', 'secondary', 'still to collect']
      ])}
      <div class="row g-4 mb-4">
        ${chartCard('ch-profit', 'Monthly profit', 'Sales and expenses, with profit as a line', 'col-12', 300)}
      </div>
      <div class="card mb-4">
        <div class="card-header d-flex align-items-center gap-2">
          <h6 class="mb-0 me-auto">Month by month</h6>
          <button class="btn btn-sm btn-outline-success no-print" id="rep-export"><i class="bx bx-spreadsheet me-1"></i>Excel</button>
        </div>
        <div class="card-body">${reportTable(monthlySpec, 36)}</div>
      </div>
      <div class="card">
        <div class="card-header"><h6 class="mb-0">By year</h6></div>
        <div class="card-body">${reportTable(yearlySpec)}</div>
      </div>
      <p class="small text-muted mt-3 mb-0">Profit counts sales when the order is booked. The cash view counts money actually received.${months.length !== Reports.monthsBetween(state.from, state.to).length ? ' The monthly chart and tables show the last 6 months because the selected period is short.' : ''}</p>`;

    box.querySelector('#rep-export').addEventListener('click', e => Reports.exportXlsx(`Profit - ${fileTag()}`, [monthlySpec, yearlySpec].map(s => ({ name: s.sheet, ...s })), e.currentTarget));

    Reports.chart(box.querySelector('#ch-profit'), {
      type: 'bar',
      data: {
        labels: months.map(Reports.monthLabel),
        datasets: [
          { label: 'Sales', data: monthly.map(m => m.sales), backgroundColor: '#fdba74', borderRadius: 4, order: 2 },
          { label: 'Expenses', data: monthly.map(m => m.expenses), backgroundColor: '#fca5a5', borderRadius: 4, order: 2 },
          { label: 'Profit', data: monthly.map(m => m.profit), type: 'line', borderColor: '#16a34a', backgroundColor: '#16a34a', tension: .3, order: 1 }
        ]
      },
      options: { plugins: { tooltip: Reports.moneyTooltip }, scales: { y: { ticks: { callback: Reports.moneyTick } } } }
    });
  }

  // ───── Shell ─────

  function render(el, params) {
    const tab = TABS.find(t => t.id === params[0]) ? params[0] : 'sales';
    applyPreset();
    const customers = Store.list('Customers').slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
    if (state.customerId && !Store.get('Customers', state.customerId)) state.customerId = '';

    el.innerHTML = `
      <div class="d-flex flex-wrap gap-2 align-items-center mb-3">
        <div class="nav nav-pills dash-tabs me-auto">
          ${TABS.map(t => `<a class="nav-link ${t.id === tab ? 'active' : ''}" href="#/dashboards/${t.id}"><i class="bx ${t.icon} me-1"></i>${t.label}</a>`).join('')}
        </div>
        <button class="btn btn-sm btn-outline-secondary no-print d-none d-md-inline-block" id="dash-print"><i class="bx bx-printer me-1"></i>Print</button>
      </div>
      <div class="card mb-4 no-print"><div class="card-body py-3">
        <div class="row g-2 align-items-end">
          <div class="col-12 col-md-3">
            <label class="form-label small mb-1" for="dash-preset">Period</label>
            <select class="form-select" id="dash-preset">${PRESETS.map(([k, l]) => `<option value="${k}" ${k === state.preset ? 'selected' : ''}>${l}</option>`).join('')}</select>
          </div>
          <div class="col-6 col-md-2">
            <label class="form-label small mb-1" for="dash-from">From</label>
            <input type="date" class="form-control" id="dash-from" value="${state.from}" max="${U.today()}">
          </div>
          <div class="col-6 col-md-2">
            <label class="form-label small mb-1" for="dash-to">To</label>
            <input type="date" class="form-control" id="dash-to" value="${state.to}">
          </div>
          ${tab === 'sales' ? `
          <div class="col-12 col-md-5">
            <label class="form-label small mb-1" for="dash-customer">Customer</label>
            <select class="form-select" id="dash-customer">
              <option value="">All customers</option>
              ${customers.map(c => `<option value="${U.esc(c.id)}" ${c.id === state.customerId ? 'selected' : ''}>${U.esc(c.name)}${c.company_name ? ` (${U.esc(c.company_name)})` : ''}</option>`).join('')}
            </select>
          </div>` : ''}
        </div>
      </div></div>
      <div class="print-only mb-3">
        <h4 class="mb-0">${U.esc(APP_CONFIG.companyName)} — ${TABS.find(t => t.id === tab).label} dashboard</h4>
        <small id="dash-print-sub"></small>
      </div>
      <p class="small text-muted mb-3 no-print" id="dash-period"></p>
      <div id="dash-body"></div>`;

    const preset = el.querySelector('#dash-preset');
    const from = el.querySelector('#dash-from');
    const to = el.querySelector('#dash-to');
    preset.addEventListener('change', () => { state.preset = preset.value; applyPreset(); from.value = state.from; to.value = state.to; update(el, params); });
    const custom = () => {
      if (!from.value || !to.value) return;
      state.preset = 'custom'; preset.value = 'custom';
      state.from = from.value <= to.value ? from.value : to.value;
      state.to = from.value <= to.value ? to.value : from.value;
      update(el, params);
    };
    from.addEventListener('change', custom);
    to.addEventListener('change', custom);
    const cust = el.querySelector('#dash-customer');
    if (cust) cust.addEventListener('change', () => { state.customerId = cust.value; update(el, params); });
    el.querySelector('#dash-print').addEventListener('click', () => window.print());
    update(el, params);
  }

  function update(el, params) {
    const box = el.querySelector('#dash-body');
    if (!box) return;
    const tab = TABS.find(t => t.id === params[0]) ? params[0] : 'sales';
    state.tab = tab;
    if (state.preset === 'all') applyPreset();
    const who = tab === 'sales' && state.customerId ? ` · ${customerName(state.customerId)}` : '';
    el.querySelector('#dash-period').textContent = periodLabel() + who;
    el.querySelector('#dash-print-sub').textContent = `${periodLabel()}${who} · printed ${U.fmtDate(U.today())}`;
    if (tab === 'expenses') renderExpenses(box);
    else if (tab === 'profit') renderProfit(box);
    else renderSales(box);
  }

  return {
    title: 'Dashboards',
    refreshOn: ['Orders', 'Payments', 'Invoices', 'Expenses', 'Customers'],
    render,
    update
  };
})();
