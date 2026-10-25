# 在线排行榜：配置与上线

2026-10-26发布版V30：网页名“一鼓作祈”，游戏内“大奏鼓”；鼓气榜、界面与雨效已按用户反馈完成。用户已明确授权发布，无需再次创建项目或复制密钥。实际Pages部署和线上核验以QA-V30及忽略目录中的发布记录为准。

连接状态（2026-10-26）：真实Free项目`kqrwcupkmtydzjyvshny`已完成建表、私有表权限和8项检查，公开URL及publishable key已配置，匿名登录已启用。两名真实匿名玩家的17项云端联调通过，临时成绩和身份已清理；当前真实玩家记录保留。发布前实际Auth与榜单接口再次返回200。本地分支`feature/online-leaderboard-v26`，上一生产回退点V25 `4148a1d`。

生产网址一直保留：**https://hehe1129.github.io/da-zoug-gu-/**。不改用户名、仓库名、Pages 路径或二维码。

## 1. 创建免费 Supabase 项目

1. 打开 https://supabase.com/dashboard ，使用你自己的 GitHub 或邮箱注册/登录。
2. 创建组织时保持 **Free**；创建一个项目，例如 `dazougu-leaderboard`。
3. 区域优先选择靠近目标玩家的亚洲区域，例如 Singapore（新加坡），以页面实际可用区域为准。
4. 数据库密码只保存在你自己的密码管理器里。本游戏前端不需要这个密码，不要把它发到聊天或写进代码。
5. 等待项目准备完成。不要选择 Pro、付费计算资源、付费附加项或其他收费服务。

## 2. 建表与访问权限

在本地打开 [supabase/leaderboard.sql](supabase/leaderboard.sql)，全选复制。

在 Supabase 左侧 **SQL Editor → New query** 中粘贴完整内容，点击 **Run**。这一步使用你在 Dashboard 中的登录权限，不需要把任何管理员密钥复制出来。脚本可以重复执行，不会清空已有玩家数据。

随后新建一个查询，粘贴并运行 [supabase/verify-leaderboard.sql](supabase/verify-leaderboard.sql)。应有 **8 项检查，passed 全部为 true**。

不要把 `dazougu_private` 添加到 Data API 的 Exposed schemas，也不要给 `anon` 或 `authenticated` 手工开放表权限。客户端只调用两个已授权的公开 RPC。

## 3. 打开匿名认证

进入 **Authentication → Sign In / Providers**（有的界面显示 Providers），找到 **Anonymous Sign-Ins / Allow anonymous sign-ins**，开启并保存。

不需要添加邮件登录、密码登录、GitHub OAuth 登录或后台账号，也不需要为匿名登录设置 OAuth 回调。

首次联调保留 CAPTCHA 关闭。Supabase 推荐匿名认证配合 CAPTCHA 防滥用；如后续要启用免费 Turnstile，需要先补充客户端 token 接入，再开启后台开关，不能只开启开关。当前没有启用额外 CAPTCHA 服务或收费服务。

## 4. 填写两个公开配置

在项目顶部 **Connect** 对话框中找 **Project URL** 和 **Publishable key**；也可在 **Project Settings → Data API / API Keys** 中找到。以当前 Dashboard 显示的名称为准。

右键本地 [leaderboard-config.js](leaderboard-config.js)，选择“打开方式 → 记事本”或代码编辑器。只填两个空引号：

```js
window.DAZOUGU_LEADERBOARD_CONFIG = Object.freeze({
  supabaseUrl: 'https://你的项目编号.supabase.co',
  publishableKey: 'sb_publishable_这里替换为完整公开密钥'
});
```

URL 是项目 API 地址，不是 Dashboard 页面地址，也不是数据库连接字符串。

**只使用 `sb_publishable_...`。不要填写 `sb_secret_...`、`service_role`、数据库密码、JWT signing secret 或 Supabase access token。管理员密钥不需要发给我。** 公开 publishable key 是专为浏览器使用的，可以随网页公开；数据权限由 JWT 和数据库规则控制。旧的 `anon` key 也兼容，但新项目优先使用 publishable key。

保存后，可以在项目目录检查配置，工具不会显示密钥值：

```powershell
node tools/check-leaderboard-config.cjs --require-config
```

看到 `PASS public project URL and browser-safe key configured` 即格式检查通过。这个检查不能证明后台开关/SQL 已安装，仍需下一步实际联调。

## 5. 真实云端联调

本次正在使用的本地预览为 http://127.0.0.1:4177/ 。也可运行项目里的“启动本地预览.cmd”，以它显示的地址为准。配置保存后刷新页面。

1. 正常浏览器点击开始，输入昵称，玩一局，结束后应显示“最高分已同步”。
2. 重开并取得更低分，榜单中的最高分不能下降；再取得更高分，最高分应更新。
3. 刷新页面再次游玩，应保留昵称和匿名身份；首页、结算页都能打开排行榜。
4. 另用无痕窗口或另一台设备游玩，可使用同样昵称。两人应是两个玩家，共享同一榜单；当前玩家以粉色行突出显示。
5. 在网页和音频已加载后模拟断网，已加载的游戏继续运行；结算显示未同步，恢复网络后点“重试”应完成补交，不重复创建成绩。
6. 有超过50位玩家时，只展示前50名；当前玩家不在前50名内时仍在底部显示自己的名次和最高分。

