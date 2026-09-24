import { DRAFT_TARGETS, type DraftInput, type DraftJob, type DraftMessage, type DraftResponse } from './types'

function validateInput(input: DraftInput): void {
  if (!input || !Array.isArray(input.platforms) || input.platforms.length === 0 || input.platforms.length > 2 ||
      input.platforms.some((platform) => platform !== 'xiaohongshu' && platform !== 'douyin') ||
      new Set(input.platforms).size !== input.platforms.length) throw new Error('请选择小红书或抖音')
  if (typeof input.title !== 'string' || !input.title.trim() || [...input.title].length > 20) throw new Error('标题须为 1–20 个字')
  if (typeof input.body !== 'string' || [...input.body].length > 1000) throw new Error('正文不能超过 1000 个字')
  if (typeof input.sourceUrl !== 'string' || input.sourceUrl.length > 2048) throw new Error('来源链接无效')
  if (typeof input.filename !== 'string' || !/^[^/\\\x00-\x1f]{1,180}\.png$/i.test(input.filename)) throw new Error('图片文件名无效')
  if (!Array.isArray(input.bytes) || input.bytes.length > 10 * 1024 * 1024 ||
      input.bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) throw new Error('PNG 图片不能超过 10 MB')
  const bytes = Uint8Array.from(input.bytes)
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (bytes.length < 45 || signature.some((byte, index) => bytes[index] !== byte)) throw new Error('图片不是有效的 PNG')
  const view = new DataView(bytes.buffer)
  let offset = 8
  let hasPixels = false
  while (offset + 12 <= bytes.length) {
    const size = view.getUint32(offset)
    const kind = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
    if (offset + size + 12 > bytes.length) break
    if (offset === 8 && (kind !== 'IHDR' || size !== 13 || view.getUint32(16) === 0 || view.getUint32(20) === 0)) break
    if (kind === 'IDAT' && size > 0) hasPixels = true
    if (kind === 'IEND' && size === 0 && hasPixels && offset + 12 === bytes.length) return
    offset += size + 12
  }
  throw new Error('PNG 图片不完整，请重新生成')
}

export interface DraftRepository {
  listJobs(): Promise<DraftJob[]>
  saveJobs(jobs: DraftJob[]): Promise<void>
  saveAsset(id: string, blob: Blob): Promise<void>
  getAsset(id: string): Promise<Blob | undefined>
}

export interface DraftTabs {
  createBlank(): Promise<number>
  navigate(tabId: number, url: string): Promise<void>
  focus(tabId: number): Promise<void>
}

interface DraftDependencies {
  repository: DraftRepository
  tabs: DraftTabs
  extensionId: string
  now?: () => number
  createId?: () => string
}

