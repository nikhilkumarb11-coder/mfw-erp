Views.home = {
  title: 'Home',
  refreshOn: ['Orders', 'Payments', 'Invoices', 'Customers'],

  render(el) {
    const m = Metrics.thisMonth();
    const reminders = Metrics.reminders();
    const customers = new Map(Store.list('Customers').map(c => [c.id, c]));
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    const stat = (label, value, icon, color) => `
      <div class="col-6 col-lg-3">
        <div class="card h-100"><div class="card-body">
          <div class="d-flex align-items-center justify-content-between mb-2">
            <span class="text-muted small fw-semibold">${label}</span>
            <span class="avatar-initial rounded bg-label-${color} stat-icon"><i class="bx ${icon}"></i></span>
          </div>
          <h4 class="mb-0 stat-value">${value}</h4>
        </div></div>
      </div>`;

    const reminderRows = reminders.map(({ order, days }) => {
      const c = customers.get(order.customer_id);
      const when = days < 0 ? `${-days} day${days === -1 ? '' : 's'} overdue` : days === 0 ? 'Today' : `In ${days} day${days === 1 ? '' : 's'}`;
      return `
        <a href="#/orders/${encodeURIComponent(order.id)}" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center ${days < 0 ? 'reminder-overdue' : ''}">
          <div class="me-2">
            <div class="fw-semibold">${U.esc(c ? c.name : 'Unknown customer')} <span class="text-muted small">${U.esc(order.order_no || '')}</span></div>
            <div class="small text-muted">${U.fmtDate(order.delivery_date)} · Balance ${U.inr(Metrics.balanceFor(order))}</div>
          </div>
          <span class="badge ${days < 0 ? 'bg-danger' : days <= 1 ? 'bg-warning' : 'bg-label-primary'}">${when}</span>
        </a>`;
    }).join('');

    el.innerHTML = `
      <div class="card mb-4 welcome-card">
        <div class="card-body d-flex align-items-center justify-content-between gap-3">
          <div>
            <h5 class="card-title text-primary mb-1">${greeting}!</h5>
            <p class="mb-0 text-muted">${U.fmtDate(U.today())} · ${U.esc(Store.settings().company_name || APP_CONFIG.companyName)}</p>
          </div>
          <img src="${APP_CONFIG.logo}" alt="" class="welcome-logo">
        </div>
      </div>

      <div class="row g-3 mb-4">
        ${stat('Sales this month', U.inr(m.sales), 'bx-trending-up', 'primary')}
        ${stat('Collected this month', U.inr(m.collected), 'bx-wallet', 'success')}
        ${stat('Pending dues', U.inr(m.pending), 'bx-time-five', 'warning')}
        ${stat('Orders this month', m.orderCount, 'bx-package', 'info')}
      </div>

      <div class="row g-4">
        <div class="col-lg-7">
          <div class="card h-100">
            <div class="card-header d-flex align-items-center justify-content-between">
              <h5 class="mb-0">Delivery reminders</h5>
              <span class="badge bg-label-${reminders.length ? 'danger' : 'secondary'}">${reminders.length}</span>
            </div>
            ${reminders.length
              ? `<div class="list-group list-group-flush">${reminderRows}</div>`
              : `<div class="card-body text-center text-muted py-5">
                   <i class="bx bx-calendar-check display-6 d-block mb-2"></i>
                   No deliveries due in the next ${APP_CONFIG.reminderDays} days.
                 </div>`}
          </div>
        </div>
        <div class="col-lg-5">
          <div class="card h-100">
            <div class="card-header"><h5 class="mb-0">Quick actions</h5></div>
            <div class="card-body">
              <div class="quick-grid">
                ${QUICK_ACTIONS.map(a => `
                  <a href="${a.href}" class="quick-tile">
                    <i class="bx ${a.icon}"></i><span>${a.label}</span>
                  </a>`).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }
};
