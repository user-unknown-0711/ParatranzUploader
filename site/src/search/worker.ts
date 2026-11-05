// The Web Worker of the full-text search: it takes a query from the page and
// answers it. The matching is in engine.ts.
import { SearchEngine, type Query, type WorkerMessage } from './engine'

const engine = new SearchEngine()

self.addEventListener('message', (event: MessageEvent<Query>) => {
  const post = (message: WorkerMessage) => self.postMessage(message)
  void engine.run(event.data, post).then(post)
})
