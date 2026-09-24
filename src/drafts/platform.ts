import type { DraftJob } from './types'

export interface DraftEditor {
  title: HTMLInputElement
  titleEcho?: string | null
  body: HTMLElement
  bodyLength?: number | null
  imageCount: number
  image: HTMLImageElement | null
}

export interface PlatformAdapter {
  storage: 'browser' | 'account' | 'unknown'
  getAccount(): string | null
  getUploadInput(): HTMLInputElement | null
  getEditor(): DraftEditor | null
  hasExistingDraft(): boolean
  dismissGuide(): void
  fillBody?(body: HTMLElement, text: string): void
  saveDraft(signal?: AbortSignal): Promise<void>
  reopenDraft(job: DraftJob, signal?: AbortSignal): Promise<void>
}
