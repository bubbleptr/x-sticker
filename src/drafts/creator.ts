import { createDouyinAdapter } from './douyin'
import { runDraft } from './runner'
import { DRAFT_TARGETS, type DraftJob, type DraftMessage, type DraftResponse, type DraftUpdate } from './types'
import { createXiaohongshuAdapter } from './xiaohongshu'

const PANEL_ID = 'x-sticker-draft-panel'
const STATUS_LABELS = { queued: '等待处理', running: '正在存草稿', needs_attention: '已暂停，需要接手', saved: '草稿已保存' }
type SendDraftMessage = (message: DraftMessage) => Promise<DraftResponse>

export async function startCreatorDrafts(
  root: Document = document,
  send: SendDraftMessage = (message) => chrome.runtime.sendMessage(message),
): Promise<void> {
  const platform = root.location.hostname === 'creator.xiaohongshu.com' ? 'xiaohongshu'
    : root.location.hostname === 'creator.douyin.com' ? 'douyin' : null
  if (!platform || root.getElementById(PANEL_ID)) return
  let response: DraftResponse
  let claimed = false
  try {
    response = await send({ type: 'DRAFT_CLAIM', platform })
    claimed = response.ok && 'job' in response
    if (!claimed) response = await send({ type: 'DRAFT_INSPECT', platform })
  } catch { return }
  if (!response.ok || !('job' in response)) return
  let job: DraftJob = response.job
  let bytes = response.bytes
  let active = false
  let controller: AbortController | undefined
  const host = root.createElement('div')
  host.id = PANEL_ID
  const shadow = host.attachShadow({ mode: 'open' })
  shadow.innerHTML = `<style>
    :host { all: initial; position: fixed; right: 16px; top: 88px; width: min(290px, calc(100vw - 32px)); z-index: 2147483646; font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f1419; }
    * { box-sizing: border-box; }
    section { padding: 14px; border: 1px solid #cfd9de; border-radius: 12px; background: #fff; box-shadow: 0 3px 16px #0002; }
    h2 { margin: 0; font-size: 14px; }
    p { margin: 8px 0 0; overflow-wrap: anywhere; }
    .note { font-size: 12px; color: #536471; }
    button { margin-top: 12px; min-height: 36px; border: 1px solid #cfd9de; border-radius: 8px; padding: 6px 12px; background: #fff; color: #0f1419; font: inherit; cursor: pointer; }
    button:focus-visible { outline: 2px solid #1d9bf0; outline-offset: 3px; }
    button:disabled { opacity: 0.6; cursor: default; }
    [hidden] { display: none; }
  </style>
  <section aria-label="X Sticker 草稿任务">
    <h2></h2><p class="state" role="status" aria-live="polite"></p><p class="message"></p>
    <p class="note">最终发布由你手动完成。</p>
    <button type="button" class="stop">停止自动操作</button>
    <button type="button" class="resume">检查并继续</button>
  </section>`
  root.documentElement.append(host)
  const title = shadow.querySelector('h2')!
  const state = shadow.querySelector('.state')!
  const message = shadow.querySelector('.message')!
  const note = shadow.querySelector('.note')!
  const stop = shadow.querySelector<HTMLButtonElement>('.stop')!
  const resume = shadow.querySelector<HTMLButtonElement>('.resume')!
  title.textContent = `X Sticker · ${DRAFT_TARGETS[platform].label}`

  function render() {
    state.textContent = STATUS_LABELS[job.status]
    message.textContent = job.message
    stop.hidden = !active
    resume.hidden = active || job.status === 'saved'
    stop.disabled = controller?.signal.aborted ?? false
    resume.disabled = active
    note.textContent = job.status === 'saved' && job.evidence?.storage === 'browser'
      ? '草稿在当前浏览器本地。最终发布由你手动完成。'
      : '最终发布由你手动完成。'
  }

  async function execute() {
    if (active || job.status === 'saved') return
    active = true
    controller = new AbortController()
    render()
    const report = async (update: DraftUpdate) => {
      const result = await send({ type: 'DRAFT_UPDATE', id: job.id, update })
      if (!result.ok) throw new Error(result.error)
      job = { ...job, ...update }
      render()
    }
    try {
      const adapter = platform === 'xiaohongshu' ? createXiaohongshuAdapter(root) : createDouyinAdapter(root)
      await runDraft(job, bytes, adapter, report, { document: root, signal: controller.signal })
    } catch (error) {
      job = { ...job, status: 'needs_attention', message: error instanceof Error ? error.message : '连接中断，请重新加载扩展后检查草稿' }
    } finally {
      active = false
      render()
    }
  }

  stop.addEventListener('click', () => {
    controller?.abort(new Error('你已停止自动操作，贴图和当前内容已保留'))
    render()
  })
  resume.addEventListener('click', () => {
    if (active) return
    resume.disabled = true
    void (async () => {
      try {
        const current = await send({ type: 'DRAFT_INSPECT', platform })
        if (!current.ok) throw new Error(current.error)
        if (!('job' in current)) throw new Error('没有找到原草稿任务，请手动检查')
        job = current.job
        bytes = current.bytes
        await execute()
      } catch (error) {
        job = { ...job, status: 'needs_attention', message: error instanceof Error ? error.message : '读取任务失败，请手动检查' }
      } finally { render() }
    })()
  })
  render()
  if (claimed) await execute()
}

if (typeof chrome !== 'undefined' && chrome.runtime?.id && window.top === window) {
  void startCreatorDrafts()
}
