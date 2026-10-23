# V22 素材来源与处理

乐器直接使用用户第一张原图，保存在 `assets/instruments-source-v22.jpg`。`icons.js` 的原生 Canvas 图集系统裁出五种乐器，去除淡奶油纸底及锣绳内留白；从纸底反解边缘颜料，不叠色滤镜、不添加表情。源图不改动。

暂停与结算共用 `assets/modal-frame-v22.webp`。用户新面板参考保存在 `assets/modal-reference-v22.jpg`。沿用旧透明面板的鼓面、五个粉色圆点、蓝云及尾部，移除圆点下方的粉色竖笔画；文字仍由原 HTML 按钮和数据绘制。面板使用内置 imagegen 编辑旧透明素材，未使用 API／CLI。原输出保存在 `assets/modal-frame-v22.png`，WebP 为无损格式转换。

最终提示词：

> Edit this supplied transparent game UI panel asset with ONE LOCAL CHANGE ONLY: remove the magenta/pink vertical calligraphic stroke beneath the five circular pink dots on the upper right. Fill that stroke area seamlessly with the exact adjacent pale cream drum-paper texture. Preserve all five circular pink dots, the exact original cream arch shape, gold-and-coral rim, all exact cobalt blue cloud/wave shapes and fine pale-blue brush textures, and the long curling blue tail at bottom. Preserve the silhouette, dimensions, composition, positions, original colors and alpha transparency everywhere else. No new text, letters, buttons, decorations, shadows, bright white highlights or background. Output standalone transparent panel asset, no phone frame or screenshot. Match the input drawing strictly, not a redesign.

封面仍使用用户确认的原插画，增加 18 个轻量 CSS 飘散光点；只使用 transform 与 opacity，离开封面暂停动画，减少动态效果模式保留静态点。没有改动封面人物、标题笔形和播放按钮。