export function createDraftService({ repository, tabs, extensionId, now = Date.now, createId = () => crypto.randomUUID() }: DraftDependencies) {
  let pending: Promise<unknown> = Promise.resolve()

  function serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(operation)
    pending = result.catch(() => undefined)
    return result
  }

  async function interruptJobs(tabId?: number): Promise<void> {
    const jobs = await repository.listJobs()
    let changed = false
    for (const job of jobs) {
      if (tabId !== undefined && job.tabId !== tabId) continue
      delete job.tabId
      if (job.status !== 'saved') {
        job.status = 'needs_attention'
        job.message = tabId === undefined
          ? '浏览器已重启，请自行核对创作者中心草稿；不会重复上传'
          : '原标签页已关闭，请自行核对创作者中心草稿；不会重复上传'
      }
      job.updatedAt = now()
      changed = true
    }
    if (changed) await repository.saveJobs(jobs)
  }

  function assertCreator(job: DraftJob, sender: chrome.runtime.MessageSender): void {
    const origin = DRAFT_TARGETS[job.platform].origin
    if (sender.id !== extensionId || job.tabId === undefined || sender.tab?.id !== job.tabId || sender.frameId !== 0 ||
        !sender.url || new URL(sender.url).origin !== origin || (sender.origin && sender.origin !== origin)) {
      throw new Error('草稿请求不属于绑定的创作者中心标签页')
    }
  }

  function assertUI(sender: chrome.runtime.MessageSender): void {
    if (sender.id !== extensionId || !sender.url) throw new Error('草稿操作来源无效')
    const url = new URL(sender.url)
    if (url.protocol === 'chrome-extension:' && url.hostname === extensionId) return
    if ((url.origin === 'https://x.com' || url.origin === 'https://twitter.com') && sender.frameId === 0 &&
        (!sender.origin || sender.origin === url.origin)) return
    throw new Error('请从 X Sticker 预览或扩展面板操作草稿')
  }

  async function dispatch(message: DraftMessage, sender: chrome.runtime.MessageSender): Promise<DraftResponse> {
    if (message.type === 'DRAFT_CREATE' || message.type === 'DRAFT_LIST' || message.type === 'DRAFT_OPEN') assertUI(sender)
    if (message.type === 'DRAFT_LIST') return { ok: true, jobs: await repository.listJobs() }
    if (message.type === 'DRAFT_CREATE') {
      const input = message.input
      validateInput(input)
      const jobs = await repository.listJobs()
      const active = jobs.find((job) => input.platforms.includes(job.platform) && (job.status === 'queued' || job.status === 'running'))
      if (active) throw new Error(`${DRAFT_TARGETS[active.platform].label}已有处理中的草稿，请先完成或停止现有任务`)
      const assetId = createId()
      await repository.saveAsset(assetId, new Blob([Uint8Array.from(input.bytes)], { type: 'image/png' }))
      const created: DraftJob[] = input.platforms.map((platform) => ({
        id: createId(), assetId, platform, title: input.title, body: input.body,
        sourceUrl: input.sourceUrl, filename: input.filename, createdAt: now(), updatedAt: now(),
        status: 'queued', step: 'opening', message: '正在打开创作者中心',
      }))
      jobs.push(...created)
      await repository.saveJobs(jobs)
      for (const job of created) {
        try {
          job.tabId = await tabs.createBlank()
          await repository.saveJobs(jobs)
          await tabs.navigate(job.tabId, DRAFT_TARGETS[job.platform].url)
        } catch (error) {
          job.status = 'needs_attention'
          job.message = `打开失败：${error instanceof Error ? error.message : '创作者中心不可用'}`
          job.updatedAt = now()
          await repository.saveJobs(jobs)
        }
      }
      return { ok: true, jobs: created }
    }
    if (message.type === 'DRAFT_CLAIM' || message.type === 'DRAFT_INSPECT') {
      const jobs = await repository.listJobs()
      const job = jobs.find((candidate) => candidate.tabId === sender.tab?.id && candidate.platform === message.platform)
      if (!job) throw new Error('当前标签页没有待处理的贴图草稿')
      assertCreator(job, sender)
      if (message.type === 'DRAFT_CLAIM' && job.status !== 'queued') {
        if (job.status === 'running') {
          job.status = 'needs_attention'
          job.updatedAt = now()
          job.message = '页面已重新加载，请在创作者中心核对当前内容后继续；不会重复上传'
          await repository.saveJobs(jobs)
        }
        throw new Error(job.status === 'saved' ? '草稿已经核对保存' : '草稿已暂停，请在原标签页核对后继续')
      }
      const asset = await repository.getAsset(job.assetId)
      if (!asset) throw new Error('贴图素材已丢失，请重新生成')
      if (message.type === 'DRAFT_CLAIM') {
        job.status = 'running'
        job.updatedAt = now()
        await repository.saveJobs(jobs)
      }
      return { ok: true, job, bytes: [...new Uint8Array(await asset.arrayBuffer())] }
    }
    if (message.type === 'DRAFT_UPDATE') {
      const jobs = await repository.listJobs()
      const job = jobs.find((candidate) => candidate.id === message.id)
      if (!job) throw new Error('草稿任务不存在')
      assertCreator(job, sender)
      const update = message.update
      if (!update || !['running', 'needs_attention', 'saved'].includes(update.status) ||
          !['opening', 'uploading', 'filling', 'saving', 'verifying'].includes(update.step) ||
          typeof update.message !== 'string' || update.message.length > 1000 ||
          (update.account !== undefined && (typeof update.account !== 'string' || update.account.length > 200))) throw new Error('草稿状态无效')
      if (job.status === 'queued' || job.status === 'saved') throw new Error('草稿尚未领取或已经保存，不能更改状态')
      if (job.status === 'needs_attention' && update.status === 'running' && jobs.some((other) =>
        other.id !== job.id && other.platform === job.platform && (other.status === 'queued' || other.status === 'running'),
      )) throw new Error(`${DRAFT_TARGETS[job.platform].label}已有处理中的草稿，请先完成或停止现有任务`)
      if (update.imageHash !== undefined) {
        if (typeof update.imageHash !== 'string' || !/^[a-f0-9]{64}$/.test(update.imageHash) ||
            (job.imageHash !== undefined && update.imageHash !== job.imageHash) ||
            (job.imageHash === undefined && (job.step !== 'uploading' || update.step !== 'filling' || update.status !== 'running'))) {
          throw new Error('图片指纹无效或已变化，请手动核对草稿')
        }
      }
      if (update.status === 'running' && update.step === 'filling' && !job.imageHash && !update.imageHash) {
        throw new Error('尚未核对上传图片，不能开始填写草稿')
      }
      if (update.status === 'saved') {
        const evidence = update.evidence
        if (job.status !== 'running' || job.step !== 'verifying' || update.step !== 'verifying' || !evidence ||
            evidence.title !== job.title || evidence.body !== job.body || evidence.imageCount !== 1 ||
            !job.imageHash || evidence.imageHash !== job.imageHash ||
            !['browser', 'account', 'unknown'].includes(evidence.storage) ||
            (job.platform === 'xiaohongshu' && evidence.storage !== 'browser') || !Number.isFinite(evidence.verifiedAt) ||
            evidence.verifiedAt < job.createdAt || evidence.verifiedAt > now() + 60_000) {
          throw new Error('尚未重新打开并核对标题、正文和单张图片，不能标记保存成功')
        }
        job.evidence = { title: evidence.title, body: evidence.body, imageCount: 1, imageHash: evidence.imageHash, storage: evidence.storage, verifiedAt: evidence.verifiedAt }
      }
      if (update.imageHash !== undefined) job.imageHash = update.imageHash
      job.status = update.status
      job.step = update.step
      job.message = update.message
      if (update.account !== undefined) job.account = update.account
      job.updatedAt = now()
      await repository.saveJobs(jobs)
      return { ok: true }
    }
    if (message.type === 'DRAFT_OPEN') {
      const jobs = await repository.listJobs()
      const job = jobs.find((candidate) => candidate.id === message.id)
      if (!job) throw new Error('草稿任务不存在')
      try {
        if (job.tabId === undefined) throw new Error('任务未打开标签页')
        await tabs.focus(job.tabId)
      } catch {
        if (job.status !== 'saved') {
          job.status = 'needs_attention'
          job.message = '原标签页已关闭，请自行到创作者中心检查草稿；不会重复上传'
          job.updatedAt = now()
          await repository.saveJobs(jobs)
        }
        throw new Error('原标签页已关闭，请自行到创作者中心检查草稿；不会重复上传')
      }
      return { ok: true }
    }
    return { ok: false, error: '不支持的草稿操作' }
  }

  return {
    handle(message: DraftMessage, sender: chrome.runtime.MessageSender): Promise<DraftResponse> {
      return serial(() => dispatch(message, sender)).catch((error: unknown): DraftResponse => ({
        ok: false, error: error instanceof Error ? error.message : '草稿操作失败',
      }))
    },
    tabClosed(tabId: number): Promise<void> { return serial(() => interruptJobs(tabId)) },
    browserRestarted(): Promise<void> { return serial(() => interruptJobs()) },
  }
}
