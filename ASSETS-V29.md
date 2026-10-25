# V29 面板素材记录

来源为用户最新参考图，原件保存在`assets/ranking-reference-v29.jpg`。使用内置Imagegen清除原图中的文字、分数、控件和示例奖章，保留浅蓝鼓面边缘、粉色点饰、奶油色纸面及蓝色云浪笔触。

交付图为`assets/ranking-panel-v29.webp`（900×1350，133,290字节）。生成PNG原件保存在本地忽略目录`output/imagegen/v29/ranking-panel-v29.png`。只做浏览器原生格式和尺寸转换，不引入运行时图像处理任务。

用户随后明确要求外层背景保持原样。网页用原面板`assets/ranking-panel-v27.webp`的透明轮廓作为CSS遮罩，限制新参考图的可见区域；不显示生成图的外部场景。外层沿用原深蓝遮罩及后面的游戏画面，没有增加云浪背景。轮廓图与新交付图均纳入原启动资源加载。

鼓气榜标题、前50名、刷新、表头、所有玩家数据和返回按钮都是使用原宋体的DOM文字；动态昵称仍通过textContent安全显示。

## 使用的Imagegen提示词

Edit target: the supplied Chinese music-game leaderboard reference. Make a blank production UI background illustration that matches this exact reference. Keep the entire portrait 2:3 composition, dark navy/royal-blue atmospheric background with thin hanging strings and faint circles, large tall rounded cream drum-skin arch, its icy pale-blue textured rim (NOT gold), five coral/pink dots down the upper right and the pink vertical line flourish below, and the exact large cobalt/ultramarine painted clouds and wave curls across the bottom. Preserve the original painterly watercolor/gouache strokes, paper grain, deep blue palette, generous blank cream area and all relative shapes and positions. Remove ALL typography and UI data: the large title including outlined first character, subtitle, close X, refresh text/underline, all table headings, every player name and number and score, the three circular medal backgrounds, separators, personal-best text, and bottom return-home text and flanking rules. Reconstruct natural blank cream paper where content was removed, and natural dark navy background where bottom text was removed. Keep the complete composition and art uncropped, including the long cloud tail. No new symbols, light halos, medals, borders or decorations. No white rectangles or mockup device frame. Opaque image, not transparent; the cream interior must be fully opaque. Match the provided artwork faithfully; do not reinterpret it.
