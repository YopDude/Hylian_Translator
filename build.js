#!/usr/bin/env node
/**
 * Static page generator for Hylian Translator.
 *
 *   node build.js
 *
 * Generates, from templates/ + i18n/:
 *   /index.html, /about.html                  (English)
 *   /<lang>/index.html, /<lang>/about.html    (every other language)
 *   /sitemap.xml                              (with hreflang alternates)
 *
 * No dependencies; Node 16+. Commit the generated files: GitHub Pages serves them as-is.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const SITE = 'https://zeldatranslator.com';
// Cache-buster for the css/js/vendor/icon query strings. It is a hash of the files themselves, so it changes exactly
// when one of them changes and can no longer be forgotten.
const VER = (() => {
  const crypto = require('crypto');
  const hash = crypto.createHash('sha1');
  const files = [];
  const walk = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).forEach((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walk(rel); else files.push(rel);
  });
  ['jsMapping', 'vendor'].forEach(walk);
  ['script.js', 'reverse.js', 'state.js', 'share.js', 'ui-select.js', 'banner.js'].forEach((f) => files.push(f));
  files.push('styles.css');
  files.sort().forEach((f) => {
    let data = fs.readFileSync(path.join(ROOT, f));
    // the font URLs inside styles.css carry their own ?v=FONT_VER, which is rewritten later in this script
    if (f === 'styles.css') data = Buffer.from(data.toString('utf8').replace(/\?v=[^')]*/g, ''));
    hash.update(f).update(data);
  });
  return hash.digest('hex').slice(0, 8);
})();
const FONT_VER = '3'; // appended to every font URL (CSS + preload) so browsers re-download fonts when you change them: bump it after editing a font
const ICON_EXT = 'webp'; // images/icons/<version>.<ext> (96x96 WebP; drop real game logos in with the same names)

// Temporary banner. It hides itself after `end` (UTC), so forgetting it is safe.
// To remove it completely, set BANNER = null and re-run the build.
const BANNER = { id: 'oot-switch2-2026', start: '2026-11-05', end: '2027-01-05' };

// code = URL folder, key = key in i18n/translations.js, html = <html lang>, hreflang = alternate tag
const LANGS = [
  { code: 'en', key: 'en', html: 'en',      hreflang: 'en',      og: 'en_US', native: 'English',    label: '🇬🇧 English' },
  { code: 'ja', key: 'jp', html: 'ja',      hreflang: 'ja',      og: 'ja_JP', native: '日本語',      label: '🇯🇵 日本語' },
  { code: 'zh', key: 'zh', html: 'zh-Hans', hreflang: 'zh-Hans', og: 'zh_CN', native: '中文',        label: '🇨🇳 中文' },
  { code: 'ko', key: 'ko', html: 'ko',      hreflang: 'ko',      og: 'ko_KR', native: '한국어',      label: '🇰🇷 한국어' },
  { code: 'es', key: 'es', html: 'es',      hreflang: 'es',      og: 'es_ES', native: 'Español',    label: '🇪🇸 Español' },
  { code: 'pt', key: 'pt', html: 'pt',      hreflang: 'pt',      og: 'pt_PT', native: 'Português',  label: '🇵🇹 Português' },
  { code: 'fr', key: 'fr', html: 'fr',      hreflang: 'fr',      og: 'fr_FR', native: 'Français',   label: '🇫🇷 Français' },
  { code: 'de', key: 'de', html: 'de',      hreflang: 'de',      og: 'de_DE', native: 'Deutsch',    label: '🇩🇪 Deutsch' },
  { code: 'it', key: 'it', html: 'it',      hreflang: 'it',      og: 'it_IT', native: 'Italiano',   label: '🇮🇹 Italiano' },
  { code: 'fi', key: 'fi', html: 'fi',      hreflang: 'fi',      og: 'fi_FI', native: 'Suomi',      label: '🇫🇮 Suomi' },
  { code: 'nl', key: 'nl', html: 'nl',      hreflang: 'nl',      og: 'nl_NL', native: 'Nederlands', label: '🇳🇱 Nederlands' },
  { code: 'ru', key: 'ru', html: 'ru',      hreflang: 'ru',      og: 'ru_RU', native: 'Русский',    label: '🇷🇺 Русский' },
  { code: 'uk', key: 'uk', html: 'uk',      hreflang: 'uk',      og: 'uk_UA', native: 'Українська', label: '🇺🇦 Українська' },
  { code: 'sr', key: 'sr', html: 'sr',      hreflang: 'sr',      og: 'sr_RS', native: 'Српски',     label: '🇷🇸 Српски' }
];
const PAGES = ['index', 'about'];
const KEYWORDS_EN = 'Zelda, Hylian Translator, Zelda translator, Hylian language, Zelda fonts, Ocarina of Time, Wind Waker, Twilight Princess, Sheikah, Gerudo, Hylian alphabet';

