# V27 参考素材与处理记录

使用内置 **Imagegen** 编辑参考图，生成空白鼓面与空白榜单插画，再做浏览器原生Canvas的尺寸/格式交付转换；图标保持用户第二张图的原始构图和颜色。未调用收费API、未使用管理员密钥。

- 鼓面交付：`assets/rank-drum-v27.webp`（320×320，22,394字节）。首页、结算入口和前三名小章复用。
- 排行榜插画：`assets/ranking-panel-v27.webp`（900×1350，165,528字节）。所有名字、分数、按钮均为真实DOM内容，没有烘焙示例榜单文字。
- 原始图标：`assets/game-icon-v27.jpg`；网站图标 `assets/game-icon-v27.png`，触屏图标 `assets/game-touch-icon-v27.png`。
- 游戏宋体：沿用用户提供的`assets/fonts/aa-classic-song.ttf`，新增界面子集`aa-classic-song-ui-v27.woff2`；动态昵称的完整同字体`aa-classic-song-names-v27.woff2`按缺失字形延迟加载。
- 生成PNG原件留存在本地忽略目录`output/imagegen/v27/`，旧版本素材未覆盖。

## 鼓面编辑提示词

Edit target: the provided circular watercolor drum skin. Prepare a faithful UI button background asset. Keep the original round cream and pale gold drum skin, outer gold rim and all small red rivets exactly in their original colors, positions and watercolor texture. Remove ONLY the white exterior outside the circular drum, make that exterior fully transparent. Center the full drum on a square canvas with approximately 3% transparent margin, no crop of rim. Do not add any lettering, symbols, shadow, face or new ornament. Flat front view, no perspective. Preserve the interior pale yellow paint as opaque. Output a genuinely transparent PNG.

## 排行榜面板编辑提示词

Edit target: the provided mobile game leaderboard reference. Extract a reusable blank UI panel asset, matching the original illustration very closely. Keep the tall rounded arch drum-skin panel, pale cream textured center, thin gold and coral perimeter, five pink/coral dots down its upper right and the pink linear flourish below them. Keep the complete expressive cobalt/ultramarine watercolor ocean waves and gold flecks curling across the bottom, including the long curved tail, with exactly the reference's painterly brush texture and deep blue, no bright white glare. Remove ALL text, characters, numbers, medals, table row separator lines, close X, controls and pink highlighted row; restore blank cream paper wherever they were. Remove the surrounding dark navy background, lanes, circles and all scenery outside the arch and the blue waves so that outside is fully transparent. The full illustration, including waves, fits on a portrait 2:3 transparent canvas. The arch should span about 80% of the canvas width, about 78% of its height, waves spreading wider toward the bottom leaving enough uncluttered blank cream area for live leaderboard rows. No text at all. Do not redesign the panel.
