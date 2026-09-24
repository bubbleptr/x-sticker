import type { PostText } from '../types'
import { DRAFT_TARGETS, type DraftJob, type DraftMessage, type DraftPlatform, type DraftResponse } from './types'

interface DraftSnapshot {
  post: Pick<PostText, 'text' | 'postUrl'>
  bytes: Uint8Array | null
  filename: string
}

const CSS = `
.draft-composer { border-top: 1px solid var(--line, #eff3f4); padding-top: 14px; font-size: 13px; color: var(--ink, #0f1419); }
.draft-composer * { box-sizing: border-box; }
.draft-composer h2, .draft-composer h3 { margin: 0; font-size: 15px; font-weight: 700; }
.draft-composer p { margin: 0; line-height: 1.5; }
.draft-composer .draft-note { color: var(--muted, #536471); font-size: 12px; }
.draft-composer form { display: grid; gap: 10px; margin-top: 10px; }
.draft-composer fieldset { border: 0; padding: 0; margin: 0; }
.draft-composer legend { padding: 0; margin-bottom: 6px; font-size: 12px; }
.draft-composer .draft-platforms { display: flex; gap: 10px; }
.draft-composer .draft-platform { display: flex; align-items: center; gap: 6px; cursor: pointer; min-height: 32px; border: 1px solid var(--line, #eff3f4); padding: 4px 10px; border-radius: 8px; }
.draft-composer .draft-platform:has(:checked) { border-color: var(--accent, #1d9bf0); }
.draft-composer input[type=checkbox] { margin: 0; accent-color: var(--accent, #1d9bf0); }
.draft-composer .draft-fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr); gap: 12px; }
.draft-composer .draft-field { display: flex; flex-direction: column; gap: 5px; font-size: 12px; }
.draft-composer input[type=text], .draft-composer textarea { width: 100%; border: 1px solid var(--line, #cfd9de); border-radius: 8px; background: #fff; color: inherit; padding: 8px 10px; font: inherit; font-size: 16px; line-height: 1.45; }
.draft-composer textarea { resize: vertical; min-height: 90px; }
.draft-composer button { cursor: pointer; font: inherit; border-radius: 8px; min-height: 36px; padding: 8px 12px; }
.draft-composer button:disabled { cursor: not-allowed; opacity: 0.5; }
.draft-composer button:not(:disabled):active { transform: scale(0.98); }
.draft-composer :is(input, textarea, button):focus-visible { outline: 2px solid var(--accent, #1d9bf0); outline-offset: 3px; }
.draft-composer .draft-submit { border: 0; background: var(--accent, #0f1419); color: #fff; font-weight: 600; }
.draft-composer .draft-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.draft-composer .draft-error { color: var(--danger, #b91c1c); font-size: 12px; }
.draft-composer .draft-jobs { margin-top: 16px; }
.draft-composer .draft-job-list { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 8px; }
.draft-composer .draft-job { border: 1px solid var(--line, #eff3f4); border-radius: 8px; padding: 10px; display: grid; gap: 5px; }
.draft-composer .draft-job-heading { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; }
.draft-composer .draft-job-title { overflow-wrap: anywhere; font-weight: 600; }
.draft-composer .draft-job button { justify-self: start; background: #fff; color: inherit; border: 1px solid var(--line, #cfd9de); font-size: 12px; }
.draft-composer .draft-job[data-status=needs_attention] { border-color: #d9a55b; }
.draft-composer .draft-job[data-status=saved] .draft-job-state { color: #0f766e; }
.draft-composer [hidden] { display: none; }
@media (max-width: 480px) { .draft-composer .draft-fields { grid-template-columns: 1fr; } }
`

const STATUS_LABELS: Record<DraftJob['status'], string> = {
  queued: '等待处理', running: '处理中', needs_attention: '需要接手', saved: '草稿已保存',
}

let composerSequence = 0

