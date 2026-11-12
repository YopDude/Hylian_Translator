#!/usr/bin/env python3
"""
Re-creates the subset fonts used by the Chinese / Korean / Japanese / Cyrillic pages.

    pip install fonttools brotli
    node build.js                 # the script reads characters from the generated pages
    python3 tools/subset-fonts.py

Source fonts are downloaded from github.com/notofonts/noto-cjk and github.com/google/fonts
into tools/.cache/ (not committed). All fonts are SIL OFL 1.1.

Output (in fonts/):
  NotoSansSC-{Regular,Bold}.subset.woff2   UI text, zh   (Regular = GB2312 level-1 + page text, Bold = page text)
  NotoSansKR-{Regular,Bold}.subset.woff2   UI text, ko   (Regular = KS X 1001 hangul + page text, Bold = page text)
  NotoSerif{JP,SC,KR}-Title.subset.woff2   <h1> title of the ja / zh / ko pages
  Forum-Title.subset.woff2                 <h1> title of the ru / uk / sr pages (Latin + Cyrillic)
"""
import re, sys, urllib.request
from pathlib import Path
from fontTools import subset

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "tools" / ".cache"
OUT = ROOT / "fonts"
RAW = "https://raw.githubusercontent.com/"
SRC = {
    "NotoSansSC-Regular.otf": "notofonts/noto-cjk/main/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf",
    "NotoSansSC-Bold.otf":    "notofonts/noto-cjk/main/Sans/SubsetOTF/SC/NotoSansSC-Bold.otf",
    "NotoSansKR-Regular.otf": "notofonts/noto-cjk/main/Sans/SubsetOTF/KR/NotoSansKR-Regular.otf",
    "NotoSansKR-Bold.otf":    "notofonts/noto-cjk/main/Sans/SubsetOTF/KR/NotoSansKR-Bold.otf",
    "NotoSerifJP-Bold.otf":   "notofonts/noto-cjk/main/Serif/SubsetOTF/JP/NotoSerifJP-Bold.otf",
    "NotoSerifSC-Bold.otf":   "notofonts/noto-cjk/main/Serif/SubsetOTF/SC/NotoSerifSC-Bold.otf",
    "NotoSerifKR-Bold.otf":   "notofonts/noto-cjk/main/Serif/SubsetOTF/KR/NotoSerifKR-Bold.otf",
    "Forum-Regular.ttf":      "google/fonts/main/ofl/forum/Forum-Regular.ttf",
}
TITLE_BASIC = "U+0020-007E"
BASIC = "U+0020-007E,U+00A0-00FF,U+2010-2027,U+2030-203A,U+2190-21FF,U+25A0-25FF,U+3000-303F,U+FF00-FFEF"

def src(name):
    p = CACHE / name
    if not p.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        print("downloading", name); urllib.request.urlretrieve(RAW + SRC[name], p)
    return p

def page_text(lang, h1_only=False):
    """All text of a language's pages (or only their <h1> titles)."""
    folder = ROOT / lang
    out = ""
    for page in ("index.html", "about.html"):
        html = (folder / page).read_text(encoding="utf8")
        if h1_only:
            out += "".join(re.findall(r"<h1[^>]*>(.*?)</h1>", html, re.S))
        else:
            out += re.sub(r"<[^>]+>", "", html)
    return out

def gb2312_l1():
    s = ""
    for hi in range(0xB0, 0xD8):
        for lo in range(0xA1, 0xFF):
            try: s += bytes([hi, lo]).decode("gb2312")
            except UnicodeDecodeError: pass
    return s

def ksx1001_hangul():
    s = ""
    for hi in range(0xB0, 0xC9):
        for lo in range(0xA1, 0xFF):
            try: s += bytes([hi, lo]).decode("euc-kr")
            except UnicodeDecodeError: pass
    return s

def make(source, out_name, text="", unicodes=BASIC, features=("*",)):
    opts = subset.Options(); opts.flavor = "woff2"; opts.layout_features = list(features); opts.hinting = False
    font = subset.load_font(str(src(source)), opts)
    s = subset.Subsetter(opts)
    s.populate(text=text, unicodes=subset.parse_unicodes(unicodes))
    s.subset(font)
    subset.save_font(font, str(OUT / out_name), opts)
    print(f"{out_name:40} {(OUT / out_name).stat().st_size/1024:7.1f} KB")

if __name__ == "__main__":
    ui = lambda lang: "".join(sorted({c for c in page_text(lang) if ord(c) > 0x2E80}))
    make("NotoSansSC-Regular.otf", "NotoSansSC-Regular.subset.woff2", gb2312_l1() + ui("zh"))
    make("NotoSansSC-Bold.otf",    "NotoSansSC-Bold.subset.woff2", ui("zh"))
    make("NotoSansKR-Regular.otf", "NotoSansKR-Regular.subset.woff2", ksx1001_hangul() + ui("ko"))
    make("NotoSansKR-Bold.otf",    "NotoSansKR-Bold.subset.woff2", ui("ko"))
    make("NotoSerifJP-Bold.otf", "NotoSerifJP-Title.subset.woff2", page_text("ja", True), TITLE_BASIC, ("kern",))
    make("NotoSerifSC-Bold.otf", "NotoSerifSC-Title.subset.woff2", page_text("zh", True), TITLE_BASIC, ("kern",))
    make("NotoSerifKR-Bold.otf", "NotoSerifKR-Title.subset.woff2", page_text("ko", True), TITLE_BASIC, ("kern",))
    make("Forum-Regular.ttf", "Forum-Title.subset.woff2", "", "U+0020-007E,U+00A0-00FF,U+0400-04FF,U+2010-2027", ("kern",))
