(() => {
Views.home = {
  title: 'Home',
  refreshOn: ['Orders', 'Payments', 'Invoices', 'Customers'],

  render(el) {
    const today = U.today();
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - (5 - i), 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    const series = months.map(ym => Metrics.thisMonth(ym));
    const m = series[5];
    const last = series[4];
    const reminders = Metrics.reminders();
    const overdue = reminders.filter(r => r.days < 0).length;
    const customers = new Map(Store.list('Customers', { includeDeleted: true }).map(c => [c.id, c]));
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const monthName = new Date(`${today.slice(0, 7)}-01T00:00:00`).toLocaleString('en-IN', { month: 'long' });

    const topDues = [...Metrics.customerStats().entries()]
      .filter(([, s]) => s.balance > 0)
      .sort((a, b) => b[1].balance - a[1].balance)
      .slice(0, 5)
      .map(([id, s]) => ({ c: customers.get(id), s }))
      .filter(x => x.c);

    const kpi = (label, value, sub, icon, tone, values) => `
      <div class="col-6 col-md-3">
        <div class="kpi-card h-100">
          <div class="d-flex align-items-start justify-content-between gap-2">
            <span class="action-icon tone-${tone}"><i class="bx ${icon}"></i></span>
            ${values ? spark(values, tone) : ''}
          </div>
          <div class="kpi-label">${label}</div>
          <div class="kpi-value">${value}</div>
          <div class="kpi-sub">${sub}</div>
        </div>
      </div>`;

    const reminderRows = reminders.map(({ order, days }) => {
      const c = customers.get(order.customer_id);
      const [, mo, d] = String(order.delivery_date).split('-');
      const when = days < 0 ? `${-days} day${days === -1 ? '' : 's'} late` : days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`;
      const tone = days < 0 ? 'danger' : days <= 1 ? 'warning' : 'neutral';
      return `
        <a href="#/orders/${encodeURIComponent(order.id)}" class="feed-row">
          <span class="date-tile date-${tone}"><b>${Number(d)}</b><small>${Reports.MONTHS[Number(mo) - 1]}</small></span>
          <span class="min-w-0 flex-grow-1">
            <span class="feed-title">${U.esc(c ? c.name : 'Unknown customer')}</span>
            <span class="feed-sub">${U.esc(order.order_no || '')} · Balance ${U.inr(Metrics.balanceFor(order))}</span>
          </span>
          <span class="chip chip-${tone}">${when}</span>
        </a>`;
    }).join('');

    const dueRows = topDues.map(({ c, s }) => `
      <a href="#/customers/${encodeURIComponent(c.id)}" class="feed-row">
        <span class="avatar-chip" style="--hue:${hue(c.name)}">${U.esc(initials(c.name))}</span>
        <span class="min-w-0 flex-grow-1">
          <span class="feed-title">${U.esc(c.name)}</span>
          <span class="feed-sub">${U.esc(c.location || '')} · ${s.orders} order${s.orders === 1 ? '' : 's'}</span>
        </span>
        <span class="feed-amount">${U.inr(s.balance)}</span>
      </a>`).join('');

    el.innerHTML = `
      <div class="home-fit">
      <div class="row g-3">
        <div class="col-lg-8">
          <section class="home-hero h-100">
            <div class="hero-top">
              <div class="min-w-0">
                <div class="hero-greet">${greeting}</div>
                <div class="hero-company text-truncate">${U.esc(Store.settings().company_name || APP_CONFIG.companyName)}</div>
              </div>
              <span class="hero-logo"><img src="${APP_CONFIG.logo}" alt=""></span>
            </div>
            <div class="hero-body">
              <div>
                <div class="hero-label">Sales in ${monthName}</div>
                <div class="hero-amount">${U.inr(m.sales)}</div>
                <div class="hero-meta">
                  <span><i class="bx bx-wallet"></i> Collected ${U.inr(m.collected)}</span>
                  <span><i class="bx bx-history"></i> Last month ${U.inr(last.sales)}</span>
                </div>
              </div>
              <div class="hero-spark d-none d-md-block">${spark(series.map(s => s.sales), 'white', 260, 72)}</div>
            </div>
            <div class="hero-actions d-none d-md-flex">
              <a href="#/orders/new" class="btn hero-btn"><i class="bx bx-plus me-1"></i>New order</a>
              <a href="#/payments/new" class="btn hero-btn hero-btn-ghost"><i class="bx bx-wallet me-1"></i>Record payment</a>
            </div>
          </section>
        </div>
        <div class="col-lg-4">
          <div class="card quick-card h-100">
            <div class="card-body">
              <div class="section-title mb-3">Quick actions</div>
              <div class="action-grid">
                ${QUICK_ACTIONS.map(a => `
                  <a href="${a.href}" class="action-tile">
                    <span class="action-icon tone-${a.tone}"><i class="bx ${a.icon}"></i></span><span>${a.label}</span>
                  </a>`).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="row g-3">
        ${kpi('Collected', U.inr(m.collected), `Last month ${U.inr(last.collected)}`, 'bx-wallet', 'green', series.map(s => s.collected))}
        ${kpi('Orders', m.orderCount, `Last month ${last.orderCount}`, 'bx-package', 'orange', series.map(s => s.orderCount))}
        ${kpi('Pending dues', U.inr(m.pending), `Across ${m.pendingOrders} order${m.pendingOrders === 1 ? '' : 's'}`, 'bx-time-five', 'amber')}
        ${kpi('Deliveries due', reminders.length, overdue ? `<span class="text-danger">${overdue} overdue</span>` : `Next ${APP_CONFIG.reminderDays} days`, 'bx-calendar-event', 'blue')}
      </div>

      <div class="row g-3 home-lists">
        <div class="col-lg-7">
          <div class="card h-100">
            <div class="card-header section-head">
              <div><div class="section-title">Delivery reminders</div><div class="section-sub">Due in the next ${APP_CONFIG.reminderDays} days, and anything late</div></div>
              <a href="#/orders" class="btn btn-sm btn-text-secondary">All orders</a>
            </div>
            ${reminders.length
              ? `<div class="feed">${reminderRows}</div>`
              : `<div class="empty-state"><span class="action-icon tone-green"><i class="bx bx-calendar-check"></i></span>
                   <div>No deliveries due in the next ${APP_CONFIG.reminderDays} days.</div></div>`}
          </div>
        </div>
        <div class="col-lg-5">
          <div class="card h-100">
            <div class="card-header section-head">
              <div><div class="section-title">Top dues</div><div class="section-sub">Customers with the largest balance</div></div>
              <a href="#/dashboards/sales" class="btn btn-sm btn-text-secondary">Reports</a>
            </div>
            ${topDues.length
              ? `<div class="feed">${dueRows}</div>`
              : `<div class="empty-state"><span class="action-icon tone-green"><i class="bx bx-check-double"></i></span>
                   <div>Nobody owes anything right now.</div></div>`}
          </div>
        </div>
      </div>
      </div>`;
  }
};

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  return ((parts[0] || '')[0] + ((parts[1] || '')[0] || '')).toUpperCase();
}

function hue(name) {
  let h = 0;
  for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

let sparkSeq = 0;
/** Tiny SVG trend line; no chart library needed on Home. */
function spark(values, tone, w = 96, h = 36) {
  const max = Math.max(...values, 1);
  const step = w / Math.max(values.length - 1, 1);
  const pts = values.map((v, i) => [i * step, h - 3 - (v / max) * (h - 8)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const id = `spark${++sparkSeq}`;
  const [lx, ly] = pts[pts.length - 1];
  return `
    <svg class="spark spark-${tone}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="currentColor" stop-opacity=".28"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/>
      </linearGradient></defs>
      <path d="${line} L${w},${h} L0,${h} Z" fill="url(#${id})"/>
      <path d="${line}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="3" fill="currentColor"/>
    </svg>`;
}
})();
