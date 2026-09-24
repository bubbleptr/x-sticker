// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import type { DraftJob, DraftMessage, DraftResponse } from './types'

vi.mock('./runner', () => ({ runDraft: vi.fn(async () => ({ status: 'needs_attention', step: 'uploading', message: '请核对' })) }))
vi.mock('./xiaohongshu', () => ({ createXiaohongshuAdapter: vi.fn(() => ({})) }))
vi.mock('./douyin', () => ({ createDouyinAdapter: vi.fn(() => ({})) }))
import { runDraft } from './runner'
import { startCreatorDrafts } from './creator'

const job: DraftJob = {
  id: 'job-1', assets: [{ id: 'asset-1', filename: 'sticker.png', mimeType: 'image/png' }], platform: 'xiaohongshu', title: '标题', body: '正文',
  sourceUrl: 'https://x.com/user/status/1', status: 'needs_attention',
  step: 'uploading', message: '页面重新加载，请核对后继续', createdAt: 1, updatedAt: 1,
}
const windows: Window[] = []
function setup() {
  const browser = new Window({ url: 'https://creator.xiaohongshu.com/publish/publish' })
  windows.push(browser)
  const root = browser.document as unknown as Document
  const listeners = new Set<Parameters<typeof chrome.runtime.onMessage.addListener>[0]>()
  const runtime = { id: 'extension', onMessage: { addListener: (listener: Parameters<typeof chrome.runtime.onMessage.addListener>[0]) => listeners.add(listener) } }
  function control(action: 'stop' | 'resume', id = job.id, sender: chrome.runtime.MessageSender = { id: 'extension', url: 'chrome-extension://extension/sw.js' }) {
    let result: DraftResponse | undefined
    for (const listener of listeners) listener({ type: 'DRAFT_RUN_CONTROL', id, action }, sender, (response: DraftResponse) => { result = response })
    return result
  }
  return { root, runtime, control }
}

afterEach(() => { for (const browser of windows.splice(0)) browser.close(); vi.clearAllMocks() })

