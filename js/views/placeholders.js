/** Screens that arrive in later phases, the Money hub, and the not-found page. */
(() => {
  const UPCOMING = {
    expenses:   { title: 'Expenses', icon: 'bx-money-withdraw', phase: 4, points: ['Purchase, Rent, Travel, Salaries, Maintenance, Misc.', 'Vendor names for purchases', 'Filters by month, category and vendor'] },
    dashboards: { title: 'Dashboards', icon: 'bx-bar-chart-alt-2', phase: 4, points: ['Sales, expenses and profit charts', 'Pending dues ageing', 'Excel export'] }
  };

  Object.entries(UPCOMING).forEach(([id, v]) => {
    Views[id] = {
      title: v.title,
      render(el) {
        el.innerHTML = `
          <div class="card coming-soon">
            <div class="card-body text-center py-5">
              <span class="coming-icon"><i class="bx ${v.icon}"></i></span>
              <h4 class="mt-3 mb-1">${v.title}</h4>
              <span class="badge bg-label-primary mb-4">Coming in Phase ${v.phase}</span>
              <ul class="list-unstyled text-start mx-auto mb-0" style="max-width: 22rem">
                ${v.points.map(p => `<li class="mb-2 d-flex gap-2"><i class="bx bx-check text-primary fs-5"></i><span>${p}</span></li>`).join('')}
              </ul>
            </div>
          </div>`;
      }
    };
  });

  Views.money = {
    title: 'Money',
    refreshOn: ['Payments', 'Orders', 'Invoices'],
    render(el) {
      const m = Metrics.thisMonth();
      const month = U.today().slice(0, 7);
      const invoiced = Store.list('Invoices').filter(i => i.status !== 'Void' && String(i.date).startsWith(month));
      const stats = [
        ['Collected this month', U.inr(m.collected), 'bx-wallet', 'success'],
        ['Pending dues', U.inr(m.pending), 'bx-time-five', 'danger'],
        ['Invoices this month', String(invoiced.length), 'bx-receipt', 'info'],
        ['Invoiced value', U.inr(invoiced.reduce((s, i) => s + (Number(i.total) || 0), 0)), 'bx-rupee', 'primary']
      ];
      const tiles = [
        { href: '#/payments/new', label: 'Add payment', icon: 'bx-plus-circle', note: 'Against an order, with receipt' },
        { href: '#/payments', label: 'Payments', icon: 'bx-wallet', note: 'Receipts & balances' },
        { href: '#/invoices', label: 'Invoices', icon: 'bx-receipt', note: 'Final & custom invoices' },
        { href: '#/invoices/new', label: 'Custom invoice', icon: 'bx-store', note: 'Walk-in buyer' },
        { href: '#/expenses', label: 'Expenses', icon: 'bx-money-withdraw', note: 'Coming in Phase 4' }
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
