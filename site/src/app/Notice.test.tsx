import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataError } from '../data'
import { Notice } from './Notice'

const containers: HTMLElement[] = []

function show(error: DataError, onReload?: () => void): HTMLElement {
  const container = document.createElement('div')
  document.body.append(container)
  containers.push(container)
  render(<Notice error={error} onReload={onReload} />, container)
  return container
}

afterEach(() => {
  for (const container of containers.splice(0)) {
    render(null, container)
    container.remove()
  }
})

describe('Notice', () => {
  it('asks for a reload when the data format is not the one the page reads', () => {
    const el = show(new DataError('format'))
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('資料已更新，請重新整理')
    expect(el.querySelector('button')?.textContent).toBe('重新整理')
  })

  it('asks for a reload when a file is gone', () => {
    const el = show(new DataError('missing'))
    expect(el.textContent).toContain('資料已更新，請重新整理')
  })

  it('says that the data could not be loaded when the network failed', () => {
    const el = show(new DataError('network'))
    expect(el.textContent).toContain('資料載入失敗')
    expect(el.textContent).not.toContain('資料已更新')
    expect(el.querySelector('button')).not.toBeNull()
  })

  it('reloads the page from the button', () => {
    const reload = vi.fn()
    const el = show(new DataError('format'), reload)
    act(() => el.querySelector('button')?.click())
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
