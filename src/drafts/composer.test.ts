/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDraftComposer } from './composer'
import type { DraftJob, DraftMessage, DraftResponse } from './types'

const post = {
  text: '完整的第一行\n第二行保留为正文。',
  postUrl: 'https://x.com/example/status/123',
}
const snapshot = { post, bytes: new Uint8Array([137, 80, 78, 71]), filename: 'sticker.png' }
const job: DraftJob = {
  id: 'job-1', assetId: 'asset-1', platform: 'xiaohongshu', title: '待处理草稿', body: post.text,
  sourceUrl: post.postUrl, filename: 'sticker.png', createdAt: 1, updatedAt: 2,
  status: 'needs_attention', step: 'saving', message: '没有找到存草稿按钮，请在后台接手。', tabId: 42,
}
let listeners: Set<(changes: Record<string, unknown>, area: string) => void>
let sendMessage: ReturnType<typeof vi.fn<(message: DraftMessage) => Promise<DraftResponse>>>
let composer: ReturnType<typeof createDraftComposer>
let container: HTMLDivElement

function submit(): void {
  container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
}
function button(): HTMLButtonElement {
  return container.querySelector('button[type="submit"]')!
}

beforeEach(() => {
  document.body.replaceChildren()
  listeners = new Set()
  sendMessage = vi.fn(async () => ({ ok: true, jobs: [] }))
  vi.stubGlobal('chrome', {
    runtime: { sendMessage },
    storage: { onChanged: { addListener: (listener: typeof listeners extends Set<infer T> ? T : never) => listeners.add(listener), removeListener: (listener: typeof listeners extends Set<infer T> ? T : never) => listeners.delete(listener) } },
  })
  container = document.createElement('div')
  document.body.append(container)
  composer = createDraftComposer(container)
})

afterEach(() => {
  composer.destroy()
  vi.unstubAllGlobals()
})

