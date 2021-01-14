
export interface CollectorMapFn<T, O> {
  (input: T[]): O
}

export function defaultQueueMicrotask(fn: () => void): void {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(fn)
  } else if (typeof setImmediate === "function") {
    setImmediate(fn)
  } else {
    setTimeout(fn, 0)
  }
}

export interface CollectorOptions<T, O> {
  map: CollectorMapFn<T, O>
  queueMicrotask?(fn: () => void): void
}

interface BasicSet {
  add(value: object): void
  size: number
  delete(value: object): void
  clear(): void
}

export class Collector<T, O> implements AsyncIterable<O> {

  #active = true
  #values: T[] = []
  #resolve: (value: O) => void | undefined = undefined
  #promise: Promise<O> | undefined = undefined
  #nextPromise: WeakMap<Promise<O>, Promise<O>> = new WeakMap()

  readonly #map: CollectorMapFn<T, O>
  readonly #queueMicrotask: typeof defaultQueueMicrotask
  readonly #iterators: BasicSet = new Set()

  constructor(options: CollectorOptions<T, O>) {
    this.#map = options.map
    this.#queueMicrotask = options.queueMicrotask || defaultQueueMicrotask
  }

  add(value: T) {
    if (!this.#active) return
    if (!this.#iterators.size) return // Do not add if there is nothing waiting on results
    this.#values.push(value)
    if (!this.#resolve) return // Resolve has been scheduled or invoked, and now we are in next batch
    const resolve = this.#resolve
    this.#resolve = undefined
    this.#queueMicrotask(() => {
      const current = this.#values
      // Start again
      this.#values = []
      this.#promise = undefined
      resolve(this.#map(current))
    })
  }

  close() {
    this.#active = false
    this.#iterators.clear()
  }

  async *[Symbol.asyncIterator](): AsyncIterator<O> {
    if (!this.#active) return
    const id = {}
    this.#iterators.add(id)
    let promise: Promise<O> | undefined = undefined,
      lastPromise: typeof promise
    try {
      do {
        if (!promise && !this.#promise) {
          const defer = deferred<O>()
          this.#promise = defer.promise
          this.#resolve = defer.resolve
          if (lastPromise) {
            this.#nextPromise.set(lastPromise, this.#promise)
          }
          promise = this.#promise
        }
        while (promise) {
          lastPromise = promise
          yield lastPromise
          promise = this.#nextPromise.get(lastPromise)
        }
      } while (this.#active)
    } finally {
      this.#iterators.delete(id)
      if (!this.#iterators.size) {
        this.#values = []
        this.#promise = undefined
        this.#resolve = undefined
      }
    }
  }


}


interface Deferred<T = void> {
  resolve(value: T): void
  reject(reason: unknown): void
  promise: Promise<T>
}

function deferred<T = void>(): Deferred<T> {
  let resolve: Deferred<T>["resolve"] | undefined = undefined,
    reject: Deferred<T>["reject"] | undefined = undefined
  const promise = new Promise<T>(
    (resolveFn, rejectFn) => {
      resolve = resolveFn
      reject = rejectFn
    }
  )
  ok(resolve)
  ok(reject)
  return {
    resolve,
    reject,
    promise
  }
}

function ok(value: unknown): asserts value {
  if (!value) {
    throw new Error("Value not provided")
  }
}
