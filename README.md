# X Sticker

把 X / Twitter 帖子做成**文字封面＋原始配图**（抖音 / 小红书用）。贴文本身是 **仿 X 网页 status 详情** 的白底卡，竖版画布背景可选自然或城市风景照片。

**v0.3**：文字卡贴作为封面，原帖静态配图按顺序独立输出；纯图片帖直接使用配图。支持逐张预览、勾选、单图下载或整组 ZIP，以及多图草稿同步。详见[配图使用说明](docs/photo-posts.md)和[草稿保存边界](docs/phase-2-browser-drafts.md)。

## 功能

- 在帖子的原生分享菜单里点「做成卡贴」，页内预览并下载 PNG
- 工具栏图标只在 X/Twitter 可用，打开相同的页内预览，抓取当前 status（或时间线首条）的正文、作者、handle、时间、互动数、头像
- 选项：显示账号、显示作者、比例 `3:4` / `9:16`；两个开关均为勾选时显示，默认都勾选
- 可自定义图片中的作者名字，留空使用帖子原名；「显示作者」控制是否显示
- Inspector 自动在扩展本地记住显示开关、自定义名字、比例、背景和同步平台；标题与正文仍按当前帖子生成
- 大图预览与右侧 Inspector 独立布局，预览始终自动适应窗口
- 保留帖子正文的加粗格式，预览与导出 PNG 使用相同效果
- 背景分为「自然」（云海、海边、雪峰）和「城市风景」（涩谷霓虹、纽约、香港），默认云海；六张照片内置，不联网拉取 Unsplash
- 页内预览用 HTML + `html-to-image` 渲染；本机单测 / 脚本用 Chrome 截图栅格化
- 有图时显示缩略图列表，支持切换预览、取消配图、失败重试；翻看图片不会重新提交草稿
- 单张直接下载，整组打包 ZIP，文件编号保留封面与配图顺序
- 选择小红书、抖音，编辑标题和正文后同步到草稿；进度在独立页面显示，可返回预览或打开后台接手

## 不做

- 抖音 / 小红书自动发布
- 帖子线程合并、引用帖媒体、视频与 GIF 截取
- Firefox / 商店上架

## 开发

```bash
npm install
npm test
npm run build
```

渲染样本（Kieran 贴 → `katie_x_web_v6.png`）：

```bash
npx tsx scripts/render-fixture.ts /opt/cursor/artifacts/katie_x_web_v6.png
```

Linux 建议：`fonts-wqy-microhei`、`fonts-noto-color-emoji`（以及可选 `fonts-noto-cjk`）。Chirp 字体不可用时回退系统栈。头像域 `pbs.twimg.com` / `abs.twimg.com` 已写入 manifest `host_permissions`。

产物在 `dist/`。Chrome → 扩展程序 → 开发者模式 → **加载已解压的扩展程序** → 选 `dist`。

1. 打开一条文字、图文或纯图片帖（`…/status/…` 或时间线）
2. 点该帖的「分享」
3. 点「做成卡贴」
4. 在页内预览里调选项，点「下载图片」或「下载整组（ZIP）」

工具栏「X Sticker」图标只在 X/Twitter 打开页内预览，不再显示独立弹窗。小红书和抖音页面没有插件悬浮面板；任务状态、停止和检查继续均在 X 的同步页操作。

## 架构

1. Content script 在打开的分享菜单里注入「做成卡贴」，刮该帖的 `PostText`，页内浮层预览。工具栏通过 `OPEN_CARD_OVERLAY` 打开同一界面。
2. `render/statusHtml.ts` 拼出 598px 宽的 X light status HTML（实测字号/色值 + 真实 SVG path）
3. 页内浮层：`html-to-image`；Node：`playwright-core` Chrome 截 `article` → 铺满外框背景，白底卡左右各留画布宽度的 10% 后垂直居中
4. Background SW 处理 PNG 下载与草稿任务；每张素材存 IndexedDB，有序素材清单与进度存 `chrome.storage.local`
5. 创作者中心 content script 在任务绑定的标签页上传、填写、保存并重新打开核对，详情见 `docs/phase-2-browser-drafts.md`

## License

MIT