describe('draft composer', () => {
  it('submits edited text to both selected platforms once while creation is pending', async () => {
    let finish!: (response: DraftResponse) => void
    sendMessage.mockImplementation(async (message) => {
      if (message.type === 'DRAFT_CREATE') return new Promise((resolve) => { finish = resolve })
      return { ok: true, jobs: [] }
    })
    composer.setSnapshot(snapshot)
    const title = container.querySelector<HTMLInputElement>('input[name="title"]')!
    const body = container.querySelector<HTMLTextAreaElement>('textarea[name="body"]')!
    expect(title.value).toBe(post.text.split('\n')[0])
    expect(body.value).toBe(post.text)
    title.value = '编辑后的标题'
    body.value = '保留人修改的完整正文'
    const douyin = container.querySelector<HTMLInputElement>('input[value="douyin"]')!
    douyin.checked = true
    douyin.dispatchEvent(new Event('change', { bubbles: true }))
    submit()
    submit()
    expect(button().disabled).toBe(true)
    const creates = sendMessage.mock.calls.filter(([message]) => message.type === 'DRAFT_CREATE')
    expect(creates).toHaveLength(1)
    expect(creates[0]![0]).toEqual({ type: 'DRAFT_CREATE', input: {
      platforms: ['xiaohongshu', 'douyin'], title: title.value, body: body.value,
      sourceUrl: post.postUrl, filename: snapshot.filename, bytes: Array.from(snapshot.bytes),
    } })
    finish({ ok: true, jobs: [job] })
    await vi.waitFor(() => expect(button().textContent).not.toContain('创建中'))
    submit()
    expect(sendMessage.mock.calls.filter(([message]) => message.type === 'DRAFT_CREATE')).toHaveLength(1)
  })

  it('cannot submit an old image while the replacement renders, and preserves edited text', () => {
    composer.setSnapshot(snapshot)
    const body = container.querySelector<HTMLTextAreaElement>('textarea[name="body"]')!
    body.value = '我的文案'
    body.dispatchEvent(new Event('input', { bubbles: true }))
    composer.setSnapshot({ ...snapshot, bytes: null })
    expect(button().disabled).toBe(true)
    submit()
    expect(sendMessage.mock.calls.some(([message]) => message.type === 'DRAFT_CREATE')).toBe(false)
    composer.setSnapshot({ ...snapshot, bytes: new Uint8Array([4, 5, 6]) })
    expect(body.value).toBe('我的文案')
    expect(button().disabled).toBe(false)
    submit()
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ bytes: [4, 5, 6], body: '我的文案' }) }))
  })

  it('keeps an overlong title and body intact and requires an edit before sending', () => {
    const text = '长'.repeat(21) + '\n' + '文'.repeat(1001)
    composer.setSnapshot({ ...snapshot, post: { ...post, text } })
    const title = container.querySelector<HTMLInputElement>('input[name=title]')!
    const body = container.querySelector<HTMLTextAreaElement>('textarea[name=body]')!
    expect(title.value).toBe('长'.repeat(21))
    expect(body.value).toBe(text)
    submit()
    expect(title.getAttribute('aria-invalid')).toBe('true')
    expect(body.getAttribute('aria-invalid')).toBe('true')
    expect(sendMessage.mock.calls.some(([message]) => message.type === 'DRAFT_CREATE')).toBe(false)
    title.value = '修改标题'
    body.value = '修改后的正文'
    title.dispatchEvent(new Event('input', { bubbles: true }))
    body.dispatchEvent(new Event('input', { bubbles: true }))
    expect(title.hasAttribute('aria-invalid')).toBe(false)
    expect(body.hasAttribute('aria-invalid')).toBe(false)
    submit()
    expect(sendMessage.mock.calls.some(([message]) => message.type === 'DRAFT_CREATE')).toBe(true)
  })

  it('counts surrounding spaces in the title limit without silently trimming the submitted text', () => {
    composer.setSnapshot(snapshot)
    const title = container.querySelector<HTMLInputElement>('input[name=title]')!
    title.value = ` ${'题'.repeat(19)} `
    title.dispatchEvent(new Event('input', { bubbles: true }))
    submit()
    expect(sendMessage.mock.calls.some(([message]) => message.type === 'DRAFT_CREATE')).toBe(false)
    expect(title.getAttribute('aria-invalid')).toBe('true')
    expect(container.querySelector('.draft-title-count')?.textContent).toBe('21 / 20 字')
    expect(title.value).toBe(` ${'题'.repeat(19)} `)

    title.value = ` ${'题'.repeat(18)} `
    title.dispatchEvent(new Event('input', { bubbles: true }))
    submit()
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ title: ` ${'题'.repeat(18)} ` }) }))
  })

  it('shows background errors and permits retry without claiming a saved draft', async () => {
    sendMessage.mockImplementation(async (message) => message.type === 'DRAFT_CREATE'
      ? { ok: false, error: '浏览器没有授权访问抖音创作者中心' }
      : { ok: true, jobs: [] })
    composer.setSnapshot(snapshot)
    submit()
    await vi.waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toContain('浏览器没有授权访问抖音创作者中心'))
    expect(button().disabled).toBe(false)
    expect(container.textContent).not.toContain('草稿已保存')
  })

  it('restores persisted work, refreshes on storage changes and opens the job for handoff', async () => {
    sendMessage.mockImplementation(async (message) => message.type === 'DRAFT_LIST' ? { ok: true, jobs: [job] } : { ok: true })
    for (const listener of listeners) listener({}, 'local')
    await vi.waitFor(() => expect(container.textContent).toContain(job.message))
    const open = Array.from(container.querySelectorAll('button')).find((item) => item.textContent === '打开后台接手')!
    open.click()
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: 'DRAFT_OPEN', id: job.id }))
    sendMessage.mockImplementation(async () => ({ ok: true, jobs: [{ ...job, status: 'saved', message: '已重新打开核对', evidence: { title: job.title, body: job.body, imageCount: 1, storage: 'browser', verifiedAt: 3 } }] }))
    for (const listener of listeners) listener({}, 'local')
    await vi.waitFor(() => expect(container.textContent).toContain('此浏览器草稿箱'))
    composer.destroy()
    expect(listeners.size).toBe(0)
  })
})
