import { createDouyinAdapter } from './douyin'
import { runDraft } from './runner'
import type { DraftJob, DraftMessage, DraftResponse, DraftRunControlMessage, DraftUpdate } from './types'
import { createXiaohongshuAdapter } from './xiaohongshu'

const startedDocuments = new WeakSet<Document>()
type SendDraftMessage = (message: DraftMessage) => Promise<DraftResponse>
type DraftRuntime = { id: string; onMessage: Pick<typeof chrome.runtime.onMessage, 'addListener'> }

export async function startCreatorDrafts(
  root: Document = document,
  send: SendDraftMessage = (message) => chrome.runtime.sendMessage(message),
  runtime: DraftRuntime = chrome.runtime,
): Promise<void> {
  const platform = root.location.hostname === 'creator.xiaohongshu.com' ? 'xiaohongshu'
    : root.location.hostname === 'creator.douyin.com' ? 'douyin' : null
  if (!platform || startedDocuments.has(root)) return
  startedDocuments.add(root)
  let response: DraftResponse
  let claimed = false
  try {
    response = await send({ type: 'DRAFT_CLAIM', platform })
    claimed = response.ok && 'job' in response
    if (!claimed) response = await send({ type: 'DRAFT_INSPECT', platform })
  } catch { return }
  if (!response.ok || !('job' in response)) return
  let job: DraftJob = response.job
  let images = response.images
  let active = false
  let controller: AbortController | undefined

  async function execute() {
    if (active || job.status === 'saved') return
    active = true
    controller = new AbortController()
    const report = async (update: DraftUpdate) => {
      const result = await send({ type: 'DRAFT_UPDATE', id: job.id, update })
      if (!result.ok) throw new Error(result.error)
      job = { ...job, ...update }
    }
    try {
      const current = await send({ type: 'DRAFT_INSPECT', platform: job.platform })
      if (!current.ok) throw new Error(current.error)
      if (!('job' in current) || current.job.id !== job.id) throw new Error('没有找到原草稿任务，请手动检查')
      job = current.job
      images = current.images
      if (job.status !== 'running') return
      controller.signal.throwIfAborted()
      const adapter = platform === 'xiaohongshu' ? createXiaohongshuAdapter(root) : createDouyinAdapter(root)
      await runDraft(job, images, adapter, report, { document: root, signal: controller.signal })
    } catch (error) {
      const update: DraftUpdate = { status: 'needs_attention', step: job.step, message: error instanceof Error ? error.message : '连接中断，请重新加载扩展后检查草稿' }
      job = { ...job, ...update }
      try { await report(update) } catch { /* The background may have been unloaded with the extension. */ }
    } finally {
      active = false
    }
  }

  runtime.onMessage.addListener((message: DraftRunControlMessage, sender, respond) => {
    if (message?.type !== 'DRAFT_RUN_CONTROL') return
    const origin = `chrome-extension://${runtime.id}`
    if (sender.id !== runtime.id || sender.tab || (sender.url && !sender.url.startsWith(`${origin}/`)) ||
        (sender.origin && sender.origin !== origin) || message.id !== job.id || !['stop', 'resume'].includes(message.action)) {
      respond({ ok: false, error: '草稿控制命令不属于当前任务' } satisfies DraftResponse)
      return
    }
    if (job.status === 'saved') {
      respond({ ok: false, error: '草稿已经保存，无需继续自动操作' } satisfies DraftResponse)
      return
    }
    if (message.action === 'stop') {
      controller?.abort(new Error('你已停止自动操作，贴图和当前内容已保留'))
      respond({ ok: true } satisfies DraftResponse)
      return
    }
    if (active) {
      respond({ ok: false, error: '页面仍在处理上一步操作，请稍后继续' } satisfies DraftResponse)
      return
    }
    // Acknowledge before inspect/report sends any messages back to the service.
    respond({ ok: true } satisfies DraftResponse)
    void execute()
  })
  if (claimed) await execute()
}

if (typeof chrome !== 'undefined' && chrome.runtime?.id && window.top === window) {
  void startCreatorDrafts()
}
