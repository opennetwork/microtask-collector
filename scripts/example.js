import { Collector } from "../esnext/index.js"
import { ok } from "assert"

async function example() {
  const collector = new Collector({
    map: values => Object.freeze(values)
  })

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

  async function wait(ms = 0) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  await Promise.all([watch(), producer()])
}

await example()
  .catch(console.error)

/**
* Logs
* { values: [1, 2] }
* { values: [3] }
* { values: [4, 5] }
*/

async function closingExample() {
  const collector = new Collector({
    map: values => Object.freeze(values)
  })

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

  async function wait(ms = 0) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  await Promise.all([watch(), producer()])
}

await closingExample()
  .catch(console.error)

/**
 * Logs
 * { result: { done: true, value: undefined } }
 */