本地自动化测试使用独立 GoTrue 协议测试服务和真实 PostgreSQL WASM 引擎，测试数据只在本机，不是线上玩家。2026-10-26另外使用真实 Supabase、官方 SDK 和两个隔离浏览器上下文完成17项云端联调；测试后已退出并删除两名临时玩家，确认榜单及测试回执清理完毕。详见 QA-V26.md。

## 6. 更新原 GitHub Pages

上述后台配置、云端联调、本地预览和用户发布授权已完成。直接沿用原仓库发布，无需再次授权，也无需在聊天里粘贴管理员密钥。

发布前保留 V25 回退分支，运行配置检查和游戏回归，再把新增代码及公开配置提交到原仓库 `hehe1129/da-zoug-gu-` 的 `main`。等待原 Pages deployment 成功，并从原网址验证取名、提交和榜单。不要改仓库名、Pages 路径或二维码。

## 已实现的身份、权限和失败处理

- 身份来自 Supabase `signInAnonymously()`，SDK 缓存并刷新会话；不把昵称或本机随机数当作玩家 ID。同一浏览器/网站来源复用身份，多标签页用 Web Locks 协调首次认证。
- 昵称按 Unicode 码点限制为1–12字，过滤控制字符、空白和不可见字符，允许重复。输出只用 `textContent`，不拼接到 HTML。
- `player_bests` 每位玩家只有一条最高分。更新在数据库事务内比较，较低或相同分数不覆盖最高分；数据库触发器也禁止降分或更换记录主人。
- 每局有独立 run UUID，与玩家 ID 分开；私有提交回执使用 `(player_id, run_id)` 主键去重。请求提交后响应丢失，重试也只记录一次。
- 网络失败时，在本机暂存最高待同步局及其原 run ID。重试和网络恢复不会重建已有身份；请求使用绑定时的匿名会话令牌，避免跨标签页切换造成身份混用。已丢失身份的旧成绩另存本机隔离缓存（最近10条），不冒用新身份提交，也不阻止新身份提交自己的新成绩。
- 只有数据库公开 RPC 能读写成绩；写入主人从 `auth.uid()` 得到，客户端没有“替其他玩家提交”的参数。私有表启用 RLS，并撤销前端的直接表权限。
- 公开榜单只含 `rank`、`nickname`、`best_score`、`is_current`。不公开玩家 UUID、认证令牌、提交编号或后台信息。相同分数按达到时间、内部 ID 稳定排序。
- 当前谱面服务端校验：版本 `v25-attack-calibration-1`，最多445次命中、最高17800分、10分整数档，完美数不超过命中数，并检查分数与命中数的基本关系。以后更换谱面或计分规则，需要同步前后端白名单与范围。
- localStorage 只保存匿名会话缓存、昵称、本机最佳和失败重试队列；排行榜每次从数据库读取，没有用本机数据冒充在线榜单。原“个人最佳”改标“本机最佳”以免混淆。
- 清理浏览器存储、无痕窗口关闭或更换设备会失去原匿名身份；不能凭同名找回或合并成绩。无注册的匿名方案本身不提供跨设备身份恢复。

## 防作弊与免费方案边界

数据库规则能阻止改动其他玩家、低分覆盖、重复请求及明显越界成绩，**不能证明某个合法范围内的分数是实际游玩所得**。纯前端游戏的代码和请求可被仿造；这里不宣称完全防作弊。

核对官方资料日期：2026-10-25。

- Free：50,000月活、500MB数据库、5GB出站流量，最多2个活跃免费项目；一周不活跃可能暂停，需要在 Dashboard 恢复。
- 匿名认证默认同IP每小时30次新注册，集中扫码可能触发限制；已有身份的复用不等于每局新注册。不能以反复创建身份绕过限制。
- 私有提交回执会随局数增长，需监控数据库容量。没有启用付费套餐、付费定时任务、付费存储或边缘函数；也没有替你创建云端资源。
- 免费服务和跨境网络没有全地区可用性承诺；排行榜连接失败会降级，不阻断已加载的游戏。

官方来源：[匿名认证](https://supabase.com/docs/guides/auth/auth-anonymous)、[API keys](https://supabase.com/docs/guides/getting-started/api-keys)、[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)、[数据库函数](https://supabase.com/docs/guides/database/functions)、[免费套餐](https://supabase.com/pricing)。

## 本地开发验证

游戏本身仍无框架、无安装依赖和构建服务。开发测试依赖仅在 `tests/leaderboard/`，不进入游戏加载路径：

```powershell
npm install --prefix tests/leaderboard
npm test --prefix tests/leaderboard
```

数据库测试运行真实 PostgreSQL 引擎，验证权限、单调最高分、去重、榜单投影等；本地 auth 测试服务只用于测试，不可用作生产服务。

启动本地预览后，可运行 `npm run test:browser --prefix tests/leaderboard` 和 `npm run test:edges --prefix tests/leaderboard`。Windows 默认使用已有 Microsoft Edge；其他系统先安装 Playwright Chromium，或通过 `DAZOUGU_BROWSER_PATH` 指定浏览器。预览端口不是4177时，设置 `DAZOUGU_PREVIEW_URL`。浏览器测试始终拦截配置使用本机测试服务，不会写入你配置的云端数据库。

修改样式后运行 `node tools/prepare-web.cjs` 同步内联 CSS。验证细节见 QA-V26.md。
