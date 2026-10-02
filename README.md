# X Sticker

把 X / Twitter 帖子做成竖版 PNG 卡贴（文字封面＋原图），用于抖音、小红书。

Turn X / Twitter posts into vertical PNG stickers (text cover + original photos) for Douyin and Xiaohongshu.

> Chrome 扩展（Manifest V3），暂未上架应用商店，需要从源码安装。
> Chrome extension (Manifest V3). Not on the Chrome Web Store yet — install from source.

## 安装 · Install

需要 / Requires: [Node.js](https://nodejs.org/) 18+ 和 / and Chrome（或 Edge 等 Chromium 浏览器 / or another Chromium browser）。

**1. 获取代码 · Get the code**

```bash
git clone https://github.com/bubbleptr/x-sticker.git
cd x-sticker
```

或者在 GitHub 页面点 **Code → Download ZIP**，解压后进入目录。
Or click **Code → Download ZIP** on GitHub, unzip it, and `cd` into the folder.

**2. 构建 · Build**

```bash
npm ci
npm run build
```

构建产物在 `dist/` 目录。
The built extension is in the `dist/` folder.

**3. 加载到 Chrome · Load into Chrome**

1. 打开 / Open `chrome://extensions`
2. 打开右上角 **开发者模式** / Turn on **Developer mode** (top right)
3. 点 **加载已解压的扩展程序** / Click **Load unpacked**
4. 选择项目里的 `dist` 文件夹 / Select the project's `dist` folder

更新代码后重新运行 `npm run build`，再在扩展页点刷新按钮。
After pulling updates, run `npm run build` again and click the reload button on the extension card.

## 使用 · Usage

1. 在 x.com 打开一条帖子 / Open a post on x.com
2. 点帖子的 **分享** 按钮，选 **做成卡贴**（也可以点工具栏的 X Sticker 图标）
   Click the post's **Share** button and choose **做成卡贴** (or click the X Sticker toolbar icon)
3. 在预览里调整比例、背景、隐私模式，然后下载 PNG / ZIP，或同步到抖音、小红书草稿
   Adjust ratio, background and privacy mode in the preview, then download PNG / ZIP, or save to Douyin / Xiaohongshu drafts

功能、开发与架构说明见 [docs/development.md](docs/development.md)（中文）。
Features, development and architecture notes: [docs/development.md](docs/development.md) (Chinese).

## License

[MIT](LICENSE)
