# V31 素材与技能

鼓气榜面板：[assets/ranking-panel-v31.webp](assets/ranking-panel-v31.webp)。以 V29 空白面板为编辑目标，使用内置 image_gen 编辑，保留拱形、蓝边、粉色圆点与蓝色云浪，将书写区改为均匀暖象牙色。1024×1536 输出经浏览器 Canvas 等比导出 900×1350 WebP；运行时沿用 V27 原有透明轮廓，未增加云浪背景。

原始输出保留在被 Git 忽略的 `output/imagegen/v31/ranking-solid-source.png`，旧版素材不覆盖。

生成提示词：

> Use case: precise-object-edit. Edit target: the supplied blank game leaderboard panel artwork. Make ONE precise change only: replace all of the mottled, cloudy cream paper INSIDE the arched blue rim with an absolutely uniform opaque solid warm ivory fill, color #FFF8E7. The entire main writing surface must be flat solid color: no paper grain, no brush mottling, no gradient, no spots, no shadows, no lighting variation. Preserve the exact existing arch shape, full 2:3 portrait composition, slim textured light-blue outer rim, the five pink dots, pink vertical mark at the upper right, and all blue watercolor cloud/wave ornament at the bottom unchanged in their existing positions and scale. Keep the navy exterior background as it is. Keep the bottom blue waves' watercolor texture and their exact contours. No text, no numbers, no labels, no additional shapes. Do not redesign, crop, stretch or move any artwork. Only the large cream interior becomes a clean uniform solid ivory color.

本次按用户要求安装并阅读：

- [particle-systems](https://github.com/pluginagentmarketplace/custom-plugin-game-developer/tree/main/skills/particle-systems)：统一风向、预分配粒子池、合批绘制；沿用网页原生 Canvas，不引入 Unity 等引擎。
- [game-art](https://github.com/davila7/claude-code-templates/tree/main/cli-tool/components/skills/creative-design/game-development/game-art)：保持既有绘画风格、字体与比例，压低文字区的背景细节，提高可读性。

雨滴斜率统一为 −0.057 至 −0.047（向左下约 2.7°—3.3°），保留随机落点、相位、速度、长度。游戏内每三滴一滴位于音符前，其余位于音符后；总数与 V30 相同，两个批次共用原有游戏时钟。前景雨仍在判定线和独立完美反馈层下面。

## 验证

- Edge 无头浏览器：完整六阶段 445 音符、开始、暂停恢复、长按恢复、提前松手、重开、三次失误结束、音频失败重试共 15 项通过。
- 天气及本地 PostgreSQL 测试接口：前后遮挡、开榜雨不停、三阶段开始渐强、减少动态效果、提交与读取成绩等 10 项通过；未向线上数据库写入测试数据。
- 定向雨、实际游戏绘制顺序、单时钟与总雨滴预算、去白边、均匀底色、320/375/430/1440px 控件及比例等 10 项通过。
- 截图和报告保存在被 Git 忽略的 `output/playwright/v31/`；测试使用浏览器模拟尺寸，未冒充实体手机测试。
- Impeccable 扫描保留既有紧凑字号、奶油色、封面渐变等用户指定风格；本次新样式仅覆盖标题合成描边与面板素材，不扩大改动范围。

本地预览：`http://127.0.0.1:4177/?v=31`。V30 完整回退点：`backup/before-rain-panel-v31`。
