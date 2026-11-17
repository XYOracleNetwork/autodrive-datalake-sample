# Fetch and HTTP

Import from the root `@ariestools/sdk` (see [import style](conventions.md#import-style)). The module subpath is `@ariestools/sdk/fetch`; `@ariestools/sdk/fetch/model` holds its types for `import type`.

## Exports

- **Functions:** `fetchJson`, `fetchJsonGet` / `fetchJsonPost` / `fetchJsonPut` / `fetchJsonPatch` / `fetchJsonDelete`, `fetchCompress`, `readResponseText`
- **Clients:** `FetchClient` and `FetchJsonClient` (each with `static create`), plus the ready-made `fetchJsonClient` instance
- **Errors:** `FetchError` (`toJSON()` gives a log-safe shape), `FetchClientError`, `isFetchError`, `toFetchError`, `classifyFetchError`
- **Types** (also in `/fetch/model`): `FetchClientConfig`, `FetchClientRequestConfig`, `FetchCompressOptions`, `FetchFunction`, `FetchErrorContext`, `FetchErrorJson`, `FetchErrorType`, `FetchJsonOptions`, `FetchJsonResponse`, `ReadResponseTextOptions`

Migrating: `@xylabs/axios` `axiosJson` / `AxiosJson` → `fetchJsonClient` / `FetchJsonClient`; `@xylabs/fetch` (deprecated) → the same names from `@ariestools/sdk`.

## Defaults

The helpers and clients are **runtime-neutral**. They do not bundle an HTTP stack or cache.

Resolution order for the underlying fetch implementation:

1. Per-request `fetcher` option  
2. `fetcher` on a `FetchClient` instance  
3. `globalThis.fetch` from the host runtime  

Browsers supply their own HTTP cache. Node's built-in fetch does **not** enable a response cache by default.

## Common usage

```ts
import { FetchClient, fetchJson } from '@ariestools/sdk'

const { data, status } = await fetchJson<MyDto>('https://api.example.com/item') // data: MyDto | null

const client = new FetchClient({ baseURL: 'https://api.example.com' })
const { data: item } = await client.get<MyDto>('/item')
```

`fetchJson` sends `options.body` as given, so pass a JSON string. `fetchJsonPost` / `Put` / `Patch(url, data, options)` and `client.post` / `put` / `patch(url, data, config)` `JSON.stringify` the `data` argument; the GET and DELETE forms have no `data` argument.

### Result and errors

Every `fetchJson*` helper and client method resolves to `FetchJsonResponse<T>`: `{ data: T | null, headers, response, status, statusText }`. `data` is `null` for an empty body and for a non-2xx body that is not valid JSON.

- **`fetchJson*` helpers resolve on 4xx/5xx.** Branch on `status` or `response.ok` yourself. They throw `FetchError` only for transport failures, an unparseable 2xx body, or a read-policy failure (`maxResponseBytes`, `signal`).
- **`FetchClient`, `FetchJsonClient` and `fetchJsonClient` throw Axios-style.** When `validateStatus` rejects the status they throw `FetchClientError`, a `FetchError` with `type: 'http-status'`, `.response` and `.config`. The default accepts 200–299; pass a function to override it, or `validateStatus: null` to never throw.
- Catch with `isFetchError(e)` (it holds across bundle copies, unlike `instanceof`) and branch on `e.type`: `dns`, `connection-refused`, `connection-reset`, `connection-timeout`, `timeout`, `aborted`, `tls`, `unreachable`, `http-status`, `parse`, `response-too-large`, `network` or `unknown`.

## Request options

| Option | Where | Notes |
|---|---|---|
| `baseURL` | clients | Resolved with WHATWG `new URL(path, baseURL)`, not Axios-style joining: `/item` against `https://api.example.com/v1` gives `https://api.example.com/item`. Keep a base path with a trailing slash and a relative path (`…/v1/` + `item`). |
| `params` | clients | `Record<string, string>` set on the query string |
| `headers` | all | `fetchJson*` and clients apply them over a default JSON `Accept` (plus `Content-Type: application/json` when there is a body) |
| `timeout` | clients | Milliseconds; `0` or unset disables. See [bounded reads](#bounded-reads-timeouts-and-cancellation) |
| `validateStatus` | clients | Function or `null`; see [Result and errors](#result-and-errors) |
| `fetcher` | all | A `FetchFunction`; see [Injecting a fetcher](#injecting-a-fetcher) |
| `maxResponseBytes` | JSON helpers, clients | Response byte cap; see [bounded reads](#bounded-reads-timeouts-and-cancellation) |
| `compressMinLength` | all | Default `1024`. Gzip is **on by default**: a request body longer than this is gzipped and sent with `Content-Encoding: gzip`, so the server must accept gzip request bodies. Raise it to opt out. |

Native `RequestInit` fields (`signal`, `redirect`, `credentials`, …) pass through.

- Per-request config is shallow-merged over the client's defaults, so a per-request `headers` or `params` **replaces** the client's object instead of merging with it.
- A non-string `body` is `JSON.stringify`-ed for the length check. A typed-array or `Buffer` body over the threshold is replaced by gzipped JSON of its elements, so raise `compressMinLength` or use native `fetch` for binary uploads.

## Injecting a fetcher

Pass a `FetchFunction` when a module owns transport, auth wrapping, or caching:

```ts
import { FetchClient, type FetchFunction } from '@ariestools/sdk'

const fetcher: FetchFunction = (input, init) => {
  const headers = new Headers(init?.headers)
  headers.set('authorization', token)
  return globalThis.fetch(input, { ...init, headers })
}

const client = new FetchClient({ baseURL: 'https://api.example.com', fetcher })
```

`init.headers` reaching a fetcher from `fetchJson*` or a client is a `Headers` instance. Never object-spread it: `{ ...init.headers }` is empty, which drops `Accept`, `Content-Type` and `Content-Encoding: gzip`. Keep `...init` so `signal` is forwarded. For auth that needs no transport control, prefer client-level `headers` config.

Libraries should inject a **local** fetcher. Only a terminal app (service, CLI, worker entry) should replace the process-wide default.

## Bounded reads, timeouts and cancellation

```ts
import { FetchJsonClient } from '@ariestools/sdk'

const controller = new AbortController()
const client = new FetchJsonClient({ maxResponseBytes: 1024 * 1024, timeout: 5000 })
const { data } = await client.get<MyDto>('https://api.example.com/data', { signal: controller.signal })
```

- `maxResponseBytes` must be a positive safe integer; anything else throws `RangeError` before the request starts. It counts the bytes `Response.body` streams (after any transport decompression; `Content-Length` is not trusted) and applies to non-2xx bodies too. Unset means unlimited.
- A client `timeout` composes with the caller's `signal`, and the first abort wins. Both stay active while the body is read. `fetchJson*` has no `timeout`; pass `signal: AbortSignal.timeout(ms)`.
- Failures are `FetchError` with type `response-too-large`, `aborted` or `timeout`. A truncated body is never returned as success.
- With a cap or signal set, read errors on non-2xx bodies propagate instead of becoming `data: null`, even with `validateStatus: null`.

For text instead of JSON, use the same primitive:

```ts
import { readResponseText } from '@ariestools/sdk'
import type { ReadResponseTextOptions } from '@ariestools/sdk/fetch/model'

const options: ReadResponseTextOptions = { maxResponseBytes: 1024 * 1024, signal: controller.signal }
const response = await fetch('https://api.example.com/data', { signal: options.signal })
const text = await readResponseText(response, options)
```

- Injected fetchers must forward `init.signal` (spreading `...init` does), or timeouts and aborts cannot cancel the request.
- A non-native fetcher whose body is not a WHATWG stream (node-fetch or cross-fetch, whatwg-fetch or React Native polyfills, Response-like test doubles) is read with `response.text()` when a cap or signal is set (since 9.0.1; earlier releases threw). The whole body is buffered before the cap is checked against its UTF-8 byte length, and abort rejects promptly but cannot cancel the body.
- The SDK adds no SSRF, redirect or credentials policy. Set native `redirect: 'error'` and `credentials: 'omit'` yourself when required.

## Node HTTP caching (Undici)

`@ariestools/sdk` does **not** depend on Undici. If you need caching in Node, the **consumer** installs a current Undici release compatible with the running Node's built-in fetch (undici 7.29+ or 8.x on Node 26; check `process.versions.undici`) and supplies a fetcher or global dispatcher. An outdated Undici can make `setGlobalDispatcher` silently miss `globalThis.fetch`; a module-local fetcher using Undici's own `fetch` is unaffected.

### Module-local cache

Own the dispatcher in the module that creates it; close it when done.

```ts
import { FetchClient, type FetchFunction } from '@ariestools/sdk'
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

Only from app bootstrap — not from libraries. Install it once, before normal requests start:

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
- Do not assume `fetchJson` throws on non-2xx, retries, or caches — check `status`, and configure retries or caching in the fetcher/dispatcher  
