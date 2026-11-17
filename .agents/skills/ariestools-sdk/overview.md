# Overview and install

## What this monorepo is

[`ariestools/sdk-js`](https://github.com/ariestools/sdk-js) publishes shared ESM TypeScript libraries used across Aries Tools, XY Labs, and XYO product repos.

| Package | Role |
|---|---|
| `@ariestools/sdk` | **Umbrella** — most neutral utilities in one install, with subpath exports per module |
| Specialist packages | Separate installs for environment- or domain-specific surfaces (Express, storage backends, threads, tests, …) |

All packages are **ESM only** (`.mjs` + `.d.ts`), typically compiled to `dist/neutral/`. They share a monorepo version when published from `sdk-js`.

## Runtime baseline

This skill describes sdk-js 9.x.

- Every published sdk-js 9.x package (the umbrella and each specialist) declares `engines.node >=26`; 8.x declared `>=18.17.1` (umbrella) or `>=18` (specialists). Ignore the umbrella README's stale "18.17.1+".
- Engines are advisory unless the consuming repo enables engine-strict, so check its Volta/`engines` pin. Repos on Node < 26 stay on 8.x or upgrade the runtime.
- `@ariestools/testing` depends on Vitest 5 (since 8.3.0). Vitest 4 consumers stay on testing 8.2.x or older.
- The toolchain itself needs only Node 22; adding an sdk-js 9.x package raises the floor to 26.

## Default choice

For application and library code that needs common helpers (libraries choose dependency vs peer placement per [packages.md](packages.md)):

```sh
pnpm add @ariestools/sdk zod @opentelemetry/api
```

Import from the root barrel; use subpaths only for `import type` and stateless helpers (see [conventions.md](conventions.md)):

```ts
import { assertEx, delay, exists, fetchJson } from '@ariestools/sdk'
```

The root barrel loads `zod` and `@opentelemetry/api` at import time, so both must be installed even if you only use `assertEx`.

Add specialist packages only when you need their surface. See [packages.md](packages.md).

## Peers and side dependencies

From the umbrella package metadata (the README's "optional" note for `zod` is wrong for the root barrel):

| Dependency | Role |
|---|---|
| `async-mutex` | Direct dependency of `@ariestools/sdk` |
| `@ariestools/telemetry` | Direct dependency of `@ariestools/sdk` (backs the deprecated telemetry re-exports); declare it yourself if you import it directly |
| `zod` (^4.6, Zod 4) | Declared optional, but **required at runtime** for the root barrel `@ariestools/sdk` and `/hex`, `/object`, `/zod` (and, transitively, `@ariestools/pixel`; `@ariestools/express` lists it as a required peer). Skip it only if every import in the dependency graph is a zod-free subpath |
| `@opentelemetry/api` (^1.9) | **Required peer** — always install it. Loaded only via the root barrel and the `/telemetry`, `/telemetry-exporter` subpaths; the umbrella's telemetry re-exports are deprecated, so prefer `@ariestools/telemetry` for new code |

pnpm does not install optional peers, so add `zod` explicitly. deplint counts only non-optional peers of your dependencies as needed, so it can report a `zod` declaration your own code never imports as unused. Keep it instead of removing it, for example with `commands.deplint.packages.zod: { placement: 'dep', presence: 'required' }` (`placement: 'peer'` in a library); see [xy-toolchain commands](../xy-toolchain/commands.md).

```sh
# Prefer for new telemetry
pnpm add @ariestools/telemetry @opentelemetry/api
```

## Migrating from retired names

Every `@xylabs/*` shim is npm-deprecated and frozen at 8.0.2. Several npm deprecation messages point to deprecated or frozen targets, so use this map instead of the npm message:

| Retired | Use |
|---|---|
| `@xylabs/sdk-js`, `@xylabs/sdk` | `@ariestools/sdk` (`@xylabs/sdk-js/model` → `@ariestools/sdk/model`) |
| `@xylabs/<module>` (`assert`, `api`, `delay`, `fetch`, `hex`, `logger`, `object`, `promise`, `storage`, …) | `@ariestools/sdk` root barrel (`@ariestools/sdk/<module>` only for types and stateless helpers). No `@ariestools/<module>` package exists |
| `@xylabs/{express,threads,pixel,eth-address,sdk-meta}` | `@ariestools/<same name>` |
| `@xylabs/telemetry`, `@xylabs/telemetry-exporter` | `@ariestools/telemetry`, not the deprecated `@ariestools/sdk/telemetry*` path npm suggests |
| `@xylabs/{indexed-db,mongo}`, frozen `@ariestools/{indexed-db,mongo}` 8.0.3 | `@ariestools/storage-adapters/indexed-db`, `@ariestools/storage-adapters/mongo` |
| `@xylabs/{vitest-extended,vitest-matchers,jest-helpers}`, frozen `@ariestools/{vitest-extended,vitest-matchers}` 8.0.3 | `@ariestools/testing` (`/extended`, `/matchers`) |
| `@xylabs/crypto`, `@ariestools/crypto` | `globalThis.crypto` / `node:crypto`; `@ariestools/crypto` is itself npm-deprecated |

The four frozen `@ariestools` 8.0.3 packages carry no npm deprecation flag. `mongo` and `indexed-db` pin `@ariestools/sdk ~8.0.3` and `vitest-extended` pins `vitest ~4.1`, so installing one next to sdk 9 pulls in a second, stale copy.

## When not to use the umbrella alone

Install a **specialist** package instead of (or in addition to) the umbrella when you need:

- Node Express API handlers and middleware → `@ariestools/express`
- IndexedDB or Mongo storage implementations → `@ariestools/storage-adapters` (`/indexed-db`, `/mongo`)
- Worker-thread / web-worker helpers → `@ariestools/threads`
- Vitest custom matchers (registered via `@ariestools/testing/extended`) → `@ariestools/testing`
- First-class OpenTelemetry helpers → `@ariestools/telemetry`
- Password/seed vault crypto → `@ariestools/crypto-auth`
- `EthAddressWrapper` (bigint-backed, EIP-55 checksum via `ethers`) or `padHex` → `@ariestools/eth-address`; the branded `EthAddress` type and its helpers live in the umbrella's `hex` module
- Browser MetaMask JSON-RPC engine surface → `@ariestools/json-rpc-engine`
- Pixel / funnel analytics client → `@ariestools/pixel`
- HTML `<head>`/meta tag merging and building → `@ariestools/sdk-meta`

The umbrella re-exports storage **interfaces** (`@ariestools/sdk/storage`) and **deprecated** telemetry runtime helpers (`span*`, `timeBudget`, `XyConsoleSpanExporter`, … via the root barrel, `/telemetry` and `/telemetry-exporter`), scheduled for removal in a future major. Backend adapters and Express remain separate. See [packages.md](packages.md).

## Versioning

Follow the consuming repository's lockfile and range policy. Do not copy patch versions from `sdk-js` blindly into every app. In workspace monorepos, use `workspace:~` for internal packages per [xy-toolchain](../xy-toolchain/commands.md).