describe('creator entry', () => {
  it('does nothing on an ordinary creator tab without a bound draft task', async () => {
    const { root, runtime, control } = setup()
    const before = root.documentElement.outerHTML
    const send = vi.fn(async (): Promise<DraftResponse> => ({ ok: false, error: '无任务' }))
    await startCreatorDrafts(root, send, runtime)
    expect(runDraft).not.toHaveBeenCalled()
    expect(root.documentElement.outerHTML).toBe(before)
    expect(control('resume')).toBeUndefined()
  })

  it('keeps a paused bound task invisible and only resumes on an authenticated background command', async () => {
    const { root, runtime, control } = setup()
    const before = root.documentElement.outerHTML
    let inspections = 0
    const send = vi.fn(async (message: DraftMessage): Promise<DraftResponse> => message.type === 'DRAFT_CLAIM'
      ? { ok: false, error: '任务已经领取' } : { ok: true, job: { ...job, status: ++inspections === 1 ? 'needs_attention' : 'running' }, images: [{ filename: 'sticker.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AQID' }] })
    await startCreatorDrafts(root, send, runtime)
    expect(root.documentElement.outerHTML).toBe(before)
    expect(runDraft).not.toHaveBeenCalled()
    expect(control('resume', 'another-job')?.ok).toBe(false)
    expect(control('resume', job.id, { id: 'foreign' })?.ok).toBe(false)
    expect(control('resume', job.id, { id: 'extension', tab: { id: 1 } as chrome.tabs.Tab })?.ok).toBe(false)
    expect(runDraft).not.toHaveBeenCalled()
    expect(control('resume')).toEqual({ ok: true })
    expect(control('resume')).toMatchObject({ ok: false, error: expect.stringContaining('稍后继续') })
    await vi.waitFor(() => expect(runDraft).toHaveBeenCalledOnce())
    expect(vi.mocked(runDraft).mock.calls[0][0].step).toBe('uploading')
    expect(root.documentElement.outerHTML).toBe(before)
  })

  it('rejects resume while a manual-input pause report is still awaiting its response', async () => {
    const { root, runtime, control } = setup()
    let acknowledgePause!: (response: DraftResponse) => void
    let pauseWasPersisted!: () => void
    const persisted = new Promise<void>((resolve) => { pauseWasPersisted = resolve })
    vi.mocked(runDraft).mockImplementationOnce(async (_job, _bytes, _adapter, report) => {
      const update = { status: 'needs_attention' as const, step: 'uploading' as const, message: '检测到人工输入' }
      await report(update)
      return update
    })
    const send = vi.fn(async (message: DraftMessage): Promise<DraftResponse> => {
      if (message.type === 'DRAFT_UPDATE') {
        pauseWasPersisted()
        return new Promise((resolve) => { acknowledgePause = resolve })
      }
      return { ok: true, job: { ...job, status: 'running' }, images: [{ filename: 'sticker.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AQID' }] }
    })
    const startup = startCreatorDrafts(root, send, runtime)
    await persisted
    expect(vi.mocked(runDraft).mock.calls[0][4]?.signal?.aborted).toBe(false)
    expect(control('resume')).toMatchObject({ ok: false, error: expect.stringContaining('稍后继续') })
    acknowledgePause({ ok: true })
    await startup
    expect(runDraft).toHaveBeenCalledOnce()
    expect(control('resume')).toEqual({ ok: true })
    await vi.waitFor(() => expect(runDraft).toHaveBeenCalledTimes(2))
  })

  it('does not start when a stop lands after claim but before its response reaches the creator', async () => {
    const { root, runtime } = setup()
    let claim!: (response: DraftResponse) => void
    const send = vi.fn(async (message: DraftMessage): Promise<DraftResponse> => message.type === 'DRAFT_CLAIM'
      ? new Promise((resolve) => { claim = resolve }) : { ok: true, job: { ...job, status: 'needs_attention' }, images: [{ filename: 'sticker.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AQID' }] })
    const startup = startCreatorDrafts(root, send, runtime)
    claim({ ok: true, job: { ...job, status: 'running' }, images: [{ filename: 'sticker.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AQID' }] })
    await startup
    expect(runDraft).not.toHaveBeenCalled()
    expect(root.querySelector('#x-sticker-draft-panel')).toBeNull()
  })

  it('claims a document once even while startup is pending and acknowledges stop before reporting it', async () => {
    const { root, runtime, control } = setup()
    let claim!: (response: DraftResponse) => void
    let finished!: () => void
    const running = new Promise<void>((resolve) => { finished = resolve })
    vi.mocked(runDraft).mockImplementationOnce(async (_job, _bytes, _adapter, report, options) => {
      await new Promise<void>((resolve) => options?.signal?.addEventListener('abort', () => resolve(), { once: true }))
      await running
      const update = { status: 'needs_attention' as const, step: 'uploading' as const, message: '已停止' }
      await report(update)
      return update
    })
    const send = vi.fn(async (message: DraftMessage): Promise<DraftResponse> => message.type === 'DRAFT_CLAIM'
      ? new Promise((resolve) => { claim = resolve }) : message.type === 'DRAFT_INSPECT'
        ? { ok: true, job: { ...job, status: 'running' }, images: [{ filename: 'sticker.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AQID' }] } : { ok: true })
    const startup = startCreatorDrafts(root, send, runtime)
    await startCreatorDrafts(root, send, runtime)
    expect(send).toHaveBeenCalledOnce()
    claim({ ok: true, job: { ...job, status: 'running' }, images: [{ filename: 'sticker.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AQID' }] })
    await vi.waitFor(() => expect(runDraft).toHaveBeenCalledOnce())
    expect(control('stop')).toEqual({ ok: true })
    expect(vi.mocked(runDraft).mock.calls[0][4]?.signal?.aborted).toBe(true)
    expect(send).toHaveBeenCalledTimes(2)
    finished()
    await startup
    expect(send).toHaveBeenLastCalledWith({ type: 'DRAFT_UPDATE', id: job.id, update: { status: 'needs_attention', step: 'uploading', message: '已停止' } })
    expect(root.querySelector('#x-sticker-draft-panel')).toBeNull()
  })
})
