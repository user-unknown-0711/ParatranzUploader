// A stand-in for the search worker that runs the real engine in the page, for
// the tests of the pieces that search: a query goes through the same messages
// and the same data as in a browser, with no Worker needed.
import type { SearchWorker } from './client'
import { SearchEngine, type Query, type WorkerMessage } from './engine'

export class InProcessWorker implements SearchWorker {
  onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  private readonly engine = new SearchEngine()

  postMessage(message: Query): void {
    // a copy, as a message to a real worker is
    const post = (data: WorkerMessage) => this.onmessage?.({ data } as MessageEvent<WorkerMessage>)
    void this.engine.run(structuredClone(message), post).then(post)
  }
}
