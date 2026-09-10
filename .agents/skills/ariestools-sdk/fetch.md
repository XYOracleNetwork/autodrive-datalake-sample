# Fetch and HTTP

Source: `@ariestools/sdk/fetch` (also re-exported from `@ariestools/sdk`).

## Defaults

Helpers such as `fetchJson`, `fetchCompress`, `FetchClient`, and `fetchJsonClient` are **runtime-neutral**. They do not bundle an HTTP stack or cache.

Resolution order for the underlying fetch implementation:

1. Per-request `fetcher` option  
2. `fetcher` on a `FetchClient` instance  
3. `globalThis.fetch` from the host runtime  

Browsers supply their own HTTP cache. Node's built-in fetch does **not** enable a response cache by default.

## Common usage

```ts
import { fetchJson, FetchClient } from '@ariestools/sdk/fetch'

const data = await fetchJson<MyDto>('https://api.example.com/item')

const client = new FetchClient({ baseURL: 'https://api.example.com' })
await client.get('/item')
```

Method helpers include `fetchJsonGet`, `fetchJsonPost`, `fetchJsonPut`, `fetchJsonPatch`, `fetchJsonDelete`.

Errors are modeled with `FetchError`, `isFetchError`, `toFetchError`, and `classifyFetchError`.

## Injecting a fetcher

Pass a `FetchFunction` when a module owns transport, auth wrapping, or caching:

```ts
import { FetchClient, type FetchFunction } from '@ariestools/sdk/fetch'

const fetcher: FetchFunction = (input, init) =>
  globalThis.fetch(input, { ...init, headers: { ...init?.headers, authorization: token } })

const client = new FetchClient({ baseURL: 'https://api.example.com', fetcher })
```

Libraries should inject a **local** fetcher. Only a terminal app (service, CLI, worker entry) should replace the process-wide default.

## Node HTTP caching (Undici)

`@ariestools/sdk` does **not** depend on Undici. If you need caching in Node, the **consumer** installs Undici and supplies a fetcher or global dispatcher.

### Module-local cache

Own the dispatcher in the module that creates it; close it when done.

```ts
import { FetchClient, type FetchFunction } from '@ariestools/sdk/fetch'
import {
  Agent,
  cacheStores,
  fetch as undiciFetch,
  interceptors,
} from 'undici'

const dispatcher = new Agent().compose(
  interceptors.cache({
    store: new cacheStores.MemoryCacheStore({
      maxSize: 20 * 1024 * 1024,
      maxCount: 250,
      maxEntrySize: 2 * 1024 * 1024,
    }),
    type: 'shared',
  }),
)

const fetcher: FetchFunction = (input, init) =>
  undiciFetch(input, { ...init, dispatcher })

const client = new FetchClient({ baseURL: 'https://api.example.com', fetcher })
await client.get('/data')
await dispatcher.close()
```

### Process-wide default

Only from app bootstrap — not from libraries:

```ts
import { setGlobalDispatcher, Agent, cacheStores, interceptors } from 'undici'

const dispatcher = new Agent().compose(
  interceptors.cache({
    store: new cacheStores.MemoryCacheStore({
      maxSize: 100 * 1024 * 1024,
      maxCount: 1_000,
      maxEntrySize: 5 * 1024 * 1024,
    }),
    type: 'shared',
  }),
)

setGlobalDispatcher(dispatcher)
// then use fetchJson / clients without a custom fetcher
```

## Cache rules of thumb

- `type: 'shared'` — safe default for process-wide caches  
- `type: 'private'` — only when the dispatcher/store is isolated to one identity  
- Do not use a global private cache across tenants  
- Workers and separate processes each need their own dispatcher  
- Tests that swap the global dispatcher should restore `getGlobalDispatcher()` and only close dispatchers they created  

## What not to do

- Do not add Undici as a dependency of a shared library just to please one Node consumer  
- Do not import deep Undici internals through the SDK — Undici is consumer-owned  
- Do not assume `fetchJson` retries or caches unless you configured that in the fetcher/dispatcher  
