"""Range-subset the supplied Song face; nicknames keep the exact same font.
Run using the project's font-build Python (fontTools + Brotli required).
"""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'da-zou-gu-qa/font-build-deps'))
from fontTools import subset
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parents[1]
source = root / 'assets/fonts/aa-classic-song.ttf'
cmap = TTFont(source).getBestCmap()
directory = root / 'assets/fonts/names-v34'
directory.mkdir(exist_ok=True)
css = []
for block in sorted(set(code//256 for code in cmap)):
    codes = [code for code in cmap if code//256 == block]
    font = TTFont(source)
    options = subset.Options()
    options.flavor = 'woff2'
    worker = subset.Subsetter(options=options)
    worker.populate(unicodes=codes)
    worker.subset(font)
    font.flavor = 'woff2'
    name = '{:04x}.woff2'.format(block)
    font.save(directory/name)
    css.append("@font-face{font-family:ClassicSongNames;src:url('assets/fonts/names-v34/"+name+"') format('woff2');font-weight:400;font-style:normal;font-display:swap;unicode-range:U+"+format(block*256,'X')+'-'+format(block*256+255,'X')+'}')
(root/'styles-fonts-v34.css').write_text('\n'.join(css), encoding='utf8')
print('Font ranges:',len(css),'max bytes:',max(f.stat().st_size for f in directory.iterdir()))