export function createDraftComposer(container: HTMLElement) {
  const id = `draft-composer-${++composerSequence}`
  container.innerHTML = `<style>${CSS}</style>
    <section class="draft-composer" aria-label="存到草稿">
      <h2>存到草稿</h2>
      <p class="draft-note">只保存草稿，最终发布由你手动完成。关闭窗口后任务继续。</p>
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
          <label class="draft-field">标题<input name="title" type="text" required autocomplete="off" spellcheck="false" aria-describedby="${id}-title-count ${id}-title-error" /><span class="draft-note draft-title-count" id="${id}-title-count">0 / 20 字</span><span class="draft-error draft-title-error" id="${id}-title-error" hidden></span></label>
          <label class="draft-field">正文<textarea name="body" rows="3" autocomplete="off" spellcheck="false" aria-describedby="${id}-body-count ${id}-body-error"></textarea><span class="draft-note draft-body-count" id="${id}-body-count">0 / 1000 字</span><span class="draft-error draft-body-error" id="${id}-body-error" hidden></span></label>
        </div>
        <p class="draft-note">小红书草稿保存在此浏览器，清理浏览器数据后会丢失。</p>
        <div class="draft-actions">
          <button class="draft-submit" type="submit" title="存到草稿（⌘ / Ctrl + Enter）" disabled>存到草稿</button>
          <p class="draft-note draft-message" role="status">等待贴图就绪</p>
        </div>
        <p class="draft-error draft-submit-error" role="alert" hidden></p>
      </form>
      <section class="draft-jobs" aria-label="草稿任务">
        <h3>草稿任务</h3>
        <p class="draft-note draft-empty">正在读取任务…</p>
        <ul class="draft-job-list" aria-live="polite"></ul>
        <p class="draft-error draft-list-error" role="alert" hidden></p>
      </section>
    </section>`

  const form = container.querySelector('form')!
  const titleInput = form.elements.namedItem('title') as HTMLInputElement
  const bodyInput = form.elements.namedItem('body') as HTMLTextAreaElement
  const platformInputs = Array.from(form.querySelectorAll<HTMLInputElement>('input[name=platform]'))
  const platformError = form.querySelector<HTMLElement>('.draft-platform-error')!
  const submitButton = form.querySelector<HTMLButtonElement>('.draft-submit')!
  const message = form.querySelector<HTMLElement>('.draft-message')!
  const submitError = form.querySelector<HTMLElement>('.draft-submit-error')!
  const titleError = form.querySelector<HTMLElement>('.draft-title-error')!
  const bodyError = form.querySelector<HTMLElement>('.draft-body-error')!
  const titleCount = form.querySelector<HTMLElement>('.draft-title-count')!
  const bodyCount = form.querySelector<HTMLElement>('.draft-body-count')!
  const listError = container.querySelector<HTMLElement>('.draft-list-error')!
  const empty = container.querySelector<HTMLElement>('.draft-empty')!
  const list = container.querySelector<HTMLUListElement>('.draft-job-list')!
  let snapshot: DraftSnapshot | null = null
  let submitting = false
  let submitted = false
  let destroyed = false
  let listRequest = 0
  let revision = 0
  let validated = false

  function setError(element: HTMLElement, error: string): void {
    element.textContent = error
    element.hidden = !error
  }

  function syncSubmit(): void {
    submitButton.disabled = !snapshot?.bytes?.length || submitting || submitted
    submitButton.textContent = submitting ? '创建中…' : submitted ? '已加入草稿任务' : '存到草稿'
    form.setAttribute('aria-busy', String(submitting))
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
    setError(submitError, '')
    updateCounts()
    if (validated) validateText()
    if (platformInputs.some((input) => input.checked)) setError(platformError, '')
    syncSubmit()
  }

  function renderJobs(jobs: DraftJob[]): void {
    list.replaceChildren()
    empty.hidden = jobs.length > 0
    empty.textContent = '暂无草稿任务'
    for (const job of jobs) {
      const item = document.createElement('li')
      item.className = 'draft-job'
      item.dataset.status = job.status
      const heading = document.createElement('div')
      heading.className = 'draft-job-heading'
      const platform = document.createElement('span')
      platform.textContent = DRAFT_TARGETS[job.platform].label
      const state = document.createElement('span')
      state.className = 'draft-job-state'
      state.textContent = STATUS_LABELS[job.status]
      heading.append(platform, state)
      const title = document.createElement('p')
      title.className = 'draft-job-title'
      title.textContent = job.title
      const detail = document.createElement('p')
      detail.className = 'draft-note'
      detail.textContent = job.message
      item.append(heading, title, detail)
      if (job.status === 'saved' && job.evidence?.storage === 'browser') {
        const location = document.createElement('p')
        location.className = 'draft-note'
        location.textContent = '已核对 · 此浏览器草稿箱'
        item.append(location)
      }
      const open = document.createElement('button')
      open.type = 'button'
      open.textContent = job.status === 'needs_attention' ? '打开后台接手' : '打开后台'
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
      item.append(open)
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
      if (!('jobs' in response)) throw new Error('无法读取草稿任务')
      setError(listError, '')
      renderJobs(response.jobs)
    } catch (error) {
      if (destroyed || request !== listRequest) return
      empty.hidden = true
      setError(listError, error instanceof Error ? error.message : '无法读取草稿任务')
    }
  }

  form.addEventListener('input', changed)
  form.addEventListener('change', changed)
  bodyInput.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      form.requestSubmit()
    }
  })
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!snapshot?.bytes?.length || submitting || submitted) return
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
    submitting = true
    setError(submitError, '')
    message.textContent = '正在创建草稿任务…'
    syncSubmit()
    try {
      const response = await send({ type: 'DRAFT_CREATE', input: {
        platforms, title: titleInput.value, body: bodyInput.value, sourceUrl: snapshot.post.postUrl,
        filename: snapshot.filename, bytes: Array.from(snapshot.bytes),
      } })
      if (destroyed) return
      if (!response.ok) throw new Error(response.error)
      submitted = revision === submittedRevision
      message.textContent = '任务已创建，可在下方查看保存结果。'
      await refreshJobs()
    } catch (error) {
      if (destroyed) return
      message.textContent = '任务创建失败'
      setError(submitError, error instanceof Error ? error.message : '无法创建草稿任务')
    } finally {
      submitting = false
      syncSubmit()
    }
  })

  const onStorageChanged = (_changes: unknown, area: string) => {
    if (area === 'local') void refreshJobs()
  }
  chrome.storage.onChanged.addListener(onStorageChanged)
  void refreshJobs()

  return {
    setSnapshot(next: DraftSnapshot | null): void {
      if (destroyed) return
      if (next?.post.postUrl !== snapshot?.post.postUrl) {
        titleInput.value = next?.post.text.split(/\r?\n/).find((line) => line.trim()) ?? ''
        bodyInput.value = next?.post.text ?? ''
      }
      if (next?.bytes !== snapshot?.bytes || next?.post.postUrl !== snapshot?.post.postUrl) changed()
      snapshot = next
      titleInput.disabled = !snapshot
      bodyInput.disabled = !snapshot
      if (!submitting) message.textContent = snapshot?.bytes ? '贴图已就绪' : '等待贴图就绪'
      syncSubmit()
    },
    destroy(): void {
      destroyed = true
      chrome.storage.onChanged.removeListener(onStorageChanged)
    },
  }
}
