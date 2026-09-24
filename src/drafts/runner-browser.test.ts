import { existsSync } from 'node:fs'
import { chromium, type Browser } from 'playwright-core'
import { createServer } from 'vite'
import { expect, it } from 'vitest'
import type { DraftJob, DraftUpdate } from './types'

it.each([
  { name: 'verifies matching pixels through upload, native rich-text editing, save and reopen', replaceImage: false, status: 'saved' },
  { name: 'refuses to verify a reopened draft with the same text but different pixels', replaceImage: true, status: 'needs_attention' },
])('$name', async ({ replaceImage, status }) => {
  const server = await createServer({
    configFile: false, server: { host: '127.0.0.1', port: 0 }, logLevel: 'silent',
    plugins: [{ name: 'draft-runner-browser-test', configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url !== '/draft-runner-browser-test') return next()
        response.setHeader('Content-Type', 'text/html; charset=utf-8')
        response.end('<!doctype html><html lang="zh-CN"><title>Local draft integration fixture</title><body><div class="user-info"><span class="name-box">本地测试账号</span></div><main id="fixture"></main></body></html>')
      })
    } }],
  })
  await server.listen()
  const executablePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome'].find((path) => path && existsSync(path))
  let browser: Browser | undefined
  try {
    browser = await chromium.launch({ executablePath, headless: true })
    const page = await browser.newPage()
    await page.goto(`${server.resolvedUrls!.local[0]}draft-runner-browser-test`)
    await page.evaluate(`(async () => {
      window.draftRunnerModule = await import('/src/drafts/runner.ts')
      window.draftAdapterModule = await import('/src/drafts/xiaohongshu.ts')
    })()`)
    const result = await page.evaluate(async (replaceImage) => {
      const fixtureWindow = window as typeof window & {
        draftRunnerModule: typeof import('./runner')
        draftAdapterModule: typeof import('./xiaohongshu')
      }
      const { runDraft } = fixtureWindow.draftRunnerModule
      const { createXiaohongshuAdapter } = fixtureWindow.draftAdapterModule
      const fixture = document.getElementById('fixture')!
      const testClosedShadowMap = new WeakMap<HTMLElement, ShadowRoot>()
      const imageUrls: string[] = []
      const uploads: { filename: string; mime: string; byteLength: number }[] = []
      const titleInputs: string[] = []
      const bodyInputs: { trusted: boolean; inputType: string }[] = []
      const updates: DraftUpdate[] = []
      let saveClicks = 0
      let publishClicks = 0
      let reopenClicks = 0
      let savedHtml = ''
      let savedTitle = ''
      const job: DraftJob = {
        id: 'browser-job', assetId: 'browser-image', platform: 'xiaohongshu',
        title: '浏览器原生草稿测试', body: '第一段  保留两个空格\n\n第二段 👩‍💻\n第三段',
        sourceUrl: 'https://x.com/example/status/1', filename: 'local-card.png',
        status: 'running', step: 'opening', message: '', createdAt: 1, updatedAt: 1,
      }

      async function makePng(color: string): Promise<Blob> {
        const canvas = document.createElement('canvas')
        canvas.width = 32
        canvas.height = 48
        const context = canvas.getContext('2d')!
        context.fillStyle = color
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.fillStyle = '#ffffff'
        context.fillRect(4, 7, 19, 13)
        return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG fixture generation failed')), 'image/png'))
      }
      const original = await makePng('#0f766e')
      const replacement = await makePng('#b91c1c')
      const bytes = Array.from(new Uint8Array(await original.arrayBuffer()))

      function mountEditor(blob: Blob, titleValue = '', bodyHtml = '<p><br></p>'): void {
        const container = document.createElement('section')
        container.className = 'publish-page-content'
        const title = document.createElement('input')
        title.placeholder = '填写标题会有更多赞哦'
        title.value = titleValue
        title.addEventListener('input', () => { titleInputs.push(title.value) })
        const body = document.createElement('div')
        body.className = 'tiptap ProseMirror'
        body.contentEditable = 'true'
        body.style.whiteSpace = 'pre-wrap'
        body.innerHTML = bodyHtml
        body.addEventListener('input', (event) => { bodyInputs.push({ trusted: event.isTrusted, inputType: (event as InputEvent).inputType }) })
        const image = document.createElement('img')
        image.className = 'img preview'
        image.src = URL.createObjectURL(blob)
        imageUrls.push(image.src)
        const controls = document.createElement('xhs-publish-btn')
        controls.setAttribute('is-save-draft', 'true')
        controls.setAttribute('save-text', '暂存离开')
        controls.setAttribute('save-disabled', 'false')
        const shadow = controls.attachShadow({ mode: 'closed' })
        testClosedShadowMap.set(controls, shadow)
        const save = document.createElement('button')
        save.textContent = '暂存离开'
        const publish = document.createElement('button')
        publish.textContent = '发布'
        publish.addEventListener('click', () => { publishClicks++ })
        save.addEventListener('click', () => {
          saveClicks++
          savedTitle = title.value
          savedHtml = body.innerHTML
          const list = document.createElement('div')
          list.className = 'draft-list'
          const card = document.createElement('div')
          card.className = 'draft-item'
          const label = document.createElement('span')
          label.className = 'draft-title-text'
          label.textContent = savedTitle
          const edit = document.createElement('button')
          edit.className = 'btn'
          edit.textContent = '编辑'
          edit.addEventListener('click', () => {
            reopenClicks++
            mountEditor(replaceImage ? replacement : new Blob([blob], { type: 'image/png' }), savedTitle, savedHtml)
          })
          card.append(label, edit)
          list.append(card)
          fixture.replaceChildren(list)
        })
        shadow.append(save, publish)
        container.append(title, body, image, controls)
        fixture.replaceChildren(container)
      }

      const upload = document.createElement('input')
      upload.type = 'file'
      upload.accept = 'image/png'
      upload.className = 'upload-input'
      upload.addEventListener('change', () => {
        const file = upload.files?.[0]
        if (!file) throw new Error('Native FileList did not receive the PNG')
        uploads.push({ filename: file.name, mime: file.type, byteLength: file.size })
        mountEditor(file)
      })
      fixture.append(upload)
      const adapter = createXiaohongshuAdapter(document, (host) => testClosedShadowMap.get(host) ?? null)
      const outcome = await runDraft(job, bytes, adapter, (update) => { updates.push(update) }, { timeout: 1500, now: () => 100 })
      return {
        outcome, updates, uploads, sourceByteLength: bytes.length, titleInputs, bodyInputs,
        saveClicks, publishClicks, reopenClicks, savedHtml, savedTitle, imageUrls,
        finalTitle: adapter.getEditor()?.title.value,
        finalBody: adapter.getEditor()?.body.innerText,
      }
    }, replaceImage)
    expect(result.uploads).toEqual([{ filename: 'local-card.png', mime: 'image/png', byteLength: result.sourceByteLength }])
    expect(result.titleInputs).toEqual(['浏览器原生草稿测试'])
    expect(result.bodyInputs.some((event) => event.trusted && event.inputType === 'insertText')).toBe(true)
    expect(result.saveClicks).toBe(1)
    expect(result.reopenClicks).toBe(1)
    expect(result.publishClicks).toBe(0)
    expect(result.imageUrls).toHaveLength(2)
    expect(result.imageUrls[0]).not.toBe(result.imageUrls[1])
    expect(result.savedHtml).toContain('👩‍💻')
    expect(result.finalTitle).toBe('浏览器原生草稿测试')
    expect(result.outcome.status, JSON.stringify({ outcome: result.outcome, savedHtml: result.savedHtml, finalBody: result.finalBody })).toBe(status)
    if (replaceImage) {
      expect(result.updates.some((update) => update.status === 'saved')).toBe(false)
      expect(result.outcome.evidence).toBeUndefined()
      expect(result.outcome.message).toMatch(/图片.*不一致/)
    } else {
      expect(result.outcome.evidence).toMatchObject({ title: '浏览器原生草稿测试', body: '第一段  保留两个空格\n\n第二段 👩‍💻\n第三段', imageCount: 1, storage: 'browser', verifiedAt: 100 })
    }
  } finally {
    await browser?.close()
    await server.close()
  }
}, 30_000)
