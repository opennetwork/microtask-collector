# Microtask Collector

Creates a collection of values from the current microtask

-------------

## Example

```js
import { Collector } from "microtask-collector"

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

async function wait(ms = 0) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

await Promise.all([watch(), producer()])
```

The above example will log:

```
{ values: [1, 2] }
{ values: [3] }
{ values: [4, 5] }
```

-------------

# `options.queueMicrotask`

By default `queueMicrotask` will be used to determine microtasks, however the `queueMicrotask` option can be provided as a function which accepts a single callback. 

For example:

```js
import { Collector } from "microtask-collector"

const collector = new Collector({
    queueMicrotask: callback => setTimeout(callback, 0)
})
```

If `queueMicrotask` is not available from the global scope then `setImmediate` will be used, or `setTimeout` with `0` as the timeout argument.

-------------

## `Collector.prototype.add(value)`

Invoked with a value associated to the current microtask

-------------

## `Collector.prototype.close()`

This should be invoked when the collector is no longer going to produce new values. This allows associated async iterators to finalise. 
