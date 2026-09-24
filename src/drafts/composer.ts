import type { PostText } from '../types'
import type { ImageAsset } from '../media'
import { DRAFT_TARGETS, type DraftJob, type DraftMessage, type DraftPlatform, type DraftResponse } from './types'

interface DraftSnapshot {
  post: Pick<PostText, 'text' | 'postUrl'>
  images: ImageAsset[] | null
}

interface DraftComposerOptions {
  progressContainer: HTMLElement
  onViewChange: (view: 'editor' | 'progress') => void
  onPlatformsChange?: (platforms: DraftPlatform[]) => void
}

const CSS = `
.draft-composer, .draft-progress { font-size: 14px; color: var(--ink, #17202a); }
.draft-composer *, .draft-progress * { box-sizing: border-box; }
.draft-composer { border-top: 1px solid var(--line, #e5e9ee); padding-top: 18px; }
.draft-composer h2 { margin: 0; font-size: 14px; font-weight: 650; }
.draft-composer p, .draft-progress p { margin: 0; line-height: 1.5; }
.draft-note { color: var(--muted, #617080); font-size: 12px; }
.draft-composer form { display: grid; gap: 14px; margin-top: 14px; }
.draft-composer fieldset { border: 0; padding: 0; margin: 0; }
.draft-composer legend { padding: 0; margin-bottom: 8px; font-size: 12px; }
.draft-platforms { display: flex; gap: 8px; }
.draft-platform { flex: 1; display: flex; align-items: center; gap: 8px; cursor: pointer; min-height: 40px; border: 1px solid var(--line, #e5e9ee); padding: 8px 12px; border-radius: 8px; }
.draft-platform:has(:checked) { border-color: var(--ink, #17202a); background: #f4f6f8; }
.draft-composer input[type=checkbox] { margin: 0; accent-color: var(--ink, #17202a); width: 15px; height: 15px; }
.draft-fields { display: grid; gap: 12px; }
.draft-field { display: flex; flex-direction: column; gap: 6px; font-size: 12px; }
.draft-field-label { display: flex; justify-content: space-between; gap: 12px; }
.draft-title-count, .draft-body-count { font-variant-numeric: tabular-nums; }
.draft-composer input[type=text], .draft-composer textarea { width: 100%; border: 1px solid var(--line, #d8dfe7); border-radius: 8px; background: #fff; color: inherit; padding: 9px 10px; font: inherit; font-size: 16px; line-height: 1.45; }
.draft-composer textarea { resize: vertical; min-height: 112px; }
.draft-composer [aria-invalid=true] { border-color: var(--danger, #b42318); }
.draft-composer button, .draft-progress button { cursor: pointer; font: inherit; border-radius: 8px; min-height: 40px; padding: 9px 14px; }
.draft-composer button:disabled, .draft-progress button:disabled { cursor: not-allowed; background: #e5e9ee; color: #798593; }
.draft-composer button:not(:disabled):active, .draft-progress button:not(:disabled):active { transform: scale(0.98); }
.draft-composer :is(input, textarea, button):focus-visible, .draft-progress button:focus-visible { outline: 2px solid var(--accent, #1d9bf0); outline-offset: 3px; }
.draft-submit { border: 0; width: 100%; background: var(--ink, #17202a); color: #fff; font-weight: 600 !important; }
.draft-actions { display: grid; gap: 8px; }
.draft-error { color: var(--danger, #b42318); font-size: 12px; }
.draft-progress { width: min(100%, 640px); margin: 0 auto; padding: 32px 24px 48px; }
.draft-progress .draft-back { border: 0; background: transparent; color: var(--muted, #617080); padding-left: 0; }
.draft-progress .draft-back:hover { color: var(--ink, #17202a); }
.draft-progress-heading { margin: 32px 0 10px; font-size: 26px; line-height: 1.3; font-weight: 650; letter-spacing: -0.02em; }
.draft-progress-heading:focus { outline: none; }
.draft-progress-description { color: var(--muted, #617080); font-size: 14px; max-width: 48ch; }
.draft-progress .draft-submit-error { margin-top: 20px; padding: 14px; border: 1px solid #efc9c4; border-radius: 10px; background: #fff9f8; font-size: 14px; }
.draft-job-list { list-style: none; margin: 28px 0 24px; padding: 0; display: grid; gap: 12px; }
.draft-job { border: 1px solid var(--line, #e5e9ee); border-radius: 12px; padding: 20px; display: grid; gap: 10px; }
.draft-job-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; font-size: 15px; font-weight: 600; }
.draft-job-state { font-size: 12px; font-weight: 500; color: var(--muted, #617080); }
.draft-job[data-status=running] .draft-job-state::before { content: ''; display: inline-block; width: 7px; height: 7px; margin-right: 6px; border-radius: 50%; background: currentColor; animation: draft-pulse 1.5s ease-in-out infinite; }
.draft-job-title { overflow-wrap: anywhere; font-size: 14px; }
.draft-job button { justify-self: start; margin-top: 4px; background: #fff; color: inherit; border: 1px solid var(--line, #d8dfe7); font-size: 13px; }
.draft-job-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.draft-control-feedback { font-size: 12px; color: var(--muted, #617080); }
.draft-control-feedback[role=alert] { color: var(--danger, #b42318); }
.draft-job[data-status=needs_attention] { border-color: #ddc393; }
.draft-job[data-status=needs_attention] .draft-job-state { color: #956019; }
.draft-job[data-status=saved] .draft-job-state { color: #17745d; }
.draft-empty { margin: 28px 0 24px !important; color: var(--muted, #617080); }
.draft-progress-footnote { border-top: 1px solid var(--line, #e5e9ee); padding-top: 18px; }
.draft-composer [hidden], .draft-progress [hidden] { display: none; }
@keyframes draft-pulse { 50% { opacity: 0.3; } }
@media (prefers-reduced-motion: reduce) { .draft-job[data-status=running] .draft-job-state::before { animation: none; } }
@media (max-width: 480px) { .draft-progress { padding: 20px 16px 32px; } .draft-progress-heading { font-size: 23px; margin-top: 24px; } .draft-job { padding: 16px; } }
`

