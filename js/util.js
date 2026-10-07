/** Small shared helpers: formatting, ids, dates, validation. */
const U = (() => {
  const VERHOEFF_D = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
  ];
  const VERHOEFF_P = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
  ];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const pad = n => String(n).padStart(2, '0');

  return {
    uuid() {
      if (crypto.randomUUID) return crypto.randomUUID();
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 15);
        return (c === 'x' ? r : (r & 3) | 8).toString(16);
      });
    },

    nowIso: () => new Date().toISOString(),

    /** Local calendar date as yyyy-mm-dd. */
    today(d = new Date()) {
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    },

    /** "2026-10-07" → "07 Oct 2026" */
    fmtDate(ymd) {
      if (!ymd) return '';
      const [y, m, d] = String(ymd).slice(0, 10).split('-');
      if (!d) return String(ymd);
      return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
    },

    /** ISO timestamp → "07 Oct, 4:05 pm" */
    fmtDateTime(iso) {
      if (!iso) return '';
      const d = new Date(iso);
      if (isNaN(d)) return '';
      return `${pad(d.getDate())} ${MONTHS[d.getMonth()]}, ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`;
    },

    timeAgo(iso) {
      if (!iso) return 'never';
      const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
      if (s < 10) return 'just now';
      if (s < 60) return `${s}s ago`;
      if (s < 3600) return `${Math.floor(s / 60)} min ago`;
      if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
      return U.fmtDateTime(iso);
    },

    /** Whole days from today to ymd (negative = overdue). */
    daysUntil(ymd) {
      const [y, m, d] = String(ymd).split('-').map(Number);
      const target = new Date(y, m - 1, d);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return Math.round((target - today) / 86400000);
    },

    round2: n => Math.round((Number(n) || 0) * 100) / 100,

    inr(n) {
      const v = U.round2(n);
      const s = '₹' + Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
      return v < 0 ? '-' + s : s;
    },

    /** Plain amount with Indian grouping and 2 decimals, for printed documents: 2,40,000.00 */
    money(n) {
      return U.round2(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },

    /** 240000 → "Rupees Two Lakh Forty Thousand Only" (Indian numbering). */
    inWords(n) {
      const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
        'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
      const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
      const two = x => x < 20 ? ONES[x] : TENS[Math.floor(x / 10)] + (x % 10 ? ' ' + ONES[x % 10] : '');
      const three = x => [x >= 100 ? ONES[Math.floor(x / 100)] + ' Hundred' : '', two(x % 100)].filter(Boolean).join(' ');
      const words = x => {
        if (!x) return '';
        return [
          x >= 1e7 ? words(Math.floor(x / 1e7)) + ' Crore' : '',
          Math.floor(x / 1e5) % 100 ? two(Math.floor(x / 1e5) % 100) + ' Lakh' : '',
          Math.floor(x / 1000) % 100 ? two(Math.floor(x / 1000) % 100) + ' Thousand' : '',
          three(x % 1000)
        ].filter(Boolean).join(' ');
      };
      const v = U.round2(Math.abs(n));
      const rupees = Math.floor(v);
      const paise = Math.round((v - rupees) * 100);
      return `Rupees ${words(rupees) || 'Zero'}${paise ? ' and ' + two(paise) + ' Paise' : ''} Only`;
    },

    esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    isPhone: s => /^\d{10}$/.test(String(s || '')),

    /** 12 digits, not starting with 0/1, valid Verhoeff checksum (as UIDAI issues them). */
    isAadhar(s) {
      const v = String(s || '');
      if (!/^[2-9]\d{11}$/.test(v)) return false;
      let c = 0;
      v.split('').reverse().forEach((ch, i) => { c = VERHOEFF_D[c][VERHOEFF_P[i % 8][Number(ch)]]; });
      return c === 0;
    },

    debounce(fn, ms) {
      let t;
      return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
    },

    /** Parses an HTML string into a single element. */
    el(html) {
      const t = document.createElement('template');
      t.innerHTML = html.trim();
      return t.content.firstElementChild;
    }
  };
})();
