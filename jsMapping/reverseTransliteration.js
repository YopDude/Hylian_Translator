/**
 * Hylian -> real-world transliteration.
 *
 * The Hylian keyboards produce a *romanisation* (Latin letters, or Hepburn romaji for the kana-based scripts).
 * This file converts that romanisation into the selected output language. It is transliteration only:
 * sounds are mapped to letters, meanings are never translated.
 *
 *   - Latin-script languages (en es pt fr de it fi nl): the romanisation is the output
 *   - ja : hiragana (via wanakana) - never kanji
 *   - ko : hangul (syllable composer below)
 *   - ru uk sr : Cyrillic (tables below)
 *   - zh : intentionally not supported
 */
(function (root) {
  'use strict';

  // ---------- helpers ----------
  const isUpper = (ch) => ch !== ch.toLowerCase();
  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const isVowel = (ch) => !!ch && 'aeiou'.includes(ch);

  // ---------- Cyrillic ----------
  // Longest match first. Lower-case only: capital letters are restored afterwards.
  const CYRILLIC = {
    ru: [['shch', 'щ'], ['yo', 'ё'], ['yu', 'ю'], ['ya', 'я'], ['ye', 'е'], ['zh', 'ж'], ['kh', 'х'], ['ts', 'ц'], ['ch', 'ч'], ['sh', 'ш'], ['dj', 'дж'], ['j', 'дж'],
      ['a', 'а'], ['b', 'б'], ['v', 'в'], ['g', 'г'], ['d', 'д'], ['e', 'е'], ['z', 'з'], ['i', 'и'], ['y', 'й'], ['k', 'к'], ['l', 'л'], ['m', 'м'], ['n', 'н'], ['o', 'о'], ['p', 'п'],
      ['r', 'р'], ['s', 'с'], ['t', 'т'], ['u', 'у'], ['f', 'ф'], ['h', 'х'], ['c', 'ц'], ['q', 'к'], ['w', 'в'], ['x', 'кс']],
    uk: [['shch', 'щ'], ['yu', 'ю'], ['ya', 'я'], ['ye', 'є'], ['yi', 'ї'], ['zh', 'ж'], ['kh', 'х'], ['ts', 'ц'], ['ch', 'ч'], ['sh', 'ш'], ['j', 'дж'],
      ['a', 'а'], ['b', 'б'], ['v', 'в'], ['h', 'г'], ['g', 'ґ'], ['d', 'д'], ['e', 'е'], ['z', 'з'], ['y', 'и'], ['i', 'і'], ['k', 'к'], ['l', 'л'], ['m', 'м'], ['n', 'н'],
      ['o', 'о'], ['p', 'п'], ['r', 'р'], ['s', 'с'], ['t', 'т'], ['u', 'у'], ['f', 'ф'], ['c', 'ц'], ['q', 'к'], ['w', 'в'], ['x', 'кс']],
    sr: [['lj', 'љ'], ['nj', 'њ'], ['dz', 'џ'], ['dj', 'ђ'], ['zh', 'ж'], ['sh', 'ш'], ['ch', 'ч'], ['ts', 'ц'], ['j', 'ј'],
      ['a', 'а'], ['b', 'б'], ['v', 'в'], ['g', 'г'], ['d', 'д'], ['e', 'е'], ['z', 'з'], ['i', 'и'], ['k', 'к'], ['l', 'л'], ['m', 'м'], ['n', 'н'], ['o', 'о'], ['p', 'п'],
      ['r', 'р'], ['s', 'с'], ['t', 'т'], ['u', 'у'], ['f', 'ф'], ['h', 'х'], ['c', 'ц'], ['q', 'к'], ['w', 'в'], ['x', 'кс'], ['y', 'и']]
  };

  function toCyrillic(text, lang, kana) {
    let table = CYRILLIC[lang];
    // Ukrainian "h" is г for English text, but Japanese "ha / hi / ..." is read х
    if (kana && lang === 'uk') table = table.map((e) => (e[0] === 'h' ? ['h', 'х'] : e));
    const src = String(text);
    const low = src.toLowerCase();
    let out = '';
    let i = 0;
    while (i < low.length) {
      let hit = null;
      for (const [latin, cyr] of table) {
        if (low.startsWith(latin, i)) { hit = [latin, cyr]; break; }
      }
      if (!hit) { out += src[i]; i++; continue; }
      let cyr = hit[1];
      // Russian: a "y" between consonants / at the end of a word is a vowel ("my" -> "ми"), not a consonant
      if (lang === 'ru' && hit[0] === 'y') {
        const prev = low[i - 1] || '', next = low[i + 1] || '';
        if (/[a-z]/.test(prev) && !isVowel(prev) && !isVowel(next)) cyr = 'и';
      }
      // keep capitals: capital first letter -> capital first Cyrillic letter ("Sh" -> "Ш", "SH" -> "Ш")
      if (isUpper(src[i])) cyr = capitalize(cyr);
      out += cyr;
      i += hit[0].length;
    }
    return out;
  }

  // ---------- Hangul ----------
  // initial consonants (index into the Unicode hangul syllable block)
  const L = { g: 0, kk: 1, gg: 1, n: 2, d: 3, tt: 4, dd: 4, r: 5, l: 5, m: 6, b: 7, pp: 8, bb: 8, s: 9, ss: 10, j: 12, jj: 13, ch: 14, k: 15, t: 16, p: 17, h: 18,
    f: 17, v: 7, z: 12, c: 15, q: 15, x: 9, sh: 9, ts: 14, th: 16, ph: 17 };
  const ONSET_TOKENS = Object.keys(L).sort((a, b) => b.length - a.length);
  // vowels (index into the Unicode hangul syllable block); longest first
  const V = { yae: 3, yeo: 6, wae: 10, yi: 20, ya: 2, yo: 12, yu: 17, ye: 7, wa: 9, wo: 14, we: 15, wi: 16, oe: 11, ae: 1, eo: 4, eu: 18, ui: 19,
    oo: 13, ee: 20, a: 0, e: 5, i: 20, o: 8, u: 13, y: 20, w: 13 };
  const VOWEL_TOKENS = Object.keys(V).sort((a, b) => b.length - a.length);
  // final consonants that Korean allows (index of the "jongseong")
  const T = { k: 1, g: 1, n: 4, d: 7, t: 7, l: 8, r: 8, m: 16, b: 17, p: 17, ng: 21, s: 19 };
  const PALATAL = { a: 2, u: 17, o: 12, e: 7, i: 20 }; // "sha" -> ㅅ+ㅑ, "shu" -> ㅅ+ㅠ ...

  const matchAt = (word, i, tokens) => tokens.find((t) => word.startsWith(t, i)) || null;
  const syl = (l, v, t) => String.fromCharCode(0xAC00 + (l * 21 + v) * 28 + (t || 0));

  function wordToHangul(word) {
    let out = '', i = 0;
    while (i < word.length) {
      const onset = matchAt(word, i, ONSET_TOKENS);
      let li = 11; // ㅇ (silent) when a syllable starts with a vowel
      let palatal = false;
      if (onset) {
        const after = i + onset.length;
        if (!matchAt(word, after, VOWEL_TOKENS)) { // consonant without a vowel ("str", final "k"): add the neutral vowel ㅡ
          out += syl(L[onset], 18); i = after; continue;
        }
        li = L[onset]; palatal = onset === 'sh'; i = after;
      }
      const vTok = matchAt(word, i, VOWEL_TOKENS);
      if (!vTok) { out += word[i]; i++; continue; }
      let vi = V[vTok];
      if (palatal && PALATAL[vTok] !== undefined) vi = PALATAL[vTok];
      i += vTok.length;
      // final consonant: only when what follows is NOT a vowel (otherwise it starts the next syllable)
      let ti = 0;
      for (const c of ['ng', 'k', 'g', 'n', 'd', 't', 'l', 'r', 'm', 'b', 'p', 's']) {
        if (!word.startsWith(c, i)) continue;
        const next = word[i + c.length] || '';
        const startsVowel = next && (isVowel(next) || ((next === 'y' || next === 'w') && isVowel(word[i + c.length + 1] || '')));
        if (!startsVowel) { ti = T[c]; i += c.length; break; }
      }
      out += syl(li, vi, ti);
    }
    return out;
  }

  function toHangul(text) {
    // only runs of letters are converted; spaces, digits and punctuation pass through
    return String(text).replace(/[A-Za-z]+/g, (w) => wordToHangul(w.toLowerCase()));
  }

  // ---------- Latin letters -> hiragana ----------
  // Japanese has no l / v / c / q / x and no stand-alone consonants, so English-style text is first made
  // pronounceable the way loanwords are: l->r, v->b, c/q->k, x->ks, and a vowel after a lone consonant
  // ("o" after t/d, "u" otherwise): zelda -> zeruda -> ぜるだ.  Real romaji (from the kana scripts) skips this.
  function latinToRomaji(src) {
    const s = src.toLowerCase().replace(/l/g, 'r').replace(/v/g, 'b').replace(/c(?!h)/g, 'k').replace(/q/g, 'k').replace(/x/g, 'ks');
    let out = '', i = 0;
    while (i < s.length) {
      const c = s[i], next = s[i + 1] || '';
      if (c === 'y' && !isVowel(next)) { out += 'i'; i++; continue; } // "hy-" / "-y": y works as a vowel here
      if (!/[a-z]/.test(c) || isVowel(c) || c === 'y' || c === 'n') { out += c; i++; continue; }
      const pair = c + next, afterPair = s[i + 2] || '';
      if (['sh', 'ch', 'ts', 'th'].includes(pair) && (isVowel(afterPair) || afterPair === 'y')) { out += pair; i += 2; continue; }
      if (isVowel(next) || next === 'y' || next === c) { out += c; i++; continue; }
      out += c + (c === 't' || c === 'd' ? 'o' : 'u'); i++;
    }
    return out;
  }

  // ---------- main entry ----------
  const LATIN = ['en', 'es', 'pt', 'fr', 'de', 'it', 'fi', 'nl'];
  const SUPPORTED = LATIN.concat(['ja', 'ko', 'ru', 'uk', 'sr']); // zh is deliberately missing

  // opts.kana: the romanisation comes from a kana-based script (real romaji) rather than English-style letters
  function transliterate(rom, lang, wk, opts) {
    const kana = !!(opts && opts.kana);
    const text = String(rom || '');
    if (!text) return '';
    if (LATIN.includes(lang)) return text;
    if (lang === 'ja') {
      const wanakana = wk || root.wanakana;
      return wanakana ? wanakana.toHiragana(kana ? text.toLowerCase() : latinToRomaji(text)) : text;
    }
    if (lang === 'ko') return toHangul(text);
    if (CYRILLIC[lang]) return toCyrillic(text, lang, kana);
    return text;
  }

  const api = { transliterate, toHangul, toCyrillic, SUPPORTED, LATIN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.HylianReverse = api;
})(typeof window !== 'undefined' ? window : globalThis);