// ---------- load data ----------
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'i18n/translations.js'), 'utf8') + ';this.T = translations;', ctx);
const T = ctx.T;
const X = require('./i18n/extras.js');
const UI = require('./i18n/ui-strings.js'); // About tooltip + reverse-mode strings
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const templates = { index: read('templates/index.template.html'), about: read('templates/about.template.html') };
// Navigates to the chosen language (the <select> carries no inline handler).
const languageSelectScript = "(function(){var s=document.getElementById('languageSelect');if(s)s.addEventListener('change',function(){if(s.value)location.href=s.value;});})();";
const bannerScript = read('banner.js').replace(/^\s*\/\/.*$/gm, '').trim();

// ---------- helpers ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const urlPath = (lang, page) => (lang.code === 'en' ? '/' : `/${lang.code}/`) + (page === 'about' ? 'about.html' : '');
const filePath = (lang, page) => path.join(ROOT, lang.code === 'en' ? '' : lang.code, page + '.html');

// relative URL from one site path to another (so pages also work in a subfolder or locally)
function rel(from, to) {
  const fromDir = from.endsWith('/') ? from : path.posix.dirname(from);
  const toNoSlash = to.length > 1 && to.endsWith('/') ? to.slice(0, -1) : to;
  let r = path.posix.relative(fromDir, toNoSlash);
  // Links point at the explicit index.html (works on any host and when opening files locally);
  // canonical / hreflang / sitemap keep the clean folder URLs.
  if (to.endsWith('/')) r = r === '' ? 'index.html' : r + '/index.html';
  return r;
}

function strings(lang) {
  const en = T.en, own = T[lang.key], ex = X[lang.key], exEn = X.en;
  const out = {};
  for (const k of Object.keys(en)) {
    if (k === 'tooltips') continue;
    out[k] = own[k] ?? ex[k] ?? en[k];
    if (own[k] === undefined && ex[k] === undefined && lang.key !== 'en') console.warn(`  [${lang.code}] missing "${k}", using English`);
  }
  for (const k of ['langLabel', 'bannerClose', 'bannerText', 'metaIndex', 'metaAbout']) out[k] = ex[k] ?? exEn[k];
  for (const k of Object.keys(en.tooltips)) out['tip_' + k] = (own.tooltips && own.tooltips[k]) || en.tooltips[k];
  const ui = UI[lang.key] || {};
  for (const k of Object.keys(UI.en)) out[k] = ui[k] ?? UI.en[k];
  // the About-button tooltip: its own translation where translations.js has none (it used to fall back to English)
  out.tip_aboutPageBtn = ui.tipAbout || (own.tooltips && own.tooltips.aboutPageBtn) || en.tooltips.aboutPageBtn;
  // "*The Legend of Zelda*" was markdown-style in the source strings -> real emphasis
  out.disclaimerText = out.disclaimerText.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  out.aboutShortTitle = out.aboutPageTitle.split(' – ')[0];
  out.translatedTextJson = JSON.stringify(out.translatedText).replace(/</g, '\\u003c');
  return out;
}

// Output languages of the Hylian -> real-world mode. Chinese is deliberately left out (logographic, not transliterable).
const OUTPUT_LANGS = LANGS.filter((l) => l.code !== 'zh');
function outputOptions(lang) {
  const def = lang.code === 'zh' ? 'en' : lang.code;
  return OUTPUT_LANGS.map((l) =>
    `        <option value="${l.html}"${l.code === def ? ' selected' : ''}>${l.code === 'ja' ? '🇯🇵 日本語 (ひらがな)' : l.label}</option>`).join('\n');
}

