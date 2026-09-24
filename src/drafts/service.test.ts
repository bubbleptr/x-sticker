import { describe, expect, it, vi } from 'vitest'
import { createDraftService, type DraftRepository, type DraftTabs } from './service'
import type { DraftInput, DraftJob, DraftUpdate } from './types'

const png = [137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0,31,21,196,137,0,0,0,11,73,68,65,84,120,156,99,96,0,2,0,0,5,0,1,165,246,69,64,0,0,0,0,73,69,78,68,174,66,96,130]
const input: DraftInput = { platforms: ['xiaohongshu', 'douyin'], title: '一张贴图', body: '测试正文', sourceUrl: 'https://x.com/author/status/123', images: [{ filename: 'sticker.png', mimeType: 'image/png', dataUrl: `data:image/png;base64,${btoa(String.fromCharCode(...png))}` }] }
const ui: chrome.runtime.MessageSender = { id: 'extension', url: 'https://x.com/home', origin: 'https://x.com', frameId: 0 }
const imageHashes = ['a'.repeat(64)]

function setup() {
  let jobs: DraftJob[] = []
  const assets = new Map<string, Blob>()
  const openTabs = new Set<number>()
  const navigations: { tabId: number; url: string }[] = []
  let sequence = 0
  let tabSequence = 100
  const repository: DraftRepository = {
    listJobs: async () => structuredClone(jobs),
    saveJobs: async (next) => { jobs = structuredClone(next) },
    saveAsset: async (id, blob) => { assets.set(id, blob) },
    getAsset: async (id) => assets.get(id),
  }
  const tabs: DraftTabs = {
    createBlank: async () => { const id = ++tabSequence; openTabs.add(id); return id },
    navigate: async (tabId, url) => {
      expect(jobs.some((job) => job.tabId === tabId && job.status === 'queued')).toBe(true)
      navigations.push({ tabId, url })
    },
    focus: async (tabId) => { if (!openTabs.has(tabId)) throw new Error('No tab') },
    control: vi.fn(async () => ({ ok: true as const })),
  }
  const service = createDraftService({ repository, tabs, extensionId: 'extension', now: () => 1000, createId: () => `id-${++sequence}` })
  return { service, repository, tabs, assets, openTabs, navigations }
}

async function create(context: ReturnType<typeof setup>) {
  const response = await context.service.handle({ type: 'DRAFT_CREATE', input }, ui)
  if (!response.ok || !('jobs' in response)) throw new Error(JSON.stringify(response))
  return response.jobs
}

function creator(job: DraftJob): chrome.runtime.MessageSender {
  const origin = job.platform === 'xiaohongshu' ? 'https://creator.xiaohongshu.com' : 'https://creator.douyin.com'
  return { id: 'extension', tab: { id: job.tabId } as chrome.tabs.Tab, frameId: 0, url: `${origin}/publish`, origin }
}

