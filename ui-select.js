/**
 * Icon dropdown: replaces the look of the "Hylian version" <select> with a menu that shows a small icon on the left
 * of every row. The real <select> stays in the page (hidden) and remains the source of truth, so the rest of the
 * code keeps reading `select.value` and listening to its `change` event. Icons come from each <option>'s data-icon.
 * Without JavaScript the plain <select> is simply used.
 */
(function () {
  'use strict';
  const sel = document.getElementById('hylianVersion');
  if (!sel) return;

  const NS = 'http://www.w3.org/2000/svg';
  const wrap = document.createElement('div');
  wrap.className = 'icon-select';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'hylianVersionBtn';
  btn.className = 'icon-select-btn';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  const btnIcon = Object.assign(document.createElement('img'), { className: 'is-icon', alt: '', width: 28, height: 28 });
  const btnText = Object.assign(document.createElement('span'), { className: 'is-text' });
  const chevron = document.createElementNS(NS, 'svg');
  chevron.setAttribute('viewBox', '0 0 20 20');
  chevron.setAttribute('class', 'is-chevron');
  chevron.setAttribute('aria-hidden', 'true');
  chevron.innerHTML = '<path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>';
  btn.append(btnIcon, btnText, chevron);

  const list = document.createElement('ul');
  list.id = 'hylianVersionList';
  list.className = 'icon-select-list';
  list.setAttribute('role', 'listbox');
  list.tabIndex = -1;
  list.hidden = true;
  btn.setAttribute('aria-controls', list.id);

  wrap.append(btn, list);
  sel.insertAdjacentElement('afterend', wrap);
  sel.classList.add('is-native-hidden');
  sel.tabIndex = -1;
  sel.setAttribute('aria-hidden', 'true');
  const label = document.querySelector('label[for="hylianVersion"]');
  if (label) { label.htmlFor = btn.id; btn.setAttribute('aria-labelledby', (label.id ? label.id + ' ' : '') + btn.id); }

  let rows = [];      // [{ li, option }]
  let active = -1;
  let typed = '', typedTimer;

  const iconOf = (o) => o.getAttribute('data-icon') || '';
  const textOf = (o) => o.textContent.trim();

  function sync() {
    const o = sel.options[sel.selectedIndex];
    if (!o) return;
    btnIcon.src = iconOf(o);
    btnText.textContent = textOf(o);
  }

  function build() {
    list.textContent = '';
    rows = [];
    const addOption = (o) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.id = 'hv-opt-' + o.value;
      li.className = 'is-option';
      li.setAttribute('aria-selected', String(o.selected));
      if (o.disabled) li.setAttribute('aria-disabled', 'true');
      const img = Object.assign(document.createElement('img'), { className: 'is-icon', alt: '', width: 26, height: 26, src: iconOf(o) });
      const span = Object.assign(document.createElement('span'), { textContent: textOf(o) });
      li.append(img, span);
      li.addEventListener('mousemove', () => setActive(rows.findIndex((r) => r.li === li)));
      li.addEventListener('click', () => choose(o));
      list.appendChild(li);
      rows.push({ li, option: o });
    };
    [...sel.children].forEach((child) => {
      if (child.tagName === 'OPTGROUP') {
        const h = document.createElement('li');
        h.setAttribute('role', 'presentation');
        h.className = 'is-group';
        h.textContent = child.label;
        list.appendChild(h);
        [...child.children].forEach(addOption);
      } else addOption(child);
    });
  }

  function setActive(i) {
    if (i < 0 || i >= rows.length) return;
    rows.forEach((r) => r.li.classList.remove('is-active'));
    active = i;
    rows[i].li.classList.add('is-active');
    list.setAttribute('aria-activedescendant', rows[i].li.id);
    // scroll only inside the menu (scrollIntoView would also scroll the whole page)
    const li = rows[i].li;
    if (li.offsetTop < list.scrollTop) list.scrollTop = li.offsetTop - 4;
    else if (li.offsetTop + li.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = li.offsetTop + li.offsetHeight - list.clientHeight + 4;
  }

  function open() {
    build();
    list.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    setActive(Math.max(0, rows.findIndex((r) => r.option.selected)));
    list.focus({ preventScroll: true });
  }

  function close(returnFocus) {
    list.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    if (returnFocus) btn.focus({ preventScroll: true });
  }

  function choose(o) {
    if (o.disabled) return;
    if (sel.value !== o.value) {
      sel.value = o.value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    sync();
    close(true);
  }

  const step = (dir) => {
    let i = active;
    do { i += dir; } while (i >= 0 && i < rows.length && rows[i].option.disabled);
    if (i >= 0 && i < rows.length) setActive(i);
  };

  btn.addEventListener('click', () => (list.hidden ? open() : close(true)));
  btn.addEventListener('keydown', (e) => {
    if (['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); if (list.hidden) open(); }
  });
  list.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); step(1); break;
      case 'ArrowUp': e.preventDefault(); step(-1); break;
      case 'Home': e.preventDefault(); setActive(0); break;
      case 'End': e.preventDefault(); setActive(rows.length - 1); break;
      case 'Enter': case ' ': e.preventDefault(); if (rows[active]) choose(rows[active].option); break;
      case 'Escape': e.preventDefault(); close(true); break;
      case 'Tab': close(false); break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { // type-ahead
          typed += e.key.toLowerCase();
          clearTimeout(typedTimer);
          typedTimer = setTimeout(() => { typed = ''; }, 700);
          const i = rows.findIndex((r) => !r.option.disabled && textOf(r.option).toLowerCase().startsWith(typed));
          if (i >= 0) setActive(i);
        }
    }
  });
  document.addEventListener('pointerdown', (e) => { if (!list.hidden && !wrap.contains(e.target)) close(false); });
  sel.addEventListener('change', sync);
  sync();
})();
