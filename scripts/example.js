import { Collector } from "../esnext/index.js"

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

  async function wait(ms = 1) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  await Promise.all([watch(), producer()])
}

await example()

/**
* Logs 
* { values: [1, 2] }
* { values: [3] }
* { values: [4, 5] }
*/