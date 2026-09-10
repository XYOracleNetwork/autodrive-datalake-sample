# Umbrella modules (`@ariestools/sdk`)

Modules live under the monolith source tree (`packages/sdk/src/modules/`) and are published as root re-exports plus **subpath exports**. Prefer subpaths when the import set is small or when documenting intent.

## Install and import

```sh
pnpm add @ariestools/sdk
```

```ts
import { assertEx } from '@ariestools/sdk/assert'
import { delay } from '@ariestools/sdk/delay'
import { fetchJson } from '@ariestools/sdk/fetch'
import type { ApiConfig } from '@ariestools/sdk/api/model'
```

Many modules also publish a `./<name>/model` subpath for types-only imports.

## Module catalog

| Module | Subpath | Typical use |
|---|---|---|
| `api` | `@ariestools/sdk/api` | API config / client-oriented helpers |
| `array` | `@ariestools/sdk/array` | Array utilities |
| `arraybuffer` | `@ariestools/sdk/arraybuffer` | ArrayBuffer helpers |
| `assert` | `@ariestools/sdk/assert` | `assertEx`, `assertDefinedEx` — throw on invalid state |
| `base` | `@ariestools/sdk/base` | Base types / shared foundations |
| `creatable` | `@ariestools/sdk/creatable` | Creatable instance patterns |
| `decimal-precision` | `@ariestools/sdk/decimal-precision` | Decimal / precision helpers |
| `delay` | `@ariestools/sdk/delay` | `delay(ms)` promise sleep |
| `ellipsize` | `@ariestools/sdk/ellipsize` | String ellipsizing |
| `enum` | `@ariestools/sdk/enum` | Enum-like helpers (prefer string unions in app code) |
| `error` | `@ariestools/sdk/error` | Error utilities |
| `events` | `@ariestools/sdk/events` | Event emitter style helpers |
| `exists` | `@ariestools/sdk/exists` | `exists` type guard for `filter(exists)` |
| `fetch` | `@ariestools/sdk/fetch` | `fetchJson`, `FetchClient`, compress/error helpers — see [fetch.md](fetch.md) |
| `forget` | `@ariestools/sdk/forget` | Fire-and-forget promises (node variants under forget/node) |
| `function-name` | `@ariestools/sdk/function-name` | Function display names |
| `geo` | `@ariestools/sdk/geo` | Geo helpers |
| `hex` | `@ariestools/sdk/hex` | Hex strings, hashes, address helpers, optional zod |
| `logger` | `@ariestools/sdk/logger` | `ConsoleLogger`, level/silent loggers |
| `object` | `@ariestools/sdk/object` | Object helpers (prefer non-deprecated exports) |
| `platform` | `@ariestools/sdk/platform` | Platform detection (node/browser conditional) |
| `profile` | `@ariestools/sdk/profile` | Lightweight profiling hooks |
| `promise` | `@ariestools/sdk/promise` | `PromiseEx`, `fulfilled` / `rejected`, `toPromise` |
| `retry` | `@ariestools/sdk/retry` | Retry helpers |
| `set` | `@ariestools/sdk/set` | Set utilities |
| `static-implements` | `@ariestools/sdk/static-implements` | Static implements pattern |
| `storage` | `@ariestools/sdk/storage` | `KeyValueStore` and storage **interfaces** |
| `telemetry` | `@ariestools/sdk/telemetry` | **Deprecated re-export path** — prefer `@ariestools/telemetry` |
| `telemetry-exporter` | `@ariestools/sdk/telemetry-exporter` | Exporter helpers (prefer dedicated telemetry package for new code) |
| `timer` | `@ariestools/sdk/timer` | Timers |
| `typeof` | `@ariestools/sdk/typeof` | Runtime type checks, branding, `is` / `ifTypeOf` |
| `url` | `@ariestools/sdk/url` | URL helpers (node/browser conditional entry) |
| `zod` | `@ariestools/sdk/zod` | Zod helpers — requires optional peer `zod` |

The published `exports` map is the source of truth if this table drifts; inspect `packages/sdk/package.json` in `sdk-js` or the installed package on disk.

## High-traffic patterns

### Assert and exists

```ts
import { assertEx } from '@ariestools/sdk/assert'
import { exists } from '@ariestools/sdk/exists'

const value = assertEx(maybe, () => 'missing value')
const items = list.filter(exists)
```

### Delay and retry

```ts
import { delay } from '@ariestools/sdk/delay'
import { retry } from '@ariestools/sdk/retry'

await delay(100)
await retry(async () => doWork(), { /* options per package API */ })
```

### Forget (async side effects)

Use forget helpers when intentionally not awaiting a promise. Prefer explicit error handling at boundaries; do not use forget to hide production failures.

### Hex and addresses

```ts
import { /* hex helpers */ } from '@ariestools/sdk/hex'
```

For a focused ETH address package, `@ariestools/eth-address` remains available — see [packages.md](packages.md).

### Storage interfaces vs adapters

`@ariestools/sdk/storage` defines store contracts (e.g. key-value). **Implementations** for IndexedDB and Mongo live in `@ariestools/storage-adapters`. Do not assume Mongo or IndexedDB ship inside the umbrella alone.

## Platform-conditional modules

`platform` and `url` use conditional package exports (`node` / `browser` / default neutral). Depend on the published subpath and let the bundler or Node resolution pick the right entry. Do not import deep `dist/node/...` paths by hand.

## Discovering APIs

When unsure of an exact export name:

1. Check the subpath's `dist/neutral/*.d.ts` in the installed package.
2. Or open `packages/sdk/src/modules/<name>/` in `sdk-js`.
3. Prefer named exports already used in the consuming monorepo over inventing wrappers.
