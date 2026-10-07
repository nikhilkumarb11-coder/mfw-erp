/**
 * Suggestion dropdown under a text input. Free typing still works; picking a
 * suggestion calls onPick.
 *
 *   Typeahead.attach(input, {
 *     source: query => [{ label, sub?, value }],
 *     onPick: item => {},
 *     footer?: () => html            // e.g. an "Add new customer" link
 *   })
 */
const Typeahead = (() => {
  function attach(input, { source, onPick, footer, minChars = 0, limit = 8 }) {
    const wrap = document.createElement('div');
    wrap.className = 'typeahead-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const menu = document.createElement('div');
    menu.className = 'dropdown-menu typeahead-menu';
    wrap.appendChild(menu);
    input.setAttribute('autocomplete', 'off');

    let items = [];
    let active = -1;

    function close() {
      menu.classList.remove('show');
      active = -1;
    }

    function open() {
      const q = input.value.trim();
      if (q.length < minChars) { close(); return; }
      items = source(q).slice(0, limit);
      const foot = footer ? footer(q) : '';
      if (!items.length && !foot) { close(); return; }
      menu.innerHTML = items.map((it, i) => `
        <button type="button" class="dropdown-item typeahead-item" data-i="${i}">
          <div class="text-truncate">${U.esc(it.label)}</div>
          ${it.sub ? `<small class="text-muted text-truncate d-block">${U.esc(it.sub)}</small>` : ''}
        </button>`).join('') + (foot ? `<div class="dropdown-divider my-1"></div>${foot}` : '');
      active = -1;
      menu.classList.add('show');
    }

    function highlight(i) {
      const buttons = menu.querySelectorAll('.typeahead-item');
      buttons.forEach(b => b.classList.remove('active'));
      if (i >= 0 && buttons[i]) {
        buttons[i].classList.add('active');
        buttons[i].scrollIntoView({ block: 'nearest' });
      }
      active = i;
    }

    function pick(i) {
      const it = items[i];
      if (!it) return;
      close();
      onPick(it);
    }

    input.addEventListener('input', open);
    input.addEventListener('focus', open);
    input.addEventListener('blur', () => setTimeout(close, 150));
    input.addEventListener('keydown', e => {
      if (!menu.classList.contains('show')) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); highlight(Math.min(active + 1, items.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(Math.max(active - 1, 0)); }
      else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(active); }
      else if (e.key === 'Escape') close();
    });
    // mousedown keeps focus in the input so blur doesn't close the menu before the click lands
    menu.addEventListener('mousedown', e => e.preventDefault());
    menu.addEventListener('click', e => {
      const btn = e.target.closest('.typeahead-item');
      if (btn) pick(Number(btn.dataset.i));
    });

    return { close, refresh: open };
  }

  return { attach };
})();
