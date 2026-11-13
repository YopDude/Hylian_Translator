// Pages live at / (English) and /<lang>/ (everything else); each page sets its path back to the site root.
const SITE_ROOT = (window.PAGE_TEXT && window.PAGE_TEXT.root) || '';

// The dictionary cache is installed automatically only when Japanese readings are needed.
// Users do not need to run or configure the service worker themselves.
const DICTIONARY_CACHE_NAME = 'hylian-kuromoji-dictionary-v1';
const DICTIONARY_FILES = [
    'base.dat.gz', 'cc.dat.gz', 'check.dat.gz', 'tid.dat.gz', 'tid_map.dat.gz',
    'tid_pos.dat.gz', 'unk.dat.gz', 'unk_char.dat.gz', 'unk_compat.dat.gz',
    'unk_invoke.dat.gz', 'unk_map.dat.gz', 'unk_pos.dat.gz'
];
// Prime the browser's own persistent HTTP cache. Kuromoji loads these same
// same-origin URLs via XHR, which then reuses the cached responses. No service
// worker or user setup is required.
async function areDictionaryFilesCached() {
    try {
        const results = await Promise.all(DICTIONARY_FILES.map(async (file) => {
            const url = new URL(KUROMOJI_DICT_BASE + file, location.href);
            const response = await fetch(url.href, { cache: 'only-if-cached', mode: 'same-origin' });
            return response.ok;
        }));
        return results.every(Boolean);
    } catch (_) {
        return false;
    }
}

async function primeDictionaryHttpCache() {
    await Promise.all(DICTIONARY_FILES.map(async (file) => {
        const url = new URL(KUROMOJI_DICT_BASE + file, location.href);
        const response = await fetch(url.href, { cache: 'force-cache' });
        if (!response.ok) throw new Error('Failed to load Japanese dictionary file: ' + file);
    }));
}

// Declare DOM elements and other frequently accessed variables at the top
const inputTextElement = document.getElementById("inputText");
const translatedTextElement = document.getElementById("translatedText");
const hylianVersionElement = document.getElementById("hylianVersion");
const gamecubeOption = document.getElementById('gamecubeOption');
const wiiOption = document.getElementById('wiiOption');
const twilightPrincessOptions = document.getElementById('twilightPrincessOptions');
const fontSizeSlider = document.getElementById("fontSizeSlider");
const fontColorInput = document.getElementById('fontColor');
const translatedTextContainer = document.getElementById("translatedText");
const fontSizeValueElement = document.getElementById("fontSizeValue");
const exportPngElement = document.getElementById('exportPNGBtn');
const downloadFontElement = document.getElementById('downloadFontBtn');
const overlay = document.getElementById('overlay');
const showHylianMapBtn = document.getElementById('showHylianMapBtn');
const closeOverlayBtn = document.getElementById('closeOverlayBtn');
const hylianMapImage = document.getElementById('hylianMapImage');
const hylianVersionSelect = document.getElementById('hylianVersion');
const loadingIndicator = document.getElementById('loadingIndicator');
//Chinese characters
const PINYIN_SCRIPT = 'https://cdn.jsdelivr.net/npm/pinyin-pro@3.18.3/dist/index.js';
let pinyinLibPromise = null;

async function ensurePinyinInstance() {
    if (window.pinyinPro) return window.pinyinPro;
    if (!pinyinLibPromise) {
        pinyinLibPromise = loadKanjiScriptOnce(PINYIN_SCRIPT).then(() => window.pinyinPro);
    }
    return pinyinLibPromise;
}


//Japanese characters
const KUROMOJI_DICT_BASE = SITE_ROOT + 'dict/';
// Add this line below:
const KUROSHIRO_SCRIPT = 'https://cdn.jsdelivr.net/npm/kuroshiro@1.2.0/dist/kuroshiro.min.js';
const KUROSHIRO_ANALYZER_SCRIPT =
  'https://cdn.jsdelivr.net/npm/kuroshiro-analyzer-kuromoji@1.1.0/dist/kuroshiro-analyzer-kuromoji.min.js';

/** @type {Promise<unknown>|null} */
let kuroshiroInitPromise = null;

/** Bumped on each translate; stale async work must not touch the DOM. */
let translateGeneration = 0;
/** Last font-family applied to the output; avoids FOUT to system sans while a new webfont loads. */
let lastCommittedFontFamily = null;

