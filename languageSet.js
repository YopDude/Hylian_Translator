// Check if a language is already selected in sessionStorage
let selectedLanguage = sessionStorage.getItem('language');

// Function to detect the user's browser language
function detectLanguage() {
  const userLanguage = navigator.language || navigator.userLanguage;
  return userLanguage.startsWith('ja') ? 'jp' : 'en'; 
}

// Initial Setup Function
function initLanguage() {
  if (!selectedLanguage) {
    selectedLanguage = detectLanguage(); 
    sessionStorage.setItem('language', selectedLanguage);
  }

  // Ensure the translations object exists before proceeding
  if (typeof translations === 'undefined' || !translations[selectedLanguage]) {
    console.warn("Translations not loaded yet. Retrying in 50ms...");
    setTimeout(initLanguage, 50);
    return;
  }

  document.documentElement.lang = selectedLanguage;

  const languageSelect = document.getElementById('languageSelect');
  if (languageSelect) {
    languageSelect.value = selectedLanguage;
  }

  // Initial UI Update
  setLanguage(selectedLanguage);
  updatePlaceholder(selectedLanguage);
  updateRadioLabels(selectedLanguage);
  updateTooltips(selectedLanguage);
}

// Run initialization
initLanguage();

// Event Listener for the dropdown selection
const languageSelect = document.getElementById('languageSelect');
if (languageSelect) {
  languageSelect.addEventListener('change', function(event) {
    const newLanguage = event.target.value; 
    
    // Safety check: ensure the new language exists in our data
    if (translations[newLanguage]) {
      setLanguage(newLanguage);  
      document.documentElement.lang = newLanguage;  
      sessionStorage.setItem('language', newLanguage);
      
      updatePlaceholder(newLanguage);
      resetTranslatedText(newLanguage);
      updateRadioLabels(newLanguage);
      updateTooltips(newLanguage);
    }
  });
}

function setLanguage(language) {
  const langData = translations[language];
  if (!langData) return;

  for (let key in langData) {
    const element = document.getElementById(key);
    // Only update if it's a string (don't try to inject the tooltips object)
    if (element && typeof langData[key] === 'string') {
      element.innerHTML = langData[key];
    }
  }
}

function updatePlaceholder(language) {
  const placeholders = {
      'en': "Type something to be translated here.",
      'jp': "翻訳するテキストを入力してください。",
      'zh': "在此输入要翻译的文本。",
      'ko': "여기에 번역할 텍스트를 입력하세요.",
      'es': "Escribe algo para traducir aquí.",
      'fr': "Tapez quelque chose à traduire ici.",
      'de': "Geben Sie hier etwas zum Übersetzen ein.",
      'ru': "Введите текст для перевода здесь.",
      'uk': "Введіть тут текст для перекладу.",
      'sr': "Унесите текст за превод овде.",
      'pt': "Digite algo para ser traduzido aqui.",
      'fi': "Kirjoita tähän käännettävä teksti.",
      'nl': "Typ hier iets om te vertalen."
  };
  
  const inputText = document.getElementById('inputText');
  if (inputText) {
    inputText.setAttribute('placeholder', placeholders[language] || placeholders['en']);
  }
}

function resetTranslatedText(language) {
    const inputTextElement = document.getElementById("inputText");
    const translatedTextElement = document.getElementById("translatedText");

    if (inputTextElement && inputTextElement.value.length !== 0){
        // Check if translateText is available from script.js
        if (typeof translateText === 'function') translateText();
    }
    else if (translatedTextElement && translations[language]) {
      translatedTextElement.classList.remove('mirror-text'); 
      translatedTextElement.innerHTML = translations[language]["translatedText"] || "";
      translatedTextElement.style.fontFamily = "RocknRollOne, sans-serif";
      
      if (typeof window.syncTranslatorCommittedFont === 'function') {
        window.syncTranslatorCommittedFont('RocknRollOne, sans-serif');
      }
    }
}

function updateRadioLabels(language) {
  // Defensive check to prevent the "undefined" error
  if (!translations[language]) return;

  const gameCubeRadio = document.getElementById("gamecubeOptionLabel");
  const wiiRadio = document.getElementById("wiiOptionLabel");

  if (gameCubeRadio && translations[language]["gamecubeOptionLabel"]) {
    gameCubeRadio.innerHTML = translations[language]["gamecubeOptionLabel"];
  }

  if (wiiRadio && translations[language]["wiiOptionLabel"]) {
    wiiRadio.innerHTML = translations[language]["wiiOptionLabel"];
  }
}

function updateTooltips(language) {
  if (!translations[language] || !translations[language].tooltips) return;

  const tooltipTexts = translations[language].tooltips;
  const tooltipElements = document.querySelectorAll('[data-tooltip-key]');
  
  tooltipElements.forEach((el) => {
    const tooltipKey = el.getAttribute('data-tooltip-key');
    if (tooltipKey && tooltipTexts[tooltipKey]) {
      el.setAttribute('data-tooltip', tooltipTexts[tooltipKey]);
    }
  });
}
