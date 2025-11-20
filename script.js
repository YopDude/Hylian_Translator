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

// Event listeners
inputTextElement.addEventListener("input", translateText); // Attach event listener to the inputTextArea
hylianVersionElement.addEventListener('change', inputTextReady); // Add an event listener for the <select> element 'change' event

// Event listener for the dropdown change
hylianVersionElement.addEventListener('change', function () {
  const selectedVersion = this.value;
  showTwilight(selectedVersion);  // Call the function to show or hide Twilight Princess options based on the selection
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
});

// Change the font when a radio button is selected
gamecubeOption.addEventListener('change', function () {
  if (this.checked) {
    translateText();
  }
});

wiiOption.addEventListener('change', function () {
  if (this.checked) {
    translateText();
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
});

// Attach event listeners to export buttons (add buttons to your HTML)
exportPngElement.addEventListener('click', exportAsPNG);

// Function to handle font change and translation logic
function translateText() {
  const inputText = inputTextElement.value; // Get the input text
  const romajiText = convertToRomaji(inputText); // Convert Japanese to English for English-based fonts
  const normalizedText = normalizeString(romajiText); // Replace any accented letters, etc
  const version = hylianVersionElement.value; // Get the selected Hylian version

  // Check for versions that require Romaji translation (Japanese-based)
  const isJapaneseVersion = version === "windwaker" || version === "ocarinaOfTime";

  if (isJapaneseVersion) {
    // Apply font styles based on version selection
    translatedTextElement.style.fontFamily = version === "windwaker"
      ? "'Ancient Hylian', sans-serif"  // Windwaker Hylian font
      : "'Hero Hylian', sans-serif";       // Ocarina Hylian font

    if (isJapanese(inputText)) { // Fonts updated to accept Japanese. Only convert if English characters used
      translatedTextElement.innerHTML = inputText.split('\n').join('<br>'); // Use innerHTML to preserve line breaks
    } else {
      // Convert Input to Hylian using the appropriate glyph map
      const glyphIndexMap = getGlyphIndexMap(version); // Get the correct map based on the selected version
      const hylianText = convertToHylian(romajiText, glyphIndexMap);

      // Update the translated text
      translatedTextElement.innerHTML = hylianText.split('\n').join('<br>'); // Preserve line breaks
    }
  }
  else if (version === "mudoran") { // Use 'joke' translation
    translatedTextElement.style.fontFamily = getFontFamilyForVersion(version);
    mudoranify(inputText, translatedTextElement);
  }
  else {
    // Handle English-based (non-Japanese) Hylian translations
    translatedTextElement.style.fontFamily = getFontFamilyForVersion(version);

    // For English-to-Hylian translation, convert each character to the corresponding Hylian font character
    let translatedText = "";
    for (let char of normalizedText) {
      translatedText += char;  // For simplicity, this can be modified to use a map like above if needed
    }

    // Update the translated text and preserve line breaks
    translatedTextElement.innerHTML = translatedText.split('\n').join('<br>'); // Preserve line breaks
  }
}

// Helper function to check if the input contains Japanese characters
function isJapanese(input) {
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(input);
}

// Function to normalize string (remove accents, etc.)
function normalizeString(input) {
  return input.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Function to get the glyph map based on version
function getGlyphIndexMap(version) {
  switch (version) {
    case "windwaker":
      return windwakerGlyphMap;
    case "ocarinaOfTime":
      return ocarinaGlyphMap;
    default:
      return {};  // Default empty map if no valid version
  }
}

// Function to get the font family based on the version
function getFontFamilyForVersion(version) {
  translatedTextElement.classList.remove('mirror-text'); // Remove mirror effect
  
  switch (version) {
    case "twilightPrincess":
      if (gamecubeOption.checked) {
        translatedTextElement.classList.remove('mirror-text'); // Remove mirror effect
      } else if (wiiOption.checked) {
        translatedTextElement.classList.add('mirror-text'); // Add mirror effect
      }
      return "'TP Hylian - GCN', sans-serif";

    case "skywardSword":
      return "'SS Ancient Hylian', sans-serif";
    case "botw":
      return "'Albw Botw Hylian', sans-serif";
    case "gerudo":
      return "'Gerudo Typography', sans-serif";
    case "sheikah":
      return "'BotW Sheikah', sans-serif";
    case "mudoran":
      return "'Mudoran', sans-serif";
    default:
      return "sans-serif"; // Default font for fallback
  }
}

// Function to convert input to Romaji using wanakana
function convertToRomaji(input) {
  return wanakana.toRomaji(input);
}

// Function to convert Romaji to Hylian characters with special handling for yoon combinations
function convertToHylian(input, glyphIndexMap) {
  let hylianText = "";
  let modifiedText = input.toLowerCase();

  // Define the yoon syllable combinations and their splits
  const yoonMap = {
    "gya": ["gi", "ya"], "gyu": ["gi", "yu"], "gyo": ["gi", "yo"],
    "kya": ["ki", "ya"], "kyu": ["ki", "yu"], "kyo": ["ki", "yo"],
    "sha": ["shi", "ya"], "shu": ["shi", "yu"], "sho": ["shi", "yo"],
    "cha": ["chi", "ya"], "chu": ["chi", "yu"], "cho": ["chi", "yo"],
    "nya": ["ni", "ya"], "nyu": ["ni", "yu"], "nyo": ["ni", "yo"],
    "hya": ["hi", "ya"], "hyu": ["hi", "yu"], "hyo": ["hi", "yo"],
    "mya": ["mi", "ya"], "myu": ["mi", "yu"], "myo": ["mi", "yo"],
    "rya": ["ri", "ya"], "ryu": ["ri", "yu"], "ryo": ["ri", "yo"],
    "ja": ["ji", "ya"], "ju": ["ji", "yu"], "jo": ["ji", "yo"],
    "bya": ["bi", "ya"], "byu": ["bi", "yu"], "byo": ["bi", "yo"],
    "pya": ["pi", "ya"], "pyu": ["pi", "yu"], "pyo": ["pi", "yo"]
  };

  // Replace non-japanese letters
  modifiedText = modifiedText.replace(/[lv]/g, match => match === 'l' ? 'r' : 'b');
  modifiedText = modifiedText.replace(/([kgzstcdjhfbpmr])\1(?=(a[aiueo]|[aiueo]|y[aiueo]))/g, (match, consonant) => 'tsu' + consonant);

  // Replace yoon combinations with their corresponding syllable pairs
  for (let yoon in yoonMap) {
    const [firstSyllable, secondSyllable] = yoonMap[yoon];
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

// Mudoranify function for joke translation
function mudoranify(input, element) {
  // Determine which set of 3 symbols to use
  const choices = isJapanese(input) ? ["D", "E", "F"] : ["A", "B", "C"];
  let translatedText = "";

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    // Detect if this character should be transformed
    const isLatin = /[a-zA-Z]/.test(char);
    const isJap = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(char);

    if (isLatin || isJap) {
      const code = char.charCodeAt(0);

      // Deterministic modulus function
      const idx = (code + i) % choices.length;
      translatedText += choices[idx];
    } else {
      // Preserve punctuation, numbers, spaces, etc
      translatedText += char;
    }
  }

  element.innerHTML = translatedText.split('\n').join('<br>');
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

    if ((gamecubeOption.checked || wiiOption.checked) && inputTextElement.value.length !== 0) {
      translateText();
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
    const fontUrl = `fonts/${fontFileName}.ttf`;
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

// Function to get translated text for the 'translatedText' key
function getTranslatedText(languageCode) {
  if (translations[languageCode] && translations[languageCode].translatedText) {
    return translations[languageCode].translatedText;
  } else {
    console.error(`Translation not found for language code: ${languageCode}`);
    return null; // or some default value if needed
  }
}

// Function to export translated text as PNG
function exportAsPNG() {
  const computedStyle = window.getComputedStyle(translatedTextElement);
  const englishText = getTranslatedText("en");
  const japaneseText = getTranslatedText("jp");

  if (translatedTextElement.textContent.length !== 0 &&
    !computedStyle.fontFamily.includes("RocknRollOne") &&
    translatedTextElement.textContent !== englishText &&
    translatedTextElement.textContent !== japaneseText) {

    html2canvas(translatedTextElement, {
      onrendered: function (canvas) {
        const imgData = canvas.toDataURL("image/png");
        const link = document.createElement('a');
        link.href = imgData;
        link.download = 'translatedText.png';
        link.click();
      }
    });
  } else {
    console.log("No translated text to export.");
  }
}
