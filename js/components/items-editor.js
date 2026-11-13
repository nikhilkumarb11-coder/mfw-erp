/**
 * Editable list of line items. Order mode: name, qty, rate → amount.
 * Event mode: description + price only (qty locked to 1).
 *
 *   const editor = ItemsEditor.mount(container, { items, mode, onChange });
 *   editor.setMode('event'|'order')
 *   editor.getItems()  → [{ id?, item_name, qty, rate, amount }]
 *   editor.total()     → number
 *   editor.validate()  → error message or ''
 */
const ItemsEditor = (() => {
  function mount(container, { items = [], mode = 'order', onChange = () => {} } = {}) {
    let eventMode = String(mode) === 'event';

    container.innerHTML = `
      <div class="items-head d-none d-md-grid">
        <span data-h-name>Item</span><span class="text-end" data-h-qty>Qty</span>
        <span class="text-end" data-h-rate>Rate (₹)</span><span class="text-end" data-h-amount>Amount</span><span></span>
      </div>
      <div class="items-rows"></div>
      <button type="button" class="btn btn-sm btn-outline-primary mt-2" data-add><i class="bx bx-plus me-1"></i><span data-add-label>Add item</span></button>`;
    const rowsEl = container.querySelector('.items-rows');
    const head = container.querySelector('.items-head');

    function applyChrome() {
      container.classList.toggle('items-editor-event', eventMode);
      head.querySelector('[data-h-name]').textContent = eventMode ? 'Description' : 'Item';
      head.querySelector('[data-h-qty]').classList.toggle('d-none', eventMode);
      head.querySelector('[data-h-rate]').textContent = eventMode ? 'Price (₹)' : 'Rate (₹)';
      head.querySelector('[data-h-amount]').classList.toggle('d-none', eventMode);
      container.querySelector('[data-add-label]').textContent = eventMode ? 'Add line' : 'Add item';
      rowsEl.querySelectorAll('.item-row').forEach(syncRowLabels);
    }

    function syncRowLabels(row) {
      const qty = row.querySelector('.item-qty');
      const amount = row.querySelector('.item-amount');
      const rateLabel = row.querySelector('.item-rate .small');
      const nameInput = row.querySelector('[data-f="item_name"]');
      qty.classList.toggle('d-none', eventMode);
      amount.classList.toggle('d-none', eventMode);
      if (rateLabel) rateLabel.textContent = eventMode ? 'Price (₹)' : 'Rate (₹)';
      if (nameInput) nameInput.placeholder = eventMode ? 'Description' : 'Item name';
      if (eventMode) row.querySelector('[data-f="qty"]').value = 1;
    }

    function amountOf(row) {
      const rate = Number(row.querySelector('[data-f="rate"]').value) || 0;
      if (eventMode) return U.round2(rate);
      const qty = Number(row.querySelector('[data-f="qty"]').value) || 0;
      return U.round2(qty * rate);
    }

    function recalc() {
      let total = 0;
      rowsEl.querySelectorAll('.item-row').forEach(row => {
        const amt = amountOf(row);
        row.querySelector('[data-amount]').textContent = U.inr(amt);
        total += amt;
      });
      onChange(U.round2(total));
    }

    function addRow(item = {}) {
      const row = U.el(`
        <div class="item-row" data-id="${U.esc(item.id || '')}">
          <div class="item-name"><input class="form-control" data-f="item_name" placeholder="Item name" value="${U.esc(item.item_name || '')}"></div>
          <div class="item-qty"><label class="d-md-none small text-muted">Qty</label>
            <input class="form-control text-end" data-f="qty" type="number" inputmode="decimal" min="0" step="any" value="${item.qty != null ? U.esc(item.qty) : 1}"></div>
          <div class="item-rate"><label class="d-md-none small text-muted">Rate (₹)</label>
            <input class="form-control text-end" data-f="rate" type="number" inputmode="decimal" min="0" step="any" value="${item.rate != null ? U.esc(item.rate) : ''}"></div>
          <div class="item-amount"><label class="d-md-none small text-muted">Amount</label>
            <div class="fw-semibold text-end" data-amount>₹0</div></div>
          <div class="item-remove"><button type="button" class="btn btn-icon btn-sm btn-text-danger" title="Remove" aria-label="Remove"><i class="bx bx-trash"></i></button></div>
        </div>`);
      rowsEl.appendChild(row);
      syncRowLabels(row);

      const nameInput = row.querySelector('[data-f="item_name"]');
      const rateInput = row.querySelector('[data-f="rate"]');
      Typeahead.attach(nameInput, {
        minChars: 1,
        source: q => {
          const list = eventMode ? Metrics.eventDescSuggestions(q) : Metrics.itemSuggestions(q);
          return list.map(m => ({
            label: m.name,
            sub: eventMode
              ? `Last price ${U.inr(m.rate)} · used ${m.count}×`
              : `Last rate ${U.inr(m.rate)} · used ${m.count}×`,
            value: m
          }));
        },
        onPick: it => {
          nameInput.value = it.value.name;
          if (!rateInput.value || rateInput.dataset.auto === '1') {
            rateInput.value = it.value.rate;
            rateInput.dataset.auto = '1';
          }
          recalc();
          rateInput.focus();
          rateInput.select();
        }
      });
      rateInput.addEventListener('input', () => { rateInput.dataset.auto = ''; });
      row.querySelectorAll('input').forEach(i => i.addEventListener('input', recalc));
      row.querySelector('.item-remove button').addEventListener('click', () => {
        row.remove();
        if (!rowsEl.children.length) addRow();
        recalc();
      });
      return row;
    }

    container.querySelector('[data-add]').addEventListener('click', () => {
      addRow().querySelector('[data-f="item_name"]').focus();
    });

    (items.length ? items : [{}]).forEach(addRow);
    applyChrome();
    recalc();

    return {
      setMode(next) {
        const nextEvent = String(next) === 'event';
        if (nextEvent === eventMode) return;
        eventMode = nextEvent;
        applyChrome();
        recalc();
      },
      getMode() { return eventMode ? 'event' : 'order'; },
      getItems() {
        return [...rowsEl.querySelectorAll('.item-row')]
          .map(row => {
            const rate = U.round2(row.querySelector('[data-f="rate"]').value);
            const qty = eventMode ? 1 : U.round2(row.querySelector('[data-f="qty"]').value);
            return {
              id: row.dataset.id || undefined,
              item_name: row.querySelector('[data-f="item_name"]').value.trim(),
              qty,
              rate,
              amount: eventMode ? rate : U.round2(qty * rate)
            };
          })
          .filter(it => it.item_name || it.rate || it.id);
      },
      total() {
        return U.round2(this.getItems().reduce((s, it) => s + it.amount, 0));
      },
      validate() {
        const list = this.getItems();
        if (!list.length) return eventMode ? 'Add at least one line' : 'Add at least one item';
        for (const it of list) {
          if (!it.item_name) return eventMode ? 'Every line needs a description' : 'Every item needs a name';
          if (!eventMode && !(it.qty > 0)) return `Quantity for "${it.item_name}" must be more than 0`;
          if (it.rate < 0) return eventMode
            ? `Price for "${it.item_name}" can't be negative`
            : `Rate for "${it.item_name}" can't be negative`;
        }
        return '';
      }
    };
  }

  return { mount };
})();
