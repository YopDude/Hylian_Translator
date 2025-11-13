// Function to handle font change and translation logic
function translateText() {
  const inputText = document.getElementById("inputText").value; // Get the input text
  const romajiText = convertToRomaji(inputText); // Convert text to English
  const version = document.getElementById("hylianVersion").value; // Get the selected Hylian version
  const translatedTextElement = document.getElementById("translatedText"); // Element where translation appears

  // Check for versions that require Romaji translation (Japanese-based)
  const isJapaneseVersion = version === "windwaker" || version === "ocarinaOfTime";

  if (isJapaneseVersion) {
    // Convert Input to Hylian using the appropriate glyph map
    const glyphIndexMap = getGlyphIndexMap(version); // Get the correct map based on the selected version
    const hylianText = convertToHylian(romajiText, glyphIndexMap);

    // Apply font styles based on version selection
    translatedTextElement.style.fontFamily = version === "windwaker" 
      ? "'Ancient Hylian', sans-serif"  // Windwaker Hylian font
      : "'Hylian 64', sans-serif";       // Ocarina Hylian font

    // Update the translated text
    translatedTextElement.textContent = hylianText;

  } else {
    // Handle English-based (non-Japanese) Hylian translations
    // Dynamically change the font based on selected version (non-Japanese options)
    translatedTextElement.style.fontFamily = getFontFamilyForVersion(version);

    // For English-to-Hylian translation, convert each character to the corresponding Hylian font character
    let translatedText = "";
    for (let char of romajiText) {
      translatedText += char;  // For simplicity, this can be modified to use a map like above if needed
    }

    // Update the translated text
    translatedTextElement.textContent = translatedText;
  }
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
  switch (version) {
    case "twilightPrincess":
      return "'TP Hylian - GCN', sans-serif";
    case "skywardSword":
      return "'SS Ancient Hylian', sans-serif";
    case "botw":
      return "'Albw Botw Hylian', sans-serif";
    case "gerudo":
      return "'Gerudo Typography', sans-serif";
    case "sheikah":
      return "'BotW Sheikah', sans-serif";
    default:
      return "sans-serif"; // Default font for fallback
  }
}

function convertToRomaji(input) {
  // Convert Hiragana or Katakana to Romaji
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

  // Use a regular expression to find lone consonants followed by a consonant + vowel pair
  modifiedText = modifiedText.replace(/([kgzstcdjhfbpmr])(?![aeiou])/g, 'tsu');  // Double the consonant when followed by a valid vowel

  //Replace yoon combinations with their corresponding syllable pairs
  for (let yoon in yoonMap) {
    const [firstSyllable, secondSyllable] = yoonMap[yoon];
    // Replace each yoon combination with its split syllables without spaces
    modifiedText = modifiedText.replace(new RegExp(yoon, 'g'), `${firstSyllable}${secondSyllable}`);
  }

  //Iterate through the modified text, checking syllables and applying mappings
  let i = 0;
  while (i < modifiedText.length) {
    const currentChar = modifiedText[i];

    //Check for valid 3-letter syllables (e.g., "shi", "chi", "tsu", etc.)
    if (i + 2 < modifiedText.length) {
      const threeSyllable = modifiedText.substring(i, i + 3);
      if (glyphIndexMap[threeSyllable]) {
        hylianText += glyphIndexMap[threeSyllable];
        i += 3; // Skip the next two characters as we've processed a 3-character syllable
        continue;
      }
    }

    //Check for valid 2-letter syllables (e.g., "ka", "ki", "ku", etc.)
    if (i + 1 < modifiedText.length) {
      const twoSyllable = modifiedText.substring(i, i + 2);
      if (glyphIndexMap[twoSyllable]) {
        hylianText += glyphIndexMap[twoSyllable];
        i += 2; // Skip the next character as we've processed a 2-character syllable
        continue;
      }
    }

    //Check for valid 1-letter syllables (e.g., "a", "i", "u", etc.)
    if (glyphIndexMap[currentChar]) {
      hylianText += glyphIndexMap[currentChar];
      i++; // Move to the next character
      continue;
    }

    // If no match was found, just skip the character
    i++; // Move to the next character
  }
    //console.log(hylianText)
  return hylianText;
}

// Attach event listener to the translate button
document.getElementById("translateBtn").addEventListener("click", translateText);

// Function to update the font size
const fontSizeSlider = document.getElementById("fontSizeSlider");
const translatedTextContainer = document.getElementById("translatedText");

fontSizeSlider.addEventListener("input", function() {
  let fontSize = parseFloat(fontSizeSlider.value).toFixed(1); // Round to 1 decimal place
  fontSize += "em"; // Add 'em' unit
  translatedTextContainer.style.fontSize = fontSize; // Apply it to translatedText
  document.getElementById("fontSizeValue").textContent = fontSize; // Update the displayed value
});

// Function to change the font color
document.getElementById('fontColor').addEventListener('input', function (event) {
  const color = event.target.value;
  document.getElementById('translatedText').style.color = color;
});

// Event listener for the Download Font button
document.getElementById('downloadFontBtn').addEventListener('click', function() {
  // Get the selected font version (e.g., "ocarinaOfTime")
  const selectedFontVersion = document.getElementById('hylianVersion').value;

  // Look up the font file name based on the selected font version
  const fontFileName = fontFileMap[selectedFontVersion];

  if (fontFileName) {
    // Add the .ttf extension and construct the font URL
    const fontUrl = `fonts/${fontFileName}.ttf`;

    // Trigger the download of the font
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

// Attach event listeners to export buttons (add buttons to your HTML)
document.getElementById('exportPNGBtn').addEventListener('click', exportAsPNG);

// Function to export the translation as PNG (for older html2canvas versions)
function exportAsPNG() {
  const translatedTextElement = document.getElementById("translatedText");
  
  // Use html2canvas to take a snapshot of the translated text
  html2canvas(translatedTextElement, {
    onrendered: function(canvas) {
      const imgData = canvas.toDataURL("image/png");
      const link = document.createElement('a');
      link.href = imgData;
      link.download = 'translatedText.png';
      link.click();
    }
  });
}
