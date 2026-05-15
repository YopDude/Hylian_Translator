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
const KOREAN_VOWELS = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'ye', 'yei', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
const KOREAN_FINALS = ['', 'g', 'kk', 'gs', 'n', 'nj', 'nh', 'd', 'l', 'lg', 'lm', 'lb', 'ls', 'lt', 'lp', 'lh', 'm', 'b', 'bs', 's', 'ss', 'ng', 'j', 'ch', 'k', 't', 'p', 'h'];

function decomposeHangul(char) {
    const code = char.charCodeAt(0) - 0xAC00;
    if (code < 0 || code > 11171) return char; // Not a Hangul block

    const initial = Math.floor(code / 588);
    const vowel = Math.floor((code % 588) / 28);
    const final = code % 28;

    return KOREAN_INITIALS[initial] + KOREAN_VOWELS[vowel] + KOREAN_FINALS[final];
}

function normalizeToEnglish(text) {
    if (!text) return "";
    let result = "";

    for (let char of text) {
        const charCode = char.charCodeAt(0);
        
        // 1. Handle Korean (Hangul blocks start at 0xAC00)
        if (charCode >= 0xAC00 && charCode <= 0xD7AF) {
            result += decomposeHangul(char);
            continue;
        }

        // 2. Skip Japanese (to preserve dots/dakuten)
        const isCharJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(char);
        if (isCharJapanese) {
            result += char;
            continue;
        }

        // 3. Process European/Slavic/Greek
        let processedChar = char.toLowerCase();
        processedChar = processedChar.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
        result += CYRILLIC_GREEK_MAP[processedChar] || processedChar;
    }
    return result;
}

window.normalizeToEnglish = normalizeToEnglish;
