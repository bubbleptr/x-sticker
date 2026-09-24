import { renderCardPng } from '../render/card'
import { createPreviewController } from '../render/preview'
import { BACKGROUND_PRESETS } from '../popup/presets'
import { createDraftComposer } from '../drafts/composer'
import {
  DEFAULT_RENDER_OPTIONS,
  type AspectRatio,
  type KatieMessage,
  type PostText,
  type RenderOptions,
  type ScrapeResult,
} from '../types'

const HOST_ID = 'katie-card-overlay'

const CSS = `
:host { all: initial; --ink: #0f1419; --muted: #536471; --line: #e4e7eb; --accent: #0f1419; --danger: #b91c1c; }
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
.scrim {
  position: absolute; inset: 0; background: rgba(15, 20, 25, 0.45);
  display: flex; align-items: center; justify-content: center;
  font: 14px/1.5 "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Segoe UI", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased; color: var(--ink);
}
.sheet {
  width: min(1280px, calc(100vw - 48px)); height: min(960px, calc(100dvh - 48px));
  overflow: hidden; background: #fff; border-radius: 16px;
  box-shadow: 0 16px 48px #0f141938; display: flex; flex-direction: column;
}
.head { display: flex; align-items: center; justify-content: space-between; flex: 0 0 64px; gap: 12px; padding: 0 24px; border-bottom: 1px solid var(--line); }
.brand { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.5px; }
.head-actions { display: flex; align-items: center; gap: 12px; }
button { font: inherit; cursor: pointer; }
.quiet-button, .close { min-height: 36px; border: 1px solid var(--line); border-radius: 8px; padding: 6px 12px; color: var(--ink); background: #fff; }
.close { border-color: transparent; color: var(--muted); }
:is(.quiet-button, .close, .preset):not(:disabled):hover { background: #f1f3f5; }
button:disabled { opacity: 0.45; cursor: not-allowed; }
.workspace { display: grid; grid-template-columns: minmax(0, 1fr) 360px; flex: 1; min-height: 0; }
.preview-wrap { min-width: 0; min-height: 0; display: flex; flex-direction: column; background: #f3f4f6; }
.preview-toolbar { display: flex; flex: 0 0 60px; align-items: center; justify-content: space-between; gap: 12px; padding: 0 24px; font-size: 13px; color: var(--muted); }
.zoom-controls { display: flex; gap: 2px; padding: 2px; border-radius: 8px; background: #e8ebee; }
.zoom-controls button { min-height: 36px; padding: 6px 12px; border: 0; border-radius: 6px; font-size: 13px; color: var(--muted); background: transparent; }
.zoom-controls button[aria-pressed="true"] { color: var(--ink); background: #fff; box-shadow: 0 1px 3px #0f14191a; }
.preview-viewport { display: flex; flex: 1; min-width: 0; min-height: 0; overflow: auto; margin: 0 24px; }
canvas { display: block; flex: none; margin: auto; background: #fff; border-radius: 4px; box-shadow: 0 4px 20px #0f14191a; }
.status { margin: 0; flex: 0 0 36px; padding: 9px 24px; font-size: 12px; color: var(--muted); }
.status.error { color: var(--danger); }
.inspector { min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 24px; border-left: 1px solid var(--line); display: flex; flex-direction: column; gap: 20px; }
.inspector > * { flex-shrink: 0; }
.appearance { display: grid; gap: 16px; }
.section-title { margin: 0; font-size: 16px; font-weight: 650; }
.author-options { display: flex; flex-wrap: wrap; gap: 8px 16px; }
.row { display: flex; align-items: center; min-height: 36px; gap: 8px; font-size: 14px; cursor: pointer; }
.row input { margin: 0; width: 16px; height: 16px; accent-color: var(--accent); }
.fieldset { margin: 0; padding: 0; border: 0; display: flex; flex-wrap: wrap; gap: 8px; }
.fieldset legend { padding: 0; margin-bottom: 8px; font-size: 14px; }
.chip, .preset { display: inline-flex; align-items: center; justify-content: center; min-height: 36px; border: 1px solid var(--line); border-radius: 8px; padding: 6px 12px; font: inherit; font-size: 14px; cursor: pointer; background: #fff; color: var(--ink); }
.chip:has(input:checked), .preset[aria-pressed="true"] { border-color: var(--ink); background: #f1f3f5; }
.chip input { position: absolute; opacity: 0; pointer-events: none; }
.presets { display: flex; flex-wrap: wrap; gap: 8px; }
.download { width: 100%; }
.progress-screen { flex: 1; min-height: 0; overflow: auto; padding: 32px; }
.chip:has(input:focus-visible), button:focus-visible, .row input:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
@media (max-width: 760px) {
  .sheet { width: calc(100vw - 16px); height: calc(100dvh - 16px); }
  .head { padding: 0 16px; flex-basis: 56px; }
  .head-actions { gap: 4px; }
  .workspace { display: flex; flex-direction: column; overflow: auto; }
  .preview-wrap { flex: 0 0 min(65dvh, 620px); }
  .preview-toolbar { padding: 0 16px; flex-basis: 52px; }
  .preview-viewport { margin: 0 16px; }
  .inspector { flex: 0 0 auto; overflow: visible; padding: 20px; border-left: 0; border-top: 1px solid var(--line); }
  .progress-screen { padding: 20px; }
}
`

