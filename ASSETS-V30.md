# V30 封面遮挡轮廓

使用内置Imagegen从既有封面`assets/cover-painting-v19.webp`提取人物和底部云纹的透明轮廓，保持原画的整幅坐标与比例。生成素材只用于CSS alpha遮挡，实际可见颜色始终来自原封面文件，未用生成素材重绘人物。

- 交付：`assets/cover-foreground-mask-v30.webp`，520×908，61,344字节，纳入启动资源加载。
- 生成PNG原件：本地忽略目录`output/imagegen/v30/cover-foreground-mask-v30.png`。
- 分层：原封面 → 远层雨 → 按轮廓遮挡的原画副本 → 近层雨 → 标题与按钮。
- 实际截图像素检查：远层测试雨线在人物躯干处被遮住，近层雨线可见。

## 使用的提示词

This is a precise UI foreground extraction from the supplied existing game cover, NOT a redraw. Keep the exact full portrait canvas and original composition (same aspect ratio as source, about 0.572 width/height). Preserve the exact pixel-relative positions, scale and complete silhouettes of the FOUR blue-jacket yellow-trouser performers and all the instruments/props they hold, AND the dark cobalt painted cloud bank attached across the bottom of them. Remove the white/pale-pink page background, the large pale-yellow arch, pink arch edging, decorative dots, pale-blue flower behind the figures and all background paint; make all of those removed areas genuinely transparent. Keep only the four figures with their hats/faces/hands/held props plus the bottom dark-blue clouds, in their original places in the lower half of the unchanged canvas. The entire top half must be fully transparent, NOT cropped away. Do NOT center, rearrange, enlarge, move, redraw or restyle the figures. Preserve all interior white face/hat areas as opaque. No new rain, lettering, shadows, halos, outer glow or extra decorations. Clean alpha right along each original silhouette. This will be used ONLY as an occlusion mask so registration and canvas framing matter more than all other considerations.
