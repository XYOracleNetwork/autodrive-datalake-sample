# Specialist packages

These packages live in the same `sdk-js` monorepo (or closely related Aries Tools packages) but are **separate npm installs**. Use them when the umbrella does not cover the environment or domain.

## Quick chooser

| Need | Package |
|---|---|
| Most neutral utilities | `@ariestools/sdk` (umbrella) |
| Express API / ECS-style handlers | `@ariestools/express` |
| IndexedDB or Mongo adapters | `@ariestools/storage-adapters` |
| Worker threads / web workers | `@ariestools/threads` |
| Vitest matchers / test helpers | `@ariestools/testing` |
| OpenTelemetry spans / console exporter | `@ariestools/telemetry` |
| Password / seed phrase vault crypto | `@ariestools/crypto-auth` |
| ETH address helpers | `@ariestools/eth-address` |
| MetaMask JSON-RPC engine (browser-safe) | `@ariestools/json-rpc-engine` |
| Pixel / funnel event client | `@ariestools/pixel` |
| HTML meta helpers | `@ariestools/sdk-meta` |
| Platform crypto polyfills | Avoid for new work — prefer platform native crypto; `@ariestools/crypto` is legacy-oriented |

## `@ariestools/express`

Base helpers for Express APIs (handlers, middleware, HTTP utilities, logging integration). Typical for Node services deployed on ECS-style hosts.

```sh
pnpm add @ariestools/express
```

Depends on the shared SDK surface for common utilities; install `@ariestools/sdk` as required by the package's peers/deps.

## `@ariestools/storage-adapters`

Consolidated storage backends:

| Subpath | Backend |
|---|---|
| `@ariestools/storage-adapters` | Root barrel |
| `@ariestools/storage-adapters/indexed-db` | IndexedDB |
| `@ariestools/storage-adapters/mongo` | MongoDB |
| `*/model` | Types-only subpaths |

```sh
pnpm add @ariestools/storage-adapters
```

Pair with `@ariestools/sdk/storage` interfaces when defining portable store contracts.

## `@ariestools/threads`

Run work in worker threads or web workers with a function-call style API.

```sh
pnpm add @ariestools/threads
```

Use for CPU-heavy or isolated work; keep serialization boundaries explicit. `@ariestools/threads-test` is a companion package for tests, not a production dependency of apps.

## `@ariestools/testing`

Vitest-oriented helpers:

| Subpath | Role |
|---|---|
| `@ariestools/testing` | Root |
| `@ariestools/testing/matchers` | Custom matchers |
| `@ariestools/testing/extended` | Extended utilities |

```sh
pnpm add -D @ariestools/testing
```

Wire matchers in Vitest setup files per the consuming repo. Prefer with `@ariestools/vitest-config` from [xy-toolchain](../xy-toolchain/testing.md).

## `@ariestools/telemetry`

First-class OpenTelemetry helpers (spans, time budgets, console span exporter). **Prefer this package for new telemetry** instead of `@ariestools/sdk/telemetry` re-exports (deprecated on the umbrella).

```sh
pnpm add @ariestools/telemetry @opentelemetry/api
```

## `@ariestools/crypto-auth`

Self-contained password and seed-phrase encryption/decryption (vault-style crypto).

```sh
pnpm add @ariestools/crypto-auth
```

Treat secrets carefully; never log keys or seed material.

## `@ariestools/eth-address`

Focused Ethereum address helpers (`EthAddress`, padding, ellipsize). Some hex/address utilities also exist under `@ariestools/sdk/hex`; use this package when you want the dedicated address API without pulling unrelated hex helpers by habit.

## `@ariestools/json-rpc-engine`

Browser-safe re-export of MetaMask's JSON-RPC engine v2 public surface (tree-shakes legacy middleware paths). Use for wallet/provider RPC pipelines in the browser.

```sh
pnpm add @ariestools/json-rpc-engine
```

## `@ariestools/pixel`

Event client for funnel / purchase style analytics fields used with the XY Labs event pipeline.

## `@ariestools/sdk-meta`

HTML meta helpers for sites that inject or manage document meta tags.

## Dependency placement

- Application/services: runtime packages in `dependencies` (see [xy-toolchain project profiles](../xy-toolchain/project-profiles.md)).
- Libraries: use `xy api-exposure` / deplint placement when deciding peer vs dependency.
- Test-only packages (`@ariestools/testing`) belong in `devDependencies`.
