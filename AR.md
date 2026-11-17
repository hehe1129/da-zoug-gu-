# 祈福牌 AR

首页右上角鼓气榜下方是扫描入口。打开窗口后点击「开启相机」，将镜头对准单块祈福牌。关闭、切到后台或离开页面时停止相机和识别。相机画面在本机识别，不上传。首页雨声在窗口打开时暂停，关闭后恢复。

使用浏览器的 getUserMedia、Canvas、Worker 及 CSS 透视。相机需 HTTPS 或 localhost，并取决于浏览器权限。应用将 JSFeat 0.0.8 及其 MIT 许可证随站点分发，运行时不请求第三方 CDN，也不用浏览器的 WebXR API。参见 [JSFeat API](https://inspirit.github.io/jsfeat/) 和 [相机 API 兼容性](https://developer.mozilla.org/docs/Web/API/MediaDevices/getUserMedia#browser_compatibility)。

角色 PNG 位于 `assets/ar/characters/`，来自提供的角色图。印刷图案裁切位于 `assets/ar/targets/`。各款的两个参考视角分别有特征掩膜和实物锚点，金属环、链条和大片背景不作为目标特征中心。透明片内仍有透底细节和反光，不能当作可靠特征。

映射和参数在 `assets/ar/targets.json`。`targetAnchor` 是目标裁切中所选鞋底或鼓架落点。`sprite.anchor` 是透明 PNG 内对应落点。`scale`、`rotation`（平面内角度）、`tilt`（离开挂件表面的角度）、`offset`（以目标图像像素为单位）和 `opacity` 可逐款调整。蓝、黄、粉、深蓝、透明依次映射举鱼、唢呐、横持鱼、钹、鼓。实际方向与印刷反面有差异时，可分别拍摄两面，为同款增加独立参考视角。

识别在 Worker 中用多尺度二进制特征和 RANSAC 拟合单应矩阵。角色仍是一张平面图，依据匹配位置和近似焦距计算抬起后四角的投影。锚点取自图像匹配，焦距未经机型标定，抬起角度和距离是近似显示量。

手机验收时用原二维码打开并进入游戏封面。用系统 Safari 或 Chrome 打开，点扫描图标，授予相机权限。把每块挂件单独放在光线均匀的桌面上，先让图案占取景框高度约一半，再缓慢平移、旋转和拉近。移开挂件，看角色是否短暂保留后消失，放回后是否重新出现。关闭窗口后确认相机指示熄灭，再试鼓气榜和鸣鼓开场。透明鼓手若反复漏识，请补一张无反光、对焦在印刷面、金属环移出画面的正面近照或正面印刷原稿。不同手机和实际灯光下仍需实测。
