import { decodeImageAsset, validateImageAssets, type ImageAsset } from '../media'
import { isVisible, waitForValue } from './dom'
import { fingerprintImage, fingerprintSourceImage } from './image'
import type { DraftEditor, PlatformAdapter } from './platform'
import type { DraftJob, DraftUpdate } from './types'

export interface DraftRunOptions {
  document?: Document
  signal?: AbortSignal
  timeout?: number
  now?: () => number
}

export type DraftReporter = (update: DraftUpdate) => void | Promise<void>

function normalizeText(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').replace(/[\u200b\ufeff]/g, '')
}

function readBody(element: HTMLElement): string {
  const blocks = new Set(['P', 'DIV', 'LI'])
  function read(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
    if (!(node instanceof Element)) return ''
    if (node.hasAttribute('data-slate-zero-width') || node.classList.contains('ProseMirror-trailingBreak')) return ''
    if (node.tagName === 'BR') return '\n'
    if (node.childNodes.length === 1 && node.firstChild instanceof Element && node.firstChild.tagName === 'BR') return ''
    let result = ''
    let previousBlock = false
    Array.from(node.childNodes).forEach((child, index) => {
      const block = child instanceof Element && blocks.has(child.tagName)
      if (index > 0 && (block || previousBlock)) result += '\n'
      result += read(child)
      previousBlock = block
    })
    return result
  }
  return normalizeText(read(element))
}

function imagesReady(editor: DraftEditor, count: number): boolean {
  return editor.imageCount === count && editor.images.length === count && editor.images.every((image) =>
    image.isConnected && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0,
  )
}

function pendingContent(editor: DraftEditor, job: DraftJob): string | null {
  if (!imagesReady(editor, job.assets.length)) return `全部 ${job.assets.length} 张图片`
  if (normalizeText(editor.title.value) !== normalizeText(job.title)) return '完整标题'
  if (editor.titleEcho !== undefined && (editor.titleEcho === null || normalizeText(editor.titleEcho) !== normalizeText(job.title))) return '平台标题预览'
  if (readBody(editor.body) !== normalizeText(job.body)) return '完整正文'
  const expectedBodyLength = job.body.replace(/\r\n?/g, '\n').length
  if (editor.bodyLength !== undefined && editor.bodyLength !== expectedBodyLength) {
    return `正文计数（当前 ${editor.bodyLength ?? '未识别'}，应为 ${expectedBodyLength}）`
  }
  return null
}

