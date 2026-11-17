# Specialist packages

These packages are published from the same `sdk-js` monorepo as the umbrella but are **separate npm installs**. Use them when the umbrella does not cover the environment or domain. Like the umbrella, every 9.x package declares `engines.node >=26` (see [overview](overview.md)).

## Quick chooser

| Need | Package | Runtime |
|---|---|---|
| Most neutral utilities | `@ariestools/sdk` (umbrella) | Both |
| Express API / ECS-style handlers | `@ariestools/express` | Node |
| IndexedDB or Mongo adapters | `@ariestools/storage-adapters` | `/indexed-db`: browser (or an IndexedDB polyfill); `/mongo`: Node |
| Worker threads / web workers | `@ariestools/threads` | Node or browser condition |
| Vitest matchers | `@ariestools/testing` | Both (Vitest 5) |
| OpenTelemetry spans / console exporter | `@ariestools/telemetry` | Both |
| Password / seed phrase vault crypto | `@ariestools/crypto-auth` | Both |
| Branded `EthAddress` type, hex / hash / address helpers | `@ariestools/sdk` (catalogued under `/hex`) | Both |
| bigint ETH address wrapper with ethers checksum | `@ariestools/eth-address` | Both |
| MetaMask JSON-RPC engine v2 (browser-safe) | `@ariestools/json-rpc-engine` | Both |
| Pixel / funnel event client | `@ariestools/pixel` | Browser |
| OpenGraph / Twitter meta in an HTML string | `@ariestools/sdk-meta` | Both |
| Platform crypto polyfills | `@ariestools/crypto` is deprecated on npm — do not install; use Web Crypto (`globalThis.crypto`) or `node:crypto` | — |

## `@ariestools/express`

Base helpers for Express 5 APIs. Typical for Node services deployed on ECS-style hosts. **Node-only**: the package has only a `node` export condition.

```sh
pnpm add @ariestools/express zod
# alongside the app's own express@5, plus @types/express-serve-static-core for types
```

- `@ariestools/sdk` comes in as a regular dependency; declare it only if your code imports it directly.
- Required peers: `zod` ^4.6 and `winston-transport` ^4.9 (also a dependency, so only `zod` needs adding). Express itself is neither a dependency nor a peer: bring your own Express 5.
- Main exports: `asyncHandler`, `errorToJsonHandler`, `requestHandlerValidator` (`ValidateRequestDefaults`, `EmptyParamsZod`, `EmptyQueryParamsZod`), `addRouteDefinitions` / `RouteDefinition`, `jsonBodyParser` / `getJsonBodyParser`, `standardResponses` / `standardErrors`, `customPoweredByHeader`, `enableCaseSensitiveRouting` / `disableCaseSensitiveRouting`, `responseProfiler` / `useRequestCounters`, and the winston loggers `getLogger` / `getDefaultLogger` (a Rollbar transport is added when `ROLLBAR_ACCESS_TOKEN` is set).
- `errorToJsonHandler` masks every 5xx body to `{ error: 'Internal Server Error' }` and logs the real message, so tests and clients must not expect internal messages in 5xx bodies.

## `@ariestools/storage-adapters`

Consolidated storage backends. Import the backend subpath and use that one subpath everywhere in the process:

| Subpath | Exports | Runtime |
|---|---|---|
| `@ariestools/storage-adapters/indexed-db` | `IndexedDbKeyValueStore` (implements the sdk `KeyValueStore`), `withDb`, `withStore`, `withReadOnlyStore`, `withReadWriteStore` | Browser (or an IndexedDB polyfill) |
| `@ariestools/storage-adapters/mongo` | `BaseMongoSdk`, `MongoClientWrapper`, `BaseMongoSdkConfig` | Node only |
| `@ariestools/storage-adapters/indexed-db/model`, `/mongo/model` | Types only | — |

```sh
pnpm add @ariestools/storage-adapters idb       # browser / IndexedDB
pnpm add @ariestools/storage-adapters mongodb   # Node / Mongo
```

`idb` ^8.0 and `mongodb` ^7.6 are optional peers, which pnpm does not install; without the matching backend the import fails with module-not-found.

**Never import the root barrel** `@ariestools/storage-adapters`. It statically imports both optional peers (pulling `mongodb` into browser graphs) and carries its own `MongoClientWrapper` pool cache, so mixing it with `/mongo` gives two wrappers and two connection pools for the same URI. This is the opposite of the `@ariestools/sdk` rule, where the root barrel is the default (see [conventions](conventions.md)).

