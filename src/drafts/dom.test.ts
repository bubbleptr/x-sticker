// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { clickSaveDraft, findSaveDraftButton, waitForValue } from './dom'

describe('creator page actions', () => {
  it('refuses a publish action even when it also says save', () => {
    const button = document.createElement('button')
    button.textContent = '保存并发布'
    const click = vi.fn()
    button.addEventListener('click', click)
    document.body.append(button)
    expect(() => clickSaveDraft(button)).toThrow(/草稿/)
    expect(click).not.toHaveBeenCalled()
  })

  it('stops when a dialog and editor both offer a draft action', () => {
    const editor = document.createElement('section')
    editor.innerHTML = '<button>保存草稿</button><div role="dialog"><button>保存草稿</button></div>'
    document.body.append(editor)
    expect(() => findSaveDraftButton(editor)).toThrow(/多个/)
  })

  it('waits for the editor to appear after an upload finishes', async () => {
    const host = document.createElement('section')
    document.body.append(host)
    const pending = waitForValue(() => host.querySelector('input'), '编辑器', 100)
    const input = document.createElement('input')
    host.append(input)
    expect(await pending).toBe(input)
  })

  it('cancels a pending page wait when the user stops automation', async () => {
    const controller = new AbortController()
    const pending = waitForValue(() => null, '编辑器', 100, controller.signal)
    controller.abort()
    await expect(pending).rejects.toHaveProperty('name', 'AbortError')
  })
})
