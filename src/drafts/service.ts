import { decodeImageAsset, encodeImageAsset, validateImageAssets } from '../media'
import { DRAFT_TARGETS, type DraftInput, type DraftJob, type DraftMessage, type DraftResponse, type DraftRunControlMessage } from './types'

function validateInput(input: DraftInput): void {
  if (!input || !Array.isArray(input.platforms) || input.platforms.length === 0 || input.platforms.length > 2 ||
      input.platforms.some((platform) => platform !== 'xiaohongshu' && platform !== 'douyin') ||
      new Set(input.platforms).size !== input.platforms.length) throw new Error('请选择小红书或抖音')
  if (typeof input.title !== 'string' || !input.title.trim() || [...input.title].length > 20) throw new Error('标题须为 1–20 个字')
  if (typeof input.body !== 'string' || [...input.body].length > 1000) throw new Error('正文不能超过 1000 个字')
  if (typeof input.sourceUrl !== 'string' || input.sourceUrl.length > 2048) throw new Error('来源链接无效')
  validateImageAssets(input.images)
}

function validHashes(value: unknown, count: number): value is string[] {
  return Array.isArray(value) && value.length === count && value.every((hash) => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash))
}

function sameHashes(first: string[], second: string[]): boolean {
  return first.length === second.length && first.every((hash, index) => hash === second[index])
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
  control(tabId: number, command: DraftRunControlMessage): Promise<DraftResponse>
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
      delete job.blocker
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
    if ((url.origin === 'https://x.com' || url.origin === 'https://twitter.com') && sender.frameId === 0 &&
        (!sender.origin || sender.origin === url.origin)) return
    throw new Error('请从 X/Twitter 的 X Sticker 预览操作草稿')
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
      const assets: DraftJob['assets'] = []
      for (const image of input.images) {
        const id = createId()
        await repository.saveAsset(id, new Blob([Uint8Array.from(decodeImageAsset(image))], { type: image.mimeType }))
        assets.push({ id, filename: image.filename, mimeType: image.mimeType })
      }
      const created: DraftJob[] = input.platforms.map((platform) => ({
        id: createId(), assets, platform, title: input.title, body: input.body,
        sourceUrl: input.sourceUrl, createdAt: now(), updatedAt: now(),
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
          delete job.blocker
          job.updatedAt = now()
          job.message = '页面已重新加载，请在创作者中心核对当前内容后继续；不会重复上传'
          await repository.saveJobs(jobs)
        }
        throw new Error(job.status === 'saved' ? '草稿已经核对保存' : '草稿已暂停，请在原标签页核对后继续')
      }
      const images = []
      for (const metadata of job.assets) {
        const asset = await repository.getAsset(metadata.id)
        if (!asset) throw new Error('贴图素材已丢失，请重新生成')
        images.push(encodeImageAsset(new Uint8Array(await asset.arrayBuffer()), metadata.mimeType, metadata.filename))
      }
      validateImageAssets(images)
      if (message.type === 'DRAFT_CLAIM') {
        job.status = 'running'
        delete job.blocker
        job.updatedAt = now()
        await repository.saveJobs(jobs)
      }
      return { ok: true, job, images }
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
      if (job.status === 'needs_attention' && update.status !== 'needs_attention') throw new Error('草稿已暂停，请返回 X 检查并继续')
      if (update.blocker !== undefined && (update.blocker !== 'existing_draft' || job.platform !== 'douyin' ||
          update.status !== 'needs_attention' || update.step !== 'opening' || job.imageHashes !== undefined ||
          update.imageHashes !== undefined || !['opening', 'uploading'].includes(job.step))) {
        throw new Error('旧草稿阻塞状态无效，不能重新上传')
      }
      if (update.imageHashes !== undefined) {
        if (!validHashes(update.imageHashes, job.assets.length) ||
            (job.imageHashes !== undefined && !sameHashes(update.imageHashes, job.imageHashes)) ||
            (job.imageHashes === undefined && (job.step !== 'uploading' || update.step !== 'filling' || update.status !== 'running'))) {
          throw new Error('图片指纹无效或已变化，请手动核对草稿')
        }
      }
      if (update.status === 'running' && update.step === 'filling' && !job.imageHashes && !update.imageHashes) {
        throw new Error('尚未核对上传图片，不能开始填写草稿')
      }
      if (update.status === 'saved') {
        const evidence = update.evidence
        if (job.status !== 'running' || job.step !== 'verifying' || update.step !== 'verifying' || !evidence ||
            evidence.title !== job.title || evidence.body !== job.body || evidence.imageCount !== job.assets.length ||
            !job.imageHashes || !validHashes(evidence.imageHashes, job.assets.length) || !sameHashes(evidence.imageHashes, job.imageHashes) ||
            !['browser', 'account', 'unknown'].includes(evidence.storage) ||
            (job.platform === 'xiaohongshu' && evidence.storage !== 'browser') || !Number.isFinite(evidence.verifiedAt) ||
            evidence.verifiedAt < job.createdAt || evidence.verifiedAt > now() + 60_000) {
          throw new Error('尚未重新打开并核对标题、正文和全部有序图片，不能标记保存成功')
        }
        job.evidence = { title: evidence.title, body: evidence.body, imageCount: job.assets.length, imageHashes: [...evidence.imageHashes], storage: evidence.storage, verifiedAt: evidence.verifiedAt }
      }
      if (update.imageHashes !== undefined) job.imageHashes = [...update.imageHashes]
      if (update.blocker) job.blocker = update.blocker
      else delete job.blocker
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
          delete job.blocker
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

  const controlVersions = new Map<string, number>()

  async function control(message: Extract<DraftMessage, { type: 'DRAFT_CONTROL' }>, sender: chrome.runtime.MessageSender): Promise<DraftResponse> {
    const target = await serial(async () => {
      assertUI(sender)
      if (typeof message.id !== 'string' || !['stop', 'resume'].includes(message.action)) throw new Error('草稿控制命令无效')
      const jobs = await repository.listJobs()
      const job = jobs.find((candidate) => candidate.id === message.id)
      if (!job) throw new Error('草稿任务不存在')
      if (job.tabId === undefined) throw new Error('原标签页已关闭，请自行到创作者中心检查草稿')
      if (job.status === 'saved') throw new Error('草稿已经保存，无需继续自动操作')
      if (message.action === 'stop' && job.status === 'needs_attention') {
        if (job.blocker) {
          delete job.blocker
          job.message = '你已停止自动操作，贴图和当前内容已保留'
          job.updatedAt = now()
          await repository.saveJobs(jobs)
        }
        return
      }
      if (message.action === 'resume' && (job.status === 'running' || job.status === 'queued')) return
      if (message.action === 'resume' && jobs.some((other) => other.id !== job.id && other.platform === job.platform &&
          (other.status === 'queued' || other.status === 'running'))) {
        throw new Error(`${DRAFT_TARGETS[job.platform].label}已有处理中的草稿，请先完成或停止现有任务`)
      }
      delete job.blocker
      job.status = message.action === 'stop' ? 'needs_attention' : 'running'
      job.message = message.action === 'stop' ? '你已停止自动操作，贴图和当前内容已保留' : '正在检查并继续原草稿'
      job.updatedAt = now()
      const version = (controlVersions.get(job.id) ?? 0) + 1
      controlVersions.set(job.id, version)
      await repository.saveJobs(jobs)
      return { tabId: job.tabId, version }
    })
    if (!target) return { ok: true }
    try {
      // Creator messages must be free to re-enter the service while control is in flight.
      const result = await tabs.control(target.tabId, { type: 'DRAFT_RUN_CONTROL', id: message.id, action: message.action })
      if (!result.ok) throw new Error(result.error)
      return { ok: true }
    } catch (error) {
      const failure = error instanceof Error ? error.message : '原标签页没有响应，请刷新创作者中心后返回 X 检查并继续'
      await serial(async () => {
        if (controlVersions.get(message.id) !== target.version) return
        const jobs = await repository.listJobs()
        const job = jobs.find((candidate) => candidate.id === message.id)
        if (!job || job.status === 'saved') return
        job.status = 'needs_attention'
        delete job.blocker
        job.message = message.action === 'stop' ? '已暂停任务；原标签页没有响应，请手动核对当前内容' : failure
        job.updatedAt = now()
        await repository.saveJobs(jobs)
      })
      return { ok: false, error: failure }
    }
  }

  return {
    handle(message: DraftMessage, sender: chrome.runtime.MessageSender): Promise<DraftResponse> {
      return (message.type === 'DRAFT_CONTROL' ? control(message, sender) : serial(() => dispatch(message, sender))).catch((error: unknown): DraftResponse => ({
        ok: false, error: error instanceof Error ? error.message : '草稿操作失败',
      }))
    },
    tabClosed(tabId: number): Promise<void> { return serial(() => interruptJobs(tabId)) },
    browserRestarted(): Promise<void> { return serial(() => interruptJobs()) },
  }
}
