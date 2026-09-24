/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDouyinAdapter } from './douyin'
import type { DraftJob } from './types'

const job: DraftJob = {
  id: 'dy-1', assets: [{ id: 'asset-1', filename: 'sticker.png', mimeType: 'image/png' }], platform: 'douyin', title: '草稿标题', body: '草稿正文',
  sourceUrl: 'https://x.com/example/status/1', createdAt: 1, updatedAt: 1,
  status: 'running', step: 'verifying', message: '',
}
const editor = `
  <span class="user-name-container-hash"><span class="user-name-hash">@Kieran的AI笔记</span></span>
  <input placeholder="添加作品标题" value="草稿标题" />
  <div contenteditable="true" data-slate-editor="true">草稿正文</div>
  <div class="image-list"><p>已添加1张图片</p><div class="img-hash"><img src="photo.png" /></div></div>
  <button id="save">暂存离开</button><button id="publish">发布</button>
`
const resumePrompt = `
  <div><span>你还有上次未发布的图文，是否继续编辑？</span>
    <span class="hint-text-hash continue-hash" id="continue">继续编辑</span>
    <span id="discard">放弃</span>
  </div>
`

beforeEach(() => { document.body.innerHTML = '' })

describe('Douyin adapter', () => {
  it('preserves all visible image slots in order without counting mirrors, avatars or empty placeholders', () => {
    document.body.innerHTML = editor.replace('已添加1张图片', '已添加2张图片').replace('<img src="photo.png" />', '<img id="cover" src="cover.png" />') +
      '<img src="avatar.jpg"><div hidden class="img-mirror"><img src="cover.png"></div>' +
      '<div class="img-placeholder"><img></div><div class="img-photo"><img id="photo" src="photo.jpg"></div>'
    const current = createDouyinAdapter().getEditor()!
    expect(current.imageCount).toBe(2)
    expect(current.images.map((image) => image.id)).toEqual(['cover', 'photo'])
  })

  it('detects an unpublished draft before upload and does not click continue or discard', () => {
    document.body.innerHTML = `<input type="file" accept="image/jpeg,image/png" />${resumePrompt}`
    const click = vi.fn()
    document.body.addEventListener('click', click, { once: true })
    const adapter = createDouyinAdapter(document)
    expect(adapter.hasExistingDraft()).toBe(true)
    expect(click).not.toHaveBeenCalled()
    document.querySelector<HTMLElement>('#continue')!.parentElement!.hidden = true
    expect(adapter.hasExistingDraft()).toBe(false)
  })

  it('accepts only one image uploader, including a hidden native file input, and rejects ambiguous uploaders', () => {
    document.body.innerHTML = '<input type="file" accept="video/*" /><input id="photo" type="file" accept=".jpg,.jpeg,.png" hidden />'
    const adapter = createDouyinAdapter(document)
    expect(adapter.getUploadInput()?.id).toBe('photo')
    document.body.insertAdjacentHTML('beforeend', '<input type="file" accept="image/*" />')
    expect(() => adapter.getUploadInput()).toThrow(/多个|唯一/)
  })

  it('reads the uploaded editor and image count, and waits when the declared image count disagrees', () => {
    document.body.innerHTML = editor
    const adapter = createDouyinAdapter(document)
    expect(adapter.getAccount()).toBe('@Kieran的AI笔记')
    expect(adapter.getEditor()).toMatchObject({ title: document.querySelector('input'), body: document.querySelector('[data-slate-editor]'), imageCount: 1 })
    document.querySelector('p')!.textContent = '已添加2张图片'
    expect(adapter.getEditor()).toBeNull()
  })

  it('returns visible image slots even while decoding so the runner can await every image', () => {
    document.body.innerHTML = editor + '<div class="img-hidden" hidden><img id="hidden-photo" src="old.png" /></div>'
    const photo = document.querySelector<HTMLImageElement>('.image-list img')!
    const hiddenPhoto = document.querySelector<HTMLImageElement>('#hidden-photo')!
    Object.defineProperties(hiddenPhoto, { complete: { value: true }, naturalWidth: { value: 200 } })
    Object.defineProperties(photo, { complete: { value: true, configurable: true }, naturalWidth: { value: 0, configurable: true } })
    const adapter = createDouyinAdapter(document)
    expect(adapter.getEditor()?.imageCount).toBe(1)
    expect(adapter.getEditor()?.images).toEqual([photo])
    Object.defineProperties(photo, { complete: { value: false, configurable: true }, naturalWidth: { value: 200, configurable: true } })
    expect(adapter.getEditor()?.images).toEqual([photo])
    Object.defineProperty(photo, 'complete', { value: true })
    expect(adapter.getEditor()?.images).toEqual([photo])
  })

  it('stops when the title or Slate editor is ambiguous instead of choosing a field', () => {
    document.body.innerHTML = editor + '<input placeholder="添加作品标题" />'
    expect(() => createDouyinAdapter(document).getEditor()).toThrow(/多个|唯一/)
    document.body.innerHTML = editor + '<div contenteditable="true" data-slate-editor="true"></div>'
    expect(() => createDouyinAdapter(document).getEditor()).toThrow(/多个|唯一/)
  })

  it('saves using the explicit draft button and never touches publish', async () => {
    document.body.innerHTML = editor
    const save = vi.fn()
    const publish = vi.fn()
    document.querySelector('#save')!.addEventListener('click', save)
    document.querySelector('#publish')!.addEventListener('click', publish)
    await createDouyinAdapter(document).saveDraft()
    expect(save).toHaveBeenCalledOnce()
    expect(publish).not.toHaveBeenCalled()
    document.body.insertAdjacentHTML('beforeend', '<button>暂存离开</button>')
    await expect(createDouyinAdapter(document).saveDraft()).rejects.toThrow(/多个/)
    expect(save).toHaveBeenCalledOnce()
  })

  it('reopens only through the unpublished-draft prompt and waits for its editor', async () => {
    document.body.innerHTML = resumePrompt
    const discard = vi.fn()
    document.querySelector('#discard')!.addEventListener('click', discard)
    document.querySelector('#continue')!.addEventListener('click', () => { document.body.innerHTML = editor })
    const adapter = createDouyinAdapter(document)
    await adapter.reopenDraft(job)
    expect(adapter.getEditor()?.title.value).toBe(job.title)
    expect(discard).not.toHaveBeenCalled()
    expect(adapter.storage).toBe('unknown')
  })

  it('does not click continue when the task is aborted after finding the draft prompt', async () => {
    document.body.innerHTML = resumePrompt
    const controller = new AbortController()
    const click = vi.fn(() => { document.body.innerHTML = editor })
    document.querySelector('#continue')!.addEventListener('click', click)
    const reopening = createDouyinAdapter(document).reopenDraft(job, controller.signal)
    controller.abort(new Error('任务已停止'))
    await expect(reopening).rejects.toThrow('任务已停止')
    expect(click).not.toHaveBeenCalled()
  })

  it('does not reopen when multiple continue controls are present', async () => {
    document.body.innerHTML = resumePrompt + '<span class="hint-text-other continue-other">继续编辑</span>'
    const click = vi.fn()
    document.querySelector('#continue')!.addEventListener('click', click)
    await expect(createDouyinAdapter(document).reopenDraft(job)).rejects.toThrow(/多个|唯一/)
    expect(click).not.toHaveBeenCalled()
  })
})
