const CYRILLIC_GREEK_MAP = {
    // Standard Cyrillic & Slavic (Russian, Bulgarian, Serbian, Ukrainian)
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh',
    'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
    'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts',
    'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
    'ђ': 'dj', 'ј': 'j', 'љ': 'lj', 'њ': 'nj', 'ћ': 'c', 'џ': 'dz', 'і': 'i', 'ї': 'yi', 'ґ': 'g', 'є': 'ye',
    // Greek
    'α': 'a', 'β': 'b', 'γ': 'g', 'δ': 'd', 'ε': 'e', 'ζ': 'z', 'η': 'i', 'θ': 'th',
    'ι': 'i', 'κ': 'k', 'λ': 'l', 'μ': 'm', 'ν': 'n', 'ξ': 'x', 'ο': 'o', 'π': 'p',
    'ρ': 'r', 'σ': 's', 'ς': 's', 'τ': 't', 'υ': 'y', 'φ': 'f', 'χ': 'ch', 'ψ': 'ps', 'ω': 'o',
    // European Extras
    'ß': 'ss', 'æ': 'ae', 'ø': 'o', 'å': 'a', 'ð': 'd', 'þ': 'th', 'ł': 'l'
};

// Korean phonetic parts (Jamo)
const KOREAN_INITIALS = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const KOREAN_VOWELS = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
const KOREAN_FINALS = ['', 'g', 'kk', 'gs', 'n', 'nj', 'nh', 'd', 'l', 'lg', 'lm', 'lb', 'ls', 'lt', 'lp', 'lh', 'm', 'b', 'bs', 's', 'ss', 'ng', 'j', 'ch', 'k', 't', 'p', 'h'];

function decomposeHangul(char) {
    const code = char.charCodeAt(0) - 0xAC00;
    if (code < 0 || code > 11171) return char; // Not a Hangul block

    const initial = Math.floor(code / 588);
    const vowel = Math.floor((code % 588) / 28);
    const final = code % 28;

    return KOREAN_INITIALS[initial] + KOREAN_VOWELS[vowel] + KOREAN_FINALS[final];
}

// Han characters (kanji / hanzi). The same range script.js uses to decide whether the Japanese dictionary is needed.
const HAN_CHAR = /[\u4E00-\u9FFF]/;

async function normalizeToEnglish(text) {
    if (!text) return "";
    let result = "";

    // Convert input to string and get the currently selected UI language
    const input = String(text);
    const chinesePage = (document.documentElement.lang || 'en').toLowerCase().startsWith('zh');
    const chars = Array.from(input); // by code point, so characters outside the BMP are not split

    for (let i = 0; i < chars.length; i++) {
        const char = chars[i];
        const charCode = char.charCodeAt(0);

        // 1. Handle Korean (Hangul) - Always decompose to phonetics
        if (charCode >= 0xAC00 && charCode <= 0xD7AF) {
            result += decomposeHangul(char);
            continue;
        }

        // 2. Handle Hanzi/Kanji
        if (HAN_CHAR.test(char)) {
            // Chinese pages use Pinyin. A whole run of Han characters is converted in one call, because the reading of
            // many characters depends on the word around them (e.g. the two readings of 行), and it is much faster.
            if (chinesePage) {
                let run = char;
                while (i + 1 < chars.length && HAN_CHAR.test(chars[i + 1])) run += chars[++i];
                try {
                    const pinyinPro = await window.ensurePinyinInstance();
                    result += String(pinyinPro.pinyin(run, { toneType: 'none' }));
                    if (i + 1 < chars.length && !/\s/.test(chars[i + 1])) result += " "; // separate from a following word
                    continue;
                } catch (e) {
                    console.error("Pinyin error:", e);
                    result += run; // nothing better available: keep the characters (they are skipped when drawing)
                    continue;
                }
            }

            // DEFAULT (Japanese/Mixed): Keep the character as-is
            // This allows the Kuroshiro logic in script.js to see "何" and turn it into "nani"
            result += char;
            continue;
        }

        // 3. Handle Japanese Kana (Hiragana/Katakana)
        // Keep them as-is so Kuroshiro/Wanakana can handle them in script.js
        if (/[\u3040-\u309F\u30A0-\u30FF]/.test(char)) {
            result += char;
            continue;
        }

        // 4. Process European/Slavic/Greek/German/Latin
        let processedChar = char.toLowerCase();
        // Remove accents/diacritics
        processedChar = processedChar.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
        // Map Cyrillic/Greek to Latin equivalents via the map in transliterationMap.js
        result += CYRILLIC_GREEK_MAP[processedChar] || processedChar;
    }

    // Trim extra spaces and return the cleaned string
    return result.trim();
}

window.normalizeToEnglish = normalizeToEnglish;
