/**
 * Printable documents (invoice, proforma, receipt): built as HTML on the
 * company letterhead, previewed on screen, turned into a PDF in the browser
 * and shared to WhatsApp.
 */
const Docs = (() => {
  const SIZES = {
    a4: { w: 794, h: 1123, mmW: 210, mmH: 297 },
    a5: { w: 559, h: 794, mmW: 148, mmH: 210 }
  };
  const LIBS = [
    'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
    'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'
  ];
  const DEFAULT_TERMS = [
    '50% advance must be paid upon order placement.',
    'The balance must be paid upon delivery.',
    'No Exchange & No Returns.',
    'If any wrong firing, we are not responsible.'
  ].join('\n');

  function profile() {
    const s = Store.settings();
    return {
      signName: s.doc_sign_name || 'MADEENA GRAND FIREWORKS',
      terms: String('invoice_terms' in s ? s.invoice_terms : DEFAULT_TERMS).split('\n').map(t => t.trim()).filter(Boolean),
      footer: s.invoice_footer || ''
    };
  }

  const itemsFor = (table, key, id) => Store.list(table).filter(i => i[key] === id)
    .sort((a, b) => (Number(a.sort) || 0) - (Number(b.sort) || 0));

  /** Non-void payments of an order in the order they were made. */
  function orderPayments(orderId) {
    return Store.list('Payments').filter(p => p.order_id === orderId && p.status !== 'Void')
      .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.created_at).localeCompare(String(b.created_at)));
  }

  function customerTo(c) {
    if (!c) return { name: 'Unknown customer' };
    return { name: c.company_name || c.name, attn: c.company_name ? c.name : '', address: c.location, phone: c.contact_no };
  }

  // ───── Document data ─────

  function proforma(order) {
    const c = Store.get('Customers', order.customer_id);
    const paid = U.round2(orderPayments(order.id).reduce((s, p) => s + (Number(p.amount) || 0), 0));
    const total = U.round2(order.total);
    return {
      kind: 'proforma', size: 'a4', title: 'Proforma Invoice',
      fileName: `Proforma-${order.order_no || 'order'}`,
      meta: [['Order No', order.order_no || '—'], ['Date', U.fmtDate(U.today())], ['Delivery', U.fmtDate(order.delivery_date)]],
      to: customerTo(c),
      items: itemsFor('OrderItems', 'order_id', order.id),
      totals: [['Total Amount', total], ['Advance Paid', paid], ['Due Amount', U.round2(total - paid), 'grand']],
      words: total,
      terms: true,
      phone: c && c.contact_no,
      message: `Dear ${c ? c.name : 'Customer'}, please find the proforma invoice for order ${order.order_no || ''}. ` +
        `Total ₹${U.money(total)}, advance paid ₹${U.money(paid)}, due ₹${U.money(total - paid)}.`
    };
  }

  function invoice(inv) {
    const order = inv.type === 'Order' ? Store.get('Orders', inv.order_id) : null;
    const c = order ? Store.get('Customers', order.customer_id) : null;
    const total = U.round2(inv.total);
    const isVoid = inv.status === 'Void';
    const to = { name: inv.buyer_name, attn: c && c.company_name && c.company_name === inv.buyer_name ? c.name : '', address: inv.buyer_address, phone: inv.buyer_contact };
    const meta = [['Invoice No', inv.invoice_no || 'Pending'], ['Date', U.fmtDate(inv.date)]];
    if (order) meta.push(['Order No', order.order_no || '—']);
    return {
      kind: 'invoice', size: 'a4', title: 'Invoice',
      fileName: `Invoice-${String(inv.invoice_no || 'pending').replace(/\//g, '-')}`,
      meta, to,
      items: itemsFor('InvoiceItems', 'invoice_id', inv.id),
      totals: [['Total Amount', total], ['Amount Paid', total], ['Due Amount', 0, 'grand']],
      words: total,
      terms: true,
      stamp: isVoid ? 'void' : 'paid',
      note: isVoid && inv.void_reason ? `Voided: ${inv.void_reason}` : '',
      phone: inv.buyer_contact,
      message: `Dear ${inv.buyer_name}, please find attached invoice ${inv.invoice_no} dated ${U.fmtDate(inv.date)} for ₹${U.money(total)}. Thank you for your business!`
    };
  }

  function receipt(payment) {
    const order = Store.get('Orders', payment.order_id);
    const c = order ? Store.get('Customers', order.customer_id) : null;
    const total = U.round2(order ? order.total : 0);
    const isVoid = payment.status === 'Void';
    const list = orderPayments(payment.order_id);
    const upto = isVoid ? list : list.slice(0, list.findIndex(p => p.id === payment.id) + 1);
    const paidSoFar = U.round2(upto.reduce((s, p) => s + (Number(p.amount) || 0), 0));
    const amount = U.round2(payment.amount);
    return {
      kind: 'receipt', size: 'a5', title: 'Payment Receipt',
      fileName: `Receipt-${payment.receipt_no || 'pending'}`,
      meta: [['Receipt No', payment.receipt_no || 'Pending'], ['Date', U.fmtDate(payment.date)], ['Order No', order ? order.order_no || '—' : '—']],
      to: customerTo(c),
      amount,
      totals: [['Order Total', total], ['Paid till date', paidSoFar], ['Balance', U.round2(total - paidSoFar), 'grand']],
      words: amount,
      stamp: isVoid ? 'void' : null,
      note: payment.note,
      phone: c && c.contact_no,
      message: `Dear ${c ? c.name : 'Customer'}, we have received ₹${U.money(amount)} on ${U.fmtDate(payment.date)} towards order ${order ? order.order_no : ''}` +
        ` (receipt ${payment.receipt_no}). Balance: ₹${U.money(total - paidSoFar)}. Thank you!`
    };
  }

  // ───── HTML ─────

  function partyHtml(d) {
    const t = d.to;
    return `
      <div class="doc-party">
        <div class="doc-label">${d.kind === 'receipt' ? 'Received from' : 'Bill to'}</div>
        <div class="doc-to-name">${U.esc(t.name)}</div>
        ${t.attn ? `<div>Attn: ${U.esc(t.attn)}</div>` : ''}
        ${t.address ? `<div>${U.esc(t.address)}</div>` : ''}
        ${t.phone ? `<div>Ph: ${U.esc(t.phone)}</div>` : ''}
      </div>
      <table class="doc-meta">${d.meta.map(([k, v]) => `<tr><td>${k}</td><td>${U.esc(v)}</td></tr>`).join('')}</table>`;
  }

  function totalsHtml(d) {
    return `<table class="doc-totals">${d.totals.map(([k, v, cls]) =>
      `<tr class="${cls === 'grand' ? 'doc-grand' : ''}"><td>${k}</td><td class="num">Rs. ${U.money(v)}</td></tr>`).join('')}</table>`;
  }

  function render(d) {
    const p = profile();
    const stamp = d.stamp === 'void' ? '<div class="doc-void">VOID</div>' : '';
    const paidStamp = d.stamp === 'paid' ? '<div class="doc-stamp">PAID</div>' : '';
    const head = `
      <img class="doc-letterhead" src="assets/letterhead.jpg" alt="">
      <div class="doc-rule"></div>
      <div class="doc-title">${U.esc(d.title)}</div>`;
    const sign = `
      <div class="doc-sign">
        <div class="doc-sign-name">For ${U.esc(p.signName)}</div>
        <div class="doc-sign-line">Proprietor</div>
      </div>`;

    if (d.kind === 'receipt') {
      return `
        <div class="doc-page doc-a5">${head}${stamp}
          <div class="doc-parties">${partyHtml(d)}</div>
          <div class="doc-amount-box">
            <div class="doc-label">Amount received</div>
            <div class="doc-amount">Rs. ${U.money(d.amount)}</div>
            <div class="doc-words-inline">${U.inWords(d.words)}</div>
          </div>
          ${totalsHtml(d)}
          ${d.note ? `<div class="doc-note">Note: ${U.esc(d.note)}</div>` : ''}
          <div class="doc-spacer"></div>
          <div class="doc-bottom"><div class="doc-thanks">Thank you for your payment.</div>${sign}</div>
          <div class="doc-foot">This is a computer-generated receipt.</div>
        </div>`;
    }

    return `
      <div class="doc-page doc-a4">${head}${stamp}
        <div class="doc-parties">${partyHtml(d)}</div>
        <table class="doc-items">
          <colgroup><col style="width:52px"><col><col style="width:96px"><col style="width:120px"><col style="width:140px"></colgroup>
          <thead><tr><th class="doc-sno">S.No</th><th>Item</th><th class="num">Quantity</th><th class="num">Price (Rs.)</th><th class="num">Total (Rs.)</th></tr></thead>
          <tbody>${d.items.map((it, i) => `
            <tr><td class="doc-sno">${i + 1}</td><td>${U.esc(it.item_name)}</td><td class="num">${U.esc(it.qty)}</td>
              <td class="num">${U.money(it.rate)}</td><td class="num">${U.money(it.amount)}</td></tr>`).join('')}
          </tbody>
        </table>
        <div class="doc-summary">
          <div class="doc-words"><div class="doc-label">Amount in words</div>${U.inWords(d.words)}${paidStamp}</div>
          ${totalsHtml(d)}
        </div>
        ${d.note ? `<div class="doc-note">${U.esc(d.note)}</div>` : ''}
        <div class="doc-spacer"></div>
        <div class="doc-bottom">
          <div class="doc-terms">${d.terms && p.terms.length ? `
            <div class="doc-terms-title">Terms &amp; Conditions:</div>
            <ol>${p.terms.map(t => `<li>${U.esc(t)}</li>`).join('')}</ol>` : ''}
          </div>
          ${sign}
        </div>
        <div class="doc-foot">${p.footer ? U.esc(p.footer) + ' · ' : ''}This is a computer-generated ${d.kind === 'proforma' ? 'proforma invoice' : 'invoice'}.</div>
      </div>`;
  }

  /** Shows a document scaled to fit its container; rescales when the container resizes. */
  function preview(container, d) {
    const size = SIZES[d.size];
    container.innerHTML = `<div class="doc-viewport"><div class="doc-fit"><div class="doc-scaler">${render(d)}</div></div></div>`;
    const viewport = container.querySelector('.doc-viewport');
    const fitBox = container.querySelector('.doc-fit');
    const scaler = container.querySelector('.doc-scaler');
    const fit = () => {
      const avail = viewport.clientWidth - 24;
      if (avail <= 0) return;
      const s = Math.min(1, avail / size.w);
      scaler.style.transform = `scale(${s})`;
      fitBox.style.width = `${size.w * s}px`;
      fitBox.style.height = `${scaler.firstElementChild.offsetHeight * s}px`;
    };
    fit();
    container.querySelectorAll('img').forEach(img => img.addEventListener('load', fit));
    const ro = new ResizeObserver(() => { if (!viewport.isConnected) ro.disconnect(); else fit(); });
    ro.observe(viewport);
  }

  // ───── PDF ─────

  let libsPromise = null;
  function loadLibs() {
    if (!libsPromise) {
      libsPromise = Promise.all(LIBS.map(src => new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = () => reject(new Error('Could not load the PDF tools. Check the internet connection.'));
        document.head.appendChild(s);
      }))).catch(err => { libsPromise = null; throw err; });
    }
    return libsPromise;
  }

  async function toPdf(d) {
    const size = SIZES[d.size];
    await loadLibs();
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const host = document.createElement('div');
    host.className = 'doc-render-host';
    host.innerHTML = render(d);
    document.body.appendChild(host);
    try {
      const page = host.firstElementChild;
      await Promise.all([...page.querySelectorAll('img')].map(img =>
        img.complete ? null : new Promise(r => { img.onload = img.onerror = r; })));
      const canvas = await window.html2canvas(page, {
        scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true,
        scrollX: 0, scrollY: 0, windowWidth: size.w + 40
      });
      const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: d.size, compress: true });
      const pagePx = Math.floor(canvas.width * size.mmH / size.mmW);
      for (let y = 0, n = 0; y < canvas.height - 4; y += pagePx, n++) {
        const h = Math.min(pagePx, canvas.height - y);
        const slice = document.createElement('canvas');
        slice.width = canvas.width;
        slice.height = h;
        slice.getContext('2d').drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
        if (n) pdf.addPage();
        pdf.addImage(slice.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, size.mmW, h * size.mmW / canvas.width);
      }
      return pdf.output('blob');
    } finally {
      host.remove();
    }
  }

  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  const isPhone = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || matchMedia('(pointer: coarse)').matches;

  async function withBusy(btn, label, fn) {
    const html = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>${label}`;
    try {
      return await fn();
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      console.error(err);
      UI.toast(err.message || 'Could not create the PDF', 'danger');
    } finally {
      btn.disabled = false;
      btn.innerHTML = html;
    }
  }

  async function download(d, btn) {
    await withBusy(btn, 'Preparing…', async () => {
      saveBlob(await toPdf(d), d.fileName + '.pdf');
    });
  }

  /**
   * Phones: the share sheet with the PDF attached (pick WhatsApp).
   * Desktop: downloads the PDF and opens a WhatsApp chat with the message.
   */
  async function share(d, btn) {
    const phone = String(d.phone || '').replace(/\D/g, '').slice(-10);
    const waUrl = `https://wa.me/${phone.length === 10 ? '91' + phone : ''}?text=${encodeURIComponent(d.message)}`;
    const usePhoneShare = isPhone() && navigator.canShare;
    // Opened before the slow PDF step so the popup blocker treats it as a click.
    const win = usePhoneShare ? null : window.open('about:blank', '_blank');
    let sent = false;
    await withBusy(btn, 'Preparing…', async () => {
      const blob = await toPdf(d);
      const file = new File([blob], d.fileName + '.pdf', { type: 'application/pdf' });
      if (usePhoneShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text: d.message, title: d.title });
          return;
        } catch (err) {
          if (err.name === 'AbortError') return;
        }
      }
      saveBlob(blob, file.name);
      if (win) win.location.href = waUrl;
      else window.open(waUrl, '_blank');
      sent = true;
      UI.toast('PDF downloaded — attach it in the WhatsApp chat.', 'info');
    });
    if (win && !sent) win.close();
  }

  /** Download + WhatsApp buttons wired to a document (or disabled with a reason). */
  function actionsHtml(disabledReason) {
    const dis = disabledReason ? `disabled title="${U.esc(disabledReason)}"` : '';
    return `
      <button class="btn btn-sm btn-outline-primary" data-doc="download" ${dis}><i class="bx bx-download me-1"></i>PDF</button>
      <button class="btn btn-sm btn-success" data-doc="share" ${dis}><i class="bx bxl-whatsapp me-1"></i>WhatsApp</button>`;
  }

  function wireActions(root, getDoc) {
    root.querySelectorAll('[data-doc]').forEach(btn => btn.addEventListener('click', () => {
      const d = getDoc();
      if (btn.dataset.doc === 'download') download(d, btn);
      else share(d, btn);
    }));
  }

  return { DEFAULT_TERMS, proforma, invoice, receipt, render, preview, toPdf, download, share, actionsHtml, wireActions, orderPayments, loadLibs };
})();