let closeCurrent: (() => void) | null = null

export function openCardOverlay(result: ScrapeResult): void {
  closeCurrent?.()

  const host = document.createElement('div')
  host.id = HOST_ID
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;'
  const shadow = host.attachShadow({ mode: 'open' })
  shadow.innerHTML = `<style>${CSS}</style>
    <div class="scrim" id="scrim">
      <div class="sheet" id="sheet" role="dialog" aria-modal="true" aria-label="X Sticker" tabindex="-1">
        <div class="head">
          <h1 class="brand">X Sticker</h1>
          <div class="head-actions">
            <button type="button" class="quiet-button" id="showProgress">同步记录</button>
            <button type="button" class="close" id="close">关闭</button>
          </div>
        </div>
        <div class="workspace">
          <section class="preview-wrap" aria-label="预览">
            <div class="preview-toolbar">
              <span>贴图预览</span>
              <div class="zoom-controls" role="group" aria-label="预览缩放">
                <button type="button" id="zoomFit" aria-pressed="true">适应窗口</button>
                <button type="button" id="zoomActual" aria-pressed="false">100%</button>
              </div>
            </div>
            <div id="previewViewport" class="preview-viewport">
              <canvas id="preview" width="1080" height="1440" aria-label="贴图效果"></canvas>
            </div>
            <p class="status" id="status" role="status"></p>
          </section>
          <aside class="inspector" aria-label="出图选项">
            <section class="appearance" aria-label="贴图样式">
            <h2 class="section-title">贴图样式</h2>
            <div class="author-options">
              <label class="row"><input type="checkbox" id="hideHandle" checked />隐藏账号</label>
              <label class="row"><input type="checkbox" id="showAuthor" checked />显示作者</label>
            </div>
            <fieldset class="fieldset">
              <legend>比例</legend>
              <label class="chip"><input type="radio" name="aspect" value="3:4" checked /><span>3:4</span></label>
              <label class="chip"><input type="radio" name="aspect" value="9:16" /><span>9:16</span></label>
            </fieldset>
            <fieldset class="fieldset">
              <legend>背景</legend>
              <div class="presets" id="bgPresets"></div>
            </fieldset>
            </section>
            <section id="draftComposer"></section>
            <button type="button" class="quiet-button download" id="download" disabled>下载 PNG</button>
          </aside>
        </div>
        <section id="draftProgress" class="progress-screen" aria-label="同步进度" hidden></section>
      </div>
    </div>`

  const q = <T extends Element>(sel: string) => shadow.querySelector(sel) as T
  const statusEl = q<HTMLParagraphElement>('#status')
  const hideHandleEl = q<HTMLInputElement>('#hideHandle')
  const showAuthorEl = q<HTMLInputElement>('#showAuthor')
  const downloadBtn = q<HTMLButtonElement>('#download')
  const preview = q<HTMLCanvasElement>('#preview')
  const bgPresetsEl = q<HTMLDivElement>('#bgPresets')
  const scrim = q<HTMLDivElement>('#scrim')
  const sheet = q<HTMLDivElement>('#sheet')
  const workspace = q<HTMLElement>('.workspace')
  const progressScreen = q<HTMLElement>('#draftProgress')
  const previewController = createPreviewController(preview, q<HTMLElement>('#previewViewport'))
  const zoomFit = q<HTMLButtonElement>('#zoomFit')
  const zoomActual = q<HTMLButtonElement>('#zoomActual')

  const post: PostText | null = result.ok ? result.post : null
  let pngBytes: Uint8Array | null = null
  let selectedBgId = BACKGROUND_PRESETS[0]!.id
  let renderToken = 0
  const filename = `x-sticker-${Date.now()}.png`
  const composer = createDraftComposer(q<HTMLElement>('#draftComposer'), {
    progressContainer: progressScreen,
    onViewChange(view) {
      workspace.hidden = view !== 'editor'
      progressScreen.hidden = view !== 'progress'
    },
  })
  const syncDraftSnapshot = () => composer.setSnapshot(post ? { post, bytes: pngBytes, filename } : null)
  syncDraftSnapshot()

  const setStatus = (text: string, isError = false) => {
    statusEl.textContent = text
    statusEl.classList.toggle('error', isError)
  }

  const currentOptions = (): RenderOptions => {
    const aspectInput = shadow.querySelector('input[name="aspect"]:checked') as HTMLInputElement | null
    const aspect = (aspectInput?.value as AspectRatio | undefined) ?? DEFAULT_RENDER_OPTIONS.aspect
    const preset = BACKGROUND_PRESETS.find((p) => p.id === selectedBgId) ?? BACKGROUND_PRESETS[0]!
    return {
      hideHandle: hideHandleEl.checked,
      showAuthor: showAuthorEl.checked,
      aspect,
      background: preset.background,
    }
  }

  const refreshPreview = async () => {
    pngBytes = null
    downloadBtn.disabled = true
    syncDraftSnapshot()
    if (!post) {
      return
    }
    const token = ++renderToken
    setStatus('渲染中…')
    try {
      const bytes = await renderCardPng(post, currentOptions())
      if (token !== renderToken || !host.isConnected) return
      pngBytes = bytes
      syncDraftSnapshot()
      previewController.paint(bytes)
      downloadBtn.disabled = false
      setStatus('预览就绪')
    } catch (err) {
      if (token !== renderToken || !host.isConnected) return
      pngBytes = null
      downloadBtn.disabled = true
      setStatus(err instanceof Error ? err.message : '渲染失败', true)
    }
  }

  for (const preset of BACKGROUND_PRESETS) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'preset'
    btn.textContent = preset.label
    btn.setAttribute('aria-pressed', preset.id === selectedBgId ? 'true' : 'false')
    btn.addEventListener('click', () => {
      selectedBgId = preset.id
      for (const child of Array.from(bgPresetsEl.children)) {
        child.setAttribute('aria-pressed', child === btn ? 'true' : 'false')
      }
      void refreshPreview()
    })
    bgPresetsEl.appendChild(btn)
  }

  const downloadPng = async () => {
    if (!pngBytes || !post) return
    const response = (await chrome.runtime.sendMessage({
      type: 'DOWNLOAD_PNG',
      bytes: Array.from(pngBytes),
      filename,
    } satisfies KatieMessage)) as KatieMessage
    if (!host.isConnected) return
    if (response?.type === 'DOWNLOAD_OK') setStatus('已开始下载')
    else if (response?.type === 'DOWNLOAD_ERR') setStatus(response.message, true)
    else setStatus('下载失败', true)
  }

  const ac = new AbortController()
  const close = () => {
    ac.abort()
    composer.destroy()
    previewController.destroy()
    host.remove()
    if (closeCurrent === close) closeCurrent = null
  }
  closeCurrent = close

  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Tab') {
      const controls = Array.from(shadow.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled])'))
        .filter((element) => element.getClientRects().length > 0)
      const active = shadow.activeElement
      const first = controls[0]
      const last = controls.at(-1)
      if (event.shiftKey && (active === first || active === sheet)) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first?.focus() }
      return
    }
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    close()
  }
  window.addEventListener('keydown', onKey, { capture: true, signal: ac.signal })
  q<HTMLButtonElement>('#close').addEventListener('click', close)
  scrim.addEventListener('click', (event) => {
    if (event.target === scrim) close()
  })
  hideHandleEl.addEventListener('change', () => void refreshPreview())
  showAuthorEl.addEventListener('change', () => void refreshPreview())
  for (const input of Array.from(shadow.querySelectorAll('input[name="aspect"]'))) {
    input.addEventListener('change', () => void refreshPreview())
  }
  downloadBtn.addEventListener('click', () => void downloadPng())
  q<HTMLButtonElement>('#showProgress').addEventListener('click', () => composer.showProgress())
  for (const [button, mode] of [[zoomFit, 'fit'], [zoomActual, 'actual']] as const) {
    button.addEventListener('click', () => {
      previewController.setZoom(mode)
      zoomFit.setAttribute('aria-pressed', String(mode === 'fit'))
      zoomActual.setAttribute('aria-pressed', String(mode === 'actual'))
    })
  }

  document.documentElement.appendChild(host)
  sheet.focus()

  if (!post) {
    setStatus('这条贴没有文字', true)
    return
  }
  setStatus(`已读取 · ${post.authorDisplayName ?? post.handle ?? '未知作者'}`)
  void refreshPreview()
}
