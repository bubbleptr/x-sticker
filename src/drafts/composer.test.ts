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
let progress: HTMLDivElement
let onViewChange: ReturnType<typeof vi.fn>

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
  progress = document.createElement('div')
  document.body.append(container, progress)
  onViewChange = vi.fn()
  composer = createDraftComposer(container, { progressContainer: progress, onViewChange })
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
    await vi.waitFor(() => expect(progress.querySelector('.draft-submit-error')?.textContent).toContain('浏览器没有授权访问抖音创作者中心'))
    expect(button().disabled).toBe(false)
    expect(progress.textContent).not.toContain('草稿已保存')
    expect(progress.hidden).toBe(false)
    expect(container.hidden).toBe(true)
    progress.querySelector<HTMLButtonElement>('.draft-back')!.click()
    expect(container.hidden).toBe(false)
    expect(onViewChange).toHaveBeenLastCalledWith('editor')
  })

  it('restores persisted work, refreshes on storage changes and opens the job for handoff', async () => {
    sendMessage.mockImplementation(async (message) => message.type === 'DRAFT_LIST' ? { ok: true, jobs: [job] } : { ok: true })
    for (const listener of listeners) listener({}, 'local')
    await vi.waitFor(() => expect(progress.textContent).toContain(job.message))
    const open = Array.from(progress.querySelectorAll('button')).find((item) => item.textContent === '打开后台接手')!
    open.click()
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: 'DRAFT_OPEN', id: job.id }))
    sendMessage.mockImplementation(async () => ({ ok: true, jobs: [{ ...job, status: 'saved', message: '已重新打开核对', evidence: { title: job.title, body: job.body, imageCount: 1, imageHash: 'test-image-hash', storage: 'browser', verifiedAt: 3 } }] }))
    for (const listener of listeners) listener({}, 'local')
    await vi.waitFor(() => expect(progress.textContent).toContain('此浏览器草稿箱'))
    composer.destroy()
    expect(listeners.size).toBe(0)
  })

  it('keeps task progress out of the editor and shows only the current submission until history is opened', async () => {
    const historical = { ...job, id: 'old-job', title: '以前的草稿' }
    sendMessage.mockImplementation(async (message) => message.type === 'DRAFT_CREATE'
      ? { ok: true, jobs: [job] }
      : { ok: true, jobs: [historical, job] })
    for (const listener of listeners) listener({}, 'local')
    await vi.waitFor(() => expect(progress.textContent).toContain('以前的草稿'))
    expect(container.querySelector('.draft-job-list')).toBeNull()
    expect(progress.hidden).toBe(true)
    composer.setSnapshot(snapshot)
    submit()
    expect(onViewChange).toHaveBeenLastCalledWith('progress')
    expect(container.hidden).toBe(true)
    expect(progress.hidden).toBe(false)
    await vi.waitFor(() => expect(progress.textContent).toContain(job.message))
    expect(progress.textContent).not.toContain('以前的草稿')
    progress.querySelector<HTMLButtonElement>('.draft-back')!.click()
    composer.showProgress()
    expect(progress.textContent).toContain('以前的草稿')
    expect(sendMessage.mock.calls.filter(([message]) => message.type === 'DRAFT_CREATE')).toHaveLength(1)
  })

  it('preserves edits and the submitted asset when returning during creation, without replaying on navigation', async () => {
    let finish!: (response: DraftResponse) => void
    sendMessage.mockImplementation(async (message) => message.type === 'DRAFT_CREATE'
      ? new Promise((resolve) => { finish = resolve })
      : { ok: true, jobs: [] })
    composer.setSnapshot(snapshot)
    const title = container.querySelector<HTMLInputElement>('input[name=title]')!
    const body = container.querySelector<HTMLTextAreaElement>('textarea[name=body]')!
    title.value = '本次标题'
    body.value = '本次正文'
    body.dispatchEvent(new Event('input', { bubbles: true }))
    submit()
    expect(progress.textContent).toContain('正在创建草稿任务')
    progress.querySelector<HTMLButtonElement>('.draft-back')!.click()
    expect(title.value).toBe('本次标题')
    expect(body.value).toBe('本次正文')
    expect(button().disabled).toBe(true)
    composer.setSnapshot({ ...snapshot, bytes: null })
    composer.setSnapshot({ ...snapshot, bytes: new Uint8Array([1, 2, 3]) })
    finish({ ok: true, jobs: [job] })
    await vi.waitFor(() => expect(progress.textContent).toContain(job.message))
    expect(onViewChange).toHaveBeenLastCalledWith('editor')
    expect(container.hidden).toBe(false)
    composer.showProgress()
    progress.querySelector<HTMLButtonElement>('.draft-back')!.click()
    const creates = sendMessage.mock.calls.filter(([message]) => message.type === 'DRAFT_CREATE')
    expect(creates).toHaveLength(1)
    expect(creates[0]![0]).toEqual(expect.objectContaining({ input: expect.objectContaining({ title: '本次标题', body: '本次正文', bytes: Array.from(snapshot.bytes) }) }))
  })

  it('does not let an older task-list response erase a newly created job or newer saved evidence', async () => {
    let finishList!: (response: DraftResponse) => void
    sendMessage.mockImplementation(async (message) => message.type === 'DRAFT_CREATE'
      ? { ok: true, jobs: [job] }
      : new Promise((resolve) => { finishList = resolve }))
    for (const listener of listeners) listener({}, 'local')
    composer.setSnapshot(snapshot)
    submit()
    await vi.waitFor(() => expect(progress.textContent).toContain(job.message))
    finishList({ ok: true, jobs: [] })
    await Promise.resolve()
    expect(progress.textContent).toContain(job.message)
    const saved = { ...job, status: 'saved' as const, updatedAt: 10, message: '已重新打开核对', evidence: { title: job.title, body: job.body, imageCount: 1, imageHash: 'test-image-hash', storage: 'browser' as const, verifiedAt: 10 } }
    sendMessage.mockResolvedValue({ ok: true, jobs: [saved] })
    for (const listener of listeners) listener({}, 'local')
    await vi.waitFor(() => expect(progress.textContent).toContain('此浏览器草稿箱'))
    sendMessage.mockResolvedValue({ ok: true, jobs: [job] })
    for (const listener of listeners) listener({}, 'local')
    await Promise.resolve()
    expect(progress.textContent).toContain('此浏览器草稿箱')
  })

  it('keeps a failed creation visible after switching to history until a new submission starts', async () => {
    let finish!: (response: DraftResponse) => void
    const historical: DraftJob = { ...job, id: 'old-saved-job', title: '以前已保存的草稿', status: 'saved', message: '已核对完成' }
    sendMessage.mockImplementation(async (message) => message.type === 'DRAFT_CREATE'
      ? new Promise((resolve) => { finish = resolve })
      : { ok: true, jobs: [historical] })
    for (const listener of listeners) listener({}, 'local')
    await vi.waitFor(() => expect(progress.textContent).toContain(historical.title))
    composer.setSnapshot(snapshot)
    submit()
    composer.showProgress()
    finish({ ok: false, error: '创作者中心访问权限已失效' })
    const error = progress.querySelector<HTMLElement>('.draft-submit-error')!
    const heading = progress.querySelector<HTMLElement>('.draft-progress-heading')!
    await vi.waitFor(() => expect(error.hidden).toBe(false))
    expect(error.textContent).toBe('创作者中心访问权限已失效')
    expect(heading.textContent).toBe('同步未开始')
    expect(progress.textContent).toContain(historical.title)
    progress.querySelector<HTMLButtonElement>('.draft-back')!.click()
    composer.showProgress()
    expect(error.hidden).toBe(false)
    expect(heading.textContent).toBe('同步未开始')
    progress.querySelector<HTMLButtonElement>('.draft-back')!.click()
    submit()
    expect(error.hidden).toBe(true)
    expect(heading.textContent).toContain('正在创建草稿任务')
    finish({ ok: true, jobs: [job] })
    await vi.waitFor(() => expect(heading.textContent).toBe('需要你接手'))
    expect(error.hidden).toBe(true)
  })

})