const STATUS_LABELS: Record<DraftJob['status'], string> = {
  queued: '等待处理', running: '处理中', needs_attention: '需要接手', saved: '草稿已核对',
}
const STEP_LABELS: Record<DraftJob['step'], string> = {
  opening: '正在打开创作者中心', uploading: '正在上传贴图', filling: '正在填写文案', saving: '正在保存草稿', verifying: '正在重新打开核对',
}

function hasOldDouyinDraft(job: DraftJob): boolean {
  return job.platform === 'douyin' && job.status === 'needs_attention' && job.blocker === 'existing_draft'
}

function controlLabel(job: DraftJob, action: 'stop' | 'resume'): string {
  if (action === 'stop') return '停止自动操作'
  return hasOldDouyinDraft(job) ? '重新同步到抖音' : '检查并继续'
}

let composerSequence = 0

export function createDraftComposer(container: HTMLElement, options: DraftComposerOptions) {
  const id = `draft-composer-${++composerSequence}`
  const progressContainer = options.progressContainer
  container.innerHTML = `<style>${CSS}</style>
    <section class="draft-composer" aria-label="同步草稿">
      <h2>同步草稿</h2>
      <form>
        <fieldset class="draft-platform-group">
          <legend>选择平台</legend>
          <div class="draft-platforms">
            <label class="draft-platform"><input type="checkbox" name="platform" value="xiaohongshu" checked />小红书</label>
            <label class="draft-platform"><input type="checkbox" name="platform" value="douyin" />抖音</label>
          </div>
          <p class="draft-error draft-platform-error" hidden></p>
        </fieldset>
        <div class="draft-fields">
          <label class="draft-field"><span class="draft-field-label">标题<span class="draft-note draft-title-count" id="${id}-title-count">0 / 20 字</span></span><input name="title" type="text" required autocomplete="off" spellcheck="false" aria-describedby="${id}-title-count ${id}-title-error" /><span class="draft-error draft-title-error" id="${id}-title-error" hidden></span></label>
          <label class="draft-field"><span class="draft-field-label">正文<span class="draft-note draft-body-count" id="${id}-body-count">0 / 1000 字</span></span><textarea name="body" rows="4" autocomplete="off" spellcheck="false" aria-describedby="${id}-body-count ${id}-body-error"></textarea><span class="draft-error draft-body-error" id="${id}-body-error" hidden></span></label>
        </div>
        <div class="draft-actions">
          <button class="draft-submit" type="submit" title="同步到草稿（⌘ / Ctrl + Enter）" disabled>同步到草稿</button>
          <p class="draft-note">只保存草稿，发布由你完成。</p>
          <p class="draft-note draft-message" role="status">等待贴图就绪</p>
        </div>
      </form>
    </section>`
  progressContainer.innerHTML = `<style>${CSS}</style>
    <section class="draft-progress" aria-label="同步状态">
      <button class="draft-back" type="button">← 返回预览</button>
      <h2 class="draft-progress-heading" tabindex="-1">同步记录</h2>
      <p class="draft-progress-description" role="status">查看草稿的保存状态。</p>
      <p class="draft-error draft-submit-error" role="alert" hidden></p>
      <p class="draft-empty">正在读取同步记录…</p>
      <ul class="draft-job-list" aria-label="草稿任务" aria-live="polite"></ul>
      <p class="draft-error draft-list-error" role="alert" hidden></p>
      <p class="draft-note draft-progress-footnote">返回预览或关闭窗口后，同步会继续。小红书草稿保存在此浏览器，发布需在创作者中心手动完成。</p>
    </section>`
  progressContainer.hidden = true
  container.hidden = false

  const form = container.querySelector('form')!
  const titleInput = form.elements.namedItem('title') as HTMLInputElement
  const bodyInput = form.elements.namedItem('body') as HTMLTextAreaElement
  const platformInputs = Array.from(form.querySelectorAll<HTMLInputElement>('input[name=platform]'))
  const platformError = form.querySelector<HTMLElement>('.draft-platform-error')!
  const submitButton = form.querySelector<HTMLButtonElement>('.draft-submit')!
  const message = form.querySelector<HTMLElement>('.draft-message')!
  const titleError = form.querySelector<HTMLElement>('.draft-title-error')!
  const bodyError = form.querySelector<HTMLElement>('.draft-body-error')!
  const titleCount = form.querySelector<HTMLElement>('.draft-title-count')!
  const bodyCount = form.querySelector<HTMLElement>('.draft-body-count')!
  const submitError = progressContainer.querySelector<HTMLElement>('.draft-submit-error')!
  const heading = progressContainer.querySelector<HTMLElement>('.draft-progress-heading')!
  const description = progressContainer.querySelector<HTMLElement>('.draft-progress-description')!
  const listError = progressContainer.querySelector<HTMLElement>('.draft-list-error')!
  const empty = progressContainer.querySelector<HTMLElement>('.draft-empty')!
  const list = progressContainer.querySelector<HTMLUListElement>('.draft-job-list')!
  let snapshot: DraftSnapshot | null = null
  let submitting = false
  let submitted = false
  let destroyed = false
  let listRequest = 0
  let revision = 0
  let validated = false
  let creationError = ''
  let currentJobIds: string[] | null = null
  const jobsById = new Map<string, DraftJob>()
  const controls = new Map<string, { label: string; pending: boolean; error: string }>()

  function setError(element: HTMLElement, error: string): void {
    element.textContent = error
    element.hidden = !error
  }

  function setView(view: 'editor' | 'progress'): void {
    container.hidden = view !== 'editor'
    progressContainer.hidden = view !== 'progress'
    options.onViewChange(view)
    if (view === 'progress') heading.focus()
    else if (!submitButton.disabled) submitButton.focus()
    else titleInput.focus()
  }

  function syncSubmit(): void {
    submitButton.disabled = !snapshot?.images?.length || submitting || submitted
    submitButton.textContent = submitting ? '创建中…' : submitted ? '已加入同步' : '同步到草稿'
    form.setAttribute('aria-busy', String(submitting))
    message.hidden = Boolean(snapshot?.images?.length)
  }

  function validateText(): boolean {
    const titleLength = Array.from(titleInput.value).length
    const bodyLength = Array.from(bodyInput.value).length
    const titleMessage = !titleInput.value.trim() ? '请填写标题' : titleLength > 20 ? '本版本标题最多 20 字，请修改后再保存。' : ''
    const bodyMessage = bodyLength > 1000 ? '本版本正文最多 1000 字，请修改后再保存。' : ''
    setError(titleError, titleMessage)
    setError(bodyError, bodyMessage)
    for (const [input, error] of [[titleInput, titleMessage], [bodyInput, bodyMessage]] as const) {
      if (error) input.setAttribute('aria-invalid', 'true')
      else input.removeAttribute('aria-invalid')
    }
    return !titleMessage && !bodyMessage
  }

  function updateCounts(): void {
    titleCount.textContent = `${Array.from(titleInput.value).length} / 20 字`
    bodyCount.textContent = `${Array.from(bodyInput.value).length} / 1000 字`
  }

  function changed(): void {
    revision++
    submitted = false
    updateCounts()
    if (validated) validateText()
    if (platformInputs.some((input) => input.checked)) setError(platformError, '')
    syncSubmit()
  }

  function mergeJobs(jobs: DraftJob[]): void {
    for (const job of jobs) {
      const existing = jobsById.get(job.id)
      if (!existing || job.updatedAt >= existing.updatedAt) jobsById.set(job.id, job)
    }
    renderJobs()
  }

  function controlAction(job: DraftJob): 'stop' | 'resume' | null {
    if (job.tabId === undefined || job.status === 'saved') return null
    return job.status === 'needs_attention' ? 'resume' : 'stop'
  }

  async function requestControl(id: string, action: 'stop' | 'resume'): Promise<void> {
    const job = jobsById.get(id)
    if (destroyed || controls.get(id)?.pending || !job || controlAction(job) !== action) return
    const state = { label: controlLabel(job, action), pending: true, error: '' }
    controls.set(id, state)
    renderJobs()
    try {
      const response = await send({ type: 'DRAFT_CONTROL', id, action })
      if (destroyed) return
      if (!response.ok) throw new Error(response.error)
      controls.delete(id)
      if ('jobs' in response) mergeJobs(response.jobs)
      void refreshJobs()
    } catch (error) {
      state.error = error instanceof Error ? error.message : '无法控制草稿任务，请重试。'
    } finally {
      state.pending = false
      if (!destroyed) renderJobs()
    }
  }

  function renderJobs(): void {
    const jobs = currentJobIds === null
      ? [...jobsById.values()].sort((a, b) => b.createdAt - a.createdAt)
      : currentJobIds.map((jobId) => jobsById.get(jobId)).filter((job): job is DraftJob => Boolean(job))
    const error = creationError
    setError(submitError, error)
    if (submitting) {
      heading.textContent = '正在创建草稿任务…'
      description.textContent = '贴图与文案已准备好，正在连接创作者中心。'
    } else if (error) {
      heading.textContent = '同步未开始'
      description.textContent = '返回预览后可以重新尝试，贴图与文案会保留。'
    } else if (!jobs.length) {
      heading.textContent = '同步记录'
      description.textContent = '同步后，可在这里查看每个平台的保存状态。'
    } else if (jobs.every((job) => job.status === 'saved')) {
      heading.textContent = '草稿已核对'
      description.textContent = '图片与文案已重新打开核对。你可以前往创作者中心检查并手动发布。'
    } else if (jobs.some(hasOldDouyinDraft)) {
      heading.textContent = '抖音有旧草稿未发布'
      description.textContent = '本次贴图和文案已保留。处理旧草稿后，在这里重新同步到抖音。'
    } else if (jobs.some((job) => job.status === 'needs_attention')) {
      heading.textContent = '需要你接手'
      description.textContent = '有平台需要人工处理，其他平台会继续同步。打开对应后台查看详情。'
    } else {
      heading.textContent = '正在同步到草稿'
      description.textContent = '正在上传贴图、填写文案并保存草稿，完成后会重新打开核对。'
    }
    empty.hidden = jobs.length > 0 || submitting || Boolean(error)
    empty.textContent = '还没有同步记录。返回预览，选择平台后同步。'
    list.replaceChildren()
    for (const job of jobs) {
      const item = document.createElement('li')
      item.className = 'draft-job'
      item.dataset.status = job.status
      item.dataset.jobId = job.id
      const jobHeading = document.createElement('div')
      jobHeading.className = 'draft-job-heading'
      const platform = document.createElement('span')
      platform.textContent = DRAFT_TARGETS[job.platform].label
      const state = document.createElement('span')
      state.className = 'draft-job-state'
      state.textContent = hasOldDouyinDraft(job) ? '旧草稿未发布' : job.status === 'running' ? STEP_LABELS[job.step] : STATUS_LABELS[job.status]
      jobHeading.append(platform, state)
      const title = document.createElement('p')
      title.className = 'draft-job-title'
      title.textContent = job.title
      const detail = document.createElement('p')
      detail.className = 'draft-note'
      detail.textContent = job.message
      item.append(jobHeading, title, detail)
      if (job.status === 'saved' && job.evidence?.storage === 'browser') {
        const location = document.createElement('p')
        location.className = 'draft-note'
        location.textContent = '已核对 · 此浏览器草稿箱'
        item.append(location)
      }
      const actions = document.createElement('div')
      actions.className = 'draft-job-actions'
      const open = document.createElement('button')
      open.type = 'button'
      open.textContent = hasOldDouyinDraft(job) ? '查看抖音旧草稿' : job.status === 'needs_attention' ? '打开后台接手' : '打开后台'
      open.addEventListener('click', async () => {
        if (open.disabled) return
        open.disabled = true
        try {
          const response = await send({ type: 'DRAFT_OPEN', id: job.id })
          if (!response.ok) setError(listError, response.error)
        } catch (error) {
          setError(listError, error instanceof Error ? error.message : '无法打开创作者中心')
        } finally {
          open.disabled = false
        }
      })
      actions.append(open)
      const action = controlAction(job)
      const controlState = controls.get(job.id)
      if (action) {
        const control = document.createElement('button')
        control.type = 'button'
        control.className = 'draft-control'
        control.disabled = Boolean(controlState?.pending)
        control.textContent = controlState?.pending
          ? `正在${controlState.label}…`
          : controlLabel(job, action)
        control.addEventListener('click', () => { void requestControl(job.id, action) })
        actions.append(control)
      }
      item.append(actions)
      if (controlState && job.status !== 'saved') {
        const text = controlState.pending
          ? `正在${controlState.label}…`
          : controlState.error
        if (text) {
          const feedback = document.createElement('p')
          feedback.className = 'draft-control-feedback'
          feedback.setAttribute('role', controlState.error ? 'alert' : 'status')
          feedback.textContent = text
          item.append(feedback)
        }
      }
      list.append(item)
    }
  }

  async function send(request: DraftMessage): Promise<DraftResponse> {
    return chrome.runtime.sendMessage(request)
  }

  async function refreshJobs(): Promise<void> {
    const request = ++listRequest
    try {
      const response = await send({ type: 'DRAFT_LIST' })
      if (destroyed || request !== listRequest) return
      if (!response.ok) throw new Error(response.error)
      if (!('jobs' in response)) throw new Error('无法读取同步记录')
      setError(listError, '')
      mergeJobs(response.jobs)
    } catch (error) {
      if (destroyed || request !== listRequest) return
      empty.hidden = true
      setError(listError, error instanceof Error ? error.message : '无法读取同步记录')
    }
  }

  progressContainer.querySelector('.draft-back')!.addEventListener('click', () => setView('editor'))
  form.addEventListener('input', changed)
  form.addEventListener('change', changed)
  for (const input of platformInputs) {
    input.addEventListener('change', () => {
      options.onPlatformsChange?.(platformInputs.filter((platform) => platform.checked).map((platform) => platform.value as DraftPlatform))
    })
  }
  bodyInput.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      form.requestSubmit()
    }
  })
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!snapshot?.images?.length || submitting || submitted) return
    const platforms = platformInputs.filter((input) => input.checked).map((input) => input.value as DraftPlatform)
    if (!platforms.length) {
      setError(platformError, '至少选择一个平台')
      platformInputs[0]!.focus()
      return
    }
    validated = true
    if (!validateText()) {
      if (titleInput.hasAttribute('aria-invalid')) titleInput.focus()
      else bodyInput.focus()
      return
    }
    if (!form.reportValidity()) return
    const submittedRevision = revision
    const input = {
      platforms, title: titleInput.value, body: bodyInput.value, sourceUrl: snapshot.post.postUrl,
      images: snapshot.images.map((image) => ({ ...image })),
    }
    submitting = true
    creationError = ''
    currentJobIds = []
    listRequest++
    setError(listError, '')
    syncSubmit()
    renderJobs()
    setView('progress')
    try {
      const response = await send({ type: 'DRAFT_CREATE', input })
      if (destroyed) return
      if (!response.ok) throw new Error(response.error)
      if (!('jobs' in response) || !response.jobs.length) throw new Error('没有收到草稿任务，请返回预览后重试。')
      submitted = revision === submittedRevision
      listRequest++
      if (currentJobIds !== null) currentJobIds = response.jobs.map((job) => job.id)
      mergeJobs(response.jobs)
      void refreshJobs()
    } catch (error) {
      if (destroyed) return
      creationError = error instanceof Error ? error.message : '无法创建草稿任务'
    } finally {
      submitting = false
      if (!destroyed) {
        syncSubmit()
        renderJobs()
      }
    }
  })

  const onStorageChanged = (_changes: unknown, area: string) => {
    if (area === 'local') void refreshJobs()
  }
  chrome.storage.onChanged.addListener(onStorageChanged)
  void refreshJobs()

  return {
    setPlatforms(platforms: DraftPlatform[]): void {
      if (destroyed) return
      if (platformInputs.every((input) => input.checked === platforms.includes(input.value as DraftPlatform))) return
      for (const input of platformInputs) input.checked = platforms.includes(input.value as DraftPlatform)
      changed()
    },
    setSnapshot(next: DraftSnapshot | null): void {
      if (destroyed) return
      if (next?.post.postUrl !== snapshot?.post.postUrl) {
        titleInput.value = next?.post.text.split(/\r?\n/).find((line) => line.trim()) ?? (next ? '图片分享' : '')
        bodyInput.value = next?.post.text ?? ''
      }
      const sameImages = next?.images === snapshot?.images || Boolean(next?.images && snapshot?.images &&
        next.images.length === snapshot.images.length && next.images.every((image, index) => {
          const previous = snapshot!.images![index]!
          return image.dataUrl === previous.dataUrl && image.filename === previous.filename && image.mimeType === previous.mimeType
        }))
      if (!sameImages || next?.post.postUrl !== snapshot?.post.postUrl) changed()
      snapshot = next ? { post: { ...next.post }, images: next.images?.map((image) => ({ ...image })) ?? null } : null
      titleInput.disabled = !snapshot
      bodyInput.disabled = !snapshot
      syncSubmit()
    },
    showProgress(): void {
      if (destroyed) return
      currentJobIds = null
      renderJobs()
      setView('progress')
      void refreshJobs()
    },
    destroy(): void {
      destroyed = true
      chrome.storage.onChanged.removeListener(onStorageChanged)
    },
  }
}
