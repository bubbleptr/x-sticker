# X Sticker

把 X / Twitter **文字贴** 渲成竖版 PNG（抖音 / 小红书用）。贴文本身是 **仿 X 网页 status 详情** 的白底卡，竖版画布背景可选纯色、渐变或内置照片。

**v0.2**：抓取、预览、下载 PNG，也可上传到小红书和抖音创作者中心并保存草稿，最终发布由人完成。用法、保存限制及验收状态见[第二阶段说明](docs/phase-2-browser-drafts.md)。

## 功能

- 在帖子的原生分享菜单里点「做成卡贴」，页内预览并下载 PNG
- 工具栏图标只在 X/Twitter 可用，打开相同的页内预览，抓取当前 status（或时间线首条）的正文、作者、handle、时间、互动数、头像
- 选项：隐藏 handle、显示作者、比例 `3:4` / `9:16`
- 大图预览与右侧 Inspector 独立布局，支持适应窗口和 100% 原始像素查看
- 背景：纯白 / 浅灰 / 天蓝渐变 / 墨黑，或六张内置照片（云海、海边、雪峰、涩谷霓虹、纽约、香港），不联网拉取 Unsplash
- 页内预览用 HTML + `html-to-image` 渲染；本机单测 / 脚本用 Chrome 截图栅格化
- 下载 PNG 到本地
- 选择小红书、抖音，编辑标题和正文后同步到草稿；进度在独立页面显示，可返回预览或打开后台接手

## 不做

- 抖音 / 小红书自动发布
- 线程多图、图片/视频贴媒体截取
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

1. 打开一条公开文字帖（`…/status/…` 或时间线）
2. 点该帖的「分享」
3. 点「做成卡贴」
4. 在页内预览里调选项，点「下载 PNG」

工具栏「X Sticker」图标只在 X/Twitter 打开页内预览，不再显示独立弹窗。小红书和抖音页面没有插件悬浮面板；任务状态、停止和检查继续均在 X 的同步页操作。

## 架构

1. Content script 在打开的分享菜单里注入「做成卡贴」，刮该帖的 `PostText`，页内浮层预览。工具栏通过 `OPEN_CARD_OVERLAY` 打开同一界面。
2. `render/statusHtml.ts` 拼出 598px 宽的 X light status HTML（实测字号/色值 + 真实 SVG path）
3. 页内浮层：`html-to-image`；Node：`playwright-core` Chrome 截 `article` → 铺满外框背景，白底卡左右各留画布宽度的 10% 后垂直居中
4. Background SW 处理 PNG 下载与草稿任务；图片存 IndexedDB，进度存 `chrome.storage.local`
5. 创作者中心 content script 在任务绑定的标签页上传、填写、保存并重新打开核对，详情见 `docs/phase-2-browser-drafts.md`

## License

MIT
