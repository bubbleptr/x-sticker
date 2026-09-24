import { isVisible, waitForValue } from './dom'
import { fingerprintImage } from './image'
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

function imageReady(editor: DraftEditor): boolean {
  return editor.imageCount === 1 && !!editor.image?.isConnected && editor.image.complete && editor.image.naturalWidth > 0 && editor.image.naturalHeight > 0
}

function matches(editor: DraftEditor, job: DraftJob): boolean {
  return imageReady(editor) && normalizeText(editor.title.value) === normalizeText(job.title) && readBody(editor.body) === normalizeText(job.body)
}

export async function runDraft(
  job: DraftJob,
  bytes: number[],
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
    if (event.isTrusted && !writing && !event.composedPath().some((node) => node instanceof Element && node.id === 'x-sticker-draft-panel')) {
      controller.abort(new Error('检测到你正在操作页面，自动操作已暂停，当前内容已保留'))
    }
  }
  const inputEvents = ['beforeinput', 'input', 'keydown', 'pointerdown']
  inputEvents.forEach((type) => root.addEventListener(type, manualInput, true))
  let step = job.step
  let account = job.account
  let imageHash = job.imageHash
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
    const next = { ...update, imageHash: update.imageHash ?? imageHash }
    await report(next)
    step = next.step
    imageHash = next.imageHash
    return next
  }
  try {
    checkAccount(false)
    await publish({ status: 'running', step, account, message: '正在检查创作者中心' })
    if (step === 'opening') {
      const input = await waitForValue(() => {
        if (adapter.hasExistingDraft() || adapter.getEditor()) throw new Error('页面已有未发布内容，已暂停以保留原草稿')
        return adapter.getUploadInput()
      }, '图片上传控件', options.timeout, signal)
      checkAccount(job.platform === 'xiaohongshu')
      if (input.files?.length) throw new Error('上传控件已有图片，请手动接手')
      await publish({ status: 'running', step: 'uploading', account, message: '正在上传贴图' })
      checkAccount(job.platform === 'xiaohongshu')
      if (adapter.hasExistingDraft() || adapter.getEditor() || adapter.getUploadInput() !== input || input.files?.length) {
        throw new Error('上传页面内容已经变化，已暂停以保留当前内容')
      }
      const transfer = new DataTransfer()
      transfer.items.add(new File([Uint8Array.from(bytes)], job.filename, { type: 'image/png' }))
      input.files = transfer.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    if (step === 'uploading') {
      const uploaded = await waitForValue(() => {
        const editor = adapter.getEditor()
        if (editor && editor.imageCount > 1) throw new Error('图片数量不是一张，请手动核对后继续')
        return editor && imageReady(editor) ? editor : null
      }, '已上传的单张图片（不会重复上传）', options.timeout, signal)
      checkAccount()
      const uploadedHash = await fingerprintImage(uploaded.image)
      if (imageHash && uploadedHash !== imageHash) throw new Error('图片与本次贴图不一致，请手动核对')
      checkAccount()
      await publish({ status: 'running', step: 'filling', imageHash: uploadedHash, account, message: '正在填写标题和正文' })
    }
    if (!imageHash) throw new Error('缺少本次图片的核对记录，请手动检查草稿')
    const verifyImage = async (editor: DraftEditor) => {
      if (await fingerprintImage(editor.image) !== imageHash) throw new Error('草稿图片与本次贴图不一致，请手动核对')
      checkAccount()
    }
    if (step !== 'saving' && step !== 'verifying') {
      const editor = await waitForValue(() => {
        const current = adapter.getEditor()
        if (current && current.imageCount > 1) throw new Error('图片数量不是一张，请手动核对后继续')
        return current && imageReady(current) ? current : null
      }, '单图编辑器', options.timeout, signal)
      checkAccount()
      if (editor.imageCount !== 1) throw new Error('图片数量不是一张，请手动核对后继续')
      await verifyImage(editor)
      const title = normalizeText(editor.title.value)
      const body = readBody(editor.body)
      if ((title && title !== normalizeText(job.title)) || (body && body !== normalizeText(job.body))) {
        throw new Error('编辑器含有其他内容，已暂停以保留你的草稿')
      }
      writing = true
      if (!title) {
        const titleSetter = Object.getOwnPropertyDescriptor(root.defaultView!.HTMLInputElement.prototype, 'value')?.set
        if (!titleSetter) throw new Error('无法填写标题，请手动接手')
        titleSetter.call(editor.title, job.title)
        editor.title.dispatchEvent(new Event('input', { bubbles: true }))
        editor.title.dispatchEvent(new Event('change', { bubbles: true }))
      }
      if (!body && job.body) {
        editor.body.focus()
        const range = root.createRange()
        range.selectNodeContents(editor.body)
        const selection = root.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
        if (!root.execCommand?.('insertText', false, job.body)) throw new Error('正文编辑器不支持自动填写，请手动接手')
      }
      writing = false
      const filled = await waitForValue(() => { const current = adapter.getEditor(); return current && matches(current, job) ? current : null }, '完整贴图内容', options.timeout, signal)
      await verifyImage(filled)
      checkAccount()
      await publish({ status: 'running', step: 'saving', account, message: '正在保存草稿' })
      checkAccount()
      await adapter.saveDraft(signal)
    }
    checkAccount(false)
    await publish({ status: 'running', step: 'verifying', account, message: '正在重新打开草稿核对' })
    signal.throwIfAborted()
    await adapter.reopenDraft(job, signal)
    const reopened = await waitForValue(() => { const current = adapter.getEditor(); return current && matches(current, job) ? current : null }, '已保存的贴图内容', options.timeout, signal)
    await verifyImage(reopened)
    checkAccount()
    return await publish({
      status: 'saved', step: 'verifying', account, message: '草稿已保存并核对，请由你手动发布',
      evidence: { title: job.title, body: job.body, imageCount: 1, imageHash, storage: adapter.storage, verifiedAt: (options.now ?? Date.now)() },
    })
  } catch (error) {
    return await publish({ status: 'needs_attention', step, account, message: error instanceof Error ? error.message : '自动操作已暂停，请手动接手' })
  } finally {
    pageChanges.disconnect()
    inputEvents.forEach((type) => root.removeEventListener(type, manualInput, true))
    options.signal?.removeEventListener('abort', stopFromOutside)
  }
}
