/** The Money hub and the not-found page. */
(() => {
  Views.money = {
    title: 'Money',
    refreshOn: ['Payments', 'Orders', 'Invoices', 'Expenses'],
    render(el) {
      const m = Metrics.thisMonth();
      const month = U.today().slice(0, 7);
      const spent = Store.list('Expenses').filter(e => String(e.date).startsWith(month)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const stats = [
        ['Collected this month', U.inr(m.collected), 'bx-wallet', 'success'],
        ['Pending dues', U.inr(m.pending), 'bx-time-five', 'danger'],
        ['Sales this month', U.inr(m.sales), 'bx-rupee', 'primary'],
        ['Expenses this month', U.inr(spent), 'bx-money-withdraw', 'warning']
      ];
      const tiles = [
        { href: '#/payments/new', label: 'Add payment', icon: 'bx-plus-circle', note: 'Against an order, with receipt' },
        { href: '#/payments', label: 'Payments', icon: 'bx-wallet', note: 'Receipts & balances' },
        { href: '#/invoices', label: 'Invoices', icon: 'bx-receipt', note: 'Final & custom invoices' },
        { href: '#/invoices/new', label: 'Custom invoice', icon: 'bx-store', note: 'Walk-in buyer' },
        { href: '#/expenses/new', label: 'Add expense', icon: 'bx-plus-circle', note: 'Purchase, rent, travel…' },
        { href: '#/expenses', label: 'Expenses', icon: 'bx-money-withdraw', note: 'Filter by month, category, vendor' },
        { href: '#/dashboards', label: 'Dashboards', icon: 'bx-bar-chart-alt-2', note: 'Sales, expenses & profit' }
      ];
      el.innerHTML = `
        <div class="row g-3 mb-4">${stats.map(([label, value, icon, color]) => `
          <div class="col-6 col-lg-3"><div class="card h-100"><div class="card-body">
            <span class="avatar-initial rounded bg-label-${color} stat-icon mb-2"><i class="bx ${icon}"></i></span>
            <small class="text-muted d-block">${label}</small><h5 class="mb-0">${value}</h5>
          </div></div></div>`).join('')}
        </div>
        <div class="row g-3">${tiles.map(t => `
          <div class="col-12 col-md-6 col-xl-4">
            <a href="${t.href}" class="card card-link h-100"><div class="card-body d-flex align-items-center gap-3">
              <span class="avatar-initial rounded bg-label-primary stat-icon"><i class="bx ${t.icon}"></i></span>
              <div><h6 class="mb-0">${t.label}</h6><small class="text-muted">${t.note}</small></div>
              <i class="bx bx-chevron-right ms-auto text-muted"></i>
            </div></a>
          </div>`).join('')}</div>`;
    }
  };

  Views.notfound = {
    title: 'Not found',
    render(el) {
      el.innerHTML = `<div class="card"><div class="card-body text-center py-5">
        <h4>Page not found</h4><a href="#/home" class="btn btn-primary mt-2">Go home</a></div></div>`;
    }
  };
})();
