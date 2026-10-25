# V26 在线排行榜验证

日期：2026-10-25。基线 V25 `4148a1d`；本地回退分支 `backup/before-online-leaderboard-v26`。原生产网址、仓库名、谱面、音频和玩法保持。

## 当前连接状态

2026-10-26更新：用户已创建真实 Free 项目 `kqrwcupkmtydzjyvshny`，状态 ACTIVE_HEALTHY，新加坡区域，PostgreSQL 17.11。通过已连接的 Supabase 插件完成建表、权限和配置；未使用管理员密钥填充前端，未启用付费服务，也未替换线上 V25。下面的本地测试和新增云端安装检查分别记录，不冒充完整云端玩家联调。

### 云端安装检查（2026-10-26）

- 确认目标组织 `dazougu` 是 Free，项目 public / dazougu_private 原无业务表。
- 应用 `dazougu_online_leaderboard_v26`，完成两张私有表、RLS、最高分触发器及两个受限公开 RPC 的部署。
- 实际云端运行 `verify-leaderboard.sql`，8项全部 true；只读 SQL 返回空榜单。
- 应用 `restrict_internal_rls_event_trigger`，撤销项目自动创建的内部事件触发函数 `public.rls_auto_enable()` 对 API 角色的无用执行授权，不移除自动 RLS 功能。可复用脚本为 `supabase/harden-project-defaults.sql`。
- 从项目接口取得现代 publishable key 和 URL，自动填写本地配置；配置检查通过，没有取得或写入 service_role / secret key。
- 使用公开 key 实际读取 `/auth/v1/settings` 和 `/rest/v1/rpc/dzg_leaderboard`，均返回200；榜单0条，匿名登录标志为false。没有创建云端测试玩家或提交测试分数。
- 安全 Advisor 余下的提示对应有意授权的两个 SECURITY DEFINER RPC：只读排行榜允许公开调用，写分函数只允许 authenticated 且主人来自 auth.uid()。它们固定空 search_path、全限定表名、明确撤销默认 PUBLIC 权限；没有为了消除提示而开放私有表。有关提示的官方说明：[公开调用](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)、[认证调用](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)。
- 尚待用户在 Dashboard 开启匿名登录；之后继续真实匿名身份、提交、最高分与共享榜单测试，再发布。

## 数据库

使用 PGlite 0.5.11 运行实际 PostgreSQL/PLpgSQL、角色权限、RLS、事务及触发器；本地 `auth.users` / `auth.uid()` 测试夹具模拟已由 Supabase 验证的身份上下文。生产脚本不包含这些夹具。

- 建表、函数与权限脚本重复运行不丢数据；8项只读安装检查全部通过。
- 正常更新最高分、拒绝低分覆盖、拒绝修改已使用 run ID 的结果、重复请求只有一条回执。
- 同名的两个认证 ID 是两位不同玩家；匿名 API 不能写成绩。
- 0–17800、10分整数档、命中0–445、完美不超过命中、分数与命中/完美的基本约束、空白/不可见昵称、超长昵称、错误谱面版本校验通过。
- anon/authenticated 均无法直接读取或更新私有表。额外临时授予表权限后验证 RLS 仍无法读取或改动另一位玩家；该临时授权未写入生产脚本。
- 即便在 RPC 外尝试降低分数，数据库触发器也拒绝。
- 排名服务只返回4个必要字段，按分数倒序展示前50，额外返回当前玩家的私有定位结果；当前玩家第50名之后仍有自己的名次。没有公开 UUID、令牌、回执或时间戳。

入口：`tests/leaderboard/database.cjs`、`supabase/verify-leaderboard.sql`。

## 客户端

`tests/leaderboard/client.cjs` 通过：

- Unicode昵称归一化、12码点长度、空白过滤；HTML样式内容仅作文本。
- 拒绝 secret/service_role 密钥配置，允许公开 publishable key 与旧 anon key；检测工具隐藏配置值。
- 身份只来自 Supabase匿名认证；并行请求合并；会话复用。
- 本机 outbox 只用于失败重试，同一身份多局离线时保留最高待同步局。
- 并发重试合并、重复结束事件不重复提交，确认成功才移除待同步记录。
- 身份丢失时，旧身份的待提交成绩隔离留存，不冒用新身份，也不阻止新身份提交新成绩。提交请求固定使用绑定时的匿名会话令牌，避免跨标签页切换混用。
- 空配置、存储不可用或请求失败均不使游戏崩溃；未以本机缓存生成排行榜。

## 浏览器联调

使用 Microsoft Edge、官方 Supabase SDK 2.118.0、两个及更多隔离浏览器上下文、仅在本机运行的 GoTrue 协议服务与真实 PostgreSQL 数据库。云端 Supabase Auth 仍待真实项目验证。

`tests/leaderboard/browser.cjs` 覆盖：

- 首次取名、空白与超长校验、正常开始。
- 结束自动提交、较低分不覆盖、较高分更新。
- 重开与刷新保留身份/昵称，过期会话刷新仍是原玩家。
- 两个独立玩家使用重复昵称，共享降序榜单；仅本人一行高亮。
- 网络失败仍可重开游玩，待同步队列保留，恢复后提交最高待同步局。
- 已提交但响应丢失，重试只生成一条回执。
- 同浏览器多标签页复用身份；同时首次认证只创建一个匿名身份。
- HTML形式昵称通过 `textContent` 安全展示，没有生成 img 元素。
- 320px宽度可操作；排行榜读取失败有重试，恢复后刷新有效。
- 首次认证不可用仍能开始游戏，暂存记录没有伪造玩家ID；网络恢复后才绑定真实认证ID并提交。
- 列表只显示50人，本人不在前50名时底部仍显示其名次与最高分。
- 无未捕获浏览器异常。

`tests/leaderboard/browser-edges.cjs` 覆盖：

- 空配置依然可取名、开始、暂停恢复、结束、重开；昵称刷新后保留。
- 模拟手机软键盘占用视口、提交昵称后收起，首次倒计时不被误暂停。
- 可选 SDK 文件失败不产生致命“游戏加载失败”，重试恢复。
- 页面刷新与网络恢复后继续补交队列，身份不变。

界面图与测试记录在忽略目录 `output/playwright/v26/`。截图中的昵称/分数是本地测试数据，未上传真实云端。样式检查对旧界面的装饰、旧微小文本给出提示；本轮保留用户要求的既有视觉，新增功能文字至少11px。

## 原游戏回归

全曲浏览器显式推进时间：445命中、0失误、六阶段完成。普通暂停、长按暂停接回、提前松手不扣血、重开随机列、三次失误结束、返回封面、必要音频加载失败与重试全部通过，无未捕获异常。

现有 `tests/chart-recording.cjs`、`tests/input-timing.cjs`、`tests/audio-clock.cjs`、`tests/audio-loading.cjs` 通过。原录音与谱面没有修改；没有把网络请求加入渲染循环。

未进行实体手机、微信或免费配额容量的实测。已核验真实项目安装权限与只读接口，匿名认证/玩家写入仍待后台开启后验证；纯前端仍能被伪造成绩，没有宣称完全防作弊。
