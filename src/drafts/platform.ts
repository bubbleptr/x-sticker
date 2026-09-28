import type { DraftJob } from './types'

export interface DraftEditor {
  title: HTMLInputElement
  titleEcho?: string | null
  body: HTMLElement
  bodyLength?: number | null
  imageCount: number
  images: HTMLImageElement[]
}

export interface PlatformAdapter {
  storage: 'browser' | 'account' | 'unknown'
  /**
   * 'source': the editor shows the uploaded pixels unchanged.
   * 'platform': the editor re-encodes uploads, so the first uploaded rendering becomes the identity.
   */
  imageIdentity: 'source' | 'platform'
  getAccount(): string | null
  getUploadInput(): HTMLInputElement | null
  getEditor(): DraftEditor | null
  hasExistingDraft(): boolean
  dismissGuide(): void
  fillBody?(body: HTMLElement, text: string): void
  saveDraft(signal?: AbortSignal): Promise<void>
  reopenDraft(job: DraftJob, signal?: AbortSignal): Promise<void>
}
