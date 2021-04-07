import {deferred} from "./deferred";
import {WeakLinkedList} from "@opennetwork/linked-list";

export function defaultQueueMicrotask(fn: () => void): void {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(fn)
  } else if (typeof setImmediate === "function") {
    setImmediate(fn)
  } else {
    setTimeout(fn, 0)
  }
}

export interface CollectorOptions {
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

export class Collector<T> implements AsyncIterable<T[]> {

  #active = true
  #resolve: () => void | undefined = undefined
  #promise: Promise<void> | undefined = undefined
  #rejection = deferred()

  readonly #values = new WeakLinkedList<T>()

  readonly queueMicrotask: typeof defaultQueueMicrotask

  #pointer: object = {}

  get size() {
    return this.#values.get(this.#pointer) ? 1 : 0;
  }

  constructor(options: CollectorOptions = {}) {
    this.queueMicrotask = options.queueMicrotask || defaultQueueMicrotask

    // Catch early so if there is no iterators being utilised the process won't crash!
    this.#rejection.promise.catch(noop)
  }

  add(value: T) {
    if (!this.#active) return
    const pointer = this.#pointer;
    const node = this.#values.get(pointer);
    if (node) {
      const next: object = {};
      this.#values.insert(pointer, next, value);
      this.#pointer = next;
    } else {
      this.#values.insert(undefined, pointer, value);
    }
    this.#queueResolve();
  }

  #constructPromise = () => {
    const defer = deferred()
    this.#promise = defer.promise
    this.#resolve = defer.resolve
    // Pass on the rejection to our individual promise
    // If our promise is already resolved then this will have no effect
    this.#rejection.promise.catch(defer.reject)
  }

  #queueResolve = () => {
    if (!this.#resolve) {
      this.#constructPromise();
    }
    const resolve = this.#resolve
    const promise = this.#promise
    this.#resolve = undefined
    this.queueMicrotask(() => {
      if (this.#promise === promise) {
        this.#promise = undefined
      }
      resolve();
    })
  };

  close() {
    this.#active = false
    this.#rejection.reject(new InternalAbortError())
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T[]> {
    if (!this.#active) return
    const values = this.#values;
    let pointer = this.#pointer;
    let promise: Promise<void> | undefined = undefined,
      yielded = new WeakSet<object>();
    try {
      do {
        let yielding;
        while ((yielding = compile()).length) {
          yield yielding;
        }
        if (!this.#promise) {
          this.#constructPromise();
        }
        promise = this.#promise
        try {
          // Its important to await here so we locally catch
          // Once the promise has resolved we will hit our eager loop and yield the
          // available values
          await promise;
        } catch (error) {
          if (!this.#active && isInternalAbortError(error)) {
            break
          } else {
            yield Promise.reject(error)
          }
        }
      } while (this.#active)

    } finally {
      const remaining = compile();
      if (remaining.length) {
        yield remaining;
      }
    }

    /**
     * Will compile an array of all values not yet yielded
     * All values returned will not be returned again by this iterator
     */
    function compile() {
      const array: T[] = [];
      let node = values.get(pointer);
      while(node = values.get(pointer)) {
        if (!yielded.has(pointer)) {
          array.push(node.value);
          yielded.add(pointer);
        }
        if (!node.next) {
          break;
        }
        pointer = node.next;
      }
      return array;
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

