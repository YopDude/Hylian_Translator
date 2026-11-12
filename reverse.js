/**
 * Hylian -> real world (the "⇆" swap).
 *
 * Replaces the text box with an on-screen keyboard of the selected Hylian script and shows the transliteration
 * in the chosen real-world language. Each key adds a romanisation (a Latin letter, or a Hepburn romaji syllable
 * for the kana-based scripts); jsMapping/reverseTransliteration.js turns that into the output language.
 *
 * Depends on script.js (font helpers, glyph maps) and wanakana (Japanese output), which are loaded before it.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const card = $('translatorCard'), bar = $('directionBar'), swapBtn = $('swapBtn');
  const versionSel = $('hylianVersion'), outLang = $('outputLanguage');
  const input = $('hylianInput'), kb = $('hylianKeyboard'), out = $('reverseOutput'), copyBtn = $('copyBtn');
  const shiftBtn = $('kbShift'), spaceBtn = $('kbSpace'), backBtn = $('kbBackspace'), clearBtn = $('kbClear');
  if (!card || !swapBtn || !input || !kb || !window.HylianReverse) return;
  const TEXT = window.PAGE_TEXT || {};

  // ---- keyboard definitions --------------------------------------------------------------------------------------
  // Scripts that are just the English alphabet drawn in a Hylian font. `cased`: upper and lower case look different.
  const LATIN = {
    twilightPrincess: { cased: true,  digits: '',           punct: '.,!:;' },
    skywardSword:     { cased: false, digits: '',           punct: '' },
    botw:             { cased: false, digits: '',           punct: '' }, // upper/lower case look (almost) the same
    gerudo:           { cased: false, digits: '15',        punct: ".,!?':;" },
    sheikah:          { cased: false, digits: '0123456789', punct: '.!?-' }
  };
  // Scripts built from kana: one glyph per syllable. The maps (script.js side) are romaji -> font character.
  const KANA = {
    windwaker:       () => windwakerGlyphMap,
    ocarinaOfTime64: () => ocarina64GlyphMap,
    ocarinaOfTime3d: () => ocarina3dGlyphMap
  };
  const ORDER = ('a i u e o ka ki ku ke ko sa shi su se so ta chi tsu te to na ni nu ne no ha hi fu he ho ma mi mu me mo ya yu yo ' +
    'ra ri ru re ro wa wo n ga gi gu ge go za ji zu ze zo da de do ba bi bu be bo pa pi pu pe po fa fi fe fo').split(' ');
  // Rendered height of each script's key glyphs, in em (measured). It sizes the glyph area of a key so the space between
  // glyph and label is the same for every font.
  const INK = { ocarinaOfTime3d: 0.93, ocarinaOfTime64: 0.98, windwaker: 0.98, twilightPrincess: 0.91, skywardSword: 0.85, botw: 0.87, gerudo: 1.18, sheikah: 0.87 };
  const SYMBOLS = "0123456789!?.,:;-'\"()ー";
  const QWERTY = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

  function fontFor(version) {
    return getFontFamilyString(version) !== 'sans-serif' ? getFontFamilyString(version) : getJapaneseFontFamilyString(version);
  }

  // ---- state ------------------------------------------------------------------------------------------------------
  let reverse = false;
  let shiftOn = false;
  let tokens = [];            // [{ rom }]  what the user has typed, as romanisation
  let current = null;         // { version, kana, cased, keys: [...], byRom: Map(rom -> glyph) }

  function buildLayout(version) {
    if (KANA[version]) {
      const map = KANA[version]();
      const sharing = new Map();                         // glyph -> every romaji that uses it (voiced/unvoiced share glyphs)
      for (const [k, g] of Object.entries(map)) { if (!sharing.has(g)) sharing.set(g, []); sharing.get(g).push(k); }
      const keys = [], byRom = new Map(), seen = new Set();
      for (const [k, g] of Object.entries(map)) {
        if (seen.has(g) || [...g].length !== 1) continue; // one key per glyph; multi-character glyphs are composites
        const isSymbol = !/^[a-z]+$/.test(k);
        if (isSymbol && !SYMBOLS.includes(k)) continue;
        if (k === ' ') continue;
        seen.add(g);
        const rom = k === 'ー' ? '-' : k;
        const all = sharing.get(g).filter((x) => /^[a-z]+$/.test(x));
        keys.push({ rom, glyph: g, label: all.length > 1 ? all.slice(0, 2).join('/') : rom, title: all.join(' / ') || rom, symbol: isSymbol, all: all.length ? all : null });
        byRom.set(rom, g);
      }
      const rank = (key) => key.symbol ? 1e6 : (ORDER.indexOf(key.rom) === -1 ? 1e5 : ORDER.indexOf(key.rom));
      keys.sort((a, b) => rank(a) - rank(b));
      return { version, kana: true, cased: false, keys, byRom };
    }
    const cfg = LATIN[version] || LATIN.botw;
    const keys = [], byRom = new Map();
    for (const row of QWERTY) for (const ch of row) { keys.push({ rom: ch, glyph: ch, label: ch, title: ch, row: QWERTY.indexOf(row) }); }
    for (const ch of cfg.digits + cfg.punct) keys.push({ rom: ch, glyph: ch, label: ch, title: ch, row: 3 });
    for (const k of keys) byRom.set(k.rom, k.glyph);
    return { version, kana: false, cased: cfg.cased, keys, byRom, latinOnly: true };
  }

  // ---- rendering -------------------------------------------------------------------------------------------------
  function glyphOf(token) {
    if (current.kana) return current.byRom.get(token.rom) || '';
    const base = token.rom.toLowerCase();
    return current.byRom.has(base) || token.rom === ' ' ? (current.cased ? token.rom : base) : '';
  }

  // Key labels: for Japanese / Korean / Russian / Ukrainian / Serbian output they show that script
  // (hiragana, hangul, Cyrillic); everything else keeps the roman label.
  const NATIVE_LABELS = ['ja', 'ko', 'ru', 'uk', 'sr'];
  function labelText(k) {
    const lang = outLang.value;
    if (!NATIVE_LABELS.includes(lang) || k.symbol || !/^[a-z]+$/.test(k.rom)) return k.label;
    const conv = (x) => HylianReverse.transliterate(x, lang, window.wanakana, { kana: current.kana });
    return k.all ? k.all.slice(0, 2).map(conv).join('/') : conv(k.rom);
  }
  function updateLabels() {
    kb.querySelectorAll('.hk').forEach((b) => {
      const k = current.keys.find((x) => x.rom === b.dataset.rom);
      if (k) b.querySelector('.hk-label').textContent = labelText(k);
    });
  }

  function renderKeyboard() {
    const font = fontFor(current.version);
    kb.textContent = '';
    kb.dataset.layout = current.kana ? 'kana' : 'latin';
    kb.style.setProperty('--ink', INK[current.version] || 1);
    const makeKey = (k) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'hk'; b.dataset.rom = k.rom; b.title = k.title; b.setAttribute('aria-label', k.title);
      const g = document.createElement('span');
      g.className = 'hk-glyph hylian-font'; g.style.fontFamily = font;
      g.textContent = current.cased && shiftOn && /[a-z]/.test(k.glyph) ? k.glyph.toUpperCase() : k.glyph;
      const l = document.createElement('span');
      l.className = 'hk-label'; l.textContent = labelText(k);
      b.append(g, l);
      return b;
    };
    if (current.kana) {
      const grid = document.createElement('div');
      grid.className = 'kb-grid';
      current.keys.forEach((k) => grid.appendChild(makeKey(k)));
      kb.appendChild(grid);
    } else {
      [0, 1, 2, 3].forEach((r) => {
        const keys = current.keys.filter((k) => k.row === r);
        if (!keys.length) return;
        const row = document.createElement('div');
        row.className = 'kb-row';
        keys.forEach((k) => row.appendChild(makeKey(k)));
        kb.appendChild(row);
      });
    }
    shiftBtn.hidden = !current.cased;
    if (!current.cased) { shiftOn = false; shiftBtn.setAttribute('aria-pressed', 'false'); }
  }

  function romanization(forJapaneseOrLatin) {
    let s = '';
    tokens.forEach((t, i) => {
      let r = t.rom;
      // "n" followed by a vowel/y would be read as a different syllable: separate it the way Hepburn does (kan'i)
      if (current.kana && forJapaneseOrLatin && r === 'n' && tokens[i + 1] && /^[aiueoy]/.test(tokens[i + 1].rom)) r = "n'";
      s += r;
    });
    return s;
  }

  function render() {
    // Hylian side
    input.style.fontFamily = fontFor(current.version);
    input.textContent = tokens.map(glyphOf).join('');
    // real-world side
    const lang = outLang.value;
    const keepApostrophe = lang === 'ja' || HylianReverse.LATIN.includes(lang);
    const text = HylianReverse.transliterate(romanization(keepApostrophe), lang, window.wanakana, { kana: current.kana });
    out.textContent = text;
    out.lang = lang;
    copyBtn.disabled = !text;
    notify();
  }

  // ---- editing ---------------------------------------------------------------------------------------------------
  function add(rom) {
    if (!current.kana && current.cased && !shiftOn) rom = rom.toLowerCase();
    if (!current.kana && !current.cased) rom = rom.toLowerCase();
    if (!current.kana && current.cased && shiftOn) rom = rom.toUpperCase();
    tokens.push({ rom });
    if (current.cased && shiftOn) { // Shift is one-shot, like on a phone keyboard
      shiftOn = false;
      shiftBtn.setAttribute('aria-pressed', 'false');
      renderKeyboard();
    }
    render();
  }
  const back = () => { tokens.pop(); render(); };
  const clear = () => { tokens = []; render(); };

  // pressing a key with the mouse must not move focus away from the Hylian input and back again
  [kb, shiftBtn.parentElement].forEach((el) => el.addEventListener('mousedown', (e) => e.preventDefault()));

  kb.addEventListener('click', (e) => {
    const b = e.target.closest('.hk');
    if (b) { add(b.dataset.rom); input.focus({ preventScroll: true }); }
  });
  spaceBtn.addEventListener('click', () => { tokens.push({ rom: ' ' }); render(); });
  backBtn.addEventListener('click', back);
  clearBtn.addEventListener('click', clear);
  shiftBtn.addEventListener('click', () => {
    shiftOn = !shiftOn;
    shiftBtn.setAttribute('aria-pressed', String(shiftOn));
    renderKeyboard();
  });

  // physical keyboard: letters / digits / punctuation of the English-alphabet scripts, space, backspace
  input.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Backspace') { back(); e.preventDefault(); return; }
    if (e.key === ' ') { tokens.push({ rom: ' ' }); render(); e.preventDefault(); return; }
    if (current.kana || e.key.length !== 1) return;
    const base = e.key.toLowerCase();
    if (!current.byRom.has(base)) return;
    tokens.push({ rom: current.cased ? e.key : base });
    render();
    e.preventDefault();
  });

  copyBtn.addEventListener('click', async () => {
    const text = out.textContent;
    if (!text) return;
    try { await navigator.clipboard.writeText(text); }
    catch (err) {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e2) { /* nothing else to try */ }
      ta.remove();
    }
    copyBtn.textContent = TEXT.copiedMsg || 'Copied!';
    setTimeout(() => { copyBtn.textContent = TEXT.copyLabel || 'Copy'; }, 1500);
  });

  // ---- switching -------------------------------------------------------------------------------------------------
  function setVersionOptions() {
    // Mudoran is a joke script without a letter mapping, so it cannot be read back
    const mud = versionSel.querySelector('option[value="mudoran"]');
    if (mud) mud.disabled = reverse;
    if (reverse && versionSel.value === 'mudoran') {
      versionSel.value = 'ocarinaOfTime3d';
      versionSel.dispatchEvent(new Event('change')); // let script.js update its fonts / chart image
    }
  }

  current = buildLayout(versionSel.value === 'mudoran' ? 'ocarinaOfTime3d' : versionSel.value);
  let tokensKana = current.kana; // were the typed tokens kana syllables (true) or letters (false)?

  function rebuild() {
    current = buildLayout(versionSel.value);
    // syllables and letters don't mix: switching between the two kinds of script clears the text,
    // while switching between scripts of the same kind keeps whatever exists in the new one
    if (tokens.length && tokensKana !== current.kana) tokens = tokens.filter((t) => t.rom === ' ');
    else tokens = tokens.filter((t) => t.rom === ' ' || current.byRom.has(current.kana ? t.rom : t.rom.toLowerCase()));
    if (!current.kana && !current.cased) tokens = tokens.map((t) => ({ rom: t.rom.toLowerCase() })); // e.g. state saved while Shift existed
    tokensKana = current.kana;
    renderKeyboard();
    render();
  }

  function setReverse(on, focus) {
    reverse = on;
    card.classList.toggle('reverse-mode', reverse);
    bar.classList.toggle('reversed', reverse);
    swapBtn.setAttribute('aria-pressed', String(reverse));
    setVersionOptions();
    if (reverse) { rebuild(); if (focus) input.focus({ preventScroll: true }); }
    notify();
  }

  let outLangChosen = false; // only remembered when the user picked it (otherwise it follows the page language)
  swapBtn.addEventListener('click', () => setReverse(!reverse, true));
  versionSel.addEventListener('change', () => { if (reverse) rebuild(); });
  outLang.addEventListener('change', () => { outLangChosen = true; if (reverse) { updateLabels(); render(); } else notify(); });

  // ---- state hooks (used by state.js to remember the session) ----------------------------------------------------
  const listeners = [];
  function notify() { listeners.forEach((fn) => fn()); }
  window.HylianReverseUI = {
    get: () => ({ reverse, tokens: tokens.map((t) => t.rom), outLang: outLangChosen ? outLang.value : null }),
    set: (s) => {
      if (!s) return;
      if (s.outLang && [...outLang.options].some((o) => o.value === s.outLang)) { outLang.value = s.outLang; outLangChosen = true; }
      tokens = (Array.isArray(s.tokens) ? s.tokens : []).filter((x) => typeof x === 'string').map((rom) => ({ rom }));
      tokensKana = !!KANA[versionSel.value];
      if (s.reverse) setReverse(true, false);
      else if (reverse) setReverse(false, false);
    },
    onChange: (fn) => listeners.push(fn)
  };

})();
