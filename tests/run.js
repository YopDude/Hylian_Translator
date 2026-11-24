#!/usr/bin/env node
/* Checks for the Hylian Translator. Run with `npm test` (rebuilds the pages first). No browser needed.
 *
 *  1. build output      pages, sitemap, robots.txt, no unresolved {{placeholders}}, hreflang
 *  2. translations      every language has every string the English one has
 *  3. html              every generated page passes html-validate
 *  4. css / scripts     no duplicate rules, no unused classes, no untranslated alert() messages, all text keys exist
 *  5. assets            image / font budgets, files the pages and the worker need
 *  6. conversions       the real functions of script.js, transliterationMap.js and reverseTransliteration.js run with the real
 *                       libraries and the Japanese dictionary (kanji, へ / は / を, ー, Korean, Chinese, Cyrillic)
 * Add a case whenever a conversion bug is fixed, so it cannot come back.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.log('  ✗ ' + name + '\n      ' + String(err && err.message || err).split('\n').join('\n      ')); }
}
const section = (title) => console.log('\n' + title);
const eq = (actual, expected, what) => {
  if (actual !== expected) throw new Error(`${what ? what + ': ' : ''}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const ok = (cond, message) => { if (!cond) throw new Error(message); };

// ---- helpers -----------------------------------------------------------------------------------------------------------
const LANGS = ['', 'ja', 'zh', 'ko', 'es', 'pt', 'fr', 'de', 'it', 'fi', 'nl', 'ru', 'uk', 'sr'];
const pages = [];
for (const l of LANGS) for (const p of ['index.html', 'about.html']) pages.push(path.join(l, p));

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') flatten(v, prefix + k + '.', out); else out[prefix + k] = v;
  }
  return out;
}
// the text between the first '{' after `start` and its matching '}' (strings and comments in these sources have no braces)
function block(src, start) {
  const i = src.indexOf(start);
  if (i < 0) throw new Error(`"${start}" not found`);
  let depth = 0;
  for (let j = src.indexOf('{', i); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(i, j + 1);
  }
  throw new Error(`unbalanced braces after "${start}"`);
}
// top-level CSS rules, with the @media (or other at-rule) each one sits in
function cssRules(css) {
  const rules = []; const stack = []; let buf = 0;
  css = css.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '{') { stack.push(css.slice(buf, i).trim()); buf = i + 1; }
    else if (c === '}') { const head = stack.pop(); if (!head.startsWith('@')) rules.push({ selector: head, context: stack.join(' | ') }); buf = i + 1; }
    else if (c === ';' && !stack.length) buf = i + 1;
  }
  return rules;
}

(async () => {
  // ================================================================================================================ 1. build
  section('1. Build output');
  await test('all 28 pages exist, with no unresolved {{placeholders}}', () => {
    for (const p of pages) {
      ok(fs.existsSync(path.join(ROOT, p)), `${p} is missing`);
      ok(!/\{\{\w+/.test(read(p)), `${p} still contains a {{placeholder}}`);
    }
  });
  await test('every page declares its language, a canonical link and 14 hreflang alternates + x-default', () => {
    for (const p of pages) {
      const html = read(p);
      ok(/<html lang="[a-zA-Z-]+"/.test(html), `${p}: <html lang> missing`);
      ok(/<link rel="canonical"/.test(html), `${p}: canonical missing`);
      eq((html.match(/rel="alternate" hreflang="/g) || []).length, 15, `${p}: hreflang links`);
    }
  });
  await test('sitemap lists all 28 pages and robots.txt points to it', () => {
    eq((read('sitemap.xml').match(/<loc>/g) || []).length, 28, 'sitemap <loc> entries');
    ok(/Sitemap: https:\/\/zeldatranslator\.com\/sitemap\.xml/.test(read('robots.txt')), 'robots.txt has no Sitemap line');
  });
  await test('cache-buster, service worker and per-language manifests are generated', () => {
    const ver = (read('index.html').match(/"ver":"([0-9a-f]{8})"/) || [])[1];
    ok(ver, 'no "ver" in PAGE_TEXT');
    ok(read('sw.js').includes(`'hylian-${ver}'`), 'sw.js cache name does not match the page version (run the build)');
    for (const l of LANGS) ok(fs.existsSync(path.join(ROOT, l, 'site.webmanifest')), `${l || 'en'}/site.webmanifest missing`);
  });

  // ================================================================================================================ 2. i18n
  section('2. Translations');
  const translationSources = {
    'i18n/translations.js': (() => { const c = {}; vm.createContext(c); vm.runInContext(read('i18n/translations.js') + ';this.T = translations', c); return c.T; })(),
    'i18n/ui-strings.js': require(path.join(ROOT, 'i18n/ui-strings.js')),
    'i18n/extras.js': require(path.join(ROOT, 'i18n/extras.js'))
  };
  for (const [file, data] of Object.entries(translationSources)) {
    await test(`${file}: every language has every string of the English one`, () => {
      const en = Object.keys(flatten(data.en));
      const problems = [];
      for (const lang of Object.keys(data)) {
        const have = flatten(data[lang]);
        // the About-button tooltip of most languages lives in ui-strings.js as `tipAbout` (build.js looks there first)
        const providedElsewhere = (k) => k === 'tooltips.aboutPageBtn' && !!(translationSources['i18n/ui-strings.js'][lang] || {}).tipAbout;
        const missing = en.filter((k) => !(k in have) && !providedElsewhere(k));
        if (missing.length) problems.push(`${lang} is missing ${missing.join(', ')}`);
      }
      ok(!problems.length, problems.join('\n'));
    });
  }
  await test('no string holds a bare "&" (it must be written &amp; in HTML text)', () => {
    const bare = /&(?!(?:[a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);)/;
    const bad = [];
    for (const [file, data] of Object.entries(translationSources)) {
      for (const [lang, strings] of Object.entries(data)) for (const [k, v] of Object.entries(flatten(strings))) if (typeof v === 'string' && bare.test(v)) bad.push(`${file} ${lang}.${k}`);
    }
    ok(!bad.length, bad.join('\n'));
  });

  // ================================================================================================================ 3. html
  section('3. HTML validity (html-validate)');
  await test('every generated page passes html-validate', async () => {
    const { HtmlValidate } = require('html-validate/node');
    const validator = new HtmlValidate(JSON.parse(read('.htmlvalidate.json')));
    const problems = [];
    for (const p of pages) {
      const report = await validator.validateFile(path.join(ROOT, p));
      for (const r of report.results) for (const m of r.messages) problems.push(`${p}:${m.line}:${m.column} ${m.message} (${m.ruleId})`);
    }
    ok(!problems.length, problems.slice(0, 12).join('\n') + (problems.length > 12 ? `\n… and ${problems.length - 12} more` : ''));
  });

  // ================================================================================================================ 4. css / js
  section('4. Styles and scripts');
  const css = read('styles.css');
  await test('no CSS rule is defined twice in the same place', () => {
    const seen = new Map(); const dups = [];
    for (const r of cssRules(css)) {
      const key = r.context + ' || ' + r.selector;
      if (seen.has(key)) dups.push(`${r.selector}${r.context ? ' (in ' + r.context + ')' : ''}`); else seen.set(key, 1);
    }
    ok(!dups.length, 'defined more than once: ' + dups.join('; '));
  });
  await test('no CSS class is unused', () => {
    const noStrings = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/url\([^)]*\)|"[^"]*"|'[^']*'|\d+\.\d+/g, '');
    const classes = [...new Set([...noStrings.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((m) => m[1]))];
    const corpus = ['templates/index.template.html', 'templates/about.template.html', 'script.js', 'reverse.js', 'ui-select.js', 'state.js', 'share.js', 'banner.js', 'build.js']
      .map(read).join('\n') + fs.readdirSync(path.join(ROOT, 'i18n')).map((f) => read('i18n/' + f)).join('\n');
    const unused = classes.filter((c) => !corpus.includes(c));
    ok(!unused.length, 'unused: ' + unused.join(', '));
  });
  await test('alert() messages are never hard-coded English (use pageText / text with a translated key)', () => {
    const bad = [];
    for (const f of ['script.js', 'reverse.js', 'share.js', 'state.js', 'ui-select.js']) {
      read(f).split('\n').forEach((line, i) => { if (/\balert\(\s*['"`]/.test(line)) bad.push(`${f}:${i + 1}`); });
    }
    ok(!bad.length, 'literal alert text at ' + bad.join(', '));
  });
  await test('every text key JavaScript asks for exists in every language', () => {
    const wanted = new Set();
    for (const f of ['script.js', 'share.js']) for (const m of read(f).matchAll(/\b(?:pageText|text)\(\s*'(\w+)'/g)) wanted.add(m[1]);
    const exposed = (read('build.js').match(/pageTextJson: JSON\.stringify\(\{([^}]*)\}\)/) || [])[1] || '';
    const all = { ...translationSources['i18n/translations.js'].en, ...translationSources['i18n/ui-strings.js'].en, ...translationSources['i18n/extras.js'].en };
    const problems = [];
    for (const key of wanted) {
      if (!new RegExp(`\\b${key}:`).test(exposed) && !/^(root|ver|imgVer)$/.test(key)) problems.push(`${key}: not exposed in PAGE_TEXT (build.js)`);
      if (!(key in all) && !['translatedText', 'copyLabel', 'copiedMsg'].includes(key)) problems.push(`${key}: no English string`);
    }
    ok(!problems.length, problems.join('\n'));
  });

  // ================================================================================================================ 5. assets
  section('5. Assets');
  await test('no image is larger than 300 KB (and nothing over 1 MB anywhere in images/)', () => {
    const big = [];
    const walk = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).forEach((e) => {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) return walk(rel);
      const kb = fs.statSync(path.join(ROOT, rel)).size / 1024;
      if (kb > 300) big.push(`${rel} (${Math.round(kb)} KB)`);
    });
    walk('images');
    ok(!big.length, 'too large: ' + big.join(', '));
  });
  await test('the 12 dictionary files, the vendor libraries and a woff2 for every Hylian font exist', () => {
    for (const n of ['base', 'cc', 'check', 'tid', 'tid_map', 'tid_pos', 'unk', 'unk_char', 'unk_compat', 'unk_invoke', 'unk_map', 'unk_pos']) ok(fs.existsSync(path.join(ROOT, `dict/${n}.dat.gz`)), `dict/${n}.dat.gz`);
    for (const f of ['wanakana.min.js', 'kuroshiro.min.js', 'kuroshiro-analyzer-kuromoji.min.js', 'pinyin-pro.js', 'html2canvas.min.js']) ok(fs.existsSync(path.join(ROOT, 'vendor', f)), `vendor/${f}`);
    const names = [...read('jsMapping/fontFileMap.js').matchAll(/:\s*"([^"]+)"/g)].map((m) => m[1]);
    ok(names.length === 9, 'expected 9 fonts in fontFileMap.js');
    for (const n of names) for (const ext of ['woff2', 'ttf']) ok(fs.existsSync(path.join(ROOT, `fonts/${n}.${ext}`)), `fonts/${n}.${ext}`);
  });
  await test('the large Japanese fonts are not downloaded by non-Japanese pages (language-name characters only)', () => {
    const label = '日本語中文ひらがな';
    const bad = [];
    for (const l of LANGS.filter((x) => !['ja', 'zh', 'ko'].includes(x))) for (const p of ['index.html', 'about.html']) {
      const text = read(path.join(l, p)).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, '');
      const extra = [...new Set([...text].filter((c) => /[\u3000-\u30FF\u3400-\u9FFF\uFF00-\uFFEF]/.test(c) && !label.includes(c)))];
      if (extra.length) bad.push(`${l || 'en'}/${p}: ${extra.join('')}`);
    }
    ok(!bad.length, bad.join('\n'));
  });

  // ================================================================================================================ 6. conversions
  section('6. Text conversions (real code, real libraries, real dictionary)');
  const wanakana = require('wanakana');
  const sandbox = { wanakana, console, document: { documentElement: { lang: 'en' } } };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  const script = read('script.js');
  vm.runInContext([
    block(script, 'function isJapanese'), block(script, 'function normalizeString'), block(script, 'function isKanaScript'),
    block(script, 'async function readingToRomaji'), block(script, 'function convertToRomaji'),
    'const ' + block(script, 'const HYLIAN_YOON_MAP').replace(/^const HYLIAN_YOON_MAP\s*=\s*/, 'HYLIAN_YOON_MAP = ') + ';',
    block(script, 'function convertToHylian'),
    read('jsMapping/WWHylianMap.js'), read('jsMapping/3dHylianMap.js'), read('jsMapping/64HylianMap.js'),
    'this.WW = windwakerGlyphMap; this.OOT3D = ocarina3dGlyphMap; this.OOT64 = ocarina64GlyphMap;'
  ].join('\n'), sandbox);
  const { convertToRomaji, convertToHylian, readingToRomaji, normalizeString, WW, OOT3D } = sandbox;

  await test('テリーショップ: Wind Waker keeps ー as a short hyphen glyph; every other script writes a vowel', () => {
    eq(convertToRomaji('テリーショップ', true), 'teri\u30fcshoppu');
    eq(convertToRomaji('テリーショップ', false), 'teriishoppu');
    const glyphs = convertToHylian(convertToRomaji('テリーショップ', true), WW);
    ok(glyphs.includes('-') && !glyphs.includes('\u2014'), `Wind Waker glyphs ${JSON.stringify(glyphs)} should hold "-" and no long dash`);
    eq(WW['ー'], '-', 'Wind Waker glyph for ー');
    ok(!('ー' in OOT3D), 'Ocarina of Time must never keep ー');
  });
  await test('kana typed as romaji: "nintendo" keeps its "do" glyph', () => {
    const glyphs = convertToHylian('nintendo', WW);
    eq(glyphs.length, 5, 'ni-n-te-n-do is five Wind Waker glyphs');
  });

  // the Japanese reading dictionary (about 3 seconds to load)
  let kuro = null;
  await test('Japanese dictionary loads from dict/', async () => {
    const Kuroshiro = require('kuroshiro').default || require('kuroshiro');
    const Analyzer = require('kuroshiro-analyzer-kuromoji');
    kuro = new Kuroshiro();
    await kuro.init(new Analyzer({ dictPath: path.join(ROOT, 'dict') + path.sep }));
  });
  if (kuro) {
    const roman = async (text, version) => normalizeString(await readingToRomaji(kuro, text, version));
    await test('任天堂 keeps its "do": kana scripts read it "nintendou", letter scripts "nintendo"', async () => {
      for (const v of ['windwaker', 'ocarinaOfTime3d', 'ocarinaOfTime64']) eq(await roman('任天堂', v), 'nintendou', v);
      for (const v of ['botw', 'skywardSword', 'twilightPrincess']) eq(await roman('任天堂', v), 'nintendo', v);
      eq(convertToHylian(await roman('任天堂', 'windwaker'), WW), convertToHylian('nintendou', WW), 'same glyphs as typing nintendou');
    });
    await test('へ / は / を stay "he" / "ha" / "wo" with kanji in the text, in every kind of script', async () => {
      eq(await roman('学校へ行く', 'windwaker'), 'gakkouheiku');
      eq(await roman('学校へ行く', 'botw'), 'gakkoheiku');
      eq(await roman('私は学校を出て東京へ行く', 'botw'), 'watashihagakkowodetetokyoheiku');
      eq(await roman('今日はいい天気です', 'skywardSword'), 'kyohaiitenkidesu');
    });
    await test('ー with kanji: kept only by Wind Waker', async () => {
      ok((await roman('任天堂テリー', 'windwaker')).endsWith('teri\u30fc'), 'Wind Waker should end with teriー');
      eq(await roman('任天堂テリー', 'ocarinaOfTime3d'), 'nintendouterii');
    });
  }

  // transliterationMap.js: Korean, Chinese and Cyrillic input
  const mapBox = { console, CYRILLIC_GREEK_MAP: undefined, document: { documentElement: { lang: 'en' } } };
  mapBox.window = mapBox;
  vm.createContext(mapBox);
  vm.runInContext(read('jsMapping/transliterationMap.js') + '\nthis.normalizeToEnglish = normalizeToEnglish;', mapBox);
  await test('Korean: ㅕ is "yeo" and ㅖ is "ye"', async () => {
    eq(await mapBox.normalizeToEnglish('여기 예'), 'yeogi ye');
  });
  await test('Chinese pages: whole words get their context-dependent pinyin ("银行" is yin hang)', async () => {
    mapBox.document.documentElement.lang = 'zh-CN';
    mapBox.ensurePinyinInstance = async () => require(path.join(ROOT, 'vendor/pinyin-pro.js'));
    eq(await mapBox.normalizeToEnglish('银行 你好'), 'yin hang ni hao');
    mapBox.document.documentElement.lang = 'en';
  });
  await test('Cyrillic input becomes Latin', async () => {
    eq(await mapBox.normalizeToEnglish('привет'), 'privet');
  });

  // reverseTransliteration.js (Hylian -> real world output languages)
  const reverse = require(path.join(ROOT, 'jsMapping/reverseTransliteration.js'));
  await test('Hylian → real world output: Latin languages pass through, kana become hiragana / hangul / Cyrillic', () => {
    eq(reverse.transliterate('bmsa', 'de', wanakana, { kana: false }), 'bmsa');
    eq(reverse.transliterate('konnichiha', 'ja', wanakana, { kana: true }), 'こんにちは');
    eq(reverse.transliterate('konnichiha', 'ru', wanakana, { kana: true }), 'конничиха');
    ok(/^[\uAC00-\uD7AF]+$/.test(reverse.transliterate('arigatou', 'ko', wanakana, { kana: true })), 'Korean output should be hangul');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
