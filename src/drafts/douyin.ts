import { clickSaveDraft, findSaveDraftButton, isVisible, waitForValue } from './dom'
import type { DraftEditor, PlatformAdapter } from './platform'

const RESUME_PROMPT = '你还有上次未发布的图文，是否继续编辑？'
const IMAGE_EXTENSION = /^\.(?:png|jpe?g|webp|gif|bmp|heic|heif|avif)$/i

function unique<T extends Element>(matches: T[], label: string): T | null {
  if (matches.length > 1) throw new Error(`抖音页面出现多个${label}，请手动接手`)
  return matches[0] ?? null
}

function hasClassPrefix(element: Element, prefix: string): boolean {
  return Array.from(element.classList).some((name) => name.startsWith(prefix))
}

export function createDouyinAdapter(root: Document = document): PlatformAdapter {
  function visible<T extends Element>(selector: string): T[] {
    return Array.from(root.querySelectorAll<T>(selector)).filter(isVisible)
  }

  function hasExistingDraft(): boolean {
    return visible<HTMLElement>('span, p, div').some((element) => {
      if (!element.textContent?.includes(RESUME_PROMPT)) return false
      return !Array.from(element.children).some((child) => child.textContent?.includes(RESUME_PROMPT))
    })
  }

  function getEditor(): DraftEditor | null {
    const title = unique(visible<HTMLInputElement>('input[placeholder="添加作品标题"]'), '标题输入框')
    const body = unique(visible<HTMLElement>('[contenteditable="true"][data-slate-editor="true"]'), '正文编辑框')
    if (!title || !body) return null
    const images = visible<HTMLImageElement>('img').filter((image) => image.parentElement && hasClassPrefix(image.parentElement, 'img-'))
    const imageCount = images.length
    const image = imageCount === 1 && images[0]!.complete && images[0]!.naturalWidth > 0 ? images[0]! : null
    const declaredCounts = new Set(visible<HTMLElement>('span, p, div').flatMap((element) => {
      const match = element.textContent?.trim().match(/^已添加\s*(\d+)\s*张图片$/)
      return match ? [Number(match[1])] : []
    }))
    if (declaredCounts.size > 1) throw new Error('抖音图片数量提示不一致，请手动接手')
    if (declaredCounts.size && !declaredCounts.has(imageCount)) return null
    const toolbar = body.closest('.editor-kit-root-container')?.querySelector('.toolbar')
    const counters = Array.from(toolbar?.querySelectorAll('div, span') ?? []).filter((element) =>
      element.children.length === 0 && isVisible(element) && /^\s*\d+\s*\/\s*1000\s*$/.test(element.textContent ?? ''),
    )
    const counter = unique(counters, '正文计数')
    const bodyLength = counter ? Number(counter.textContent!.split('/')[0]!.trim()) : null
    return { title, body, bodyLength, imageCount, image }
  }

  return {
    storage: 'unknown',
    getAccount() {
      const names = visible<HTMLElement>('span[class]').filter((element) => hasClassPrefix(element, 'user-name-') && !hasClassPrefix(element, 'user-name-container-'))
      return unique(names, '账号标识')?.textContent?.trim() || null
    },
    getUploadInput() {
      const inputs = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="file"]')).filter((input) => {
        const accepted = input.accept.split(',').map((type) => type.trim()).filter(Boolean)
        // Native file inputs may be hidden behind the visible upload surface.
        return !input.disabled && accepted.length > 0 && accepted.every((type) => /^image\//i.test(type) || IMAGE_EXTENSION.test(type))
      })
      return unique(inputs, '图片上传控件')
    },
    getEditor,
    hasExistingDraft,
    dismissGuide() {},
    fillBody(body, text) {
      const leaf = unique(Array.from(body.querySelectorAll('[data-string="true"]')).filter(isVisible), '正文输入位置')
      const node = leaf?.firstChild
      if (!node || node.nodeType !== Node.TEXT_NODE || node.textContent?.replace(/[\u200b\ufeff]/g, '')) {
        throw new Error('无法确认抖音的空白正文输入位置，请手动接手')
      }
      body.focus()
      // Keep editor-kit's line/leaf structure and let its paste handler update the model.
      const range = root.createRange()
      range.setStart(node, 0)
      range.collapse(true)
      const selection = root.getSelection()
      if (!selection) throw new Error('无法定位抖音正文光标，请手动接手')
      selection.removeAllRanges()
      selection.addRange(range)
      const clipboardData = new DataTransfer()
      clipboardData.setData('text/plain', text)
      body.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }))
    },
    async saveDraft(signal) {
      const button = await waitForValue(() => findSaveDraftButton(root), '抖音暂存离开按钮', undefined, signal)
      if (button.textContent?.replace(/\s+/g, '') !== '暂存离开') {
        throw new Error('未找到已验证的抖音暂存离开按钮，请手动接手')
      }
      signal?.throwIfAborted()
      clickSaveDraft(button)
    },
    async reopenDraft(_job, signal) {
      await waitForValue(() => hasExistingDraft() || null, '抖音未发布草稿提示', undefined, signal)
      const resume = await waitForValue(() => unique(
        visible<HTMLElement>('span, button, [role="button"]').filter((element) => element.textContent?.trim() === '继续编辑'),
        '继续编辑控件',
      ), '抖音继续编辑入口', undefined, signal)
      signal?.throwIfAborted()
      resume.click()
      await waitForValue(getEditor, '重新打开的抖音草稿', undefined, signal)
    },
  }
}