describe('persistent draft workflow', () => {
  it('requires complete ordered image evidence for a multi-image draft after a service restart', async () => {
    const context = setup()
    const response = await context.service.handle({ type: 'DRAFT_CREATE', input: {
      ...input, platforms: ['xiaohongshu'], images: [input.images[0]!, { ...input.images[0]!, filename: 'photo.png' }],
    } }, ui)
    if (!response.ok || !('jobs' in response)) throw new Error('Draft creation failed')
    const job = response.jobs[0]!
    const sender = creator(job)
    await context.service.handle({ type: 'DRAFT_CLAIM', platform: job.platform }, sender)
    await context.service.handle({ type: 'DRAFT_UPDATE', id: job.id, update: { status: 'running', step: 'uploading', message: '上传中' } }, sender)
    const hashes = ['a'.repeat(64), 'b'.repeat(64)]
    expect(await context.service.handle({ type: 'DRAFT_UPDATE', id: job.id, update: { status: 'running', step: 'filling', imageHashes: hashes, message: '已核对' } }, sender)).toEqual({ ok: true })
    await context.service.handle({ type: 'DRAFT_UPDATE', id: job.id, update: { status: 'running', step: 'verifying', message: '重开核对' } }, sender)
    const restored = createDraftService({ repository: context.repository, tabs: context.tabs, extensionId: 'extension', now: () => 1000 })
    expect(await restored.handle({ type: 'DRAFT_INSPECT', platform: job.platform }, sender)).toMatchObject({ ok: true, job: { imageHashes: hashes }, images: [input.images[0]!, { ...input.images[0]!, filename: 'photo.png' }] })
    for (const evidenceHashes of [[hashes[0]], [...hashes].reverse(), [hashes[0], 'c'.repeat(64)]]) {
      const result = await restored.handle({ type: 'DRAFT_UPDATE', id: job.id, update: { status: 'saved', step: 'verifying', message: '保存', evidence: {
        title: job.title, body: job.body, imageCount: 2, imageHashes: evidenceHashes as string[], storage: 'browser', verifiedAt: 1000,
      } } }, sender)
      expect(result.ok).toBe(false)
    }
    expect(await restored.handle({ type: 'DRAFT_UPDATE', id: job.id, update: { status: 'saved', step: 'verifying', message: '保存', evidence: {
      title: job.title, body: job.body, imageCount: 2, imageHashes: hashes, storage: 'browser', verifiedAt: 1000,
    } } }, sender)).toEqual({ ok: true })
  })

  it('delivers a cover and attachments in the same order to both platform jobs', async () => {
    const context = setup()
    const dataUrl = `data:image/png;base64,${btoa(String.fromCharCode(...png))}`
    const images = [
      { filename: 'cover.png', mimeType: 'image/png' as const, dataUrl },
      { filename: 'photo.png', mimeType: 'image/png' as const, dataUrl },
    ]
    const response = await context.service.handle({ type: 'DRAFT_CREATE', input: {
      platforms: input.platforms, title: input.title, body: input.body, sourceUrl: input.sourceUrl, images,
    } }, ui)
    expect(response.ok).toBe(true)
    if (!response.ok || !('jobs' in response)) throw new Error('Draft creation failed')
    expect(response.jobs).toHaveLength(2)
    for (const job of response.jobs) {
      expect(job.assets.map((asset) => asset.filename)).toEqual(['cover.png', 'photo.png'])
      expect(await context.service.handle({ type: 'DRAFT_CLAIM', platform: job.platform }, creator(job)))
        .toMatchObject({ ok: true, images })
    }
  })

  it('persists a pre-upload Douyin blocker and clears it when continuing, stopping or receiving a different result', async () => {
    const context = setup()
    const [, job] = await create(context)
    const sender = creator(job)
    await context.service.handle({ type: 'DRAFT_CLAIM', platform: job.platform }, sender)
    const pause = () => context.service.handle({ type: 'DRAFT_UPDATE', id: job.id, update: { status: 'needs_attention', step: 'opening', blocker: 'existing_draft', message: '抖音旧稿，本次尚未上传' } }, sender)
    const inspect = () => context.service.handle({ type: 'DRAFT_INSPECT', platform: job.platform }, sender)
    expect(await pause()).toEqual({ ok: true })
    expect(await inspect()).toMatchObject({ ok: true, job: { blocker: 'existing_draft' } })
    await context.service.handle({ type: 'DRAFT_CONTROL', id: job.id, action: 'resume' }, ui)
    let current = await inspect()
    expect(current).toMatchObject({ ok: true, job: { id: job.id, status: 'running', step: 'opening' } })
    if (!current.ok || !('job' in current)) throw new Error('Missing task')
    expect(current.job.blocker).toBeUndefined()
    await context.service.handle({ type: 'DRAFT_UPDATE', id: job.id, update: { status: 'running', step: 'uploading', message: '上传前检查点' } }, sender)
    expect(await pause()).toEqual({ ok: true })
    expect(await inspect()).toMatchObject({ ok: true, job: { blocker: 'existing_draft', step: 'opening' } })
    await context.service.handle({ type: 'DRAFT_CONTROL', id: job.id, action: 'stop' }, ui)
    current = await inspect()
    if (!current.ok || !('job' in current)) throw new Error('Missing task')
    expect(current.job.blocker).toBeUndefined()
    await pause()
    await context.service.handle({ type: 'DRAFT_UPDATE', id: job.id, update: { status: 'needs_attention', step: 'opening', message: '账号需要核对' } }, sender)
    current = await inspect()
    if (!current.ok || !('job' in current)) throw new Error('Missing task')
    expect(current.job.blocker).toBeUndefined()
    expect(context.navigations).toHaveLength(2)
    expect(context.assets.size).toBe(1)
  })

  it.each([
    { platform: 'xiaohongshu', status: 'needs_attention', step: 'opening' },
    { platform: 'douyin', status: 'running', step: 'opening' },
    { platform: 'douyin', status: 'needs_attention', step: 'uploading' },
    { platform: 'douyin', status: 'needs_attention', step: 'opening', hash: imageHashes },
    { platform: 'douyin', status: 'needs_attention', step: 'opening', blocker: 'other' },
  ])('rejects a blocker that could incorrectly enable uploading again: %j', async ({ platform, status, step, hash, blocker }) => {
    const context = setup()
    const jobs = await create(context)
    const job = jobs.find((candidate) => candidate.platform === platform)!
    const sender = creator(job)
    await context.service.handle({ type: 'DRAFT_CLAIM', platform: job.platform }, sender)
    if (hash) {
      await context.service.handle({ type: 'DRAFT_UPDATE', id: job.id, update: { status: 'running', step: 'uploading', message: '上传' } }, sender)
      await context.service.handle({ type: 'DRAFT_UPDATE', id: job.id, update: { status: 'running', step: 'filling', imageHashes: hash, message: '已上传' } }, sender)
    }
    const result = await context.service.handle({ type: 'DRAFT_UPDATE', id: job.id, update: { status, step, blocker: blocker ?? 'existing_draft', message: '错误的可重试标记' } as DraftUpdate }, sender)
    expect(result.ok).toBe(false)
  })

  it('routes controls only from X to the bound tab and never resumes a saved or unknown task', async () => {
    const context = setup()
    const [job] = await create(context)
    for (const sender of [creator(job), { ...ui, id: 'foreign' }, { ...ui, frameId: 1 }]) {
      expect((await context.service.handle({ type: 'DRAFT_CONTROL', id: job.id, action: 'stop' }, sender)).ok).toBe(false)
    }
    expect((await context.service.handle({ type: 'DRAFT_CONTROL', id: 'missing', action: 'resume' }, ui)).ok).toBe(false)
    expect(context.tabs.control).not.toHaveBeenCalled()
    expect(await context.service.handle({ type: 'DRAFT_CONTROL', id: job.id, action: 'stop' }, ui)).toEqual({ ok: true })
    expect(context.tabs.control).toHaveBeenCalledWith(job.tabId, { type: 'DRAFT_RUN_CONTROL', id: job.id, action: 'stop' })
    const jobs = await context.repository.listJobs()
    jobs[0].status = 'saved'
    await context.repository.saveJobs(jobs)
    expect((await context.service.handle({ type: 'DRAFT_CONTROL', id: job.id, action: 'resume' }, ui)).ok).toBe(false)
    await context.service.tabClosed(job.tabId!)
    expect((await context.service.handle({ type: 'DRAFT_CONTROL', id: job.id, action: 'stop' }, ui)).ok).toBe(false)
    expect(context.tabs.control).toHaveBeenCalledTimes(1)
  })

  it('stops a queued task before the creator is ready and rejects late running updates', async () => {
    const context = setup()
    const [job] = await create(context)
    context.tabs.control = vi.fn(async () => { throw new Error('No receiver') })
    expect((await context.service.handle({ type: 'DRAFT_CONTROL', id: job.id, action: 'stop' }, ui)).ok).toBe(false)
    expect(await context.service.handle({ type: 'DRAFT_INSPECT', platform: job.platform }, creator(job))).toMatchObject({ ok: true, job: { status: 'needs_attention' } })
    expect((await context.service.handle({ type: 'DRAFT_CLAIM', platform: job.platform }, creator(job))).ok).toBe(false)
    expect((await context.service.handle({ type: 'DRAFT_UPDATE', id: job.id, update: { status: 'running', step: 'opening', message: '迟到的消息' } }, creator(job))).ok).toBe(false)
    expect(context.navigations).toHaveLength(2)
  })

  it('sends controls outside the serial queue so an inspect/update round trip cannot deadlock, and coalesces duplicate resume', async () => {
    const context = setup()
    const [job] = await create(context)
    await context.service.handle({ type: 'DRAFT_CLAIM', platform: job.platform }, creator(job))
    await context.service.handle({ type: 'DRAFT_CONTROL', id: job.id, action: 'stop' }, ui)
    context.tabs.control = vi.fn(async () => {
      expect((await context.service.handle({ type: 'DRAFT_INSPECT', platform: job.platform }, creator(job))).ok).toBe(true)
      return context.service.handle({ type: 'DRAFT_UPDATE', id: job.id, update: { status: 'running', step: 'opening', message: '已继续' } }, creator(job))
    })
    expect(await Promise.all([
      context.service.handle({ type: 'DRAFT_CONTROL', id: job.id, action: 'resume' }, ui),
      context.service.handle({ type: 'DRAFT_CONTROL', id: job.id, action: 'resume' }, ui),
    ])).toEqual([{ ok: true }, { ok: true }])
    expect(context.tabs.control).toHaveBeenCalledOnce()
  })

  it('preserves the paused checkpoint if the creator rejects resume', async () => {
    const context = setup()
    const [job] = await create(context)
    await context.service.handle({ type: 'DRAFT_CONTROL', id: job.id, action: 'stop' }, ui)
    context.tabs.control = vi.fn(async () => ({ ok: false as const, error: '页面正在停止，请稍后继续' }))
    expect(await context.service.handle({ type: 'DRAFT_CONTROL', id: job.id, action: 'resume' }, ui)).toEqual({ ok: false, error: '页面正在停止，请稍后继续' })
    expect(await context.service.handle({ type: 'DRAFT_INSPECT', platform: job.platform }, creator(job))).toMatchObject({ ok: true, job: { status: 'needs_attention', step: 'opening' } })
  })

  it.each([{ hash: undefined }, { hash: ['not-a-sha256'] }, { hash: 'a'.repeat(64) }])('rejects a missing or malformed fingerprint before filling: %j', async ({ hash: invalidHash }) => {
    const context = setup()
    const [job] = await create(context)
    const sender = creator(job)
    await context.service.handle({ type: 'DRAFT_CLAIM', platform: job.platform }, sender)
    await context.service.handle({ type: 'DRAFT_UPDATE', id: job.id, update: { status: 'running', step: 'uploading', message: '上传中' } }, sender)
    expect((await context.service.handle({ type: 'DRAFT_UPDATE', id: job.id, update: { status: 'running', step: 'filling', message: '填写中', imageHashes: invalidHash as string[] | undefined } }, sender)).ok).toBe(false)
  })

  it('allows only one active task per platform while other platforms continue independently', async () => {
    const context = setup()
    const samePlatform = { type: 'DRAFT_CREATE' as const, input: { ...input, platforms: ['xiaohongshu' as const] } }
    const responses = await Promise.all([context.service.handle(samePlatform, ui), context.service.handle(samePlatform, ui)])
    expect(responses.map((response) => response.ok)).toEqual([true, false])
    expect((await context.service.handle({ type: 'DRAFT_CREATE', input: { ...input, platforms: ['douyin'] } }, ui)).ok).toBe(true)
    expect(context.openTabs.size).toBe(2)
    expect(context.assets.size).toBe(2)
  })

  it('blocks resuming an older paused task while a newer task owns that platform', async () => {
    const context = setup()
    const [older, otherPlatform] = await create(context)
    const sender = creator(older)
    await context.service.handle({ type: 'DRAFT_CLAIM', platform: older.platform }, sender)
    await context.service.handle({ type: 'DRAFT_UPDATE', id: older.id, update: { status: 'needs_attention', step: 'opening', message: '用户停止' } }, sender)
    expect((await context.service.handle({ type: 'DRAFT_CREATE', input: { ...input, platforms: [older.platform] } }, ui)).ok).toBe(true)
    const resume = await context.service.handle({ type: 'DRAFT_UPDATE', id: older.id, update: { status: 'running', step: 'opening', message: '继续' } }, sender)
    expect(resume).toMatchObject({ ok: false, error: expect.stringContaining('已有处理中的草稿') })
    expect(await context.service.handle({ type: 'DRAFT_INSPECT', platform: older.platform }, sender)).toMatchObject({ ok: true, job: { status: 'needs_attention' } })
    expect((await context.service.handle({ type: 'DRAFT_CLAIM', platform: otherPlatform.platform }, creator(otherPlatform))).ok).toBe(true)
  })

  it('persists the uploaded image fingerprint once and rejects a different image at verification', async () => {
    const context = setup()
    const [job] = await create(context)
    const sender = creator(job)
    await context.service.handle({ type: 'DRAFT_CLAIM', platform: job.platform }, sender)
    await context.service.handle({ type: 'DRAFT_UPDATE', id: job.id, update: { status: 'running', step: 'uploading', message: '上传中' } }, sender)
    expect((await context.service.handle({ type: 'DRAFT_UPDATE', id: job.id, update: { status: 'running', step: 'filling', message: '写入前核对', imageHashes } }, sender)).ok).toBe(true)
    const restored = createDraftService({ repository: context.repository, tabs: context.tabs, extensionId: 'extension', now: () => 1000 })
    expect(await restored.handle({ type: 'DRAFT_INSPECT', platform: job.platform }, sender)).toMatchObject({ ok: true, job: { imageHashes } })
    expect((await restored.handle({ type: 'DRAFT_UPDATE', id: job.id, update: { status: 'running', step: 'filling', message: '另一张图', imageHashes: ['b'.repeat(64)] } }, sender)).ok).toBe(false)
    await restored.handle({ type: 'DRAFT_UPDATE', id: job.id, update: { status: 'running', step: 'verifying', message: '重新打开核对' } }, sender)
    const saved: DraftUpdate = { status: 'saved', step: 'verifying', message: '已核对', evidence: { title: input.title, body: input.body, imageCount: 1, imageHashes: ['b'.repeat(64)], storage: 'browser', verifiedAt: 1000 } }
    expect((await restored.handle({ type: 'DRAFT_UPDATE', id: job.id, update: saved }, sender)).ok).toBe(false)
    expect((await restored.handle({ type: 'DRAFT_UPDATE', id: job.id, update: { ...saved, evidence: { ...saved.evidence!, imageHashes } } }, sender)).ok).toBe(true)
  })

  it('marks closed or browser-restarted tasks for attention without reusing stale tab IDs', async () => {
    const context = setup()
    const [first, second] = await create(context)
    await context.service.handle({ type: 'DRAFT_CLAIM', platform: first.platform }, creator(first))
    await context.service.tabClosed(first.tabId!)
    expect((await context.service.handle({ type: 'DRAFT_INSPECT', platform: first.platform }, { ...creator(first), tab: undefined })).ok).toBe(false)
    let result = await context.service.handle({ type: 'DRAFT_LIST' }, ui)
    expect(result).toMatchObject({ ok: true, jobs: [{ status: 'needs_attention' }, { status: 'queued', tabId: second.tabId }] })
    await context.service.browserRestarted()
    result = await context.service.handle({ type: 'DRAFT_LIST' }, ui)
    if (!result.ok || !('jobs' in result)) throw new Error('Missing task list')
    expect(result.jobs.every((job) => job.status === 'needs_attention' && job.tabId === undefined)).toBe(true)
    expect(context.navigations).toHaveLength(2)
  })

  it('opens the existing task tab and never recreates or uploads when that tab was closed', async () => {
    const context = setup()
    const [job] = await create(context)
    expect((await context.service.handle({ type: 'DRAFT_OPEN', id: job.id }, ui)).ok).toBe(true)
    context.openTabs.delete(job.tabId!)
    const result = await context.service.handle({ type: 'DRAFT_OPEN', id: job.id }, ui)
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('标签页已关闭') })
    expect(context.navigations).toHaveLength(2)
    expect(context.openTabs.size).toBe(1)
  })

  it('limits create/list/open to the X capture page', async () => {
    const context = setup()
    for (const sender of [
      { ...ui, id: 'foreign' },
      { id: 'extension', url: 'chrome-extension://extension/src/popup/index.html' },
      { ...ui, url: 'https://creator.xiaohongshu.com/publish' },
      { ...ui, url: 'http://x.com/home' },
      { ...ui, url: 'https://x.com/home', frameId: 2 },
    ]) {
      expect((await context.service.handle({ type: 'DRAFT_CREATE', input }, sender)).ok).toBe(false)
      expect((await context.service.handle({ type: 'DRAFT_LIST' }, sender)).ok).toBe(false)
    }
    expect(context.assets.size).toBe(0)
    expect((await context.service.handle({ type: 'DRAFT_CREATE', input }, { ...ui, url: 'https://x.com/home', origin: 'https://x.com', frameId: 0 })).ok).toBe(true)
  })

  it('requires a claimed job, a separate verifying step and matching read-back evidence before saved', async () => {
    const context = setup()
    const [job] = await create(context)
    const sender = creator(job)
    const saved: DraftUpdate = { status: 'saved', step: 'verifying', message: '已核对', evidence: { title: input.title, body: input.body, imageCount: 1, imageHashes, storage: 'browser', verifiedAt: 1000 } }
    expect((await context.service.handle({ type: 'DRAFT_UPDATE', id: job.id, update: saved }, sender)).ok).toBe(false)
    await context.service.handle({ type: 'DRAFT_CLAIM', platform: job.platform }, sender)
    expect((await context.service.handle({ type: 'DRAFT_UPDATE', id: job.id, update: saved }, sender)).ok).toBe(false)
    await context.service.handle({ type: 'DRAFT_UPDATE', id: job.id, update: { status: 'running', step: 'uploading', message: '上传中' } }, sender)
    await context.service.handle({ type: 'DRAFT_UPDATE', id: job.id, update: { status: 'running', step: 'filling', message: '填写中', imageHashes } }, sender)
    expect((await context.service.handle({ type: 'DRAFT_UPDATE', id: job.id, update: { status: 'running', step: 'verifying', message: '重新打开核对' } }, sender)).ok).toBe(true)
    for (const evidence of [undefined, { ...saved.evidence!, title: '别的草稿' }, { ...saved.evidence!, body: '正文不对' }, { ...saved.evidence!, imageCount: 2 }]) {
      expect((await context.service.handle({ type: 'DRAFT_UPDATE', id: job.id, update: { ...saved, evidence } }, sender)).ok).toBe(false)
    }
    expect((await context.service.handle({ type: 'DRAFT_UPDATE', id: job.id, update: saved }, { ...sender, tab: { id: 999 } as chrome.tabs.Tab })).ok).toBe(false)
    expect((await context.service.handle({ type: 'DRAFT_UPDATE', id: job.id, update: saved }, sender)).ok).toBe(true)
    expect((await context.service.handle({ type: 'DRAFT_CLAIM', platform: job.platform }, sender)).ok).toBe(false)
    expect(await context.service.handle({ type: 'DRAFT_INSPECT', platform: job.platform }, sender)).toMatchObject({ ok: true, job: { status: 'saved', evidence: saved.evidence } })
  })

  it('does not replay after a reload or concurrent claim, and allows read-only inspection', async () => {
    const context = setup()
    const [job] = await create(context)
    const sender = creator(job)
    const claims = await Promise.all([
      context.service.handle({ type: 'DRAFT_CLAIM', platform: job.platform }, sender),
      context.service.handle({ type: 'DRAFT_CLAIM', platform: job.platform }, sender),
    ])
    expect(claims.map((response) => response.ok)).toEqual([true, false])
    const restored = createDraftService({ repository: context.repository, tabs: context.tabs, extensionId: 'extension' })
    const inspected = await restored.handle({ type: 'DRAFT_INSPECT', platform: job.platform }, sender)
    expect(inspected).toMatchObject({ ok: true, job: { status: 'needs_attention' }, images: input.images })
    expect((await restored.handle({ type: 'DRAFT_CLAIM', platform: job.platform }, sender)).ok).toBe(false)
  })

  it('delivers the asset only to the bound top-level HTTPS creator tab', async () => {
    const context = setup()
    const [job] = await create(context)
    const sender = creator(job)
    for (const invalid of [
      { ...sender, tab: { id: 999 } as chrome.tabs.Tab },
      { ...sender, url: 'http://creator.xiaohongshu.com/publish' },
      { ...sender, origin: 'https://creator.douyin.com' },
      { ...sender, frameId: 1 },
      { ...sender, id: 'another-extension' },
    ]) {
      expect((await context.service.handle({ type: 'DRAFT_CLAIM', platform: 'xiaohongshu' }, invalid)).ok).toBe(false)
    }
    const result = await context.service.handle({ type: 'DRAFT_CLAIM', platform: 'xiaohongshu' }, sender)
    expect(result).toMatchObject({ ok: true, job: { id: job.id, status: 'running' }, images: input.images })
  })

  it('keeps the second platform independent when opening the first fails', async () => {
    const context = setup()
    const navigate = context.tabs.navigate
    context.tabs.navigate = async (tabId, url) => {
      if (url.includes('xiaohongshu')) throw new Error('页面不可用')
      await navigate(tabId, url)
    }
    const jobs = await create(context)
    expect(jobs[0].status).toBe('needs_attention')
    expect(jobs[1].status).toBe('queued')
    expect(context.navigations).toHaveLength(1)
  })

  it.each([
    { title: '' },
    { title: '长'.repeat(21) },
    { body: '字'.repeat(1001) },
    { images: [{ ...input.images[0], dataUrl: 'data:image/png;base64,AQID' }] },
    { images: [] },
    { platforms: ['wechat'] },
    { platforms: [] },
    { images: [{ ...input.images[0], filename: '../sticker.png' }] },
  ])('rejects invalid input without opening a tab: %j', async (changes) => {
    const context = setup()
    const result = await context.service.handle({ type: 'DRAFT_CREATE', input: { ...input, ...changes } as DraftInput }, ui)
    expect(result.ok).toBe(false)
    expect(context.openTabs.size).toBe(0)
    expect(context.assets.size).toBe(0)
  })

  it('stores one PNG and binds separate platform tabs before navigation', async () => {
    const context = setup()
    const jobs = await create(context)
    expect(jobs.map((job) => job.status)).toEqual(['queued', 'queued'])
    expect(new Set(jobs.map((job) => job.tabId)).size).toBe(2)
    expect(jobs[0].assets).toEqual(jobs[1].assets)
    expect(context.assets.size).toBe(1)
    expect(context.navigations).toHaveLength(2)
    const restored = createDraftService({ repository: context.repository, tabs: context.tabs, extensionId: 'extension' })
    expect(await restored.handle({ type: 'DRAFT_LIST' }, ui)).toEqual({ ok: true, jobs })
  })
})
