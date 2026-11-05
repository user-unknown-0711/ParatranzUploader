import { afterEach, describe, expect, it, vi } from 'vitest'
import { fixtureFetch } from '../testdata'
import type { Query, WorkerMessage } from './engine'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('worker.ts', () => {
  it('posts that it begins to match, then the reply, for a query of the page', async () => {
    let onMessage: ((event: MessageEvent<Query>) => void) | undefined
    const posted: WorkerMessage[] = []
    vi.stubGlobal('self', {
      addEventListener: (type: string, listener: (event: MessageEvent<Query>) => void) => {
        if (type === 'message') onMessage = listener
      },
      postMessage: (message: WorkerMessage) => posted.push(message),
    })
    const base = new URL('data/', document.baseURI).href
    const fixtures = fixtureFetch()
    vi.stubGlobal('fetch', vi.fn((url: string) => fixtures(`./data/${url.slice(base.length)}`)))
    await import('./worker')
    expect(onMessage).toBeDefined()

    onMessage?.({ data: { id: 9, q: '燒傷', lang: 'zh', re: false, base } } as MessageEvent<Query>)
    await vi.waitFor(() => expect(posted).toHaveLength(2))
    expect(posted[0]).toEqual({ id: 9, matching: true })
    expect(posted[1]).toMatchObject({ id: 9, total: 1 })
  })
})
