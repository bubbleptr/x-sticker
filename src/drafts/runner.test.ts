// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PlatformAdapter } from './platform'
import type { DraftJob, DraftUpdate } from './types'
vi.mock('./image', () => ({ fingerprintImage: vi.fn(async () => 'a'.repeat(64)) }))
import { fingerprintImage } from './image'
import { runDraft } from './runner'

const job: DraftJob = {
  id: 'job-1', assetId: 'asset-1', platform: 'xiaohongshu', title: '今日贴图',
  body: '第一段\n第二段', sourceUrl: 'https://x.com/user/status/1', filename: 'sticker.png',
  status: 'running', step: 'filling', imageHash: 'a'.repeat(64), message: '', createdAt: 1, updatedAt: 1,
}

function setup(overrides: Partial<PlatformAdapter> = {}) {
  document.body.innerHTML = '<input placeholder="标题"><div contenteditable="true"></div>'
  const title = document.querySelector('input')!
  const body = document.querySelector<HTMLElement>('[contenteditable]')!
  const exec = vi.fn((_command: string, _ui: boolean, value: string) => {
    const target = document.activeElement === title ? title : body
    if (target === title) title.value = value
    else body.textContent = value
    target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }))
    return true
  })
  Object.defineProperty(document, 'execCommand', { configurable: true, value: exec })
  const image = document.createElement('img')
  Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 2 }, naturalHeight: { value: 2 } })
  document.body.append(image)
  const adapter: PlatformAdapter = {
    storage: 'browser', getAccount: () => '账号一', getUploadInput: () => null,
    getEditor: () => ({ title, body, image, imageCount: 1 }), hasExistingDraft: () => false,
    dismissGuide: vi.fn(), saveDraft: vi.fn(async () => {}), reopenDraft: vi.fn(async () => {}),
    ...overrides,
  }
  const updates: DraftUpdate[] = []
  const report = vi.fn(async (update: DraftUpdate) => { updates.push(update) })
  return { title, body, adapter, report, updates, exec }
}

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); vi.mocked(fingerprintImage).mockResolvedValue('a'.repeat(64)) })

