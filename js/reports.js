/**
 * Shared tools for reports: Excel export (SheetJS), charts (Chart.js) and
 * money/period helpers. Both libraries load on first use only.
 *
 *   Reports.exportXlsx('Expenses Oct 2026', [{
 *     name: 'Expenses',
 *     columns: [{ label: 'Date', type: 'date', value: r => r.date }, { label: 'Amount', type: 'money', value: r => r.amount }],
 *     rows
 *   }], buttonEl)
 */
const Reports = (() => {
  const XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
  const CHART_URL = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js';
  const COLORS = ['#ea580c', '#2563eb', '#16a34a', '#9333ea', '#dc2626', '#0891b2', '#ca8a04', '#db2777', '#4b5563', '#65a30d'];
  const loading = {};

  function loadScript(src, what) {
    if (!loading[src]) {
      loading[src] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = () => { delete loading[src]; reject(new Error(`Could not load the ${what}. Check the internet connection.`)); };
        document.head.appendChild(s);
      });
    }
    return loading[src];
  }

  const num = v => Number(v) || 0;
  const sum = (rows, f) => U.round2(rows.reduce((s, r) => s + num(f(r)), 0));

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  /** '2026-10' → 'Oct 2026' */
  const monthLabel = ym => ym ? `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}` : '';

  /** The last n months ending with `end` ('YYYY-MM'), oldest first. */
  function lastMonths(n, end = U.today().slice(0, 7)) {
    let y = Number(end.slice(0, 4));
    let m = Number(end.slice(5, 7));
    const out = [];
    for (let i = 0; i < n; i++) {
      out.unshift(`${y}-${String(m).padStart(2, '0')}`);
      if (--m === 0) { m = 12; y--; }
    }
    return out;
  }

  /** Months from..to inclusive ('YYYY-MM-DD' or 'YYYY-MM'), the latest 36 at most. */
  function monthsBetween(from, to) {
    const out = [];
    let y = Number(from.slice(0, 4));
    let m = Number(from.slice(5, 7));
    const endKey = to.slice(0, 7);
    while (out.length < 1200) {
      const key = `${y}-${String(m).padStart(2, '0')}`;
      out.push(key);
      if (key >= endKey) break;
      if (++m === 13) { m = 1; y++; }
    }
    return out.slice(-36);
  }

  function groupSum(rows, keyFn, valFn) {
    const map = new Map();
    rows.forEach(r => {
      const k = keyFn(r);
      map.set(k, U.round2((map.get(k) || 0) + num(valFn(r))));
    });
    return map;
  }

  // ───── Excel ─────

  function toDate(ymd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || ''));
    return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : '';
  }

  function buildSheet(spec) {
    const header = spec.columns.map(c => c.label);
    const body = spec.rows.map(r => spec.columns.map(c => {
      const v = c.value(r);
      if (c.type === 'date') return toDate(v);
      if (c.type === 'money' || c.type === 'number') return v === '' || v == null ? '' : num(v);
      return v == null ? '' : String(v);
    }));
    const totals = spec.totals ? spec.columns.map((c, i) => {
      if (i === 0) return 'Total';
      return c.type === 'money' && c.total !== false ? sum(spec.rows, c.value) : '';
    }) : null;
    const aoa = [header, ...body, ...(totals ? [totals] : [])];
    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
    spec.columns.forEach((c, ci) => {
      const fmt = c.type === 'date' ? 'dd-mmm-yyyy' : c.type === 'money' ? '#,##0.00' : null;
      if (!fmt) return;
      for (let ri = 1; ri < aoa.length; ri++) {
        const cell = ws[XLSX.utils.encode_cell({ r: ri, c: ci })];
        if (cell && cell.t !== 's') cell.z = fmt;
      }
    });
    ws['!cols'] = spec.columns.map((c, ci) => {
      const longest = aoa.reduce((w, row) => Math.max(w, String(row[ci] instanceof Date ? '00-Mmm-0000' : row[ci] ?? '').length), 4);
      return { wch: Math.min(Math.max(longest + 2, c.type === 'money' ? 14 : 8), 48) };
    });
    return ws;
  }

  /** sheets: [{ name, columns: [{ label, value(row), type?: 'date'|'money'|'number' }], rows, totals? }] */
  async function exportXlsx(fileName, sheets, btn) {
    const html = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Exporting…'; }
    try {
      await loadScript(XLSX_URL, 'Excel tools');
      const wb = XLSX.utils.book_new();
      sheets.forEach(s => XLSX.utils.book_append_sheet(wb, buildSheet(s), s.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31)));
      XLSX.writeFile(wb, `${fileName.replace(/[\\/:*?"<>|]/g, '-')}.xlsx`, { compression: true });
    } catch (err) {
      console.error(err);
      UI.toast(err.message || 'Export failed', 'danger');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = html; }
    }
  }

  // ───── Charts ─────

  const charts = new Map();

  /** Draws (or redraws) a Chart.js chart into a <canvas>; old charts on detached canvases are freed. */
  async function chart(canvas, config) {
    await loadScript(CHART_URL, 'chart tools');
    charts.forEach((c, el) => { if (!el.isConnected || el === canvas) { c.destroy(); charts.delete(el); } });
    if (!canvas.isConnected) return null;
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.color = '#697a8d';
    const c = new Chart(canvas, {
      ...config,
      options: { responsive: true, maintainAspectRatio: false, animation: { duration: 300 }, ...(config.options || {}) }
    });
    charts.set(canvas, c);
    return c;
  }

  const moneyTick = v => {
    const n = Math.abs(v);
    const s = n >= 1e7 ? `${U.round2(n / 1e7)}Cr` : n >= 1e5 ? `${U.round2(n / 1e5)}L` : n >= 1e3 ? `${U.round2(n / 1e3)}K` : String(n);
    return `${v < 0 ? '-' : ''}₹${s}`;
  };
  const moneyTooltip = { callbacks: { label: ctx => `${ctx.dataset.label ? ctx.dataset.label + ': ' : ''}${U.inr(ctx.raw)}` } };

  return { loadScript, exportXlsx, chart, COLORS, MONTHS, monthLabel, lastMonths, monthsBetween, groupSum, sum, num, moneyTick, moneyTooltip };
})();