function languageSelect(lang, page) {
  const from = urlPath(lang, page);
  const opts = LANGS.map((l) =>
    `        <option value="${rel(from, urlPath(l, page))}" lang="${l.html}"${l.code === lang.code ? ' selected' : ''}>${l.label}</option>`).join('\n');
  return `      <select id="languageSelect" aria-label="${esc(X[lang.key].langLabel)}">\n${opts}\n      </select>`;
}

function languageLinks(lang, page) {
  const from = urlPath(lang, page);
  const links = LANGS.map((l) =>
    `<a href="${rel(from, urlPath(l, page))}" hreflang="${l.hreflang}" lang="${l.html}"${l.code === lang.code ? ' aria-current="page"' : ''}>${l.native}</a>`).join('\n      ');
  return `    <nav class="lang-links" aria-label="${esc(X[lang.key].langLabel)}">\n      ${links}\n    </nav>`;
}

function hreflangTags(page) {
  const tags = LANGS.map((l) => `  <link rel="alternate" hreflang="${l.hreflang}" href="${SITE}${urlPath(l, page)}">`);
  tags.push(`  <link rel="alternate" hreflang="x-default" href="${SITE}${urlPath(LANGS[0], page)}">`);
  return tags.join('\n');
}

function bannerHtml(s) {
  if (!BANNER) return '';
  return `  <div id="eventBanner" class="event-banner" hidden data-id="${BANNER.id}" data-start="${BANNER.start}T00:00:00Z" data-end="${BANNER.end}T00:00:00Z">
    <span class="event-banner__icon" aria-hidden="true">b</span>
    <p class="event-banner__text">${s.bannerText}</p>
    <button type="button" class="event-banner__close" aria-label="${esc(s.bannerClose)}">&times;</button>
  </div>
  <script>${bannerScript}</script>`;
}

function render(tpl, vars, where) {
  return tpl.replace(/\{\{(\w+)(\|a)?\}\}/g, (_, name, attr) => {
    if (!(name in vars)) throw new Error(`Unknown template variable {{${name}}} in ${where}`);
    return attr ? esc(vars[name]) : vars[name];
  });
}

// ---------- keep the font URLs in styles.css versioned ----------
{
  const cssPath = path.join(ROOT, 'styles.css');
  const css = fs.readFileSync(cssPath, 'utf8');
  const next = css.replace(/url\('(fonts\/[^'?]+)(?:\?v=[^']*)?'\)/g, `url('$1?v=${FONT_VER}')`);
  if (next !== css) fs.writeFileSync(cssPath, next);
}

// ---------- build ----------
// <lastmod> in the sitemap should only change when a page's content changes, not on every build. tools/lastmod.json
// remembers a hash of each page (ignoring the cache-buster) and the date it last changed.
const LASTMOD_FILE = path.join(ROOT, 'tools', 'lastmod.json');
let lastmod = {};
try { lastmod = JSON.parse(fs.readFileSync(LASTMOD_FILE, 'utf8')); } catch (_) { /* first build */ }
const today = new Date().toISOString().slice(0, 10);
const nextLastmod = {};
function recordLastmod(url, html) {
  const hash = require('crypto').createHash('sha1')
    .update(html.replace(/\?v=[0-9a-f]{8}/g, '').replace(/"ver":"[0-9a-f]{8}"/g, '')).digest('hex').slice(0, 12);
  const prev = lastmod[url];
  nextLastmod[url] = prev && prev.hash === hash ? prev : { hash, date: today };
}
let count = 0;
for (const lang of LANGS) {
  const s = strings(lang);
  for (const page of PAGES) {
    const from = urlPath(lang, page);
    const vars = Object.assign({}, s, {
      htmlLang: lang.html, ogLocale: lang.og, ver: VER, fontVer: FONT_VER, site: SITE, iconExt: ICON_EXT,
      root: lang.code === 'en' ? '' : '../',
      canonical: SITE + from,
      hreflangTags: hreflangTags(page),
      keywordsTag: lang.code === 'en' ? `  <meta name="keywords" content="${esc(KEYWORDS_EN)}"/>\n` : '',
      banner: bannerHtml(s),
      languageSelectScript,
      outputLanguageOptions: outputOptions(lang),
      pageTextJson: JSON.stringify({ root: lang.code === 'en' ? '' : '../', ver: VER, translatedText: s.translatedText, copyLabel: s.copyBtn, copiedMsg: s.copiedMsg, shareLinkCopied: s.shareLinkCopied, sharedLinkNotice: s.sharedLinkNotice, returnToMySettings: s.returnToMySettings }).replace(/</g, '\\u003c'),
      languageSelect: languageSelect(lang, page),
      languageLinks: languageLinks(lang, page),
      homeHref: rel(from, urlPath(lang, 'index')),
      aboutHref: rel(from, urlPath(lang, 'about'))
    });
    const out = render(templates[page], vars, `${lang.code}/${page}`);
    fs.mkdirSync(path.dirname(filePath(lang, page)), { recursive: true });
    fs.writeFileSync(filePath(lang, page), out);
    recordLastmod(urlPath(lang, page), out);
    count++;
  }
}

