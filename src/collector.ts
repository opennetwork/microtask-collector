
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

class InternalAbortError extends Error {

}

function noop() {

}

export class Collector<T, O> implements AsyncIterable<O> {

  #active = true
  #values: T[] = []
  #resolve: (value: O) => void | undefined = undefined
  #promise: Promise<O> | undefined = undefined
  #nextPromise: WeakMap<Promise<O>, Promise<O>> = new WeakMap()
  #rejection = deferred<O>()
  #finalPromise: Promise<O> | undefined = undefined

  readonly #map: CollectorMapFn<T, O>
  readonly queueMicrotask: typeof defaultQueueMicrotask
  readonly #iterators: BasicSet = new Set()

  constructor(options: CollectorOptions<T, O>) {
    this.#map = options.map
    this.queueMicrotask = options.queueMicrotask || defaultQueueMicrotask

    // Catch early so if there is no iterators being utilised the process won't crash!
    this.#rejection.promise.catch(noop)
  }

  add(value: T) {
    if (!this.#active) return
    if (!this.#iterators.size) return // Do not add if there is nothing waiting on results
    this.#values.push(value)
    if (!this.#resolve) return // Resolve has been scheduled or invoked, and now we are in next batch
    const resolve = this.#resolve
    this.#resolve = undefined
    this.queueMicrotask(() => {
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
    this.#rejection.reject(new InternalAbortError())
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

          // Pass on the rejection to our individual promise
          // If our promise is already resolved then this will have no effect
          this.#rejection.promise.catch(defer.reject)

          if (lastPromise) {
            this.#nextPromise.set(lastPromise, this.#promise)
          }
          promise = this.#promise
        }
        while (promise) {
          lastPromise = promise
          try {
            yield /* Its important to await here so we locally catch */ await lastPromise
          } catch (error) {
            if (!this.#active && isInternalAbortError(error)) {
              break
            } else {
              yield Promise.reject(error)
            }
          }
          promise = this.#nextPromise.get(lastPromise)
        }
      } while (this.#active)

    } finally {
      this.#iterators.delete(id)

      if (!this.#iterators.size) {
        this.#promise = undefined
        this.#resolve = undefined
      }

      if (this.#values.length) {
        // If we have some values, we closed before we hit a microtask!
        // values can be only added if this.#active was true..
        //
        // If `options.queueMicrotask` takes shorter amount of time then `rejection.promise.catch` then
        // we are good to go, but if it takes longer, then this case comes into play

        const defer = deferred<O>()
        defer.resolve(this.#map(this.#values))
        this.#finalPromise = defer.promise
        this.#values = []
      }

      if (this.#finalPromise) {
        yield this.#finalPromise
      }

    }

  }


}

function isInternalAbortError(error: unknown) {
  if (error instanceof InternalAbortError) {
    return true
  }
  if (error instanceof AggregateError) {
    for (const aggregateError of error.errors) {
      if (isInternalAbortError(aggregateError)) {
        return true
      }
    }
  }
  return false
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
