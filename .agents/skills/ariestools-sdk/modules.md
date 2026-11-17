# Umbrella modules (`@ariestools/sdk`)

Modules live under the monolith source tree (`packages/sdk/src/modules/`) and are published as root re-exports plus **subpath exports**. Import from the root `@ariestools/sdk` by default. Treat the subpaths as a catalog of types and stateless functions, not as the preferred style: every entry is a separate bundle, so a class or module state reached through a subpath is a different object from the root's. See [conventions.md](conventions.md#import-style).

## Install and import

```sh
pnpm add @ariestools/sdk zod @opentelemetry/api
```

`@opentelemetry/api` (^1.9) is a required peer: the root barrel loads `@ariestools/telemetry`, which imports it. `zod` (^4.6) is declared an optional peer, but the root barrel, `/hex`, `/object` and `/zod` import it at load, so install it with the umbrella. Peer details are in [overview.md](overview.md#peers-and-side-dependencies).

```ts
import { assertEx, delay, fetchJson } from '@ariestools/sdk'
import type { ApiConfig, Hex, Promisable } from '@ariestools/sdk/model'
```

`@ariestools/sdk/model` aggregates every module's types. Per-module `./<name>/model` subpaths (types only) exist for api, assert, base, creatable, enum, error, events, fetch, forget, hex, object, profile, promise, retry, storage, telemetry, typeof and zod. Other modules have none; `@ariestools/sdk/logger/model`, for example, does not resolve.

## Module catalog

| Module | Subpath | Typical use |
|---|---|---|
| `api` | `@ariestools/sdk/api` | API config / client-oriented helpers |
| `array` | `@ariestools/sdk/array` | Array utilities |
| `arraybuffer` | `@ariestools/sdk/arraybuffer` | ArrayBuffer helpers |
| `assert` | `@ariestools/sdk/assert` | `assertEx`, `assertDefinedEx` — throw on invalid state |
| `base` | `@ariestools/sdk/base` | `Base` class (logger + OTel providers, `Base.defaultLogger`), `globallyUnique`, `initDefaultLogger` |
| `creatable` | `@ariestools/sdk/creatable` | Creatable instance patterns |
| `decimal-precision` | `@ariestools/sdk/decimal-precision` | Decimal / precision helpers |
| `delay` | `@ariestools/sdk/delay` | `delay(ms)` promise sleep |
| `ellipsize` | `@ariestools/sdk/ellipsize` | String ellipsizing |
| `enum` | `@ariestools/sdk/enum` | Enum-like helpers (prefer string unions in app code) |
| `error` | `@ariestools/sdk/error` | Error utilities |
| `events` | `@ariestools/sdk/events` | Event emitter style helpers |
| `exists` | `@ariestools/sdk/exists` | `exists` type guard for `filter(exists)` |
| `fetch` | `@ariestools/sdk/fetch` | `fetchJson`, `FetchClient`, compress/error helpers — see [fetch.md](fetch.md) |
| `forget` | `@ariestools/sdk/forget` | `forget(promise, config?)`, `ForgetPromise`. The published entry is the Node-capable variant on all platforms; `terminateOnException`/`terminateOnTimeout` (default false) call `process.exit`, so leave them off in browser or library code. There is no `/forget/node` subpath |
| `function-name` | `@ariestools/sdk/function-name` | Function display names |
| `geo` | `@ariestools/sdk/geo` | Geo helpers |
| `hex` | `@ariestools/sdk/hex` | Hex/hash/address/EthAddress helpers and Zod schemas — requires `zod` ^4.6 (imported at load) |
| `logger` | `@ariestools/sdk/logger` | `ConsoleLogger`, `LevelLogger`, `SilentLogger`, `IdLogger`, `parseLogLevel` |
| `object` | `@ariestools/sdk/object` | Object helpers (`asAnyObject`, `AsObjectFactory`, `deepMerge`, `omitBy`/`pickBy`, JsonObject helpers, `toSafeJson`, `AnyObject`/`EmptyObject` types) — requires `zod`; `isType` is in `/typeof` |
| `platform` | `@ariestools/sdk/platform` | `isNode` / `isBrowser` / `isWebworker` (node/browser conditional); `subtle` only from the node and neutral entries |
| `profile` | `@ariestools/sdk/profile` | Lightweight profiling hooks |
| `promise` | `@ariestools/sdk/promise` | `PromiseEx`, `fulfilled` / `rejected`, `toPromise` |
| `retry` | `@ariestools/sdk/retry` | `retry(fn, config?)` — re-runs on an incomplete result, not on exceptions (see below) |
| `set` | `@ariestools/sdk/set` | Set utilities |
| `static-implements` | `@ariestools/sdk/static-implements` | Static implements pattern |
| `storage` | `@ariestools/sdk/storage` | `KeyValueStore` / `ReadonlyKeyValueStore` **interfaces** |
| `telemetry` | `@ariestools/sdk/telemetry` | **Deprecated re-export path** — prefer `@ariestools/telemetry` |
| `telemetry-exporter` | `@ariestools/sdk/telemetry-exporter` | **Deprecated re-export path** — use `@ariestools/telemetry` (`createXyConsoleSpanExporter`, `spanDurationInMillis`) |
| `timer` | `@ariestools/sdk/timer` | Timers |
| `typeof` | `@ariestools/sdk/typeof` | `is*` guards (`isDefined`, `isString`, `isObject`, …), `typeOf`, `ifTypeOf`, `ifDefined`, `Brand` |
| `url` | `@ariestools/sdk/url` | URL helpers (node/browser conditional entry) |
| `zod` | `@ariestools/sdk/zod` | Zod factories (`zodIsFactory`, `zodAsFactory`, `zodToFactory`, `zodAllFactory`, async variants) — requires `zod` ^4.6 |

The published `exports` map is the source of truth if this table drifts; inspect `packages/sdk/package.json` in `sdk-js` or the installed package on disk.

Take classes and module state only from the root: `ApiClient`, `Base` / `initDefaultLogger`, `AbstractCreatable`, `BaseEmitter` / `Events`, `ForgetPromise`, the logger classes, `PromiseEx` and `TimerScheduler`.

## High-traffic patterns

### Assert and exists

```ts
import { assertEx, exists } from '@ariestools/sdk'

const value = assertEx(maybe, () => 'missing value')
const items = list.filter(exists)
```

`assertEx` throws on `undefined`, `null`, `false`, `0`, `''` and `0n`; `NaN` passes and is returned unchanged. Use `assertDefinedEx` when `0`, `''` or `false` are valid values. Always pass a function (`() => 'msg'` or `() => new MyError()`), never a string.

### Delay and retry

```ts
import { delay, retry } from '@ariestools/sdk'

await delay(100)
const value = await retry(async () => {
  try {
    return await fetchMaybe()
  } catch {
    return undefined // incomplete, so retry
  }
}, { retries: 3, interval: 100, backoff: 2 })
```

`retry` re-runs on an incomplete result, not on exceptions: a thrown error propagates from the first attempt, so catch inside and return `undefined` to trigger a retry. A result is complete when it is not `undefined`; pass `complete: (result) => boolean` to change that. The default is 0 retries, and exhaustion returns `undefined`. A `void` function is never complete, so `retries: N` runs it N + 1 times even when every attempt succeeds.

### Forget (async side effects)

Use forget helpers when intentionally not awaiting a promise. Prefer explicit error handling at boundaries; do not use forget to hide production failures.

```ts
import { forget, ForgetPromise } from '@ariestools/sdk'

forget(sendMetrics(), {
  name: 'metrics',
  onComplete: ([, error]) => {
    if (error) logger.warn(error)
  },
})

// before process exit and in test teardown
await ForgetPromise.awaitInactive()
```

- Import from the root: `ForgetPromise` holds static state (`activeForgets`), and the `/forget` subpath has its own copy.
- A rejection is logged and delivered to `onComplete([undefined, error])`. `onException` covers only errors thrown during synchronous setup.
- The default `timeout` is 30 s. It only notifies (`onCancel` plus a logged error); the work keeps running.
- `ForgetPromise.awaitInactive(interval?, timeout?)` resolves `0` once every forgotten promise settles, or the number still running when `timeout` elapses.
- Process-wide defaults go in `globalThis.xy.forget.config`; per-call config overrides them.

### Hex and addresses

```ts
import {
  hexToBigInt, isEthAddress, isHash, isHex, toAddress, toEthAddress, toHex,
} from '@ariestools/sdk'
```

`Hex`, `Hash` and `Address` are unprefixed (`isHex('0xff')` is false by default); `EthAddress` is `0x`-prefixed. The branded `EthAddress` type, `toEthAddress` / `isEthAddress` / `asEthAddress` and `EthAddressZod` all live in this module. `@ariestools/eth-address` adds only `EthAddressWrapper` (bigint parse and compare, EIP-55 checksum) and `padHex`, and it pulls in `ethers` — see [packages.md](packages.md).

### Storage interfaces vs adapters

`@ariestools/sdk/storage` holds the `KeyValueStore` / `ReadonlyKeyValueStore` contracts. `IndexedDbKeyValueStore` (`@ariestools/storage-adapters/indexed-db`) implements them. `@ariestools/storage-adapters/mongo` provides `BaseMongoSdk` / `MongoClientWrapper` for Mongo access. Neither backend ships inside the umbrella — see [packages.md](packages.md).

## Platform-conditional modules

`platform` and `url` use conditional package exports (`node` / `browser` / default neutral). When you need the platform-specific entry, import the `/platform` or `/url` subpath (stateless, so a subpath is fine) and let the bundler or Node resolution pick it. Do not import deep `dist/node/...` paths by hand.

`subtle` is exported only under the `node` and default conditions; browser builds get `isNode` / `isBrowser` / `isWebworker` only, so use `globalThis.crypto.subtle` there. The root barrel is the same bundle under every condition and carries the neutral, runtime-detecting variants.

## Discovering APIs

When unsure of an exact export name:

1. Check the subpath's `dist/neutral/*.d.ts` in the installed package.
2. Or open `packages/sdk/src/modules/<name>/` in `sdk-js`.
3. Prefer named exports already used in the consuming monorepo over inventing wrappers.