// sitemap with hreflang alternates
fs.mkdirSync(path.dirname(LASTMOD_FILE), { recursive: true });
fs.writeFileSync(LASTMOD_FILE, JSON.stringify(nextLastmod, null, 1) + '\n');
const urls = [];
for (const page of PAGES) {
  for (const lang of LANGS) {
    const alts = LANGS.map((l) => `    <xhtml:link rel="alternate" hreflang="${l.hreflang}" href="${SITE}${urlPath(l, page)}"/>`);
    alts.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${urlPath(LANGS[0], page)}"/>`);
    const priority = page === 'index' ? (lang.code === 'en' ? '1.00' : '0.90') : (lang.code === 'en' ? '0.80' : '0.70');
    urls.push(`  <url>\n    <loc>${SITE}${urlPath(lang, page)}</loc>\n    <lastmod>${nextLastmod[urlPath(lang, page)].date}</lastmod>\n    <priority>${priority}</priority>\n${alts.join('\n')}\n  </url>`);
  }
}
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`);

console.log(`Built ${count} pages + sitemap.xml (${LANGS.length} languages).`);

// ---------- warn about referenced files that are missing from the project ----------
{
  const missing = new Set();
  const need = (rel) => { const f = rel.split('?')[0]; if (f && !fs.existsSync(path.join(ROOT, f))) missing.add(f); };
  for (const m of read('styles.css').matchAll(/url\('([^']+)'\)/g)) if (!/^(data:|https?:)/.test(m[1])) need(m[1]);       // fonts, background images
  for (const m of read('script.js').matchAll(/SITE_ROOT \+ '(images\/[^']+)'/g)) need(m[1]);                                   // alphabet charts
  for (const m of read('jsMapping/fontFileMap.js').matchAll(/:"([^"]+)"/g)) need(`fonts/${m[1]}.ttf`);                         // downloadable fonts
  for (const tpl of Object.values(templates)) for (const m of tpl.matchAll(/\{\{root\}\}(images\/[^"'?{]+)/g)) if (!m[1].endsWith('.')) need(m[1]);      // images used by the pages
  for (const v of ['ocarinaOfTime3d', 'ocarinaOfTime64', 'windwaker', 'twilightPrincess', 'skywardSword', 'botw', 'gerudo', 'sheikah', 'mudoran']) need(`images/icons/${v}.${ICON_EXT}`);
  for (const v of ['wanakana.min.js', 'kuroshiro.min.js', 'kuroshiro-analyzer-kuromoji.min.js', 'pinyin-pro.js', 'html2canvas.min.js']) need(`vendor/${v}`);   // self-hosted libraries
  need('site.webmanifest');
  if (missing.size) console.warn(`\n⚠ ${missing.size} file(s) used by the site are missing from this folder:\n  ` + [...missing].sort().join('\n  '));
  else console.log('All referenced fonts, images and icons are present.');
}
