import { renderCardPng } from '../render/card'
import { BACKGROUND_PRESETS } from '../popup/presets'
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
:host { all: initial; }
.scrim {
  position: absolute;
  inset: 0;
  background: rgba(15, 20, 25, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Segoe UI", system-ui, sans-serif;
  color: #0f1419;
}
.sheet {
  width: min(760px, calc(100vw - 32px));
  max-height: min(92vh, 680px);
  overflow: auto;
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 16px 48px rgba(15, 20, 25, 0.28);
  padding: 16px 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.workspace {
  display: flex;
  align-items: stretch;
  gap: 16px;
  min-height: 480px;
}
.preview-wrap {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  border-radius: 12px;
  background: #f7f9f9;
}
.inspector {
  flex: 0 0 248px;
  width: 248px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.brand { margin: 0; font-size: 18px; font-weight: 700; }
.close {
  appearance: none;
  border: none;
  background: transparent;
  font: inherit;
  font-size: 13px;
  color: #536471;
  cursor: pointer;
  padding: 4px 8px;
}
.status { margin: 0; min-height: 1.25em; font-size: 12px; color: #536471; }
.status.error { color: #f4212e; }
.row { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
.fieldset { margin: 0; padding: 0; border: none; display: flex; flex-wrap: wrap; gap: 6px; }
.fieldset legend { padding: 0; margin: 0 0 6px; width: 100%; font-size: 12px; color: #536471; }
.chip, .preset {
  border: 1px solid #eff3f4;
  border-radius: 999px;
  padding: 4px 10px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  background: #fff;
  color: #0f1419;
}
.chip { display: inline-flex; }
.chip:has(input:checked), .preset[aria-pressed="true"] {
  border-color: #1d9bf0;
  color: #1d9bf0;
  background: #e8f5fd;
}
.chip input { position: absolute; opacity: 0; pointer-events: none; }
.presets { display: flex; flex-wrap: wrap; gap: 6px; }
canvas {
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 520px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(15, 20, 25, 0.12);
}
.download {
  appearance: none;
  border: none;
  border-radius: 999px;
  margin-top: auto;
  padding: 10px 14px;
  font: inherit;
  font-weight: 700;
  font-size: 14px;
  background: #0f1419;
  color: #fff;
  cursor: pointer;
}
.download:disabled { opacity: 0.45; cursor: not-allowed; }
`

let closeCurrent: (() => void) | null = null

function paintPreview(preview: HTMLCanvasElement, bytes: Uint8Array): void {
  const ab = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(ab).set(bytes)
  const blob = new Blob([ab], { type: 'image/png' })
  const url = URL.createObjectURL(blob)
  const img = new Image()
  img.onload = () => {
    const maxW = 480
    const scale = maxW / img.width
    preview.width = maxW
    preview.height = Math.round(img.height * scale)
    const ctx = preview.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, preview.width, preview.height)
    ctx.drawImage(img, 0, 0, preview.width, preview.height)
    URL.revokeObjectURL(url)
  }
  img.onerror = () => URL.revokeObjectURL(url)
  img.src = url
}

export function openCardOverlay(result: ScrapeResult): void {
  closeCurrent?.()

  const host = document.createElement('div')
  host.id = HOST_ID
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;'
  const shadow = host.attachShadow({ mode: 'open' })
  shadow.innerHTML = `<style>${CSS}</style>
    <div class="scrim" id="scrim">
      <div class="sheet" id="sheet" role="dialog" aria-label="X Sticker" tabindex="-1">
        <div class="head">
          <h1 class="brand">X Sticker</h1>
          <button type="button" class="close" id="close">关闭</button>
        </div>
        <div class="workspace">
          <section class="preview-wrap" aria-label="预览">
            <canvas id="preview" width="360" height="480"></canvas>
          </section>
          <aside class="inspector" aria-label="出图选项">
            <p class="status" id="status" role="status"></p>
            <label class="row"><input type="checkbox" id="hideHandle" checked />隐藏 handle</label>
            <label class="row"><input type="checkbox" id="showAuthor" checked />显示作者名</label>
            <fieldset class="fieldset">
              <legend>比例</legend>
              <label class="chip"><input type="radio" name="aspect" value="3:4" checked /><span>3:4</span></label>
              <label class="chip"><input type="radio" name="aspect" value="9:16" /><span>9:16</span></label>
            </fieldset>
            <fieldset class="fieldset">
              <legend>背景</legend>
              <div class="presets" id="bgPresets"></div>
            </fieldset>
            <button type="button" class="download" id="download" disabled>下载 PNG</button>
          </aside>
        </div>
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

  const post: PostText | null = result.ok ? result.post : null
  let pngBytes: Uint8Array | null = null
  let selectedBgId = BACKGROUND_PRESETS[0]!.id
  let renderToken = 0

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
    if (!post) {
      downloadBtn.disabled = true
      pngBytes = null
      return
    }
    const token = ++renderToken
    setStatus('渲染中…')
    try {
      const bytes = await renderCardPng(post, currentOptions())
      if (token !== renderToken || !host.isConnected) return
      pngBytes = bytes
      paintPreview(preview, bytes)
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
      filename: `x-sticker-${Date.now()}.png`,
    } satisfies KatieMessage)) as KatieMessage
    if (!host.isConnected) return
    if (response?.type === 'DOWNLOAD_OK') setStatus('已开始下载')
    else if (response?.type === 'DOWNLOAD_ERR') setStatus(response.message, true)
    else setStatus('下载失败', true)
  }

  const ac = new AbortController()
  const close = () => {
    ac.abort()
    host.remove()
    if (closeCurrent === close) closeCurrent = null
  }
  closeCurrent = close

  const onKey = (event: KeyboardEvent) => {
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

  document.documentElement.appendChild(host)
  sheet.focus()

  if (!post) {
    setStatus('这条贴没有文字', true)
    return
  }
  setStatus(`已读取 · ${post.authorDisplayName ?? post.handle ?? '未知作者'}`)
  void refreshPreview()
}