describe('draft runner', () => {
  it.each(['before_upload', 'while_recording_upload'] as const)('preserves an existing Douyin draft at %s and retries the same task once after it is handled', async (arrival) => {
    const context = setup()
    const input = document.createElement('input')
    input.type = 'file'
    document.body.append(input)
    let existing = arrival === 'before_upload'
    let revealAfterCheckpoint = arrival === 'while_recording_upload'
    let uploaded = false
    const editor = context.adapter.getEditor()
    context.adapter.getUploadInput = () => input
    context.adapter.getEditor = () => uploaded ? editor : null
    context.adapter.hasExistingDraft = () => existing
    const upload = vi.fn(() => { uploaded = true })
    input.addEventListener('change', upload)
    const report = async (update: DraftUpdate) => {
      await context.report(update)
      if (update.status === 'running' && update.step === 'uploading' && revealAfterCheckpoint) {
        existing = true
        revealAfterCheckpoint = false
      }
    }
    const original: DraftJob = { ...job, platform: 'douyin', step: 'opening', imageHash: undefined }
    const blocked = await runDraft(original, [1, 2, 3], context.adapter, report, { timeout: 20 })
    expect(blocked).toMatchObject({ status: 'needs_attention', step: 'opening', blocker: 'existing_draft' })
    expect(blocked.message).toContain('抖音')
    expect(blocked.message).toContain('尚未上传')
    expect(input.files?.length).toBe(0)
    expect(upload).not.toHaveBeenCalled()
    expect(context.adapter.saveDraft).not.toHaveBeenCalled()
    const paused = { ...original, ...blocked }
    const stillBlocked = await runDraft(paused, [1, 2, 3], context.adapter, report, { timeout: 20 })
    expect(stillBlocked).toMatchObject({ status: 'needs_attention', step: 'opening', blocker: 'existing_draft' })
    expect(upload).not.toHaveBeenCalled()
    existing = false
    const retried = await runDraft({ ...paused, ...stillBlocked }, [1, 2, 3], context.adapter, report, { timeout: 20 })
    expect(retried.status).toBe('saved')
    expect(retried.blocker).toBeUndefined()
    expect(upload).toHaveBeenCalledOnce()
    expect(context.adapter.saveDraft).toHaveBeenCalledOnce()
  })

  it('does not mark an interrupted upload as retryable when an old Douyin draft appears after dispatch', async () => {
    const context = setup({ getEditor: () => null, hasExistingDraft: () => true })
    const input = document.createElement('input')
    input.type = 'file'
    document.body.append(input)
    context.adapter.getUploadInput = () => input
    const upload = vi.fn()
    input.addEventListener('change', upload)
    const result = await runDraft({ ...job, platform: 'douyin', step: 'uploading', imageHash: undefined }, [1], context.adapter, context.report, { timeout: 5 })
    expect(result).toMatchObject({ status: 'needs_attention', step: 'uploading' })
    expect(result.blocker).toBeUndefined()
    expect(upload).not.toHaveBeenCalled()
  })

  it('fills one image, saves, reopens and only then reports verified evidence', async () => {
    const context = setup()
    const result = await runDraft(job, [1, 2, 3], context.adapter, context.report, { timeout: 20, now: () => 100 })
    expect(context.title.value).toBe(job.title)
    expect(context.body.textContent).toBe(job.body)
    expect(context.exec).toHaveBeenCalledWith('insertText', false, job.body)
    expect(context.adapter.saveDraft).toHaveBeenCalledOnce()
    expect(context.adapter.reopenDraft).toHaveBeenCalledOnce()
    expect(context.updates.map(({ status, step }) => `${status}/${step}`)).toEqual([
      'running/filling', 'running/saving', 'running/verifying', 'saved/verifying',
    ])
    expect(result).toMatchObject({ status: 'saved', evidence: { title: job.title, body: job.body, imageCount: 1, storage: 'browser', verifiedAt: 100 } })
  })

  it.each(['saving', 'verifying'] as const)('recovers %s by reopening the draft without replaying upload or save', async (step) => {
    const context = setup()
    context.title.value = job.title
    context.body.textContent = job.body
    const result = await runDraft({ ...job, status: 'needs_attention', step }, [], context.adapter, context.report, { timeout: 20 })
    expect(result.status).toBe('saved')
    expect(context.adapter.saveDraft).not.toHaveBeenCalled()
    expect(context.adapter.reopenDraft).toHaveBeenCalledOnce()
    expect(context.exec).not.toHaveBeenCalled()
  })


  it('leaves unrelated editor text intact when continuing an interrupted fill', async () => {
    const context = setup()
    context.body.textContent = '用户正在编辑的其他草稿'
    const result = await runDraft(job, [], context.adapter, context.report, { timeout: 20 })
    expect(result.status).toBe('needs_attention')
    expect(context.body.textContent).toBe('用户正在编辑的其他草稿')
    expect(context.title.value).toBe('')
    expect(context.exec).not.toHaveBeenCalled()
    expect(context.adapter.saveDraft).not.toHaveBeenCalled()
  })


  it('uploads exactly once after recording the uploading step, then fills the resulting editor', async () => {
    const context = setup()
    const upload = document.createElement('input')
    upload.type = 'file'
    upload.accept = 'image/png'
    document.body.append(upload)
    let uploaded = false
    context.adapter.getUploadInput = () => upload
    const getEditor = context.adapter.getEditor
    context.adapter.getEditor = () => uploaded ? getEditor() : null
    upload.addEventListener('change', () => {
      expect(context.updates.at(-1)?.step).toBe('uploading')
      expect(upload.files?.[0].name).toBe('sticker.png')
      uploaded = true
    })
    const result = await runDraft({ ...job, step: 'opening' }, [1, 2, 3], context.adapter, context.report, { timeout: 20 })
    expect(result.status).toBe('saved')
    expect(uploaded).toBe(true)
    expect(context.updates.some((update) => update.step === 'filling')).toBe(true)
  })


  it('stops if the visible account differs from the job account', async () => {
    const context = setup({ getAccount: () => '其他账号' })
    const result = await runDraft({ ...job, account: '原账号' }, [], context.adapter, context.report)
    expect(result.status).toBe('needs_attention')
    expect(result.message).toContain('账号')
    expect(context.exec).not.toHaveBeenCalled()
    expect(context.adapter.saveDraft).not.toHaveBeenCalled()
  })

  it('does not claim success if the account changes while reopening the draft', async () => {
    let account = '账号一'
    const context = setup({ getAccount: () => account, reopenDraft: vi.fn(async () => { account = '账号二' }) })
    const result = await runDraft(job, [], context.adapter, context.report, { timeout: 20 })
    expect(result.status).toBe('needs_attention')
    expect(result.message).toContain('账号')
    expect(context.updates.some((update) => update.status === 'saved')).toBe(false)
  })


  it('honors a stop between recording saving and clicking the site button', async () => {
    const context = setup()
    const controller = new AbortController()
    const report = async (update: DraftUpdate) => {
      await context.report(update)
      if (update.step === 'saving') controller.abort(new Error('你已停止自动操作'))
    }
    const result = await runDraft(job, [], context.adapter, report, { signal: controller.signal, timeout: 20 })
    expect(result.status).toBe('needs_attention')
    expect(result.message).toContain('停止')
    expect(context.adapter.saveDraft).not.toHaveBeenCalled()
    expect(context.adapter.reopenDraft).not.toHaveBeenCalled()
  })


  it('stops at a visible verification dialog without editing or saving', async () => {
    const context = setup()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.textContent = '请完成安全验证'
    document.body.append(dialog)
    const result = await runDraft(job, [], context.adapter, context.report, { timeout: 20 })
    expect(result.status).toBe('needs_attention')
    expect(context.title.value).toBe('')
    expect(context.adapter.saveDraft).not.toHaveBeenCalled()
  })


  it('refuses to upload into an already open editor even if its text matches this task', async () => {
    const context = setup()
    context.title.value = job.title
    context.body.textContent = job.body
    const result = await runDraft({ ...job, step: 'opening' }, [1], context.adapter, context.report, { timeout: 20 })
    expect(result.status).toBe('needs_attention')
    expect(context.adapter.saveDraft).not.toHaveBeenCalled()
  })

  it('does not upload again when resuming an interrupted upload', async () => {
    const context = setup({ getEditor: () => null })
    const input = document.createElement('input')
    input.type = 'file'
    document.body.append(input)
    context.adapter.getUploadInput = () => input
    const upload = vi.fn()
    input.addEventListener('change', upload)
    const result = await runDraft({ ...job, step: 'uploading' }, [1], context.adapter, context.report, { timeout: 5 })
    expect(result.status).toBe('needs_attention')
    expect(upload).not.toHaveBeenCalled()
    expect(context.adapter.saveDraft).not.toHaveBeenCalled()
  })

  it('establishes the Douyin account after upload before recording or editing the loaded image', async () => {
    const context = setup()
    const input = document.createElement('input')
    input.type = 'file'
    document.body.append(input)
    let uploaded = false
    const editor = context.adapter.getEditor()
    context.adapter.getAccount = () => uploaded ? '抖音账号' : null
    context.adapter.getUploadInput = () => input
    context.adapter.getEditor = () => uploaded ? editor : null
    input.addEventListener('change', () => { uploaded = true })
    const result = await runDraft({ ...job, platform: 'douyin', step: 'opening' }, [1], context.adapter, context.report, { timeout: 20 })
    expect(result.status).toBe('saved')
    expect(context.updates.find((update) => update.step === 'filling')?.account).toBe('抖音账号')
  })

  it('verifies rendered paragraphs and placeholders without losing intentional spaces or emoji joiners', async () => {
    const text = '甲  乙\n👩‍💻'
    const context = setup({ reopenDraft: vi.fn(async () => {
      context.body.innerHTML = '<p>甲&nbsp; 乙</p><p>👩‍💻<span data-slate-zero-width="z">&#xfeff;</span></p>'
    }) })
    const result = await runDraft({ ...job, body: text }, [], context.adapter, context.report, { timeout: 20 })
    expect(result).toMatchObject({ status: 'saved', evidence: { body: text } })
  })

  it('does not report success when reopened content has different whitespace', async () => {
    const context = setup({ reopenDraft: vi.fn(async () => { context.body.textContent = '甲 乙' }) })
    const result = await runDraft({ ...job, body: '甲  乙' }, [], context.adapter, context.report, { timeout: 5 })
    expect(result.status).toBe('needs_attention')
    expect(context.updates.some((update) => update.status === 'saved')).toBe(false)
  })

  it('identifies a missing description after saving instead of reporting a generic verification timeout', async () => {
    const context = setup({ reopenDraft: vi.fn(async () => { context.body.textContent = '' }) })
    const result = await runDraft(job, [], context.adapter, context.report, { timeout: 5 })
    expect(result).toMatchObject({ status: 'needs_attention', step: 'verifying' })
    expect(result.message).toContain('正文')
    expect(result.evidence).toBeUndefined()
    expect(context.adapter.saveDraft).toHaveBeenCalledOnce()
  })

  it('compares the platform count with the pasted text, including intentional invisible characters', async () => {
    const text = '第一段\u200b\n第二段\ufeff 👩‍💻'
    const context = setup()
    const getEditor = context.adapter.getEditor
    context.adapter.getEditor = () => ({ ...getEditor()!, bodyLength: context.body.textContent?.length ?? 0 })
    const result = await runDraft({ ...job, body: text }, [], context.adapter, context.report, { timeout: 5 })
    expect(result).toMatchObject({ status: 'saved', evidence: { body: text } })
    expect(context.adapter.saveDraft).toHaveBeenCalledOnce()
  })

  it('interrupts a pending platform operation when a new dialog appears', async () => {
    const context = setup({ saveDraft: vi.fn(async (signal) => {
      const dialog = document.createElement('div')
      dialog.setAttribute('role', 'dialog')
      dialog.textContent = '需要安全验证'
      const stopped = new Promise<void>((_, reject) => signal?.addEventListener('abort', () => reject(signal.reason), { once: true }))
      document.body.append(dialog)
      await stopped
    }) })
    const result = await runDraft(job, [], context.adapter, context.report, { timeout: 20 })
    expect(result).toMatchObject({ status: 'needs_attention', step: 'saving' })
    expect(context.adapter.reopenDraft).not.toHaveBeenCalled()
  })


  it('rejects a reopened old draft with identical text but a different image', async () => {
    const context = setup({ reopenDraft: vi.fn(async () => { vi.mocked(fingerprintImage).mockResolvedValue('b'.repeat(64)) }) })
    const result = await runDraft(job, [], context.adapter, context.report, { timeout: 20 })
    expect(result.status).toBe('needs_attention')
    expect(result.message).toContain('图片')
    expect(context.updates.some((update) => update.status === 'saved')).toBe(false)
  })

  it('does not infer a saved draft when recovering a job without its original image identity', async () => {
    const context = setup()
    context.title.value = job.title
    context.body.textContent = job.body
    const result = await runDraft({ ...job, step: 'verifying', imageHash: undefined }, [], context.adapter, context.report, { timeout: 20 })
    expect(result.status).toBe('needs_attention')
    expect(context.adapter.reopenDraft).not.toHaveBeenCalled()
  })


  it('keeps the last persisted step and hash when stopped during the first asynchronous image fingerprint', async () => {
    const context = setup()
    const controller = new AbortController()
    let started!: () => void
    let release!: (hash: string) => void
    const hashingStarted = new Promise<void>((resolve) => { started = resolve })
    const hashingFinished = new Promise<string>((resolve) => { release = resolve })
    vi.mocked(fingerprintImage).mockImplementationOnce(() => { started(); return hashingFinished })
    const pending = runDraft({ ...job, step: 'uploading', imageHash: undefined }, [], context.adapter, context.report, { signal: controller.signal, timeout: 20 })
    await hashingStarted
    controller.abort(new Error('你已停止自动操作'))
    release('a'.repeat(64))
    const result = await pending
    expect(result).toMatchObject({ status: 'needs_attention', step: 'uploading' })
    expect(result.imageHash).toBeUndefined()
    expect(context.updates.some((update) => update.step === 'filling')).toBe(false)
  })

  it('waits for the reopened picture to load before reading its identity', async () => {
    const context = setup()
    const getEditor = context.adapter.getEditor
    let reopenLoading = false
    context.adapter.reopenDraft = vi.fn(async () => { reopenLoading = true })
    context.adapter.getEditor = () => {
      const editor = getEditor()!
      if (!reopenLoading) return editor
      queueMicrotask(() => {
        reopenLoading = false
        document.body.setAttribute('data-image-loaded', 'yes')
      })
      return { ...editor, image: null }
    }
    vi.mocked(fingerprintImage).mockImplementation(async (image) => {
      if (!image) throw new Error('图片尚未加载')
      return 'a'.repeat(64)
    })
    const result = await runDraft(job, [], context.adapter, context.report, { timeout: 20 })
    expect(result.status).toBe('saved')
  })

  it('cancels a pending save before its click when the visible account changes', async () => {
    const context = setup()
    const account = document.createElement('span')
    account.textContent = '账号一'
    document.body.append(account)
    let clicks = 0
    context.adapter.getAccount = () => account.textContent
    context.adapter.saveDraft = vi.fn(async (signal) => {
      const mutationObserved = new Promise<void>((resolve) => {
        const observer = new MutationObserver(() => { observer.disconnect(); resolve() })
        observer.observe(account, { childList: true, characterData: true, subtree: true })
      })
      account.firstChild!.nodeValue = '账号二'
      await mutationObserved
      signal?.throwIfAborted()
      clicks++
    })
    const result = await runDraft(job, [], context.adapter, context.report, { timeout: 20 })
    expect(result.status).toBe('needs_attention')
    expect(result.message).toContain('账号')
    expect(clicks).toBe(0)
  })


  it('does not save a displayed title until the platform preview has accepted it', async () => {
    const context = setup()
    const getEditor = context.adapter.getEditor
    context.adapter.getEditor = () => ({ ...getEditor()!, titleEcho: null })
    const result = await runDraft(job, [], context.adapter, context.report, { timeout: 5 })
    expect(context.title.value).toBe(job.title)
    expect(result.status).toBe('needs_attention')
    expect(context.adapter.saveDraft).not.toHaveBeenCalled()
    expect(context.updates.some((update) => update.step === 'saving')).toBe(false)
  })


  it('continues only after an asynchronous title preview catches up with the editor', async () => {
    const context = setup()
    const getEditor = context.adapter.getEditor
    let titleEcho: string | null = null
    let reachedPreview!: () => void
    const waitingForPreview = new Promise<void>((resolve) => { reachedPreview = resolve })
    context.adapter.getEditor = () => {
      if (context.body.textContent === job.body) reachedPreview()
      return { ...getEditor()!, titleEcho }
    }
    const pending = runDraft(job, [], context.adapter, context.report, { timeout: 100 })
    await waitingForPreview
    expect(context.adapter.saveDraft).not.toHaveBeenCalled()
    titleEcho = job.title
    document.body.setAttribute('data-title-preview-ready', 'true')
    const result = await pending
    expect(result.status).toBe('saved')
    expect(context.adapter.saveDraft).toHaveBeenCalledOnce()
  })

})
