import { Collector } from "../esnext/index.js"
import { ok } from "assert"

{
  const collector = new Collector()

  async function watch() {
    for await (const values of collector) {
      console.log({ values })
    }
  }

  async function producer() {
    collector.add(1)
    collector.add(2)
    await wait()
    collector.add(3)
    await wait()
    collector.add(4)
    collector.add(5)
    collector.close()
  }

  await Promise.all([watch(), producer()])
}

/**
* Logs
* { values: [1, 2] }
* { values: [3] }
* { values: [4, 5] }
*/

{
  const collector = new Collector()

  async function watch() {
    const iterator = collector[Symbol.asyncIterator]()
    const nextPromise = iterator.next()
    await wait(2)
    // By now our collector has been closed and we should be done
    const result = await nextPromise
    console.log({ result })
    ok(result.done)
  }

  async function producer() {
    await wait()
    collector.close()
  }

  await Promise.all([watch(), producer()])
}

/**
 * Logs
 * { result: { done: true, value: undefined } }
 */

{
  const collector = new Collector({
    queueMicrotask: callback => setTimeout(callback, 5)
  })

  async function watch() {
    const iterator = collector[Symbol.asyncIterator]()
    async function withValue() {
      const nextPromise = iterator.next()
      await wait(2)
      // By now our collector has been closed and we should be done
      const result = await nextPromise
      console.log({ result })
      ok(!result.done)
      ok(Array.isArray(result.value) && result.value[0] === 1)
    }
    async function withoutValue() {
      const nextPromise = iterator.next()
      await wait(2)
      // By now our collector has been closed and we should be done
      const result = await nextPromise
      console.log({ result })
      ok(result.done)
    }
    await withValue()
    await withoutValue()
  }

  async function producer() {
    collector.add(1)
    collector.close()
  }

  await Promise.all([watch(), producer()])
}

/**
 * Logs
 * { result: { done: false, value: [ 1 ] } }
 * { result: { done: true, value: undefined } }
 */

async function wait(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function deferred() {
  let resolve,
    reject
  const promise = new Promise(
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
