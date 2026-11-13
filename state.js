/**
 * Remembers the session in localStorage so a reload or a switch to another language page picks up where the user left off:
 * the text, direction (real world <-> Hylian), Hylian version, Twilight Princess variant, font colour and size, and the
 * Hylian keyboard input with its output language. Reading / writing is wrapped in try/catch (private mode etc.).
 * It survives reloads and hard reloads; it is only gone if the visitor clears the site's data.
 */
(function () {
  'use strict';
  const KEY = 'hylianTranslator.state.v1';
  const $ = (id) => document.getElementById(id);
  const text = $('inputText'), version = $('hylianVersion'), color = $('fontColor'), size = $('fontSizeSlider');
  const gc = $('gamecubeOption'), wii = $('wiiOption');
  if (!text || !version) return;
  const ui = window.HylianReverseUI;

  const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));

  function snapshot() {
    return {
      v: 1,
      text: text.value,
      version: version.value,
      tp: wii && wii.checked ? 'wii' : 'gamecube',
      color: color ? color.value : null,
      size: size ? size.value : null,
      rev: ui ? ui.get() : null
    };
  }

  let timer;
  function save() {
    clearTimeout(timer);
    timer = setTimeout(flush, 150);
  }
  function flush() {
    clearTimeout(timer);
    if (sharedMode) return;
    try { localStorage.setItem(KEY, JSON.stringify(snapshot())); } catch (e) { /* storage unavailable */ }
  }

  function restore() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return; }
    if (!s || s.v !== 1) return;
    if (typeof s.version === 'string' && [...version.options].some((o) => o.value === s.version)) {
      version.value = s.version; fire(version, 'change');
    }
    if (s.tp === 'wii' && wii) { wii.checked = true; fire(wii, 'change'); }
    if (color && /^#[0-9a-f]{6}$/i.test(s.color || '')) { color.value = s.color; fire(color, 'input'); }
    if (size && Number.isFinite(parseFloat(s.size))) { size.value = s.size; fire(size, 'input'); }
    if (typeof s.text === 'string' && s.text) { text.value = s.text; fire(text, 'input'); }
    if (ui && s.rev) ui.set(s.rev);
  }

  // Did this visitor already have saved settings? (read before restore(); shared links use it to decide how to open)
  let hadSavedSettings = false;
  try { const saved = JSON.parse(localStorage.getItem(KEY) || 'null'); hadSavedSettings = !!(saved && saved.v === 1); } catch (e) { /* ignore */ }

  restore();

  // Shared links are temporary overlays: preserve the visitor's own restored
  // local settings and never write the shared configuration back to storage.
  const personalSnapshot = snapshot();
  let sharedMode = false;
  window.HylianTranslatorState = {
    get: snapshot,
    hadSavedSettings,
    apply: (s) => {
      if (!s || typeof s !== 'object') return;
      if (typeof s.version === 'string' && [...version.options].some((o) => o.value === s.version)) { version.value = s.version; fire(version, 'change'); }
      if (s.tp === 'wii' && wii) { wii.checked = true; fire(wii, 'change'); }
      else if (gc) { gc.checked = true; fire(gc, 'change'); }
      if (color && /^#[0-9a-f]{6}$/i.test(s.color || '')) { color.value = s.color; fire(color, 'input'); }
      if (size && Number.isFinite(parseFloat(s.size))) { size.value = s.size; fire(size, 'input'); }
      if (typeof s.text === 'string') { text.value = s.text; fire(text, 'input'); }
      if (ui && s.rev) ui.set(s.rev);
    },
    setSharedMode: (on) => { sharedMode = !!on; },
    restorePersonal: () => { sharedMode = false; window.HylianTranslatorState.apply(personalSnapshot); }
  };

  [text, version, color, size, gc, wii].forEach((el) => {
    if (!el) return;
    el.addEventListener('input', () => { if (!sharedMode) save(); });
    el.addEventListener('change', () => { if (!sharedMode) save(); });
  });
  if (ui) ui.onChange(() => { if (!sharedMode) save(); });
  window.addEventListener('pagehide', flush);
})();
