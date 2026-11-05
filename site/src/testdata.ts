// The hand-written data set of site/fixtures/data, served the way the site serves
// ./data/: for the tests of the pieces that load data.
import { options } from 'preact'

const modules = import.meta.glob('../fixtures/data/**/*.json', { eager: true, import: 'default' })

/** A JSON document of the fixtures, by its path under data/, such as "meta.json". */
export function fixture<T>(rel: string): T {
  const doc = modules[`../fixtures/data/${rel}`]
  if (doc === undefined) throw new Error(`no fixture ${rel}`)
  return doc as T
}

/**
 * A stand-in for fetch that answers ./data/<rel> from the fixtures (200) or
 * with a 404. `docs` replaces or adds documents, by path under data/.
 */
export function fixtureFetch(docs: Record<string, unknown> = {}): (input: string) => Promise<Response> {
  return async (input) => {
    const rel = input.replace(/^\.\/data\//, '')
    const path = rel
      .split('/')
      .map((seg) => decodeURIComponent(seg))
      .join('/')
    let doc: unknown
    if (path in docs) doc = docs[path]
    else if (`../fixtures/data/${path}` in modules) doc = fixture(path)
    else return new Response('not found', { status: 404 })
    return new Response(JSON.stringify(doc), { status: 200, headers: { 'content-type': 'application/json' } })
  }
}

/**
 * Have Preact run the effects it leaves for after the paint (the key handlers,
 * the listeners) as soon as the render is done, so that a test that has waited
 * for the DOM has them too. Returns what undoes it.
 */
export function runEffectsAtOnce(): () => void {
  const before = options.requestAnimationFrame
  options.requestAnimationFrame = (callback) => queueMicrotask(callback)
  return () => {
    options.requestAnimationFrame = before
  }
}