Pair with the `KeyValueStore` interface (`import type` from `@ariestools/sdk/storage`) when defining portable store contracts.

## `@ariestools/threads`

Run work in worker threads (Node) or web workers (browser) with a function-call style API.

```sh
pnpm add @ariestools/threads
```

| Subpath | Conditions | Contents |
|---|---|---|
| `.` | `node` or `browser` only (no neutral default) | Main thread: `spawn`, `Pool`, `Worker`, `BlobWorker`, `Thread`, `Transfer`, `registerSerializer`, `DefaultSerializer`; Node adds `installWorkerSignalHandlers` / `uninstallWorkerSignalHandlers` |
| `/master`, `/pool`, `/implementation` | `node` or `browser` only | Main-thread API without serializers, `Pool` alone, the platform worker implementation |
| `/worker` | `node` or `browser` only | Worker side: `expose`, `Transfer`, `registerSerializer` |
| `/register` | `node` only | Side-effect import that installs `globalThis.Worker` |
| `/spawn`, `/thread`, `/observable`, `/observable-promise` | Neutral | Individual pieces |
| `/messenger` | Types only | Message types |

```ts
// worker module
import { expose } from '@ariestools/threads/worker'
expose({ add: (a: number, b: number) => a + b })

// main thread (Node resolves a relative worker path against process.cwd(); pass an absolute path)
import { spawn, Thread, Worker } from '@ariestools/threads'
const calc = await spawn(new Worker(workerPath))
await calc.add(2, 3)
await Thread.terminate(calc)
```

Use `Pool(() => spawn(new Worker(workerPath)), size)` for a worker pool and `Transfer(buffer)` to move ArrayBuffers instead of copying them. `observable-fns` is both a dependency and a peer, so the plain install covers it; add it yourself only when app code imports it.

Use for CPU-heavy or isolated work; keep serialization boundaries explicit. There is no published test companion package; test worker code with your own Vitest specs in the `spec/node` realm.

## `@ariestools/testing`

Vitest custom matchers (`toBeArray`, `toBeArrayOfSize`, `toBeTrue`, `toContainKey`, `toInclude`, `toBeValidDate`, …):

| Subpath | Role |
|---|---|
| `@ariestools/testing/extended` | Side-effect import: registers the matchers with `expect.extend` and adds their Vitest types (`CustomMatchers`). Add it to `setupFiles` or import it at the top of a spec |
| `@ariestools/testing/matchers` | The raw `matchers` object, for a manual `expect.extend` |
| `@ariestools/testing/model`, `/matchers/model` | The `ExpectationResult` type only |
| `@ariestools/testing` | Re-exports `/extended` and `/matchers`, so importing the root also registers the matchers |

```sh
pnpm add -D @ariestools/testing
```

```ts
// Vitest setup file, or the top of a spec
import '@ariestools/testing/extended'
```

9.x depends directly on `vitest ~5.0.1` (not a peer). Keep the consuming repo on Vitest 5.0.1 or a later 5.0.x, matching the `vitest ^5.0` peer of `@ariestools/vitest-config`, so there is one Vitest instance and `expect.extend` reaches the `expect` your specs use. Vitest 4 repos need `@ariestools/testing` 8.2.x or older. Prefer with `@ariestools/vitest-config` from [xy-toolchain](../xy-toolchain/testing.md).

## `@ariestools/telemetry`

First-class OpenTelemetry helpers. **Prefer this package for new telemetry** instead of the `@ariestools/sdk/telemetry` re-exports (deprecated on the umbrella).

```sh
pnpm add @ariestools/telemetry @opentelemetry/api
```

Main exports: `span`, `spanAsync`, `spanRoot`, `spanRootAsync`, `cloneContextWithoutSpan`, `timeBudget`, `createXyConsoleSpanExporter`, `spanDurationInMillis`, and the types `SpanConfig`, `TelemetryLogger`, `XySpanExporter`. Use `createXyConsoleSpanExporter()` instead of the deprecated `new XyConsoleSpanExporter()`.

## `@ariestools/crypto-auth`

Self-contained password and seed-phrase vault crypto (PBKDF2-derived, non-extractable AES-GCM keys).

```sh
pnpm add @ariestools/crypto-auth
```