function primaryFamilyFromCssFontFamily(cssFontFamily) {
  const trimmed = cssFontFamily.trim();
  const sq = trimmed.match(/^'([^']*)'/);
  if (sq) return sq[1];
  const dq = trimmed.match(/^"([^"]*)"/);
  if (dq) return dq[1];
  const first = trimmed.split(',')[0].trim();
  return first.replace(/^["']|["']$/g, '');
}

async function ensureFontReady(targetFont, gen) {
  if (gen !== translateGeneration) return;
  if (!targetFont || targetFont.trim() === 'sans-serif') return;
  const primary = primaryFamilyFromCssFontFamily(targetFont);
  if (!primary || primary === 'sans-serif') return;
  const fontSizeRem = fontSizeSlider.value;
  const loadSpec = `${fontSizeRem}rem "${primary}"`;
  if (document.fonts.check(loadSpec)) return;
  try {
    await document.fonts.load(loadSpec);
  } catch (e) {
    // Still commit after load failure so text is not stuck forever.
  }
}

function syncMirrorClassForVersion(version) {
  translatedTextElement.classList.remove('mirror-text');
  if (version === 'twilightPrincess' && wiiOption.checked) {
    translatedTextElement.classList.add('mirror-text');
  }
}

function getFontFamilyString(version) {
  switch (version) {
    case 'twilightPrincess':
      return "'TP Hylian - GCN', sans-serif";
    case 'skywardSword':
      return "'SS Ancient Hylian', sans-serif";
    case 'botw':
      return "'Albw Botw Hylian', sans-serif";
    case 'gerudo':
      return "'Gerudo', sans-serif";
    case 'sheikah':
      return "'BotW Sheikah', sans-serif";
    case 'mudoran':
      return "'Mudoran', sans-serif";
    default:
      return 'sans-serif';
  }
}

function getJapaneseFontFamilyString(version) {
  switch (version) {
    case 'windwaker':
      return "'Ancient Hylian', sans-serif";
    case 'ocarinaOfTime64':
      return "'Hylian64', sans-serif";
    case 'ocarinaOfTime3d':
      return "'Hero Hylian', sans-serif";
    default:
      return '';
  }
}

function loadHtml2Canvas() {
  if (window.html2canvas) return Promise.resolve(window.html2canvas);

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-html2canvas]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.html2canvas));
      existing.addEventListener('error', reject);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/0.4.1/html2canvas.min.js';
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.dataset.html2canvas = 'true';
    script.onload = () => resolve(window.html2canvas);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Image mapping with mobile versions
const hylianVersionImages = {
  "ocarinaOfTime3d": SITE_ROOT + 'images/ocarina.png',
  "ocarinaOfTime3d-mobile": SITE_ROOT + 'images/ocarina-mobile.png',
  "ocarinaOfTime64": SITE_ROOT + 'images/ocarina64.png',
  "ocarinaOfTime64-mobile": SITE_ROOT + 'images/ocarina-mobile64.png',
  "windwaker": SITE_ROOT + 'images/windwaker.png',
  "windwaker-mobile": SITE_ROOT + 'images/windwaker-mobile.png',
  "twilightPrincess": SITE_ROOT + 'images/twilight.png',
  "twilightPrincess-mobile": SITE_ROOT + 'images/twilight-mobile.png',
  "skywardSword": SITE_ROOT + 'images/skyward.png',
  "skywardSword-mobile": SITE_ROOT + 'images/skyward-mobile.png',
  "botw": SITE_ROOT + 'images/botw.png',
  "botw-mobile": SITE_ROOT + 'images/botw-mobile.png',
  "gerudo": SITE_ROOT + 'images/gerudo.png',
  "gerudo-mobile": SITE_ROOT + 'images/gerudo-mobile.png',
  "sheikah": SITE_ROOT + 'images/sheikah.png',
  "sheikah-mobile": SITE_ROOT + 'images/sheikah-mobile.png',
  "mudoran": SITE_ROOT + 'images/mudoran.png',
  "mudoran-mobile": SITE_ROOT + 'images/mudoran-mobile.png',
};

// Event listeners
inputTextElement.addEventListener("input", translateText); // Attach event listener to the inputTextArea
hylianVersionElement.addEventListener('change', inputTextReady); // Add an event listener for the <select> element 'change' event

