// Check if a language is already selected in sessionStorage
let selectedLanguage = sessionStorage.getItem('language');

// If no language is selected, detect the user's preferred language (default to English if not Japanese)
if (!selectedLanguage) {
  selectedLanguage = detectLanguage(); // Detect language
  sessionStorage.setItem('language', selectedLanguage); // Store language in sessionStorage
}

// Initialize the page with the selected language (either from sessionStorage or detected)
document.documentElement.lang = selectedLanguage;
setLanguage(selectedLanguage);
updatePlaceholder(selectedLanguage);

// Function to detect the user's browser language (defaults to English if not Japanese)
function detectLanguage() {
  const userLanguage = navigator.language || navigator.userLanguage;
  return userLanguage.startsWith('ja') ? 'jp' : 'en'; // If it's Japanese, return 'jp', else return 'en'
}

// Event listener for the language toggle button/icon
document.getElementById('languageIcon').addEventListener('click', function() {
  const currentLanguage = document.documentElement.lang; // Get current language
  const newLanguage = currentLanguage === 'en' ? 'jp' : 'en'; // Toggle between 'en' and 'jp'
  
  setLanguage(newLanguage);  // Update the text content based on the selected language
  document.documentElement.lang = newLanguage;  // Update lang attribute for accessibility and SEO
  
  // Store the new language selection in sessionStorage
  sessionStorage.setItem('language', newLanguage);
  
  // Update placeholder text for the textarea based on the new language
  updatePlaceholder(newLanguage);
});

// Function to update the text content of the page based on the selected language
function setLanguage(language) {
  const langData = translations[language];
  
  for (let key in langData) {
    const element = document.getElementById(key);
    if (element) {
      element.innerHTML = langData[key];
    }
  }
}

// Update the placeholder text for the textarea based on the selected language
function updatePlaceholder(language) {
  const placeholderText = language === 'en' 
    ? "Type something to be translated here." 
    : "翻訳するテキストを入力してください。"; // Placeholder text in Japanese
  
  const inputText = document.getElementById('inputText');
  if (inputText) {
    inputText.setAttribute('placeholder', placeholderText); // Update placeholder
  }
}

