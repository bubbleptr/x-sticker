import { existsSync } from 'node:fs'
import { chromium, type Browser } from 'playwright-core'
import { createServer } from 'vite'
import { expect, it } from 'vitest'
import type { DraftJob, DraftUpdate } from './types'

it.each([
  { name: 'saves and reopens a Douyin description accepted by the editor model', rejectPaste: false, missingCounter: false },
  { name: 'does not save Douyin when visible text was not accepted by the editor model', rejectPaste: true, missingCounter: false },
  { name: 'does not save Douyin when the platform no longer exposes description acceptance', rejectPaste: false, missingCounter: true },
])('$name', async ({ rejectPaste, missingCounter }) => {
  const server = await createServer({
    configFile: false, server: { host: '127.0.0.1', port: 0 }, logLevel: 'silent',
    plugins: [{ name: 'douyin-browser-contract-test', configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url !== '/douyin-browser-contract-test') return next()
        response.setHeader('Content-Type', 'text/html; charset=utf-8')
        response.end('<!doctype html><html lang="zh-CN"><title>Douyin editor contract fixture</title><body><span class="user-name-fixture">本地测试账号</span><main id="fixture"></main></body></html>')
      })
    } }],
  })
  await server.listen()
  const executablePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome'].find((path) => path && existsSync(path))
  let browser: Browser | undefined
  try {
    browser = await chromium.launch({ executablePath, headless: true })
    const page = await browser.newPage()
    await page.goto(`${server.resolvedUrls!.local[0]}douyin-browser-contract-test`)
    await page.evaluate(`(async () => {
      window.draftRunnerModule = await import('/src/drafts/runner.ts')
      window.draftAdapterModule = await import('/src/drafts/douyin.ts')
    })()`)
    const result = await page.evaluate(async ({ rejectPaste, missingCounter }) => {
      const fixtureWindow = window as typeof window & {
        draftRunnerModule: typeof import('./runner')
        draftAdapterModule: typeof import('./douyin')
      }
      const { runDraft } = fixtureWindow.draftRunnerModule
      const { createDouyinAdapter } = fixtureWindow.draftAdapterModule
      const fixture = document.getElementById('fixture')!
      const updates: DraftUpdate[] = []
      const uploads: { filename: string; mime: string; byteLength: number }[] = []
      const pastedTexts: string[] = []
      const bodyInputs: string[] = []
      let saveClicks = 0
      let reopenClicks = 0
      let publishClicks = 0
      let savedTitle = ''
      let savedBody = ''
      let savedBeforeModelSync = false
      const job: DraftJob = {
        id: 'douyin-browser-job', assetId: 'douyin-browser-image', platform: 'douyin',
        title: '正文保存测试', body: '第一段  保留两个空格\n\n第二段 👩‍💻\n第三段',
        sourceUrl: 'https://x.com/example/status/1', filename: 'local-card.png',
        status: 'running', step: 'opening', message: '', createdAt: 1, updatedAt: 1,
      }
      const canvas = document.createElement('canvas')
      canvas.width = 32
      canvas.height = 48
      const context = canvas.getContext('2d')!
      context.fillStyle = '#0f766e'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = '#ffffff'
      context.fillRect(4, 7, 19, 13)
      const original = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG fixture generation failed')), 'image/png'))
      const bytes = Array.from(new Uint8Array(await original.arrayBuffer()))

      function mountEditor(blob: Blob, titleValue = '', bodyValue = ''): void {
        const container = document.createElement('section')
        const title = document.createElement('input')
        title.placeholder = '添加作品标题'
        title.value = titleValue
        const richEditor = document.createElement('div')
        richEditor.className = 'editor-kit-root-container'
        const body = document.createElement('div')
        body.className = 'editor-kit-container'
        body.contentEditable = 'true'
        body.dataset.slateEditor = 'true'
        body.style.whiteSpace = 'pre-wrap'
        const toolbar = document.createElement('div')
        toolbar.className = 'toolbar'
        const count = document.createElement('div')
        toolbar.append(count)
        richEditor.append(body)
        if (!missingCounter) richEditor.append(toolbar)
        let bodyModel = bodyValue
        function renderBody(): void {
          const lines = bodyModel.split('\n').map((text) => {
            const line = document.createElement('div')
            line.className = 'ace-line'
            line.dataset.node = 'true'
            const wrapper = document.createElement('div')
            wrapper.dataset.lineWrapper = 'true'
            const leaf = document.createElement('span')
            leaf.dataset.leaf = 'true'
            const string = document.createElement('span')
            string.dataset.string = 'true'
            if (!text) string.dataset.enter = 'true'
            string.textContent = text || '\u200b'
            leaf.append(string)
            wrapper.append(leaf)
            line.append(wrapper)
            return line
          })
          body.replaceChildren(...lines)
          count.textContent = `${bodyModel.length} / 1000`
        }
        renderBody()
        // This fixture models the observed platform contract, not the editor-kit implementation.
        // Native DOM input alone is not persistence; only the paste handler commits its model.
        body.addEventListener('input', (event) => { bodyInputs.push((event as InputEvent).inputType) })
        body.addEventListener('paste', (event) => {
          event.preventDefault()
          const text = event.clipboardData?.getData('text/plain') ?? ''
          pastedTexts.push(text)
          // Text can appear before acceptance; the toolbar confirms model commitment.
          body.textContent = text
          if (rejectPaste) return
          requestAnimationFrame(() => {
            bodyModel = text
            renderBody()
          })
        })
        const imageContainer = document.createElement('div')
        imageContainer.className = 'img-fixture'
        const image = document.createElement('img')
        image.src = URL.createObjectURL(blob)
        imageContainer.append(image)
        const imageCount = document.createElement('div')
        imageCount.textContent = '已添加 1 张图片'
        const save = document.createElement('button')
        save.textContent = '暂存离开'
        const publish = document.createElement('button')
        publish.textContent = '发布'
        publish.addEventListener('click', () => { publishClicks++ })
        save.addEventListener('click', () => {
          saveClicks++
          savedBeforeModelSync ||= bodyModel !== job.body
          savedTitle = title.value
          savedBody = bodyModel
          const prompt = document.createElement('p')
          prompt.textContent = '你还有上次未发布的图文，是否继续编辑？'
          const resume = document.createElement('button')
          resume.textContent = '继续编辑'
          resume.addEventListener('click', () => {
            reopenClicks++
            mountEditor(new Blob([blob], { type: 'image/png' }), savedTitle, savedBody)
          })
          fixture.replaceChildren(prompt, resume)
        })
        container.append(title, richEditor, imageContainer, imageCount, save, publish)
        fixture.replaceChildren(container)
      }

      const upload = document.createElement('input')
      upload.type = 'file'
      upload.accept = 'image/png'
      upload.addEventListener('change', () => {
        const file = upload.files?.[0]
        if (!file) throw new Error('Native FileList did not receive the PNG')
        uploads.push({ filename: file.name, mime: file.type, byteLength: file.size })
        mountEditor(file)
      })
      fixture.append(upload)
      const adapter = createDouyinAdapter(document)
      const outcome = await runDraft(job, bytes, adapter, (update) => { updates.push(update) }, { timeout: 1200, now: () => 100 })
      return {
        outcome, updates, uploads, sourceByteLength: bytes.length, bodyInputs, pastedTexts,
        saveClicks, reopenClicks, publishClicks, savedTitle, savedBody, savedBeforeModelSync,
        expectedTitle: job.title, expectedBody: job.body, finalBody: adapter.getEditor()?.body.innerText,
      }
    }, { rejectPaste, missingCounter })
    expect(result.uploads).toEqual([{ filename: 'local-card.png', mime: 'image/png', byteLength: result.sourceByteLength }])
    expect(result.publishClicks).toBe(0)
    if (rejectPaste || missingCounter) {
      expect(result.saveClicks, JSON.stringify(result)).toBe(0)
      expect(result.reopenClicks).toBe(0)
      expect(result.outcome.status).toBe('needs_attention')
      expect(result.outcome.step).toBe('filling')
      expect(result.outcome.evidence).toBeUndefined()
      expect(result.updates.some((update) => update.status === 'saved')).toBe(false)
    } else {
      expect(result.savedBody, JSON.stringify(result)).toBe(result.expectedBody)
      expect(result.savedBeforeModelSync).toBe(false)
      expect(result.saveClicks).toBe(1)
      expect(result.reopenClicks).toBe(1)
      expect(result.savedTitle).toBe(result.expectedTitle)
      expect(result.outcome.status, JSON.stringify(result)).toBe('saved')
      expect(result.outcome.evidence).toMatchObject({ title: result.expectedTitle, body: result.expectedBody, imageCount: 1, storage: 'unknown', verifiedAt: 100 })
    }
  } finally {
    await browser?.close()
    await server.close()
  }
}, 30_000)
