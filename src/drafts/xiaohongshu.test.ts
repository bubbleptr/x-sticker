// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createXiaohongshuAdapter } from './xiaohongshu'
import type { DraftJob } from './types'

const job: DraftJob = {
  id: 'test', assetId: 'asset', platform: 'xiaohongshu', title: '测试草稿', body: '测试正文',
  sourceUrl: 'https://x.com/example/status/1', filename: 'test.png',
  createdAt: 1, updatedAt: 1, status: 'running', step: 'verifying', message: '',
}

afterEach(() => { document.body.replaceChildren() })

describe('Xiaohongshu draft adapter', () => {
  it('does not count a hidden stale preview as the current draft image', () => {
    document.body.innerHTML = '<div hidden><img class="img preview"></div>' +
      '<div class="publish-page-content"><input placeholder="填写标题会有更多赞哦">' +
      '<div class="tiptap ProseMirror" contenteditable="true"></div></div>'
    expect(createXiaohongshuAdapter().getEditor()?.imageCount).toBe(0)
  })

  it('saves through the closed component without clicking publish', async () => {
    const host = document.createElement('xhs-publish-btn')
    host.setAttribute('is-save-draft', 'true')
    host.setAttribute('save-text', '暂存离开')
    host.setAttribute('save-disabled', 'false')
    const shadow = host.attachShadow({ mode: 'closed' })
    shadow.innerHTML = '<button>暂存离开</button><button>发布</button>'
    document.body.append(host)
    const save = vi.fn()
    const publish = vi.fn()
    shadow.querySelectorAll('button')[0]!.addEventListener('click', save)
    shadow.querySelectorAll('button')[1]!.addEventListener('click', publish)
    await createXiaohongshuAdapter(document, () => shadow).saveDraft()
    expect(save).toHaveBeenCalledOnce()
    expect(publish).not.toHaveBeenCalled()
  })

  it('does not open the wrong draft when multiple cards have the same title', async () => {
    document.body.innerHTML = '<div class="draft-list">' +
      '<div class="draft-item"><div class="draft-title-text">测试草稿</div><div class="btn">编辑</div></div>'.repeat(2) + '</div>'
    const click = vi.fn()
    document.body.addEventListener('click', click)
    await expect(createXiaohongshuAdapter().reopenDraft(job)).rejects.toThrow(/同名/)
    expect(click).not.toHaveBeenCalled()
  })
})