- `new SeedPhraseVault(store, walletKind?, crypto?)`: the app supplies a `SeedPhraseStore` (`getPhrases` / `setPhrase` / `removePhrase`) and, optionally, a custom `VaultCrypto` (default `Pbkdf2AesGcmVaultCrypto`).
- Create records with `addSelfDescribingPhrase(phrase, label, password)`, which stores the salt and `keyMetadata` on the record and returns `{ key, record }`. Read them with `openSeedPhrase(password, record)` or `verifyPasswordForRecord`. A wrong password throws `SeedPhraseDecryptError`.
- New keys use 600,000 PBKDF2 iterations; legacy records are read at 100,000. `needsRehash` / `SeedPhraseVault.recordNeedsRehash` only detect a legacy record; `vault.upgradeRecordKdf(record, password)` re-encrypts it crash-safely. Pass a `LegacyKdfFallback` (`{ salt, iterations? }`) to `openSeedPhrase` / `upgradeRecordKdf` for records written before salt and metadata existed.
- `encryptSeedPhrase` / `decryptSeedPhrase` are deprecated; use the vault.
- Base64 uses native `Uint8Array.prototype.toBase64` / `Uint8Array.fromBase64`, so the package needs Node >= 26 or a current browser.

Treat secrets carefully; never persist or log derived keys or seed material.

## `@ariestools/eth-address`

The branded `EthAddress` type and its helpers (`toEthAddress`, `isEthAddress`, `asEthAddress`, `ETH_ZERO_ADDRESS`, `EthAddressZod`, `EthAddressRegEx`) are **not** in this package. They live in the umbrella (`@ariestools/sdk`, catalogued under `/hex`) with the other hex, hash and address helpers, and they need `zod`.

Install this package only for `EthAddressWrapper` (a bigint-backed address class: parse, compare, `toShortString`, and an EIP-55 checksum via `toString(true)`), `isEthAddressWrapper` or `padHex`:

```sh
pnpm add @ariestools/eth-address
```

It depends on `ethers`, so it is the heavier choice. Its `ellipsize` re-export is deprecated; import `ellipsize` from `@ariestools/sdk`.

## `@ariestools/json-rpc-engine`

Browser-safe re-export of MetaMask's JSON-RPC engine v2 public surface. Use for wallet/provider RPC pipelines in the browser.

```sh
pnpm add @ariestools/json-rpc-engine
```

Drop-in for `@metamask/json-rpc-engine/v2`: replace that import with `@ariestools/json-rpc-engine/v2` (identical to the root). `asLegacyMiddleware` and the v1 API (`JsonRpcEngine`, `createAsyncMiddleware`) are deliberately not exported, because they pull Node's `events` into browser graphs; Node code that needs v1 keeps `@metamask/json-rpc-engine`.

## `@ariestools/pixel`

Browser event client for funnel / purchase style analytics fields used with the XY Labs event pipeline.

```sh
pnpm add @ariestools/pixel zod
```

```ts
import { XyPixel } from '@ariestools/pixel'

XyPixel.init(pixelId) // once, on the client
await XyPixel.instance.send('Purchase', fields) // `instance` throws before init
```

`XyUserEventHandler` wraps the common events (`funnelStarted`, `purchase`, `viewContent`, `userClick`, …). `init` reads `localStorage` and `send` reads `document.location`, so call them only on the client; importing the package during SSR is safe. `XyPixel.selectApi(new PixelApi('beta' | 'local' | url))` overrides the default endpoint. Field types (`PurchaseFields`, `FunnelStartedFields`, `ViewContentFields`, `UserClickFields`, …) are in `@ariestools/pixel/model`. `zod` is needed because pixel loads `@ariestools/sdk/object` at runtime without declaring it.

## `@ariestools/sdk-meta`

Server/edge helpers that inject OpenGraph / Twitter meta into an HTML **string** via `cheerio` (not the live DOM): `metaBuilder(html, meta, handler?)`, `mergeDocumentHead(destination, source)`, `addMetaToHead($, name, value)`, `getMetaAsDict`, and the `Meta`, `OpenGraphMeta` and `TwitterMeta` types.

```sh
pnpm add @ariestools/sdk-meta
```

## Dependency placement

- Application/services: runtime packages in `dependencies` (see [xy-toolchain project profiles](../xy-toolchain/project-profiles.md)).
- Libraries: use `xy api-exposure` / deplint placement when deciding peer vs dependency.
- Test-only packages (`@ariestools/testing`) belong in `devDependencies`.
