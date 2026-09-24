import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import { expect, it } from 'vitest'

it('retains PNG bytes and task metadata after the background page is recreated', async () => {
  const server = await createServer({
    configFile: false, server: { host: '127.0.0.1', port: 0 }, logLevel: 'silent',
    plugins: [{ name: 'draft-storage-test', configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url !== '/draft-storage-test') return next()
        response.setHeader('Content-Type', 'text/html')
        response.end('<!doctype html><title>Draft storage test</title>')
      })
    } }],
  })
  await server.listen()
  const executablePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome'].find((path) => path && existsSync(path))
  const browser = await chromium.launch({ executablePath, headless: true })
  try {
    const page = await browser.newPage()
    await page.goto(`${server.resolvedUrls!.local[0]}draft-storage-test`)
    await page.addInitScript(() => {
      Object.defineProperty(window, 'chrome', { configurable: true, value: {
        storage: { local: {
          get: async (key: string) => ({ [key]: JSON.parse(localStorage.getItem(key) ?? 'null') }),
          set: async (data: Record<string, unknown>) => { for (const [key, value] of Object.entries(data)) localStorage.setItem(key, JSON.stringify(value)) },
        } },
      } })
    })
    await page.reload()
    await page.evaluate(`(async () => {
      const moduleUrl = '/src/drafts/store.ts'
      const { createDraftRepository } = await import(moduleUrl)
      const repository = createDraftRepository()
      await repository.saveAsset('image-1', new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }))
      await repository.saveJobs([{ id: 'job-1', assetId: 'image-1', filename: 'old-card.png', imageHash: 'a'.repeat(64), title: '跨重载草稿', platform: 'xiaohongshu', status: 'running', step: 'uploading' }, { id: 'saved-job', assetId: 'image-1', filename: 'old-card.png', imageHash: 'a'.repeat(64), status: 'saved', step: 'verifying', evidence: { title: '旧任务标题', body: '旧正文', imageCount: 1, imageHash: 'a'.repeat(64), storage: 'browser', verifiedAt: 123 } }])
    })()`)
    await page.reload()
    const restored = await page.evaluate(`(async () => {
      const moduleUrl = '/src/drafts/store.ts'
      const { createDraftRepository } = await import(moduleUrl)
      const repository = createDraftRepository()
      const asset = await repository.getAsset('image-1')
      return { jobs: await repository.listJobs(), bytes: [...new Uint8Array(await asset.arrayBuffer())], mime: asset.type, missing: await repository.getAsset('missing') }
    })()`)
    expect(restored).toMatchObject({ jobs: [{ id: 'job-1', title: '跨重载草稿', status: 'running', step: 'uploading', assets: [{ id: 'image-1', filename: 'old-card.png', mimeType: 'image/png' }], imageHashes: ['a'.repeat(64)] }, { id: 'saved-job', status: 'saved', step: 'verifying', assets: [{ id: 'image-1', filename: 'old-card.png', mimeType: 'image/png' }], imageHashes: ['a'.repeat(64)], evidence: { title: '旧任务标题', body: '旧正文', imageCount: 1, imageHashes: ['a'.repeat(64)], storage: 'browser', verifiedAt: 123 } }], bytes: [137, 80, 78, 71], mime: 'image/png' })
    expect(restored).toHaveProperty('missing', undefined)
  } finally {
    await browser.close()
    await server.close()
  }
}, 30_000)