showHylianMapBtn.addEventListener('click', () => {
  const selectedVersion = hylianVersionSelect.value;
  const imageToDisplay = preloadImage(selectedVersion);

  // Show loading indicator
  loadingIndicator.style.display = 'block';

  // Wait for the image to load before showing it
  imageToDisplay.onload = function() {
    loadingIndicator.style.display = 'none'; // Hide loading indicator when image is loaded
    hylianMapImage.src = imageToDisplay.src; // Set the source of the image once it's loaded
    overlay.classList.add('open');
  };

  // In case the image fails to load, handle the error
  imageToDisplay.onerror = function() {
    loadingIndicator.style.display = 'none'; // Hide loading indicator on error
    console.error('Failed to load the image.');
  };
});

// Close the overlay when the close button is clicked
closeOverlayBtn.addEventListener('click', () => {
  overlay.classList.remove('open');
});

// Close the overlay when clicked outside the image
overlay.addEventListener('click', (event) => {
  if (event.target === overlay) {
    overlay.classList.remove('open');
  }
});

window.addEventListener('resize', () => {
  const selectedVersion = hylianVersionSelect.value;
  const imageToDisplay = preloadImage(selectedVersion); // Preload the image again based on the current version

  // Update the image source
  hylianMapImage.src = imageToDisplay.src;
});

// Event listener for the dropdown change
hylianVersionElement.addEventListener('change', function () {
  const selectedVersion = this.value;
  showTwilight(selectedVersion);  // Call the function to show or hide Twilight Princess options based on the selection
  // Preload and update the selected overlay image
  const imageToDisplay = preloadImage(selectedVersion);
  
  // Wait for the image to load before updating the overlay
  imageToDisplay.onload = function() {
  hylianMapImage.src = imageToDisplay.src; // Update the overlay image
  };

  // Focus the active editor after both translation modes have processed the version change.
  // reverse.js rebuilds its keyboard synchronously from the same change event, so defer
  // focus until the next frame to ensure the selected editor is ready.
  requestAnimationFrame(() => {
    const reverseInput = document.getElementById('hylianInput');
    const translatorCard = document.getElementById('translatorCard');
    const activeInput = translatorCard && translatorCard.classList.contains('reverse-mode')
      ? reverseInput
      : inputTextElement;
    if (activeInput && !activeInput.disabled) {
      if (activeInput === reverseInput && window.HylianReverseUI && typeof window.HylianReverseUI.focusEnd === 'function') {
        // The reverse editor is contenteditable; set its DOM selection explicitly.
        // In mirrored Twilight Princess the DOM end is visually on the left, as intended.
        window.HylianReverseUI.focusEnd();
      } else {
        activeInput.focus({ preventScroll: true });
        if (typeof activeInput.setSelectionRange === 'function') {
          const end = activeInput.value.length;
          activeInput.setSelectionRange(end, end);
        }
      }
    }
  });
});

// Check the selected version when the page loads or refreshes
window.addEventListener('load', function () {
  const selectedVersion = hylianVersionElement.value;

  // If "Twilight Princess" is selected, run showTwilight
  if (selectedVersion === 'twilightPrincess') {
    showTwilight(selectedVersion);
  }
  // If the text input is not empty on reload, run translate function
  inputTextReady();

  // Apply the current font size from the slider (if any) on page load
  const fontSizeValue = fontSizeSlider.value;
  translatedTextElement.style.fontSize = fontSizeValue + "rem"; // Apply font size in rem
  fontSizeValueElement.textContent = fontSizeValue + "x"; // Update label to match slider

  // Apply the current font color from the color picker (if any) on page load
  const fontColorValue = fontColorInput.value;
  translatedTextElement.style.color = fontColorValue; // Apply the font color
  preloadImage(selectedVersion);  // Preload the selected over lay image for the version
});

// Change the font when a radio button is selected
gamecubeOption.addEventListener('change', function () {
  if (this.checked) {
    inputTextReady();
  }
});

wiiOption.addEventListener('change', function () {
  if (this.checked) {
    inputTextReady();
  }
});

// Function to update the font size and display it as a multiplier (x)
fontSizeSlider.addEventListener("input", function () {
  let fontSizeValue = parseFloat(fontSizeSlider.value).toFixed(1);  // Slider value, e.g., 3, 4, etc.

  // Apply the font size in rem to the translatedText
  translatedTextElement.style.fontSize = fontSizeValue + "rem";  // Apply font size in rem
  fontSizeValueElement.textContent = fontSizeValue + "x"; // Display it as x
});

