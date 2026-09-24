import { clickSaveDraft, findSaveDraftButton, isVisible, waitForValue } from './dom'
import type { PlatformAdapter } from './platform'

type ShadowReader = (host: HTMLElement) => ShadowRoot | null

export function createXiaohongshuAdapter(
  root: Document = document,
  readShadow: ShadowReader = (host) => chrome.dom.openOrClosedShadowRoot(host),
): PlatformAdapter {
  const unique = <T extends HTMLElement>(selector: string, label: string): T | null => {
    const found = Array.from(root.querySelectorAll<T>(selector)).filter(isVisible)
    if (found.length > 1) throw new Error(`${label}不唯一，请手动接手`)
    return found[0] ?? null
  }
  const getEditor: PlatformAdapter['getEditor'] = () => {
    const title = unique<HTMLInputElement>('input[placeholder="填写标题会有更多赞哦"]', '标题输入框')
    const body = unique<HTMLElement>('.tiptap.ProseMirror[contenteditable="true"]', '正文编辑器')
    if (!title || !body) return null
    const container = title.closest('.publish-page-content')
    if (!container?.contains(body)) throw new Error('无法确认当前图文编辑区域，请手动接手')
    const images = Array.from(container.querySelectorAll<HTMLImageElement>('img.img.preview')).filter((image) =>
      isVisible(image) && !!(image.currentSrc || image.getAttribute('src')),
    )
    const titleEcho = unique<HTMLElement>('.publish-page-preview .image-preview .title', '笔记标题预览')?.textContent ?? null
    return { title, body, imageCount: images.length, images, titleEcho }
  }
  return {
    storage: 'browser',
    getAccount: () => unique<HTMLElement>('.user-info .name-box', '账号')?.textContent?.trim() || null,
    getEditor,
    getUploadInput: () => {
      const inputs = root.querySelectorAll<HTMLInputElement>('input.upload-input[type="file"]')
      if (inputs.length > 1) throw new Error('图片上传入口不唯一，请手动接手')
      return inputs[0] ?? null
    },
    hasExistingDraft: () => getEditor() !== null,
    dismissGuide: () => {
      const close = unique<HTMLButtonElement>('button[aria-label="关闭新功能引导"]', '引导关闭按钮')
      close?.click()
    },
    saveDraft: async (signal) => {
      const host = unique<HTMLElement>('xhs-publish-btn', '草稿操作区')
      if (!host || host.getAttribute('is-save-draft') !== 'true' ||
          host.getAttribute('save-text') !== '暂存离开' || host.getAttribute('save-disabled') !== 'false') {
        throw new Error('未找到可用的小红书草稿保存操作，请手动接手')
      }
      const shadow = readShadow(host)
      const save = shadow && findSaveDraftButton(shadow)
      if (!save) throw new Error('无法读取小红书草稿按钮，请手动接手')
      signal?.throwIfAborted()
      clickSaveDraft(save)
    },
    reopenDraft: async (job, signal) => {
      await waitForValue(() => unique<HTMLElement>('.draft-list', '草稿列表'), '小红书草稿列表', undefined, signal)
      const cards = Array.from(root.querySelectorAll<HTMLElement>('.draft-item')).filter((card) =>
        isVisible(card) && card.querySelector('.draft-title-text')?.textContent?.trim() === job.title.trim(),
      )
      if (cards.length > 1) throw new Error('存在同名草稿，无法确认本次内容，请手动核对')
      if (cards.length !== 1) throw new Error('草稿列表中未找到本次内容，请手动核对')
      const edit = Array.from(cards[0]!.querySelectorAll<HTMLElement>('.btn'))
        .filter((element) => isVisible(element) && element.textContent?.trim() === '编辑')
      if (edit.length !== 1) throw new Error('草稿编辑入口不唯一，请手动核对')
      signal?.throwIfAborted()
      edit[0]!.click()
      await waitForValue(getEditor, '已保存的图文编辑器', undefined, signal)
    },
  }
}
