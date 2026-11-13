# Hylian Translator

Translate text into the **Hylian** scripts of *The Legend of Zelda* series, or read Hylian back into a real-world language with an on-screen Hylian keyboard.

Live site: https://yopdude.github.io/Hylian_Translator/ (custom domain: https://zeldatranslator.com)

## Features
- **Real world → Hylian:** English, Japanese (hiragana/katakana) and other European / Slavic / Korean input, converted to the Hylian scripts. Scripts: Ocarina of Time (3D and N64), Wind Waker, Twilight Princess (GameCube and mirrored Wii), Skyward Sword, Breath of the Wild, Gerudo, Sheikah, Mudoran.
- **Hylian → real world (⇆ swap):** tap Hylian keys, get the transliteration (sounds, not meanings) in the chosen language. English-alphabet scripts map letter by letter, kana-based scripts (Ocarina of Time, Wind Waker) syllable by syllable. Output: Latin languages as typed, Japanese as hiragana, Korean as hangul, Russian / Ukrainian / Serbian as Cyrillic. Chinese is not supported and Mudoran can't be reversed. Key labels follow the output language.
- **Customisation:** font colour (the output panel turns dark automatically if the colour is too light to read), font size, PNG export, alphabet chart per script.
- **14 languages**, each on its own static pages (`/`, `/ja/`, `/es/` ...) with `hreflang` and a sitemap.
- **Session memory:** `state.js` keeps the text, direction, script, colour, size and keyboard input in `localStorage`, so reloads and language switches pick up where you left off.
- **Temporary banner** that hides itself after a set date.

## Project layout
| Path | What it is |
|---|---|
| `templates/` | page layouts (`index.template.html`, `about.template.html`) |
| `i18n/translations.js` | UI text per language |
| `i18n/extras.js` | banner text, meta descriptions, language labels |
| `i18n/ui-strings.js` | About tooltip + Hylian→real-world strings |
| `build.js` | generates every HTML page and `sitemap.xml` |
| `index.html`, `about.html`, `<lang>/` | **generated: don't edit by hand** |
| `script.js` | translator (real world → Hylian), PNG export, contrast guard |
| `reverse.js`, `jsMapping/reverseTransliteration.js` | Hylian → real world UI and its engines |
| `ui-select.js` | Hylian-version dropdown with icons |
| `state.js`, `banner.js` | session memory, banner logic |
| `jsMapping/*` | glyph maps and romanisation tables |
| `site.webmanifest` | web app manifest (icons live in `images/`: `favicon.ico`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`) |
| `fonts/`, `images/`, `dict/` | fonts, charts/icons, Japanese dictionary |
| `tools/` | font scripts (below) |

## Build
No dependencies, Node 16+:

    node build.js

Edit the templates / `i18n` files, rebuild, commit the generated pages. The build also lists any font, chart, icon or favicon that the site uses but that is missing from the folder.

**Add a language:** add its block to `i18n/translations.js`, `i18n/extras.js` and `i18n/ui-strings.js`, add a line to `LANGS` in `build.js`, rebuild.

## Alphabet charts (`images/`)
The eye button shows one chart per script, plus a `-mobile` version for narrow screens. Paths are set in `hylianVersionImages` in `script.js`:

| Script | Desktop | Mobile |
|---|---|---|
| Ocarina of Time (3D) | `ocarina.png` | `ocarina-mobile.png` |
| Ocarina of Time (N64) | `ocarina64.png` | `ocarina-mobile64.png` |
| Wind Waker | `windwaker.png` | `windwaker-mobile.png` |
| Twilight Princess | `twilight.png` | `twilight-mobile.png` |
| Skyward Sword | `skyward.png` | `skyward-mobile.png` |
| Breath of the Wild | `botw.png` | `botw-mobile.png` |
| Gerudo / Sheikah / Mudoran | `gerudo.png` / `sheikah.png` / `mudoran.png` | `<name>-mobile.png` |

## Version icons
`images/icons/<version>.<ext>` (`ocarinaOfTime3d`, `ocarinaOfTime64`, `windwaker`, `twilightPrincess`, `skywardSword`, `botw`, `gerudo`, `sheikah`, `mudoran`). Square images, ~128 px. If they aren't SVG, set `ICON_EXT` in `build.js` and rebuild.

## Fonts
- `tools/normalize-font-metrics.py` gives every Hylian font the same vertical metrics (outlines untouched) so switching scripts doesn't resize the output box.
- `tools/subset-fonts.py` rebuilds the Chinese/Korean UI fonts (Noto Sans) and the Japanese/Chinese/Korean/Cyrillic title fonts (Noto Serif, Forum) from the text of the built pages. Run `node build.js` first; re-run it after adding characters to those languages. Licences: `fonts/NotoSansSC-OFL.txt` (all Noto CJK fonts) and `fonts/OFL-Forum.txt`.
- `styles.css` also carries `ascent-override` / `descent-override` per Hylian font (written by the same tool), so the key and output spacing stays correct even if a browser or a copied folder still has an old font file.
- After changing any font file, bump `FONT_VER` in `build.js` so browsers re-download it (it versions every font URL).

## Banner
Set in `BANNER` in `build.js` (id, start and end date). It is on every page but hides itself after `end` and can be dismissed. `BANNER = null` removes it.

## Hidden text
The scope note under the Hylian keyboard ("Transliteration only…") is kept in the page but hidden: remove the `hidden` attribute on `.rev-note` in `templates/index.template.html` to show it.

## Disclaimer
*The Legend of Zelda* and all associated characters, trademarks and logos are the property of **Nintendo**. This fan site is not affiliated with, endorsed or sponsored by Nintendo, and is for non-commercial, fan-based purposes only.
