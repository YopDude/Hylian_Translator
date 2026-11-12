#!/usr/bin/env python3
"""
Normalises the vertical metrics of the Hylian fonts so that swapping between scripts doesn't change the
height of the output box ("bounce"). Glyph outlines are NOT touched, only ascent / descent / line gap.

For each font the glyphs' real vertical extent is measured, and ascent/descent are set so that the middle
of the glyphs sits exactly in the middle of a 1.25 em line box (ascent + descent = 1.25 em, line gap 0, same
values in hhea, OS/2 typo and OS/2 win, so every platform agrees). Combined with `line-height: 1.25` in the CSS,
every font then produces an identical line box.

    pip install fonttools brotli
    python3 tools/normalize-font-metrics.py          # rewrites fonts/<name>.ttf / .woff / .woff2 and the @font-face overrides

The same numbers are also written into styles.css as ascent-override / descent-override / line-gap-override, so a browser
shows the right metrics even if it still has an old copy of a font file (Firefox 89+, Chrome 87+, Safari 17.4+).
"""
import re
from pathlib import Path
from fontTools.ttLib import TTFont

FONTS = ["Hylian64Regular", "HeroHylianRegular", "AncientHylian-English", "TPHylian-GCNRegular", "SSAncientHylian",
         "AlbwBotwHylian-Regular", "GerudoTypographyRegular", "BotWSheikahRegular", "MudoranRegular"]
LINE = 1.25
ROOT = Path(__file__).resolve().parent.parent
DIR = ROOT / "fonts"
CSS = ROOT / "styles.css"
OVERRIDES = {}

def centre_of_glyphs(font):
    cmap, glyf = font.getBestCmap(), font["glyf"]
    tops, bottoms = [], []
    for cp in range(0x21, 0x7F):
        g = glyf[cmap[cp]] if cp in cmap else None
        if g is not None and g.numberOfContours != 0:
            tops.append(g.yMax); bottoms.append(g.yMin)
    tops.sort(); bottoms.sort()
    pick = lambda a, p: a[min(len(a) - 1, int(len(a) * p))]   # ignore a few outlier glyphs
    return (pick(tops, .97) + pick(bottoms, .03)) / 2

for name in FONTS:
    font = TTFont(DIR / f"{name}.ttf")
    upm = font["head"].unitsPerEm
    c = centre_of_glyphs(font) / upm            # glyph centre above the baseline, in em
    asc, desc = LINE / 2 + c, LINE / 2 - c      # centres the glyphs in the line box
    A, D = round(asc * upm), round(desc * upm)
    hhea, os2 = font["hhea"], font["OS/2"]
    hhea.ascent, hhea.descent, hhea.lineGap = A, -D, 0
    os2.sTypoAscender, os2.sTypoDescender, os2.sTypoLineGap = A, -D, 0
    os2.usWinAscent, os2.usWinDescent = max(A, 0), max(D, 0)
    font.save(DIR / f"{name}.ttf")
    for flavor, ext in (("woff", "woff"), ("woff2", "woff2")):
        f2 = TTFont(DIR / f"{name}.ttf"); f2.flavor = flavor; f2.save(DIR / f"{name}.{ext}")
    OVERRIDES[name] = (A / upm * 100, D / upm * 100)
    print(f"{name:26} centre {c:5.2f} em  ->  ascent {asc:.3f}  descent {desc:.3f}")

# ---- mirror the metrics into the @font-face rules of styles.css ------------------------------------------------------
css = CSS.read_text(encoding="utf8")
def patch(match):
    block = match.group(0)
    for name, (asc, desc) in OVERRIDES.items():
        if f"fonts/{name}.woff2" in block:
            block = re.sub(r"\n\s*(ascent|descent|line-gap)-override:[^;]*;", "", block)
            return block.rstrip("}").rstrip() + (f"\n  ascent-override: {asc:.2f}%;\n  descent-override: {desc:.2f}%;\n  line-gap-override: 0%;\n}}")
    return block
new = re.sub(r"@font-face\s*\{[^}]*\}", patch, css)
if new != css:
    CSS.write_text(new, encoding="utf8")
print("styles.css: @font-face overrides written for", len(OVERRIDES), "fonts")