export async function runDraft(
  job: DraftJob,
  images: ImageAsset[],
  adapter: PlatformAdapter,
  report: DraftReporter,
  options: DraftRunOptions = {},
): Promise<DraftUpdate> {
  const root = options.document ?? document
  const controller = new AbortController()
  const signal = controller.signal
  const stopFromOutside = () => controller.abort(options.signal?.reason ?? new Error('自动操作已停止'))
  if (options.signal?.aborted) stopFromOutside()
  else options.signal?.addEventListener('abort', stopFromOutside, { once: true })
  let writing = false
  const manualInput = (event: Event) => {
    if (event.isTrusted && !writing) {
      controller.abort(new Error('检测到你正在操作页面，自动操作已暂停，当前内容已保留'))
    }
  }
  const inputEvents = ['beforeinput', 'input', 'keydown', 'pointerdown']
  inputEvents.forEach((type) => root.addEventListener(type, manualInput, true))
  let step = job.step
  let account = job.account
  let imageHashes = job.imageHashes
  let blocker: DraftUpdate['blocker']
  const checkExistingDraft = () => {
    if (!adapter.hasExistingDraft()) return
    if (job.platform === 'douyin' && job.step === 'opening' && !imageHashes) {
      // This check only runs before assigning the FileList, including after its checkpoint is persisted.
      step = 'opening'
      blocker = 'existing_draft'
      throw new Error('抖音有上次未发布的图文，本次贴图尚未上传。请先处理旧稿，再返回 X 重新同步到抖音。')
    }
    throw new Error('页面已有未发布内容，已暂停以保留原草稿')
  }
  const checkPage = () => {
    signal.throwIfAborted()
    if (step !== 'opening') adapter.dismissGuide()
    const challenge = Array.from(root.querySelectorAll('iframe[src*="captcha"], [id*="captcha"], [class*="captcha"]')).find(isVisible)
    if (challenge) throw new Error('页面需要安全验证，请手动完成后检查并继续')
    const dialog = Array.from(root.querySelectorAll('[role="dialog"], [aria-modal="true"]')).find((element) =>
      isVisible(element) && !element.textContent?.includes('你还有上次未发布的图文，是否继续编辑？'),
    )
    if (dialog) throw new Error('页面出现提示窗口，请手动处理后检查并继续')
  }
  const pageChanges = new MutationObserver(() => {
    try { checkAccount(false) } catch (error) { controller.abort(error) }
  })
  pageChanges.observe(root.documentElement, { childList: true, subtree: true, attributes: true, characterData: true })
  const checkAccount = (required = true) => {
    checkPage()
    const current = adapter.getAccount()
    if (account && current && current !== account) throw new Error('当前账号已经变化，已暂停，请手动核对')
    if (!current && required) throw new Error('无法确认当前账号，请登录后检查并继续')
    if (!account && current) account = current
  }
  const publish = async (update: DraftUpdate) => {
    if (update.status !== 'needs_attention') signal.throwIfAborted()
    const next = { ...update, imageHashes: update.imageHashes ?? imageHashes }
    await report(next)
    step = next.step
    imageHashes = next.imageHashes
    return next
  }
  try {
    validateImageAssets(images)
    if (images.length !== job.assets.length || images.some((image, index) =>
      image.filename !== job.assets[index]!.filename || image.mimeType !== job.assets[index]!.mimeType,
    )) throw new Error('草稿源图片与任务记录不一致，请手动核对')
    const sourceHashes: string[] = []
    for (const image of images) {
      signal.throwIfAborted()
      sourceHashes.push(await fingerprintSourceImage(image, root))
    }
    if (imageHashes && (imageHashes.length !== sourceHashes.length || imageHashes.some((hash, index) => hash !== sourceHashes[index]))) {
      throw new Error('源图片与已有核对记录不一致，请手动核对草稿')
    }
    const verifyImages = async (editor: DraftEditor) => {
      if (!imagesReady(editor, images.length)) throw new Error('草稿图片数量或加载状态不符，请手动核对')
      const imageSources = editor.images.map((image) => ({ src: image.src, currentSrc: image.currentSrc }))
      for (const [index, image] of editor.images.entries()) {
        if (await fingerprintImage(image) !== sourceHashes[index]) {
          throw new Error(`第 ${index + 1} 张图片与源图不一致或平台仅提供缩略图，无法自动确认内容和顺序，请手动核对草稿`)
        }
        checkAccount()
      }
      const current = adapter.getEditor()
      if (!current || !imagesReady(current, images.length) || current.images.some((image, index) =>
        image !== editor.images[index] || image.src !== imageSources[index]!.src || image.currentSrc !== imageSources[index]!.currentSrc,
      )) throw new Error('核对过程中图片或顺序发生变化，请手动检查草稿')
    }
    checkAccount(false)
    await publish({ status: 'running', step, account, message: '正在检查创作者中心' })
    if (step === 'opening') {
      const input = await waitForValue(() => {
        checkExistingDraft()
        if (adapter.getEditor()) throw new Error('页面已有未发布内容，已暂停以保留原草稿')
        return adapter.getUploadInput()
      }, '图片上传控件', options.timeout, signal)
      checkAccount(job.platform === 'xiaohongshu')
      if (input.files?.length) throw new Error('上传控件已有图片，请手动接手')
      await publish({ status: 'running', step: 'uploading', account, message: '正在上传贴图' })
      checkAccount(job.platform === 'xiaohongshu')
      checkExistingDraft()
      if (adapter.getEditor() || adapter.getUploadInput() !== input || input.files?.length) {
        throw new Error('上传页面内容已经变化，已暂停以保留当前内容')
      }
      const transfer = new DataTransfer()
      for (const image of images) {
        transfer.items.add(new File([Uint8Array.from(decodeImageAsset(image))], image.filename, { type: image.mimeType }))
      }
      input.files = transfer.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    if (step === 'uploading') {
      const uploaded = await waitForValue(() => {
        const editor = adapter.getEditor()
        if (editor && editor.imageCount > images.length) throw new Error('草稿图片数量与本次图片不一致，请手动核对后继续')
        return editor && imagesReady(editor, images.length) ? editor : null
      }, '已上传的全部图片（不会重复上传）', options.timeout, signal)
      checkAccount()
      await verifyImages(uploaded)
      checkAccount()
      await publish({ status: 'running', step: 'filling', imageHashes: sourceHashes, account, message: '正在填写标题和正文' })
    }
    if (!imageHashes) throw new Error('缺少本次图片的核对记录，请手动检查草稿')
    const waitForContent = (saved: boolean) => {
      let pending = '贴图内容'
      return waitForValue(() => {
        const editor = adapter.getEditor()
        if (!editor) return null
        const missing = pendingContent(editor, job)
        if (!missing) return editor
        pending = missing
        return null
      }, () => `${saved ? '已保存的' : '平台确认的'}${pending}`, options.timeout, signal)
    }
    if (step !== 'saving' && step !== 'verifying') {
      const editor = await waitForValue(() => {
        const current = adapter.getEditor()
        if (current && current.imageCount > images.length) throw new Error('草稿图片数量与本次图片不一致，请手动核对后继续')
        return current && imagesReady(current, images.length) ? current : null
      }, '全部图片编辑器', options.timeout, signal)
      checkAccount()
      if (editor.imageCount !== images.length) throw new Error('草稿图片数量与本次图片不一致，请手动核对后继续')
      await verifyImages(editor)
      const title = normalizeText(editor.title.value)
      const body = readBody(editor.body)
      if ((title && title !== normalizeText(job.title)) || (body && body !== normalizeText(job.body))) {
        throw new Error('编辑器含有其他内容，已暂停以保留你的草稿')
      }
      writing = true
      if (!title) {
        editor.title.focus()
        editor.title.setSelectionRange(0, editor.title.value.length)
        if (!root.execCommand?.('insertText', false, job.title)) throw new Error('标题输入框不支持自动填写，请手动接手')
        editor.title.blur()
      }
      if (!body && job.body) {
        if (adapter.fillBody) adapter.fillBody(editor.body, job.body)
        else {
          editor.body.focus()
          const range = root.createRange()
          range.selectNodeContents(editor.body)
          const selection = root.getSelection()
          selection?.removeAllRanges()
          selection?.addRange(range)
          if (!root.execCommand?.('insertText', false, job.body)) throw new Error('正文编辑器不支持自动填写，请手动接手')
        }
      }
      writing = false
      await waitForContent(false)
      checkAccount()
      await publish({ status: 'running', step: 'saving', account, message: '正在保存草稿' })
      const readyToSave = await waitForContent(false)
      await verifyImages(readyToSave)
      checkAccount()
      await adapter.saveDraft(signal)
    }
    checkAccount(false)
    await publish({ status: 'running', step: 'verifying', account, message: '正在重新打开草稿核对' })
    signal.throwIfAborted()
    await adapter.reopenDraft(job, signal)
    const reopened = await waitForContent(true)
    await verifyImages(reopened)
    checkAccount()
    return await publish({
      status: 'saved', step: 'verifying', account, message: '草稿已保存并核对，请由你手动发布',
      evidence: { title: job.title, body: job.body, imageCount: images.length, imageHashes, storage: adapter.storage, verifiedAt: (options.now ?? Date.now)() },
    })
  } catch (error) {
    return await publish({ status: 'needs_attention', step, account, blocker, message: error instanceof Error ? error.message : '自动操作已暂停，请手动接手' })
  } finally {
    pageChanges.disconnect()
    inputEvents.forEach((type) => root.removeEventListener(type, manualInput, true))
    options.signal?.removeEventListener('abort', stopFromOutside)
  }
}
