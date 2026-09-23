import {
  DEFAULT_RENDER_OPTIONS,
  type AspectRatio,
  type Background,
  type KatieMessage,
  type PostText,
  type RenderOptions,
  type ScrapeResult,
} from '../types'
import { renderCardPng } from '../render/card'
import { BACKGROUND_PRESETS } from './presets'

const statusEl = document.getElementById('status') as HTMLParagraphElement
const hideHandleEl = document.getElementById('hideHandle') as HTMLInputElement
const showAuthorEl = document.getElementById('showAuthor') as HTMLInputElement
const downloadBtn = document.getElementById('download') as HTMLButtonElement
const preview = document.getElementById('preview') as HTMLCanvasElement
const bgPresetsEl = document.getElementById('bgPresets') as HTMLDivElement

let post: PostText | null = null
let pngBytes: Uint8Array | null = null
let selectedBgId = BACKGROUND_PRESETS[0]!.id
let renderToken = 0

function setStatus(text: string, isError = false): void {
  statusEl.textContent = text
  statusEl.classList.toggle('error', isError)
}

function currentOptions(): RenderOptions {
  const aspectInput = document.querySelector(
    'input[name="aspect"]:checked',
  ) as HTMLInputElement | null
  const aspect = (aspectInput?.value as AspectRatio | undefined) ?? DEFAULT_RENDER_OPTIONS.aspect
  const preset = BACKGROUND_PRESETS.find((p) => p.id === selectedBgId) ?? BACKGROUND_PRESETS[0]!
  return {
    hideHandle: hideHandleEl.checked,
    showAuthor: showAuthorEl.checked,
    aspect,
    background: preset.background as Background,
  }
}

function paintPreview(bytes: Uint8Array): void {
  const ab = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(ab).set(bytes)
  const blob = new Blob([ab], { type: 'image/png' })
  const url = URL.createObjectURL(blob)
  const img = new Image()
  img.onload = () => {
    const maxW = 270
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

async function refreshPreview(): Promise<void> {
  if (!post) {
    downloadBtn.disabled = true
    pngBytes = null
    return
  }
  const token = ++renderToken
  const options = currentOptions()
  setStatus('渲染中…')
  try {
    const bytes = await renderCardPng(post, options)
    if (token !== renderToken) return
    pngBytes = bytes
    paintPreview(bytes)
    downloadBtn.disabled = false
    setStatus('预览就绪')
  } catch (err) {
    if (token !== renderToken) return
    pngBytes = null
    downloadBtn.disabled = true
    setStatus(err instanceof Error ? err.message : '渲染失败', true)
  }
}

function bindPresets(): void {
  for (const preset of BACKGROUND_PRESETS) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'preset'
    btn.textContent = preset.label
    btn.setAttribute('aria-pressed', preset.id === selectedBgId ? 'true' : 'false')
    btn.addEventListener('click', () => {
      selectedBgId = preset.id
      for (const child of Array.from(bgPresetsEl.children)) {
        child.setAttribute(
          'aria-pressed',
          child === btn ? 'true' : 'false',
        )
      }
      void refreshPreview()
    })
    bgPresetsEl.appendChild(btn)
  }
}

async function scrapeActiveTab(): Promise<void> {
  setStatus('读取贴文…')
  downloadBtn.disabled = true
  post = null
  pngBytes = null

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id || !tab.url) {
    setStatus('当前页没读到文字贴', true)
    return
  }

  const onX =
    tab.url.startsWith('https://x.com/') || tab.url.startsWith('https://twitter.com/')
  if (!onX) {
    setStatus('当前页没读到文字贴', true)
    return
  }

  let response: KatieMessage
  try {
    response = (await chrome.tabs.sendMessage(tab.id, {
      type: 'SCRAPE_POST',
    } satisfies KatieMessage)) as KatieMessage
  } catch {
    setStatus('当前页没读到文字贴', true)
    return
  }

  if (response?.type !== 'SCRAPE_RESULT') {
    setStatus('当前页没读到文字贴', true)
    return
  }

  const result: ScrapeResult = response.result
  if (!result.ok) {
    setStatus('当前页没读到文字贴', true)
    return
  }

  post = result.post
  setStatus(`已读取 · ${post.authorDisplayName ?? post.handle ?? '未知作者'}`)
  await refreshPreview()
}

async function downloadPng(): Promise<void> {
  if (!pngBytes || !post) return
  const filename = `katie-${Date.now()}.png`
  const response = (await chrome.runtime.sendMessage({
    type: 'DOWNLOAD_PNG',
    bytes: Array.from(pngBytes),
    filename,
  } satisfies KatieMessage)) as KatieMessage

  if (response?.type === 'DOWNLOAD_OK') {
    setStatus('已开始下载')
  } else if (response?.type === 'DOWNLOAD_ERR') {
    setStatus(response.message, true)
  } else {
    setStatus('下载失败', true)
  }
}

function bindControls(): void {
  hideHandleEl.addEventListener('change', () => void refreshPreview())
  showAuthorEl.addEventListener('change', () => void refreshPreview())
  for (const input of Array.from(document.querySelectorAll('input[name="aspect"]'))) {
    input.addEventListener('change', () => void refreshPreview())
  }
  downloadBtn.addEventListener('click', () => void downloadPng())
}

bindPresets()
bindControls()
void scrapeActiveTab()
