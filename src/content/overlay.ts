import { encodeImageAsset, loadPostPhoto, type ImageAsset } from '../media'
import { renderCardPng } from '../render/card'
import { createPreviewController } from '../render/preview'
import { BACKGROUND_PRESETS, BACKGROUND_PRESET_GROUPS } from '../popup/presets'
import { DEFAULT_INSPECTOR_PREFERENCES, loadInspectorPreferences, saveInspectorPreferences, type InspectorPreferences } from '../inspectorPreferences'
import { createDraftComposer } from '../drafts/composer'
import brandLogo from '../../public/icons/logo.svg?raw'
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
.brand { display: flex; align-items: center; gap: 10px; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.5px; white-space: nowrap; }
.brand-logo { width: 28px; height: 28px; flex: none; pointer-events: none; user-select: none; }
.brand-logo svg { display: block; width: 100%; height: 100%; }
.head-actions { display: flex; align-items: center; gap: 12px; }
button { font: inherit; cursor: pointer; }
.quiet-button, .close { min-height: 36px; border: 1px solid var(--line); border-radius: 8px; padding: 6px 12px; color: var(--ink); background: #fff; }
.close { border-color: transparent; color: var(--muted); }
:is(.quiet-button, .close, .preset):not(:disabled):hover { background: #f1f3f5; }
button:disabled { opacity: 0.45; cursor: not-allowed; }
.workspace { display: grid; grid-template-columns: minmax(0, 1fr) 360px; flex: 1; min-height: 0; }
.preview-wrap { min-width: 0; min-height: 0; display: flex; flex-direction: column; background: #f3f4f6; }
.preview-toolbar { display: flex; flex: 0 0 60px; align-items: center; justify-content: space-between; gap: 12px; padding: 0 24px; font-size: 13px; color: var(--muted); }
.preview-viewport { display: flex; flex: 1; min-width: 0; min-height: 0; overflow: auto; margin: 0 24px; }
canvas { display: block; flex: none; margin: auto; background: #fff; border-radius: 4px; box-shadow: 0 4px 20px #0f14191a; }
.status { margin: 0; min-height: 36px; padding: 9px 24px; font-size: 12px; color: var(--muted); }
.status.error { color: var(--danger); }
.inspector { min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 24px; border-left: 1px solid var(--line); display: flex; flex-direction: column; gap: 20px; }
.inspector > * { flex-shrink: 0; }
.appearance { display: grid; gap: 16px; }
.section-title { margin: 0; font-size: 16px; font-weight: 650; }
.author-options { display: flex; flex-wrap: wrap; gap: 8px 16px; }
.row { display: flex; align-items: center; min-height: 36px; gap: 8px; font-size: 14px; cursor: pointer; }
.row input { margin: 0; width: 16px; height: 16px; accent-color: var(--accent); }
.name-field { display: grid; gap: 6px; font-size: 14px; }
.name-field input { width: 100%; border: 1px solid var(--line); border-radius: 8px; padding: 9px 10px; background: #fff; color: var(--ink); font: inherit; font-size: 16px; line-height: 1.45; }
.name-field input:disabled { color: var(--muted); background: #f3f4f6; }
.name-hint { font-size: 12px; color: var(--muted); }
.fieldset { margin: 0; padding: 0; border: 0; display: flex; flex-wrap: wrap; gap: 8px; }
.fieldset legend { padding: 0; margin-bottom: 8px; font-size: 14px; }
.chip, .preset { display: inline-flex; align-items: center; justify-content: center; min-height: 36px; border: 1px solid var(--line); border-radius: 8px; padding: 6px 12px; font: inherit; font-size: 14px; cursor: pointer; background: #fff; color: var(--ink); }
.chip:has(input:checked), .preset[aria-pressed="true"] { border-color: var(--ink); background: #f1f3f5; }
.chip input { position: absolute; opacity: 0; pointer-events: none; }
.presets { display: flex; flex-wrap: wrap; gap: 8px; }
.background-groups { display: grid; gap: 12px; width: 100%; }
.background-group { border: 0; padding: 0; margin: 0; min-width: 0; }
.background-group legend { font-size: 12px; color: var(--muted); }
.preferences-status { margin: 0; color: var(--danger); font-size: 12px; }
.download { width: 100%; }
.gallery { display: flex; gap: 10px; overflow-x: auto; flex: none; padding: 12px 24px 4px; }
.gallery-page { flex: 0 0 84px; min-width: 0; }
.thumbnail { display: block; width: 84px; height: 72px; padding: 4px; border: 1px solid var(--line); border-radius: 8px; background: #fff; color: var(--muted); font-size: 12px; overflow: hidden; }
.thumbnail[aria-pressed="true"] { border-color: var(--ink); box-shadow: 0 0 0 1px var(--ink); }
.thumbnail img { width: 100%; height: 100%; object-fit: contain; display: block; }
.gallery-page[data-selected="false"] .thumbnail { opacity: 0.5; }
.gallery-choice { display: flex; align-items: center; justify-content: center; gap: 5px; min-height: 40px; font-size: 12px; cursor: pointer; }
.gallery-choice input { width: 16px; height: 16px; accent-color: var(--ink); margin: 0; }
.gallery-cover-label { text-align: center; display: block; padding: 10px 0; font-size: 12px; }
.preview-label { font-variant-numeric: tabular-nums; }
.preview-empty { margin: auto; padding: 24px; max-width: 38ch; text-align: center; color: var(--muted); }
.preview-empty p { margin: 0 0 12px; overflow-wrap: anywhere; }
.preview-empty button { min-height: 40px; }
.gallery-choice input:focus-visible { outline: 2px solid var(--ink); outline-offset: 3px; }
.progress-screen { flex: 1; min-height: 0; overflow: auto; padding: 32px; }
.chip:has(input:focus-visible), button:focus-visible, .row input:focus-visible, .name-field input:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
@media (max-width: 760px) {
  .sheet { width: calc(100vw - 16px); height: calc(100dvh - 16px); }
  .head { padding: 0 16px; flex-basis: 56px; }
  .brand { gap: 8px; font-size: 18px; }
  .brand-logo { width: 24px; height: 24px; }
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
          <h1 class="brand"><span class="brand-logo" aria-hidden="true">${brandLogo}</span><span>X Sticker</span></h1>
          <div class="head-actions">
            <button type="button" class="quiet-button" id="showProgress">同步记录</button>
            <button type="button" class="close" id="close">关闭</button>
          </div>
        </div>
        <div class="workspace">
          <section class="preview-wrap" aria-label="预览">
            <div class="preview-toolbar">
              <span id="previewLabel" class="preview-label">贴图预览</span>
              <span>适应窗口</span>
            </div>
            <div id="previewViewport" class="preview-viewport">
              <canvas id="preview" width="1080" height="1440" aria-label="贴图效果" hidden></canvas>
              <div id="previewEmpty" class="preview-empty"><p id="previewMessage">正在准备图片…</p><button id="retryImage" class="quiet-button" type="button" hidden>重试加载</button></div>
            </div>
            <div id="gallery" class="gallery" aria-label="图片预览与选择" inert></div>
            <p class="status" id="status" role="status"></p>
          </section>
          <aside class="inspector" aria-label="出图选项" aria-busy="true" inert>
            <section class="appearance" aria-label="贴图样式">
            <h2 class="section-title">封面样式</h2>
            <div class="author-options">
              <label class="row"><input type="checkbox" id="showHandle" checked />显示账号</label>
              <label class="row"><input type="checkbox" id="showAuthor" checked />显示作者</label>
            </div>
            <label class="name-field">
              <span>自定义名字</span>
              <input type="text" id="customName" autocomplete="off" spellcheck="false" aria-describedby="customNameHint" placeholder="使用帖子原名" />
              <span class="name-hint" id="customNameHint">用于图片中的作者名，留空使用原名</span>
            </label>
            <fieldset class="fieldset">
              <legend>比例</legend>
              <label class="chip"><input type="radio" name="aspect" value="3:4" checked /><span>3:4</span></label>
              <label class="chip"><input type="radio" name="aspect" value="9:16" /><span>9:16</span></label>
            </fieldset>
            <fieldset class="fieldset">
              <legend>背景</legend>
              <div class="background-groups" id="bgPresets"></div>
            </fieldset>
            <p class="preferences-status" id="preferencesStatus" role="status" hidden></p>
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
  const showHandleEl = q<HTMLInputElement>('#showHandle')
  const showAuthorEl = q<HTMLInputElement>('#showAuthor')
  const customNameEl = q<HTMLInputElement>('#customName')
  const downloadBtn = q<HTMLButtonElement>('#download')
  const preview = q<HTMLCanvasElement>('#preview')
  const bgPresetsEl = q<HTMLDivElement>('#bgPresets')
  const scrim = q<HTMLDivElement>('#scrim')
  const sheet = q<HTMLDivElement>('#sheet')
  const workspace = q<HTMLElement>('.workspace')
  const progressScreen = q<HTMLElement>('#draftProgress')
  const inspector = q<HTMLElement>('.inspector')
  const preferencesStatus = q<HTMLElement>('#preferencesStatus')
  const previewController = createPreviewController(preview, q<HTMLElement>('#previewViewport'))

  const post: PostText | null = result.ok ? result.post : null
  const hasCover = Boolean(post?.text.trim())
  type Page = { id: string; label: string; selected: boolean; image: ImageAsset | null; loading: boolean; error: string }
  const pages: Page[] = [
    ...(hasCover ? [{ id: 'cover', label: '文字封面', selected: true, image: null, loading: true, error: '' }] : []),
    ...(post?.photos ?? []).map((_, index) => ({ id: `photo-${index}`, label: `配图 ${index + 1}`, selected: true, image: null, loading: true, error: '' })),
  ]
  let activePage = pages[0]
  let paintedImage: ImageAsset | null = null
  let pendingImage: ImageAsset | null = null
  let paintToken = 0
  let exportImages: ImageAsset[] | null = null
  let downloading = false
  const gallery = q<HTMLElement>('#gallery')
  const previewEmpty = q<HTMLElement>('#previewEmpty')
  const previewMessage = q<HTMLElement>('#previewMessage')
  const retryImage = q<HTMLButtonElement>('#retryImage')
  gallery.hidden = !post?.photos?.length
  q<HTMLElement>('.appearance').hidden = !hasCover
  let selectedBgId = DEFAULT_INSPECTOR_PREFERENCES.backgroundId
  let renderToken = 0
  let nameRenderTimer: ReturnType<typeof setTimeout> | undefined
  const filename = `x-sticker-${Date.now()}.zip`
  const failedPreferences = new Set<keyof InspectorPreferences>()
  const persistPreferences = (patch: Partial<InspectorPreferences>) => {
    const fields = Object.keys(patch) as (keyof InspectorPreferences)[]
    void saveInspectorPreferences(patch).then(() => {
      for (const field of fields) failedPreferences.delete(field)
      preferencesStatus.hidden = failedPreferences.size === 0
    }).catch(() => {
      for (const field of fields) failedPreferences.add(field)
      preferencesStatus.textContent = '偏好保存失败，下次打开可能无法恢复。'
      preferencesStatus.hidden = false
    })
  }
  const composer = createDraftComposer(q<HTMLElement>('#draftComposer'), {
    progressContainer: progressScreen,
    onPlatformsChange: (platforms) => persistPreferences({ platforms }),
    onViewChange(view) {
      workspace.hidden = view !== 'editor'
      progressScreen.hidden = view !== 'progress'
    },
  })
  const syncDraftSnapshot = () => composer.setSnapshot(post ? { post, images: exportImages } : null)
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
      hideHandle: !showHandleEl.checked,
      showAuthor: showAuthorEl.checked,
      aspect,
      background: preset.background,
    }
  }

  const showActivePage = () => {
    const page = activePage
    const image = page?.image
    const painted = Boolean(image && image === paintedImage && !pendingImage)
    preview.hidden = !painted
    previewEmpty.hidden = painted
    previewMessage.textContent = page?.error || (page?.loading || image ? '正在加载图片…' : '这条帖子没有可用的文字或静态图片。')
    retryImage.hidden = !activePage?.error
    q<HTMLElement>('#previewLabel').textContent = activePage
      ? `${activePage.label} · ${pages.indexOf(activePage) + 1} / ${pages.length}` : '贴图预览'
    if (image && image !== pendingImage && (image !== paintedImage || pendingImage)) {
      const token = ++paintToken
      pendingImage = image
      void previewController.paint(image.dataUrl).then((drawn) => {
        if (token !== paintToken || !host.isConnected) return
        pendingImage = null
        if (drawn) paintedImage = image
        showActivePage()
      }).catch((error: unknown) => {
        if (token !== paintToken || !host.isConnected) return
        pendingImage = null
        paintedImage = null
        page.image = null
        page.error = error instanceof Error ? error.message : '图片预览失败，请重试'
        syncImages()
      })
    }
    for (const page of pages) {
      const item = gallery.querySelector<HTMLElement>(`[data-page-id="${page.id}"]`)!
      item.dataset.selected = String(page.selected)
      const button = item.querySelector<HTMLButtonElement>('.thumbnail')!
      button.setAttribute('aria-pressed', String(page === activePage))
      button.setAttribute('aria-label', `查看${page.label}${page.error ? '，加载失败' : ''}`)
      const thumb = button.querySelector('img')!
      const placeholder = button.querySelector('span')!
      if (page.image && thumb.getAttribute('src') !== page.image.dataUrl) thumb.src = page.image.dataUrl
      thumb.hidden = !page.image
      placeholder.hidden = Boolean(page.image)
      placeholder.textContent = page.error ? '加载失败' : '加载中…'
    }
  }

  const syncImages = () => {
    const selected = pages.filter((page) => page.selected)
    const ready = selected.length > 0 && selected.every((page) => page.image)
    exportImages = ready ? selected.map((page, index) => ({
      ...page.image!, filename: `${String(index + 1).padStart(2, '0')}-${page.id === 'cover' ? 'cover' : 'photo'}.${page.image!.mimeType.split('/')[1]!.replace('jpeg', 'jpg')}`,
    })) : null
    downloadBtn.disabled = !ready || downloading
    downloadBtn.textContent = downloading ? '准备下载…' : selected.length > 1 ? '下载整组（ZIP）' : '下载图片'
    syncDraftSnapshot()
    const failed = selected.find((page) => page.error)
    if (failed) setStatus(`${failed.label}加载失败，${failed.id === 'cover' ? '请重试。' : '请重试或取消勾选。'}`, true)
    else if (!selected.length) setStatus('请至少选择一张图片。')
    else if (!ready) setStatus('正在准备所选图片…')
    else setStatus(pages.length > 1 ? `已选 ${selected.length} 张，按封面、配图顺序输出` : '预览就绪')
    showActivePage()
  }

  const invalidatePreview = () => {
    const cover = pages.find((page) => page.id === 'cover')
    if (cover) { cover.image = null; cover.loading = true; cover.error = '' }
    syncImages()
    return ++renderToken
  }

  const refreshPreview = async () => {
    clearTimeout(nameRenderTimer)
    const cover = pages.find((page) => page.id === 'cover')
    if (!post || !cover) { syncImages(); return }
    const token = invalidatePreview()
    try {
      const customName = customNameEl.value.trim()
      const renderedPost = customName ? { ...post, authorDisplayName: customName } : post
      const bytes = await renderCardPng(renderedPost, currentOptions())
      if (token !== renderToken || !host.isConnected) return
      cover.image = encodeImageAsset(bytes, 'image/png', '01-cover.png')
    } catch (err) {
      if (token !== renderToken || !host.isConnected) return
      cover.error = err instanceof Error ? err.message : '封面生成失败'
    }
    cover.loading = false
    syncImages()
  }

  const loadPhoto = async (page: Page) => {
    const index = Number(page.id.slice('photo-'.length))
    const photo = post?.photos?.[index]
    if (!photo) return
    page.loading = true
    page.error = ''
    syncImages()
    try {
      const image = await loadPostPhoto(photo.url, `photo-${index + 1}`)
      if (!host.isConnected) return
      page.image = image
    } catch (err) {
      if (!host.isConnected) return
      page.error = err instanceof Error ? err.message : '图片加载失败'
    }
    page.loading = false
    syncImages()
  }

  for (const page of pages) {
    const item = document.createElement('div')
    item.className = 'gallery-page'
    item.dataset.pageId = page.id
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'thumbnail'
    const image = document.createElement('img')
    image.alt = ''
    image.hidden = true
    const placeholder = document.createElement('span')
    button.append(image, placeholder)
    button.addEventListener('click', () => { activePage = page; showActivePage() })
    item.append(button)
    if (page.id === 'cover') {
      const label = document.createElement('span')
      label.className = 'gallery-cover-label'
      label.textContent = '文字封面'
      item.append(label)
    } else {
      const label = document.createElement('label')
      label.className = 'gallery-choice'
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.checked = true
      checkbox.addEventListener('change', () => { page.selected = checkbox.checked; syncImages() })
      label.append(checkbox, page.label)
      item.append(label)
    }
    gallery.append(item)
  }
  retryImage.addEventListener('click', () => {
    if (!activePage || activePage.loading) return
    if (activePage.id === 'cover') void refreshPreview()
    else void loadPhoto(activePage)
  })

  const updateBackgroundSelection = () => {
    for (const button of bgPresetsEl.querySelectorAll<HTMLButtonElement>('.preset')) {
      button.setAttribute('aria-pressed', String(button.dataset.presetId === selectedBgId))
    }
  }
  for (const group of BACKGROUND_PRESET_GROUPS) {
    const fieldset = document.createElement('fieldset')
    fieldset.className = 'background-group'
    const legend = document.createElement('legend')
    legend.textContent = group.label
    const presets = document.createElement('div')
    presets.className = 'presets'
    for (const preset of group.presets) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'preset'
      btn.dataset.presetId = preset.id
      btn.textContent = preset.label
      btn.addEventListener('click', () => {
        selectedBgId = preset.id
        updateBackgroundSelection()
        persistPreferences({ backgroundId: selectedBgId })
        void refreshPreview()
      })
      presets.appendChild(btn)
    }
    fieldset.append(legend, presets)
    bgPresetsEl.appendChild(fieldset)
  }
  updateBackgroundSelection()

  const downloadPng = async () => {
    if (!exportImages || !post || downloading) return
    const images = exportImages.map((image) => ({ ...image }))
    downloading = true
    syncImages()
    try {
      const response = (await chrome.runtime.sendMessage({
        type: 'DOWNLOAD_IMAGES', images, filename,
      } satisfies KatieMessage)) as KatieMessage
      if (!host.isConnected) return
      if (response?.type === 'DOWNLOAD_OK') setStatus('已开始下载')
      else if (response?.type === 'DOWNLOAD_ERR') setStatus(response.message, true)
      else setStatus('下载失败', true)
    } catch (error) {
      if (host.isConnected) setStatus(error instanceof Error ? error.message : '下载失败', true)
    } finally {
      downloading = false
      if (host.isConnected) {
        downloadBtn.disabled = !exportImages
        downloadBtn.textContent = (exportImages?.length ?? 0) > 1 ? '下载整组（ZIP）' : '下载图片'
      }
    }
  }

  const ac = new AbortController()
  const close = () => {
    ac.abort()
    clearTimeout(nameRenderTimer)
    composer.destroy()
    previewController.destroy()
    host.remove()
    if (closeCurrent === close) closeCurrent = null
  }
  closeCurrent = close

  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Tab') {
      const controls = Array.from(shadow.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled])'))
        .filter((element) => !element.closest('[inert]') && element.getClientRects().length > 0)
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
  showHandleEl.addEventListener('change', () => {
    persistPreferences({ showHandle: showHandleEl.checked })
    void refreshPreview()
  })
  showAuthorEl.addEventListener('change', () => {
    customNameEl.disabled = !showAuthorEl.checked
    persistPreferences({ showAuthor: showAuthorEl.checked })
    void refreshPreview()
  })
  customNameEl.addEventListener('input', () => {
    persistPreferences({ customName: customNameEl.value })
    invalidatePreview()
    clearTimeout(nameRenderTimer)
    setStatus('渲染中…')
    nameRenderTimer = setTimeout(() => void refreshPreview(), 200)
  })
  for (const input of shadow.querySelectorAll<HTMLInputElement>('input[name="aspect"]')) {
    input.addEventListener('change', () => {
      persistPreferences({ aspect: input.value as AspectRatio })
      void refreshPreview()
    })
  }
  downloadBtn.addEventListener('click', () => void downloadPng())
  q<HTMLButtonElement>('#showProgress').addEventListener('click', () => composer.showProgress())
  document.documentElement.appendChild(host)
  sheet.focus()

  setStatus(post ? '正在读取偏好…' : '这条帖子没有可用的文字或静态图片。', !post)
  void loadInspectorPreferences().then((preferences) => {
    if (!host.isConnected) return
    showHandleEl.checked = preferences.showHandle
    showAuthorEl.checked = preferences.showAuthor
    customNameEl.value = preferences.customName
    customNameEl.disabled = !showAuthorEl.checked
    q<HTMLInputElement>(`input[name="aspect"][value="${preferences.aspect}"]`).checked = true
    selectedBgId = preferences.backgroundId
    updateBackgroundSelection()
    composer.setPlatforms(preferences.platforms)
  }).catch(() => {
    preferencesStatus.textContent = '偏好读取失败，本次使用默认设置。'
    preferencesStatus.hidden = false
  }).finally(() => {
    if (!host.isConnected) return
    inspector.inert = false
    gallery.inert = false
    inspector.removeAttribute('aria-busy')
    void refreshPreview()
    for (const page of pages.filter((page) => page.id !== 'cover')) void loadPhoto(page)
  })
}
