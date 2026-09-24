// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DraftJob, DraftMessage, DraftResponse } from './types'

vi.mock('./runner', () => ({ runDraft: vi.fn(async () => ({ status: 'needs_attention', step: 'uploading', message: '请核对' })) }))
vi.mock('./xiaohongshu', () => ({ createXiaohongshuAdapter: vi.fn(() => ({})) }))
vi.mock('./douyin', () => ({ createDouyinAdapter: vi.fn(() => ({})) }))
import { runDraft } from './runner'
import { startCreatorDrafts } from './creator'

const job: DraftJob = {
  id: 'job-1', assetId: 'asset-1', platform: 'xiaohongshu', title: '标题', body: '正文',
  sourceUrl: 'https://x.com/user/status/1', filename: 'sticker.png', status: 'needs_attention',
  step: 'uploading', message: '页面重新加载，请核对后继续', createdAt: 1, updatedAt: 1,
}

afterEach(() => { document.body.innerHTML = ''; vi.clearAllMocks() })

describe('creator entry', () => {
  it('does nothing on an ordinary creator tab without a bound draft task', async () => {
    window.location.href = 'https://creator.xiaohongshu.com/publish/publish'
    const send = vi.fn(async (): Promise<DraftResponse> => ({ ok: false, error: '无任务' }))
    await startCreatorDrafts(document, send)
    expect(runDraft).not.toHaveBeenCalled()
    expect(document.querySelector('#x-sticker-draft-panel')).toBeNull()
  })

  it('only resumes an inspected interrupted task after the user clicks continue', async () => {
    window.location.href = 'https://creator.xiaohongshu.com/publish/publish'
    const send = vi.fn(async (message: DraftMessage): Promise<DraftResponse> => message.type === 'DRAFT_CLAIM'
      ? { ok: false, error: '任务已经领取' } : { ok: true, job, bytes: [1, 2, 3] })
    await startCreatorDrafts(document, send)
    expect(runDraft).not.toHaveBeenCalled()
    const panel = document.querySelector('#x-sticker-draft-panel')!.shadowRoot!
    const resume = Array.from(panel.querySelectorAll('button')).find((button) => button.textContent === '检查并继续')!
    resume.click()
    await vi.waitFor(() => expect(runDraft).toHaveBeenCalledOnce())
    expect(vi.mocked(runDraft).mock.calls[0][0].step).toBe('uploading')
  })
})
