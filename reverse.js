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
  const shiftBtn = $('kbShift'), spaceBtn = $('kbSpace'), backBtn = $('kbBackspace'), clearBtn = $('kbClear'), mirrorBtn = $('kbMirror');
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
  let mirrorEnabled = false; // retained while switching scripts, but only applied to Twilight Princess

  // Use a small, predictable caret instead of the oversized native caret produced by some Hylian fonts.
  const customCaret = document.createElement('span');
  customCaret.className = 'hylian-custom-caret';
  customCaret.setAttribute('aria-hidden', 'true');
  document.body.appendChild(customCaret);

  function updateCustomCaret() {
    const selection = window.getSelection();
    if (document.activeElement !== input || !selection || !selection.rangeCount || !(selection.anchorNode === input || input.contains(selection.anchorNode))) {
      customCaret.hidden = true;
      return;
    }
    const range = selection.getRangeAt(0).cloneRange();
    range.collapse(true);
    let rect = range.getBoundingClientRect();
    if (!rect.height) {
      const probe = range.cloneRange();
      if (probe.startOffset > 0 && probe.startContainer.nodeType === Node.TEXT_NODE) {
        probe.setStart(probe.startContainer, probe.startOffset - 1);
        const previousRect = probe.getBoundingClientRect();
        if (previousRect.height) rect = { left: previousRect.right, top: previousRect.top, height: previousRect.height };
      }
    }
    if (!rect.height) { customCaret.hidden = true; return; }
    const height = Math.min(16, rect.height);
    customCaret.style.left = `${rect.left}px`;
    customCaret.style.top = `${rect.top + (rect.height - height) / 2}px`;
    customCaret.style.height = `${height}px`;
    customCaret.hidden = false;
  }

  input.style.caretColor = 'transparent';
  document.addEventListener('selectionchange', updateCustomCaret);
  input.addEventListener('focus', updateCustomCaret);
  input.addEventListener('blur', () => { customCaret.hidden = true; });
  window.addEventListener('resize', updateCustomCaret);
  window.addEventListener('scroll', updateCustomCaret, true);
  let tokens = [];            // [{ rom }]  what the user has typed, as romanisation
  let pendingRomaji = '';
  let compositionRange = null;
  let isComposing = false;
  let skipCommittedComposition = null;
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
        // Every romanisation sharing this glyph remains a valid input token (e.g. ha/ba/pa, chi/di).
        all.forEach(alias => byRom.set(alias, g));
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
    if (token.rom === '\n' || token.rom === ' ') return token.rom;
    if (current.kana) return current.byRom.get(token.rom) || token.rom;
    const base = token.rom.toLowerCase();
    return current.byRom.has(base) || token.rom === ' ' ? (current.cased ? token.rom : base) : token.rom;
  }

  // Key labels: for Japanese / Korean / Russian / Ukrainian / Serbian output they show that script
  // (hiragana, hangul, Cyrillic); everything else keeps the roman label.
  const NATIVE_LABELS = ['ru', 'uk', 'sr'];
  function labelText(k) {
    const lang = outLang.value;
    const nativeLabels = current.kana ? NATIVE_LABELS.concat(['ja', 'ko']) : NATIVE_LABELS;
    if (!nativeLabels.includes(lang) || k.symbol || !/^[a-z]+$/.test(k.rom)) return k.label;
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
  function glyphOffsetToToken(offset) {
    let used = 0;
    for (let i = 0; i < tokens.length; i++) {
      const length = glyphOf(tokens[i]).length;
      if (offset <= used + length / 2) return i;
      used += length;
    }
    return tokens.length;
  }

  function caretTokenRange() {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || !input.contains(selection.anchorNode)) return [tokens.length, tokens.length];
    const range = selection.getRangeAt(0);
    const before = range.cloneRange();
    before.selectNodeContents(input);
    before.setEnd(range.startContainer, range.startOffset);
    const start = glyphOffsetToToken(before.toString().length);
    const selected = range.toString().length;
    return [start, glyphOffsetToToken(before.toString().length + selected)];
  }

  function renderAt(index) {
    render();
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    const walker = document.createTreeWalker(input, NodeFilter.SHOW_TEXT);
    let node, remaining = tokens.slice(0, index).reduce((n, t) => n + glyphOf(t).length, 0);
    while ((node = walker.nextNode())) {
      if (remaining <= node.textContent.length) { range.setStart(node, remaining); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); return; }
      remaining -= node.textContent.length;
    }
    range.selectNodeContents(input); range.collapse(false); selection.removeAllRanges(); selection.addRange(range);
    updateCustomCaret();
  }

  function add(rom) {
    if (current.kana) {
      insertTypedText(rom, true);
      return;
    }
    pendingRomaji = '';
    if (current.cased && !shiftOn) rom = rom.toLowerCase();
    if (!current.cased) rom = rom.toLowerCase();
    if (current.cased && shiftOn) rom = rom.toUpperCase();
    const [start, end] = caretTokenRange();
    tokens.splice(start, end - start, { rom });
    if (current.cased && shiftOn) { shiftOn = false; shiftBtn.setAttribute('aria-pressed', 'false'); renderKeyboard(); }
    renderAt(start + 1);
  }

  function deleteAtCaret(backward) {
    const [start, end] = caretTokenRange();
    if (start !== end) tokens.splice(start, end - start);
    else if (backward && start > 0) tokens.splice(start - 1, 1);
    else if (!backward && start < tokens.length) tokens.splice(start, 1);
    renderAt(start > 0 && backward ? start - (start === end ? 1 : 0) : start);
  }

  const back = () => deleteAtCaret(true);
  const clear = () => { tokens = []; pendingRomaji = ''; renderAt(0); };

  const CYRILLIC_TO_ROM = { 'а':'a','б':'b','в':'v','г':'g','ґ':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya' };
  const HANGUL_L = ['g','kk','n','d','tt','r','m','b','pp','s','ss','','j','jj','ch','k','t','p','h'];
  const HANGUL_V = ['a','ae','ya','yae','eo','e','yeo','ye','o','wa','wae','oe','yo','u','wo','we','wi','yu','eu','ui','i'];
  const HANGUL_T = ['', 'k','k','ks','n','nj','nh','t','l','lk','lm','lb','ls','lt','lp','lh','m','p','ps','t','t','ng','t','t','k','t','p','t'];
  function nativeToRom(text) {
    // Convert kana runs together so contracted sounds such as しゃ become "sha", not "shixya".
    const source = String(text).replace(/[\u3040-\u30ffー]+/g, run => window.wanakana ? window.wanakana.toRomaji(run) : run);
    let roman = [...source].map(ch => {
      if (CYRILLIC_TO_ROM[ch.toLowerCase()] !== undefined) {
        const r = CYRILLIC_TO_ROM[ch.toLowerCase()]; return ch !== ch.toLowerCase() ? r.charAt(0).toUpperCase() + r.slice(1) : r;
      }
      const code = ch.charCodeAt(0);
      if (code >= 0xac00 && code <= 0xd7a3) {
        const n = code - 0xac00, l = Math.floor(n / 588), v = Math.floor((n % 588) / 28), t = n % 28;
        return (HANGUL_L[l] || '') + (HANGUL_V[v] || '') + (HANGUL_T[t] || '');
      }
      return ch;
    }).join('');
    // Korean keyboard syllables do not use Hepburn spelling. Normalize common Korean spellings
    // to the Japanese mora names accepted by the Ocarina/Wind Waker maps.
    if (current && current.kana && /[\uac00-\ud7a3]/.test(text)) {
      roman = roman.replace(/cheu/g, 'tsu').replace(/sya/g, 'sha').replace(/syu/g, 'shu').replace(/syo/g, 'sho')
        .replace(/tya/g, 'cha').replace(/tyu/g, 'chu').replace(/tyo/g, 'cho')
        .replace(/si/g, 'shi').replace(/ti/g, 'chi').replace(/tu/g, 'tsu').replace(/hu/g, 'fu');
    }
    return roman;
  }

  function tokenizeRomaji(value, allowPending, discardInvalid = false) {
    const result = [];
    const original = String(value);
    let rest = original.toLowerCase();
    if (current.kana) rest = rest.replace(/l/g, 'r').replace(/v/g, 'b');
    const choices = [...current.byRom.keys()].filter(k => /^[a-z]+$/.test(k)).sort((a,b) => b.length-a.length);
    while (rest) {
      if (rest[0] === ' ' || rest[0] === '\n' || rest[0] === '\t') { result.push(rest[0] === '\t' ? ' ' : rest[0]); rest = rest.slice(1); continue; }
      // Use the same contracted-syllable table as the forward translator (e.g. sha -> shi + ya).
      if (current.kana && typeof HYLIAN_YOON_MAP !== 'undefined') {
        const yoon = Object.keys(HYLIAN_YOON_MAP).sort((a,b) => b.length-a.length).find(k => rest.startsWith(k));
        if (yoon) {
          const pair = HYLIAN_YOON_MAP[yoon];
          if (pair.every(part => current.byRom.has(part))) { result.push(...pair); rest = rest.slice(yoon.length); continue; }
        }
      }
      // Small tsu / doubled consonants follow the same convention as the forward translator.
      if (current.kana && /^([kgzstcdjhfbpmr])\1(?=(?:a|i|u|e|o|y))/.test(rest) && current.byRom.has('tsu')) {
        result.push('tsu'); rest = rest.slice(1); continue;
      }
      const hit = choices.find(k => rest.startsWith(k));
      if (hit) { result.push(current.cased ? original.slice(original.length - rest.length, original.length - rest.length + hit.length) : hit); rest = rest.slice(hit.length); continue; }
      if (rest[0] === 'n' && rest.length > 1 && !/[aiueoy]/.test(rest[1]) && current.byRom.has('n')) { result.push('n'); rest = rest.slice(1); continue; }
      const pendingChoices = current.kana && typeof HYLIAN_YOON_MAP !== 'undefined' ? choices.concat(Object.keys(HYLIAN_YOON_MAP)) : choices;
      if (allowPending && pendingChoices.some(k => k.startsWith(rest))) return { result, pending: rest };
      // Keep a standalone n as the nasal when followed by a separator or at the end of a paste.
      if (rest[0] === 'n' && current.byRom.has('n')) { result.push('n'); rest = rest.slice(1); continue; }
      // Kana-based layouts accept only recognised morae (plus separators handled
      // above). Keeping stray Latin consonants here makes the Hylian font render
      // unrelated fallback glyphs (e.g. typing "kkkkk"). Leave a possible partial
      // syllable in `pending` while typing, but never render invalid letters.
      // Latin layouts continue preserving unknown text during ordinary editing.
      const ch = rest[0];
      if (current.byRom.has(ch)) result.push(ch);
      else if (!discardInvalid && !current.kana) result.push(ch);
      rest = rest.slice(1);
    }
    return { result, pending: '' };
  }

  function insertTypedText(raw, incremental) {
    const [start, end] = caretTokenRange();
    const converted = nativeToRom(raw);
    let replaceAt = start;
    let combined = incremental && current.kana ? pendingRomaji + converted : converted;

    // A lone n is a valid visible mora, but Hepburn input may continue it as na/ni/... or nya/nyu/nyo.
    // Reconsider that previous token instead of leaving a separate n in front of the new syllables.
    if (current.kana && start === end && start > 0 && tokens[start - 1].rom === 'n' && /^[aiueoy]/i.test(combined)) {
      replaceAt = start - 1;
      combined = 'n' + combined;
    }

    const parsed = tokenizeRomaji(combined, incremental && current.kana);
    pendingRomaji = parsed.pending || '';
    if (!parsed.result.length) return;
    tokens.splice(replaceAt, end - replaceAt, ...parsed.result.map(rom => ({ rom })));
    renderAt(replaceAt + parsed.result.length);
  }

  // pressing a key with the mouse must not move focus away from the Hylian input and back again
  [kb, shiftBtn.parentElement].forEach((el) => el.addEventListener('mousedown', (e) => e.preventDefault()));

  kb.addEventListener('click', (e) => {
    const b = e.target.closest('.hk');
    if (b) { add(b.dataset.rom); input.focus({ preventScroll: true }); b.classList.add('is-pressed'); setTimeout(() => b.classList.remove('is-pressed'), 120); }
  });
  spaceBtn.addEventListener('click', () => { const [a, b] = caretTokenRange(); tokens.splice(a, b-a, { rom: ' ' }); pendingRomaji = ''; renderAt(a + 1); });
  backBtn.addEventListener('click', back);
  clearBtn.addEventListener('click', clear);
  shiftBtn.addEventListener('click', () => {
    shiftOn = !shiftOn;
    shiftBtn.setAttribute('aria-pressed', String(shiftOn));
    renderKeyboard();
  });

  // Native editing is handled before the browser mutates the editable surface, keeping the token model
  // (and therefore transliteration) in sync while retaining normal cursor/selection editing.
  input.addEventListener('compositionstart', () => { isComposing = true; compositionRange = caretTokenRange(); });
  input.addEventListener('compositionend', (e) => {
    isComposing = false;
    if (!e.data || !compositionRange) { compositionRange = null; return; }
    skipCommittedComposition = e.data;
    setTimeout(() => { skipCommittedComposition = null; }, 0);
    const [start, end] = compositionRange; compositionRange = null;
    input.textContent = tokens.map(glyphOf).join('');
    pendingRomaji = '';
    const parsed = tokenizeRomaji(nativeToRom(e.data), false).result;
    tokens.splice(start, end - start, ...parsed.map(rom => ({ rom })));
    renderAt(start + parsed.length);
  });
  input.addEventListener('beforeinput', (e) => {
    if (isComposing && e.inputType.startsWith('insert')) return;
    if (e.inputType === 'insertText' && skipCommittedComposition === e.data) { e.preventDefault(); skipCommittedComposition = null; return; }
    if (e.inputType === 'deleteContentBackward') { e.preventDefault(); pendingRomaji = ''; deleteAtCaret(true); return; }
    if (e.inputType === 'deleteContentForward') { e.preventDefault(); pendingRomaji = ''; deleteAtCaret(false); return; }
    if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') { e.preventDefault(); pendingRomaji = ''; const [a,b] = caretTokenRange(); tokens.splice(a,b-a,{rom:'\n'}); renderAt(a+1); return; }
    if (e.inputType === 'insertText' && e.data != null) {
      e.preventDefault();
      if (e.data === ' ') { const [a,b] = caretTokenRange(); if (pendingRomaji && current.byRom.has(pendingRomaji)) tokens.splice(a,b-a,{rom:pendingRomaji}); else tokens.splice(a,b-a); const insertAt = a + (pendingRomaji && current.byRom.has(pendingRomaji) ? 1 : 0); pendingRomaji = ''; tokens.splice(insertAt, 0, {rom:' '}); renderAt(insertAt+1); }
      else insertTypedText(e.data, true);
      return;
    }
    if (e.inputType === 'insertFromPaste') {
      const pasted = (e.dataTransfer || e.clipboardData)?.getData('text/plain');
      if (pasted != null) { e.preventDefault(); pendingRomaji = ''; insertTypedText(pasted, false); }
    }
  });
  input.addEventListener('paste', (e) => {
    const pasted = e.clipboardData && e.clipboardData.getData('text/plain');
    if (pasted != null) { e.preventDefault(); pendingRomaji = ''; insertTypedText(pasted, false); }
  });
  input.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); if (pendingRomaji) pendingRomaji = ''; else deleteAtCaret(e.key === 'Backspace'); }
    else if (e.key === 'Enter') { e.preventDefault(); pendingRomaji = ''; const [a,b] = caretTokenRange(); tokens.splice(a,b-a,{rom:'\n'}); renderAt(a+1); }
  });
  if (mirrorBtn) {
    mirrorBtn.hidden = versionSel.value !== 'twilightPrincess';
    mirrorBtn.addEventListener('click', () => {
      if (versionSel.value !== 'twilightPrincess') return;
      mirrorEnabled = !mirrorEnabled;
      input.classList.toggle('mirror-text', mirrorEnabled);
      mirrorBtn.setAttribute('aria-pressed', String(mirrorEnabled));
      notify();
    });
  }

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
    // Tokens are stored as romanisation, but their granularity depends on the script:
    // kana layouts use syllables ("ka"), while Latin layouts use individual letters.
    // On a script-family switch, re-tokenize and discard anything the new layout
    // cannot represent rather than carrying unsupported characters across.
    const message = tokens.map((t) => t.rom).join('');
    current = buildLayout(versionSel.value);
    const converted = tokenizeRomaji(message, false, tokensKana !== current.kana);
    tokens = converted.result.map((rom) => ({ rom }));
    pendingRomaji = '';
    if (!current.kana && !current.cased) tokens = tokens.map((t) => ({ rom: t.rom.toLowerCase() })); // e.g. state saved while Shift existed
    tokensKana = current.kana;
    renderKeyboard();
    const isTwilight = current.version === 'twilightPrincess';
    input.classList.toggle('mirror-text', isTwilight && mirrorEnabled);
    if (mirrorBtn) {
      mirrorBtn.hidden = !isTwilight;
      mirrorBtn.setAttribute('aria-pressed', String(isTwilight && mirrorEnabled));
    }
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
    focusEnd: () => {
      input.focus({ preventScroll: true });
      const range = document.createRange();
      range.selectNodeContents(input);
      range.collapse(false);
      const selection = window.getSelection();
      if (selection) { selection.removeAllRanges(); selection.addRange(range); }
      updateCustomCaret();
    },
    get: () => ({ reverse, tokens: tokens.map((t) => t.rom), outLang: outLangChosen ? outLang.value : null, mirrorEnabled }),
    set: (s) => {
      if (!s) return;
      if (s.outLang && [...outLang.options].some((o) => o.value === s.outLang)) { outLang.value = s.outLang; outLangChosen = true; }
      tokens = (Array.isArray(s.tokens) ? s.tokens : []).filter((x) => typeof x === 'string').map((rom) => ({ rom }));
      tokensKana = !!KANA[versionSel.value];
      // Normalize older saved kana tokens too (notably a previously committed n + vowel sequence).
      if (tokensKana) tokens = tokenizeRomaji(tokens.map((token) => token.rom).join(''), false).result.map((rom) => ({ rom }));
      mirrorEnabled = !!s.mirrorEnabled;
      if (s.reverse) setReverse(true, false);
      else if (reverse) setReverse(false, false);
    },
    onChange: (fn) => listeners.push(fn)
  };

})();
