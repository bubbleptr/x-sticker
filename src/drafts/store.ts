import type { DraftRepository } from './service'
import type { DraftJob } from './types'

const JOBS_KEY = 'stickerDraftJobs'
const DATABASE_NAME = 'x-sticker-drafts'
const ASSETS_STORE = 'assets'

export function createDraftRepository(): DraftRepository {
  async function database(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, 1)
      request.onupgradeneeded = () => { request.result.createObjectStore(ASSETS_STORE) }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('无法打开贴图素材库'))
      request.onblocked = () => reject(new Error('贴图素材库正被其他页面占用，请关闭旧扩展页面后重试'))
    })
  }

  return {
    async listJobs() {
      const result = await chrome.storage.local.get(JOBS_KEY)
      return (result[JOBS_KEY] ?? []) as DraftJob[]
    },
    async saveJobs(jobs) {
      await chrome.storage.local.set({ [JOBS_KEY]: jobs })
    },
    async saveAsset(id, blob) {
      const db = await database()
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(ASSETS_STORE, 'readwrite')
          transaction.objectStore(ASSETS_STORE).put(blob, id)
          transaction.oncomplete = () => resolve()
          transaction.onerror = () => reject(transaction.error ?? new Error('保存贴图素材失败'))
          transaction.onabort = () => reject(transaction.error ?? new Error('保存贴图素材已中断'))
        })
      } finally {
        db.close()
      }
    },
    async getAsset(id) {
      const db = await database()
      try {
        return await new Promise<Blob | undefined>((resolve, reject) => {
          const request = db.transaction(ASSETS_STORE, 'readonly').objectStore(ASSETS_STORE).get(id)
          request.onsuccess = () => resolve(request.result as Blob | undefined)
          request.onerror = () => reject(request.error ?? new Error('读取贴图素材失败'))
        })
      } finally {
        db.close()
      }
    },
  }
}
