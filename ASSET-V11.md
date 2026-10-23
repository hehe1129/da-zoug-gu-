# 第十一版美术处理

使用方式：内置 imagegen 编辑工具，未调用 CLI。原稿截图为 `assets/cover-reference-v11.jpg`，最终项目文件为 `assets/cover-painting-v11.png`。其他乐器、字体和标题原件均原样复制；乐器透明背景及标题渐变由网页渲染。

封面提示：

> Edit this supplied screenshot into a clean production mobile game cover BACKGROUND, strictly preserve the exact supplied illustration rather than redesigning it. Crop away ALL black phone/browser chrome top and bottom, keep only the white illustrated page. Preserve exactly the four blue-shirt/yellow-trouser masked performers, their original poses, sizes, positions and instruments; the large pale yellow drum with pink fuzzy rim, watercolor/colored pencil texture, white paper, hazy blue clouds at the bottom, and vertical WENLING · DA ZOU GU inscription at right. REMOVE ONLY the three large blue Chinese title characters 大奏鼓, the cream 开始游戏 text and its underline on the blue clouds, and the blue volume button at upper right. Reconstruct their backgrounds naturally, especially pale yellow drum behind removed title. Leave empty white/pale yellow upper-left title area and unlettered rich blue clouds for live HTML overlays. No new text, no extra objects, no geometry redesign, no rounded cards, do not simplify or flatten the illustrated textures. Portrait aspect ratio matching just the illustrated white page (about 938 wide by 1620 tall), high resolution. The output is art only; real controls and new supplied calligraphy will be overlaid by code.

生成底图没有保留英文边注，因此该边注由网页排版补上。标题保留原照片里的字形，截取纸张内部区域作为蒙版填充蓝色渐变。封面大标题不使用新字体，其余界面文字使用用户提供的 Guming TTF。