// Function to change the font color
fontColorInput.addEventListener('input', function (event) {
  const color = event.target.value;
  translatedTextElement.style.color = color;
  updateOutputContrast();
});

// ---- Contrast auto-guard ----------------------------------------------------------------------------------------
// If the chosen text colour would be hard to read on the (light) card, the output panel switches to a dark theme.
// It is re-evaluated only when the colour changes, and any normal / dark colour keeps the default light panel.
const outputPanel = document.getElementById('outputPanel');
const MIN_CONTRAST = 3; // WCAG AA for large text (the output is always large)

function relativeLuminance(r, g, b) {
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function parseCssColor(value) {
  const hex = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (hex) return [parseInt(hex[1].slice(0, 2), 16), parseInt(hex[1].slice(2, 4), 16), parseInt(hex[1].slice(4, 6), 16)];
  const rgb = /rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(value);
  return rgb ? [+rgb[1], +rgb[2], +rgb[3]] : null;
}

function contrastRatio(a, b) {
  const la = relativeLuminance(...a), lb = relativeLuminance(...b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function updateOutputContrast() {
  if (!outputPanel) return;
  const text = parseCssColor(fontColorInput.value);
  const card = outputPanel.closest('.text-block') || document.body;
  const light = parseCssColor(getComputedStyle(card).backgroundColor) || [247, 241, 225]; // the card's default background
  if (!text) return;
  outputPanel.classList.toggle('output-dark', contrastRatio(text, light) < MIN_CONTRAST);
}
updateOutputContrast();

function umdDefault(globalName) {
  const mod = window[globalName];
  if (mod == null) return null;
  return mod.default != null ? mod.default : mod;
}

function loadKanjiScriptOnce(src) {
  return new Promise(function (resolve, reject) {
    const marker = encodeURIComponent(src);
    const sel = 'script[data-hylian-kanji-src="' + marker + '"]';
    const existing = document.querySelector(sel);
    if (existing) {
      if (existing.getAttribute('data-loaded') === '1') {
        resolve();
        return;
      }
      existing.addEventListener(
        'load',
        function () {
          existing.setAttribute('data-loaded', '1');
          resolve();
        },
        { once: true }
      );
      existing.addEventListener(
        'error',
        function () {
          reject(new Error('Failed to load script: ' + src));
        },
        { once: true }
      );
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.setAttribute('data-hylian-kanji-src', marker);
    s.addEventListener('load', function () {
      s.setAttribute('data-loaded', '1');
      resolve();
    });
    s.addEventListener('error', function () {
      reject(new Error('Failed to load script: ' + src));
    });
    document.head.appendChild(s);
  });
}

async function ensureKuroshiroInstance(options = {}) {
  if (window.__hylianKuroshiro) return window.__hylianKuroshiro;

  if (!kuroshiroInitPromise) {
    kuroshiroInitPromise = (async function () {
      // Check the browser HTTP cache before deciding whether the first-download
      // indicator is needed. The fetches below prime that same cache for Kuromoji.
      const dictionaryCached = await areDictionaryFilesCached();
      const showLoading = options.showLoading !== false && !dictionaryCached;
      const spinnerOverlay = showLoading ? document.querySelector('.loadingIndicator') : null;

      // Japanese-page warmup is always silent. Elsewhere, show the loader only for the
      // first uncached dictionary download; cached dictionary initialization stays quiet.
      if (spinnerOverlay) spinnerOverlay.style.display = 'block';
      if (showLoading) document.body.style.cursor = 'wait';

      try {
        await primeDictionaryHttpCache();
        await loadKanjiScriptOnce(KUROSHIRO_SCRIPT);
        await loadKanjiScriptOnce(KUROSHIRO_ANALYZER_SCRIPT);
        const Kuroshiro = umdDefault('Kuroshiro');
        const KuromojiAnalyzer = umdDefault('KuromojiAnalyzer');

        if (!Kuroshiro || !KuromojiAnalyzer) {
          throw new Error('Kuroshiro or KuromojiAnalyzer not available');
        }

        const kuroshiro = new Kuroshiro();
        await kuroshiro.init(new KuromojiAnalyzer({ dictPath: KUROMOJI_DICT_BASE }));
        window.__hylianKuroshiro = kuroshiro;
        return kuroshiro;
      } finally {
        if (spinnerOverlay) spinnerOverlay.style.display = 'none';
        if (showLoading) document.body.style.cursor = 'default';
      }
    })();
  }

  try {
    return await kuroshiroInitPromise;
  } catch (e) {
    kuroshiroInitPromise = null;
    throw e;
  }
}


// Attach event listeners to export buttons (add buttons to your HTML)
exportPngElement.addEventListener('click', () => {
  exportAsPNG().catch((err) => {
    console.error('Export as PNG failed:', err);
    alert('PNG export failed to load required library. Please check your connection and try again.');
  });
});

// Function to handle font change and translation logic
async function translateText() {
    const gen = ++translateGeneration;
    const originalInput = String(inputTextElement.value);
    const version = hylianVersionElement.value;

    if (!originalInput) {
        translatedTextElement.textContent = "";
        return;
    }

    // 1. First, normalize the text (Handled in transliterationMap.js)
    let workingText = originalInput;
    if (typeof window.normalizeToEnglish === 'function') {
        workingText = await window.normalizeToEnglish(originalInput);
    }

    let romajiOutput = "";

    // Chinese UI pages normalize Hanzi to Pinyin before this point. Do not initialize the
    // Japanese dictionary there; on other pages, Kanji/Kana use Kuroshiro readings.
    const chineseUi = (document.documentElement.lang || '').toLowerCase().startsWith('zh');
    // Only Han characters trigger the Japanese dictionary on non-Japanese,
    // non-Chinese pages. Kana alone can be handled by the lightweight romaji path.
    const containsKanji = /[\u4E00-\u9FFF]/.test(originalInput + workingText);
    if (!chineseUi && containsKanji) {
        const kuro = await ensureKuroshiroInstance();
        romajiOutput = await kuro.convert(workingText, { to: "romaji" });
    } else {
        // Otherwise, use standard wanakana/romaji conversion
        romajiOutput = convertToRomaji(workingText);
    }

    // 3. Now route to the specific Zelda game font logic
    const isJapaneseVersion = version === 'windwaker' || version === 'ocarinaOfTime64' || version === 'ocarinaOfTime3d';
    let targetFont = 'sans-serif';
    let innerHTML = '';

    if (isJapaneseVersion) {
        targetFont = getJapaneseFontFamilyString(version);
        const glyphIndexMap = getGlyphIndexMap(version);
        const hylianText = convertToHylian(romajiOutput, glyphIndexMap);
        innerHTML = hylianText.split('\n').join('<br>');
    } else if (version === 'mudoran') {
        targetFont = getFontFamilyString(version);
        // Nod to ALttP: Japanese input uses the D/E/F glyph set (one glyph per Japanese character, as in the Japanese
        // release), anything else uses A/B/C. Detect on the ORIGINAL input: romajiOutput is already Latin by now.
        // (On Chinese pages Han characters are Chinese, not Japanese, so only kana switches the set there.)
        const japaneseInput = /[\u3040-\u30FF]/.test(originalInput) || (!chineseUi && /[\u4E00-\u9FFF]/.test(originalInput));
        innerHTML = mudoranifyToHtml(japaneseInput ? originalInput : romajiOutput, japaneseInput);
    } else {
        // English-based versions (BotW, TP, Skyward Sword)
        targetFont = getFontFamilyString(version);
        const normalizedText = normalizeString(romajiOutput);
        innerHTML = escapeHtml(normalizedText).split('\n').join('<br>');
    }

    // 4. Update the UI
    if (targetFont !== lastCommittedFontFamily) {
        await ensureFontReady(targetFont, gen);
    }
    if (gen !== translateGeneration) return;

    syncMirrorClassForVersion(version);
    translatedTextElement.style.fontFamily = targetFont;
    translatedTextElement.innerHTML = innerHTML;
    lastCommittedFontFamily = targetFont;
}

// Helper function to check if the input contains Japanese characters
function isJapanese(input) {
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(input);
}

// Function to normalize string (remove accents, etc.)
function normalizeString(input) {
  // We only want to normalize non-Japanese text. 
  // If it's Japanese, we skip the NFD normalization which breaks dakuten.
  if (isJapanese(input)) return input;
  return input.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Function to get the glyph map based on version
function getGlyphIndexMap(version) {
  switch (version) {
    case "windwaker":
      return windwakerGlyphMap;
    case "ocarinaOfTime64":
      return ocarina64GlyphMap;
    case "ocarinaOfTime3d":
      return ocarina3dGlyphMap;
    default:
      return {};  // Default empty map if no valid version
  }
}

// Function to convert input to Romaji using wanakana
function convertToRomaji(input) {
  return wanakana.toRomaji(input);
}

const HYLIAN_YOON_MAP = {
    "gya": ["gi", "ya"], "gyu": ["gi", "yu"], "gyo": ["gi", "yo"],
    "kya": ["ki", "ya"], "kyu": ["ki", "yu"], "kyo": ["ki", "yo"],
    "sha": ["shi", "ya"], "shu": ["shi", "yu"], "sho": ["shi", "yo"],
    "shya": ["shi", "ya"], "shyu": ["shi", "yu"], "shyo": ["shi", "yo"],
    "cha": ["chi", "ya"], "chu": ["chi", "yu"], "cho": ["chi", "yo"],
    "nya": ["ni", "ya"], "nyu": ["ni", "yu"], "nyo": ["ni", "yo"],
    "hya": ["hi", "ya"], "hyu": ["hi", "yu"], "hyo": ["hi", "yo"],
    "mya": ["mi", "ya"], "myu": ["mi", "yu"], "myo": ["mi", "yo"],
    "rya": ["ri", "ya"], "ryu": ["ri", "yu"], "ryo": ["ri", "yo"],
    "ja": ["ji", "ya"], "ju": ["ji", "yu"], "jo": ["ji", "yo"],
    "jya": ["ji", "ya"], "jyu": ["ji", "yu"], "jyo": ["ji", "yo"],
    "bya": ["bi", "ya"], "byu": ["bi", "yu"], "byo": ["bi", "yo"],
    "pya": ["pi", "ya"], "pyu": ["pi", "yu"], "pyo": ["pi", "yo"]
  };

// Function to convert Romaji to Hylian characters with special handling for yoon combinations
function convertToHylian(input, glyphIndexMap) {
  let hylianText = "";
  let modifiedText = input.toLowerCase();



  // Replace non-japanese letters
  modifiedText = modifiedText.replace(/[lv]/g, match => match === 'l' ? 'r' : 'b');
  modifiedText = modifiedText.replace(/([kgzstcdjhfbpmr])\1(?=(a[aiueo]|[aiueo]|y[aiueo]))/g, (match, consonant) => 'tsu' + consonant);

  // Replace yoon combinations with their corresponding syllable pairs
  for (let yoon in HYLIAN_YOON_MAP) {
    const [firstSyllable, secondSyllable] = HYLIAN_YOON_MAP[yoon];
    modifiedText = modifiedText.replace(new RegExp(yoon, 'g'), `${firstSyllable}${secondSyllable}`);
  }

  // Process each character and apply glyph mappings
  let i = 0;
  while (i < modifiedText.length) {
    const currentChar = modifiedText[i];

    // Check for 3-letter syllables (e.g., "shi", "chi", "tsu")
    if (i + 2 < modifiedText.length) {
      const threeSyllable = modifiedText.substring(i, i + 3);
      if (glyphIndexMap[threeSyllable]) {
        hylianText += glyphIndexMap[threeSyllable];
        i += 3;
        continue;
      }
    }

    // Check for 2-letter syllables (e.g., "ka", "ki", "ku")
    if (i + 1 < modifiedText.length) {
      const twoSyllable = modifiedText.substring(i, i + 2);
      if (glyphIndexMap[twoSyllable]) {
        hylianText += glyphIndexMap[twoSyllable];
        i += 2;
        continue;
      }
    }

    // Check for 1-letter syllables (e.g., "a", "i", "u")
    if (glyphIndexMap[currentChar]) {
      hylianText += glyphIndexMap[currentChar];
      i++;
      continue;
    }

    // Handle new lines
    if (currentChar === "\n") {
      hylianText += "\n";
      i++;
      continue;
    }

    i++;
  }

  return hylianText;
}

// Typed text is inserted with innerHTML (to keep <br> line breaks), so it must be escaped: otherwise text such as
// "<img onerror=...>" - typed, or arriving through a shared link - would run as markup.
function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Mudoranify function for joke translation (returns HTML fragment)
function mudoranifyToHtml(input, japanese) {
  const choices = japanese ? ['D', 'E', 'F'] : ['A', 'B', 'C'];
  let translatedText = '';

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    const isLatin = /[a-zA-Z]/.test(char);
    const isJap = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(char);

    if (isLatin || isJap) {
      const code = char.charCodeAt(0);

      const idx = (code + i) % choices.length;
      translatedText += choices[idx];
    } else {
      translatedText += escapeHtml(char);
    }
  }

  return translatedText.split('\n').join('<br>');
}

// Don't translate if inputText area is still blank
function inputTextReady() {
  if (inputTextElement.value.length !== 0) {
    translateText();
  }
}

// Function to show or hide the Twilight Princess radio buttons
function showTwilight(selectedVersion) {
  if (selectedVersion === 'twilightPrincess') {
    twilightPrincessOptions.style.display = 'block'; // Show the options

    if (gamecubeOption.checked || wiiOption.checked) {
      inputTextReady();
    }
  } else {
    twilightPrincessOptions.style.display = 'none'; // Hide the options
    translatedTextElement.classList.remove('mirror-text'); // Remove mirror effect
  }
}

// Event listener for the Download Font button
downloadFontElement.addEventListener('click', function () {
  const selectedFontVersion = hylianVersionElement.value;
  const fontFileName = fontFileMap[selectedFontVersion];

  if (fontFileName) {
    const fontUrl = `${SITE_ROOT}fonts/${fontFileName}.ttf`;
    downloadFont(fontUrl, `${fontFileName}.ttf`);
  } else {
    alert('Font file not found for the selected font version.');
  }
});

// Function to download the font file
function downloadFont(fontUrl, fontName) {
  const link = document.createElement('a');
  link.href = fontUrl;
  link.download = fontName;  // Download the font with its name
  link.click();  // Programmatically click the link to trigger the download
}

// The "your translated text will appear here" placeholder of the current page language (set inline by the page)
function getTranslatedText() {
  return (window.PAGE_TEXT && window.PAGE_TEXT.translatedText) || '';
}

// Function to export translated text as PNG
async function exportAsPNG() {
  const computedStyle = window.getComputedStyle(translatedTextElement);
  const placeholderText = getTranslatedText();

  if (translatedTextElement.textContent.length !== 0 &&
    !computedStyle.fontFamily.includes("RocknRollOne") &&
    translatedTextElement.textContent !== placeholderText) {

    try {
      const html2canvas = await loadHtml2Canvas();
      html2canvas(translatedTextElement, {
        onrendered: function (canvas) {
          const imgData = canvas.toDataURL("image/png");
          const link = document.createElement('a');
          link.href = imgData;
          link.download = 'translatedText.png';
          link.click();
        }
      });
    } catch (err) {
      console.error('Failed to load html2canvas:', err);
      alert('PNG export is temporarily unavailable (failed to load). Please try again.');
    }
  } else {
    console.log("No translated text to export.");
  }
}

function preloadImage(version) {
  const image = new Image();
  let imageSrc;

  // Determine if it's mobile or desktop
  if (window.innerWidth <= 768) {
    // Mobile image version (more narrow)
    imageSrc = hylianVersionImages[version + '-mobile'];
  } else {
    // Desktop image version (standard)
    imageSrc = hylianVersionImages[version];
  }

  // Set the image source
  image.src = imageSrc;
  return image;
}

/** Keeps font-load bookkeeping in sync when language toggle resets the output (script loads after languageSet). */
window.syncTranslatorCommittedFont = function (cssFontFamily) {
  lastCommittedFontFamily = cssFontFamily;
};

// Warm the Japanese reading dictionary in the background on the Japanese translator homepage.
// The same in-flight promise is reused if the user starts typing before initialization finishes.
if (document.documentElement.lang === 'ja' && inputTextElement && translatedTextElement &&
    /\/(?:ja\/)?(?:index\.html)?$/.test(window.location.pathname)) {
  const warmKanjiLibrary = () => ensureKuroshiroInstance({ showLoading: false }).catch((err) => {
    console.warn('Background Kanji library preload failed; it will retry when needed.', err);
  });
  if ('requestIdleCallback' in window) window.requestIdleCallback(warmKanjiLibrary, { timeout: 2500 });
  else window.addEventListener('load', () => window.setTimeout(warmKanjiLibrary, 800), { once: true });
}
