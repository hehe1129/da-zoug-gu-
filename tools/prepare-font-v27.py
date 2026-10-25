"""Development only. Requires fonttools[woff]; uses the supplied Song font."""
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parents[1]
source = root / 'assets/fonts/aa-classic-song.ttf'
files = ['index.html', 'game.js', 'audio.js', 'icons.js', 'score.js',
         'leaderboard-client.js', 'leaderboard.js', 'styles-v26.css', 'styles-v27.css']
characters = ''.join((root / name).read_text(encoding='utf-8-sig') for name in files)
characters += ''.join(chr(i) for i in range(32, 256)) + '开心的小狗海风小鱼听浪阿鼓'
font = TTFont(str(source))
options = subset.Options()
options.flavor = 'woff2'
options.recommended_glyphs = True
subsetter = subset.Subsetter(options=options)
subsetter.populate(text=characters)
subsetter.subset(font)
font.flavor = 'woff2'
font.save(str(root / 'assets/fonts/aa-classic-song-ui-v27.woff2'))
# The full fallback is lazy: only an uncached nickname glyph can request it.
# It is deliberately a different CSS family so startup only waits for UI glyphs.
full = TTFont(str(source))
full.flavor = 'woff2'
full.save(str(root / 'assets/fonts/aa-classic-song-names-v27.woff2'))
for name in ['aa-classic-song-ui-v27.woff2', 'aa-classic-song-names-v27.woff2']:
    print(name, (root / 'assets/fonts' / name).stat().st_size)
