/**
 * Editable list of line items (item name, qty, rate → amount) with a running
 * total. Used by orders now and by quotations and invoices later.
 *
 *   const editor = ItemsEditor.mount(container, { items, onChange: total => {} });
 *   editor.getItems()  → [{ id?, item_name, qty, rate, amount }]
 *   editor.total()     → number
 *   editor.validate()  → error message or ''
 */
const ItemsEditor = (() => {
  function mount(container, { items = [], onChange = () => {} } = {}) {
    container.innerHTML = `
      <div class="items-head d-none d-md-grid">
        <span>Item</span><span class="text-end">Qty</span><span class="text-end">Rate (₹)</span><span class="text-end">Amount</span><span></span>
      </div>
      <div class="items-rows"></div>
      <button type="button" class="btn btn-sm btn-outline-primary mt-2" data-add><i class="bx bx-plus me-1"></i>Add item</button>`;
    const rowsEl = container.querySelector('.items-rows');

    function amountOf(row) {
      const qty = Number(row.querySelector('[data-f="qty"]').value) || 0;
      const rate = Number(row.querySelector('[data-f="rate"]').value) || 0;
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
          <div class="item-remove"><button type="button" class="btn btn-icon btn-sm btn-text-danger" title="Remove item" aria-label="Remove item"><i class="bx bx-trash"></i></button></div>
        </div>`);
      rowsEl.appendChild(row);

      const nameInput = row.querySelector('[data-f="item_name"]');
      const rateInput = row.querySelector('[data-f="rate"]');
      Typeahead.attach(nameInput, {
        minChars: 1,
        source: q => Metrics.itemSuggestions(q).map(m => ({ label: m.name, sub: `Last rate ${U.inr(m.rate)} · used ${m.count}×`, value: m })),
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
    recalc();

    return {
      getItems() {
        return [...rowsEl.querySelectorAll('.item-row')]
          .map(row => ({
            id: row.dataset.id || undefined,
            item_name: row.querySelector('[data-f="item_name"]').value.trim(),
            qty: U.round2(row.querySelector('[data-f="qty"]').value),
            rate: U.round2(row.querySelector('[data-f="rate"]').value),
            amount: amountOf(row)
          }))
          .filter(it => it.item_name || it.rate || it.id);
      },
      total() {
        return U.round2(this.getItems().reduce((s, it) => s + it.amount, 0));
      },
      validate() {
        const items = this.getItems();
        if (!items.length) return 'Add at least one item';
        for (const it of items) {
          if (!it.item_name) return 'Every item needs a name';
          if (!(it.qty > 0)) return `Quantity for "${it.item_name}" must be more than 0`;
          if (it.rate < 0) return `Rate for "${it.item_name}" can't be negative`;
        }
        return '';
      }
    };
  }

  return { mount };
})();
